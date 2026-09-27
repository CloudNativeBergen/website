import 'server-only'
import { createHash } from 'node:crypto'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { countMarketingAssetReleaseTwins, detailsPatch } from './sanity'
import type { MarketingAssetSubjectType } from './types'

/**
 * A render Task's gallery entry (spec §4.3, #1165).
 *
 * Attaching a render to a `studioRender` Task also saves it to the gallery.
 * The entry is FOUND by its weak `task` reference, so this is idempotent and
 * rendering the Task again replaces the entry's IMAGE only: a title, tags or
 * alt an organizer edited since are kept. The reference is weak, so the entry
 * survives the deletion of its Task, Campaign and plan, and never blocks them.
 *
 * A first entry gets a deterministic id through `createIfNotExists`, so two
 * attaches racing past the read cannot make two entries; what the create
 * left is read back, so a no-op create is never mistaken for this render
 * being in the gallery. Nothing is written for a render the Task no longer
 * holds.
 *
 * The entry records its image as `createdImageAssetId`, kept in step on
 * every replace, so deleting the entry in the gallery runs the shared
 * orphan check on it (spec §5; the user's decision on PR #1228): the file
 * goes once NOTHING references it — the Task, a post, anything, counted
 * across every tenant. The file this replaces is the render the Task
 * REPLACED, which the Task already records for the same check (#1162); the
 * caller runs it after this, so the old file goes once nothing holds it.
 *
 * Throws on failure. The caller must never let that fail the attach.
 */
export interface TaskRenderGalleryEntry {
  /** The request host's organization; never from the client. */
  orgId: string
  /** The Task's edition, which the caller's tenancy guard admitted. */
  conferenceId: string
  taskId: string
  imageAssetId: string
  title: string
  alt: string
  /** The Task's subject, validated when the Task was made. */
  subject: { type: MarketingAssetSubjectType; id: string } | null
}

/**
 * A ROOT-level id for a Task's entry. Task ids carry a dot
 * (`marketingTask.<uuid>`, `marketingTask.gen-<hash>`), and an id with a dot
 * is not a published document to `path("*")` — the gallery would never list
 * or find it. A hash of the Task id is dot-free and deterministic.
 */
export function taskRenderAssetDocumentId(taskId: string): string {
  return `marketingAsset-task-${createHash('sha256').update(taskId).digest('hex').slice(0, 32)}`
}

/** What the entry and its Task hold now. */
async function readState(entry: TaskRenderGalleryEntry) {
  const [task, existing] = await Promise.all([
    scopedFetch<{ _rev: string; assetId: string | null } | null>(
      clientReadUncached,
      { conferenceId: entry.conferenceId },
      `*[_type == "marketingTask" && _id == $taskId][0]{ _rev, "assetId": asset.asset._ref }`,
      { taskId: entry.taskId },
      { cache: 'no-store' },
    ),
    scopedFetch<{
      _id: string
      _rev: string
      assetId: string | null
    } | null>(
      clientReadUncached,
      { orgId: entry.orgId },
      `*[_type == "marketingAsset" && task._ref == $taskId && _id in path("*")] | order(_createdAt asc)[0]{
        _id, _rev, "assetId": image.asset._ref
      }`,
      { taskId: entry.taskId },
      { cache: 'no-store' },
    ),
  ])
  return { task, existing }
}

/** The image fields a render writes on its entry. */
function imageFields(imageAssetId: string) {
  return {
    image: {
      _type: 'image',
      asset: { _type: 'reference', _ref: imageAssetId },
    },
    // The entry's own file, so deleting the entry deletes it once nothing
    // references it (the gallery delete's orphan check).
    createdImageAssetId: imageAssetId,
  }
}

/**
 * Give a Studio draft of the entry this render too, image only: publishing
 * a draft that still holds the old image would put it back after the Task's
 * pending mark was cleared.
 *
 * Checked AFTER the entry's own write, not before it: a patch cannot say "if
 * this document exists", so no transaction can cover a draft Studio opens in
 * the meantime. Afterwards it can: a draft opened later is copied from the
 * entry, which holds this render already, and one opened in between is
 * found here. Revision-guarded, so an organizer's save in between is read
 * again. Throws if it cannot finish, and the save stays pending.
 */
async function syncDraftImage(
  entry: TaskRenderGalleryEntry,
  id: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const draft = await scopedFetch<{
      _rev: string
      assetId: string | null
    } | null>(
      clientReadUncached,
      { orgId: entry.orgId },
      `*[_type == "marketingAsset" && _id == $draftId][0]{ _rev, "assetId": image.asset._ref }`,
      { draftId: `drafts.${id}` },
      { cache: 'no-store' },
    )
    if (!draft || draft.assetId === entry.imageAssetId) return
    try {
      await clientWrite
        .patch(`drafts.${id}`)
        .ifRevisionId(draft._rev)
        .set(imageFields(entry.imageAssetId))
        .commit()
      return
    } catch (error) {
      if (!isRevisionConflict(error)) throw error
    }
  }
  throw new Error(
    `The Studio draft of gallery entry ${id} kept changing; its image is replaced on the next retry`,
  )
}

/** Sanity refused a revision guard: something moved since the read. */
function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes('revision')
  )
}

/**
 * `superseded`: the Task holds another render now, so nothing is written —
 * a slower attach must never put an older render back.
 *
 * EVERY write is in one transaction with a revision guard on the TASK as it
 * was read holding this render (a no-op patch, as the gallery delete guards
 * its own document), so the write lands only while the Task still holds this
 * render. Two separate reads cannot promise that on their own: a newer
 * attach can move the Task and the entry between them. A guard that fails is
 * read again, and a newer render then answers `superseded`.
 */
export async function saveTaskRenderToGallery(
  entry: TaskRenderGalleryEntry,
): Promise<'created' | 'replaced' | 'unchanged' | 'superseded'> {
  let created = false
  for (let attempt = 0; attempt < 3; attempt++) {
    const { task, existing } = await readState(entry)
    if (!task || task.assetId !== entry.imageAssetId) return 'superseded'
    const tx = clientWrite
      .transaction()
      .patch(entry.taskId, (p) =>
        p.ifRevisionId(task._rev).unset(['_galleryGuard']),
      )
    const taskRenderEntryId =
      existing?._id ?? taskRenderAssetDocumentId(entry.taskId)
    let outcome: 'created' | 'replaced'
    if (existing) {
      if (existing.assetId === entry.imageAssetId) {
        // Also on a retry: a draft a failed save left behind catches up.
        await syncDraftImage(entry, existing._id)
        return created ? 'created' : 'unchanged'
      }
      // A Content Release copy would put the old image back when it is
      // published, after this save had cleared the Task's pending mark. So
      // the save fails, and stays pending, until the release lets it go —
      // as the gallery's own edit and delete refuse the same case.
      if (
        (await countMarketingAssetReleaseTwins(entry.orgId, existing._id)) > 0
      )
        throw new Error(
          `The gallery entry ${existing._id} is part of a Content Release in Studio; its image is replaced once the release lets it go`,
        )
      // The image only. A Studio draft of the entry follows once this lands.
      tx.patch(existing._id, (p) =>
        p.ifRevisionId(existing._rev).set(imageFields(entry.imageAssetId)),
      )
      outcome = 'replaced'
    } else {
      // A create that lost a race to another attach is a no-op; the next
      // pass reads back what it left and, if need be, replaces it.
      const { set } = detailsPatch({
        title: entry.title.trim() || 'Studio render',
        alt: entry.alt,
        scope: 'edition',
        conferenceId: entry.conferenceId,
        subject: entry.subject ?? undefined,
        tags: [],
        credit: undefined,
      })
      tx.createIfNotExists({
        _id: taskRenderAssetDocumentId(entry.taskId),
        _type: 'marketingAsset',
        organization: { _type: 'reference', _ref: entry.orgId },
        kind: 'image',
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: entry.imageAssetId },
        },
        createdImageAssetId: entry.imageAssetId,
        source: 'studio',
        task: { _type: 'reference', _ref: entry.taskId, _weak: true },
        ...set,
      })
      outcome = 'created'
    }
    try {
      await tx.commit()
    } catch (error) {
      if (isRevisionConflict(error)) continue
      throw error
    }
    if (outcome === 'replaced') {
      await syncDraftImage(entry, taskRenderEntryId)
      return 'replaced'
    }
    created = true
  }
  throw new Error(
    `The gallery entry of Task ${entry.taskId} could not be saved: it kept changing`,
  )
}
