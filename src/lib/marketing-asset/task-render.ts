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

/** Whether a Studio draft of the entry exists, so its image moves too. */
async function hasDraft(orgId: string, id: string): Promise<boolean> {
  const n = await scopedFetch<{ n: number } | null>(
    clientReadUncached,
    { orgId },
    `{ "n": count(*[_type == "marketingAsset" && _id == $draftId]) }`,
    { draftId: `drafts.${id}` },
    { cache: 'no-store' },
  )
  return (n?.n ?? 0) > 0
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
    let outcome: 'created' | 'replaced'
    if (existing) {
      if (existing.assetId === entry.imageAssetId)
        return created ? 'created' : 'unchanged'
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
      const image = {
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: entry.imageAssetId },
        },
        // The entry's own file, so deleting the entry deletes it once
        // nothing references it (the gallery delete's orphan check).
        createdImageAssetId: entry.imageAssetId,
      }
      // The image only, on the entry and on any Studio draft of it (which
      // would otherwise put the old image back when published).
      tx.patch(existing._id, (p) => p.ifRevisionId(existing._rev).set(image))
      if (await hasDraft(entry.orgId, existing._id))
        tx.patch(`drafts.${existing._id}`, (p) => p.set(image))
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
    if (outcome === 'replaced') return 'replaced'
    created = true
  }
  throw new Error(
    `The gallery entry of Task ${entry.taskId} could not be saved: it kept changing`,
  )
}
