import 'server-only'
import { createHash } from 'node:crypto'
import type { Patch } from '@sanity/client'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { renderAlt } from '@/lib/marketing/render-handoff'
import { detailsPatch } from './sanity'
import {
  MARKETING_ASSET_SUBJECT_TYPES,
  type MarketingAssetSubjectType,
} from './types'
import type { TaskRenderCard } from './studio'

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
 * A first entry's title, alt and subject are taken from the SAME read of the
 * Task whose revision guards the write, so an edit of the Task after the
 * attach is either in the entry or refuses the write and is read again.
 *
 * Throws on failure. The caller must never let that fail the attach.
 */
type Subject = { type: MarketingAssetSubjectType; id: string }


export interface TaskRenderGalleryEntry {
  /** The request host's organization; never from the client. */
  orgId: string
  /** The Task's edition, which the caller's tenancy guard admitted. */
  conferenceId: string
  taskId: string
  imageAssetId: string
  /**
   * Where the render was made, when it was a card on a tab with a Format
   * switch. Absent (the meme generator, a collage, the promo), the entry
   * claims none, and a replaced image's record goes with it.
   */
  studio?: TaskRenderCard
  /**
   * The Task's subject as this organization's gallery may store it: the
   * subject, or null to leave out one that fails its guards. Throws to fail
   * the save.
   */
  admitSubject: (subject: Subject) => Promise<Subject | null>
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

/**
 * What a render's gallery save must hold against. Every write is guarded by
 * ONE mechanism (below); these are the actors it guards against:
 *
 *  - a NEWER attach of the same Task (the Task, entry and draft move on);
 *  - Studio opening a DRAFT of the entry, copied from its image at the time;
 *  - a Content RELEASE copy of the entry, likewise;
 *  - an organizer editing (title, tags, alt) or deleting the entry;
 *  - a RETRY of this same attach.
 *
 * The invariant: a write lands only while the Task still holds THIS render,
 * and the save reports done only once a read taken AFTER its last write shows
 * the Task on this render, the entry on it, any draft on it, and no release
 * copy on another image.
 */
interface GalleryState {
  task: {
    _rev: string
    assetId: string | null
    title: string | null
    alt: string | null
    subjectName: string | null
    subject: Subject | null
  } | null
  entry: { _id: string; _rev: string; assetId: string | null } | null
  draft: { _rev: string; assetId: string | null } | null
  /** Release copies of the entry holding another image than this render. */
  staleReleaseCopies: number
}

async function readState(entry: TaskRenderGalleryEntry): Promise<GalleryState> {
  const [task, found] = await Promise.all([
    scopedFetch<GalleryState['task']>(
      clientReadUncached,
      { conferenceId: entry.conferenceId },
      `*[_type == "marketingTask" && _id == $taskId][0]{ _rev, "assetId": asset.asset._ref,
        title, alt, "subjectName": coalesce(subject->name, subject->title),
        "subject": select(subject->_type in $subjectTypes => { "id": subject._ref, "type": subject->_type }) }`,
      {
        taskId: entry.taskId,
        subjectTypes: [...MARKETING_ASSET_SUBJECT_TYPES],
      },
      { cache: 'no-store' },
    ),
    scopedFetch<GalleryState['entry']>(
      clientReadUncached,
      { orgId: entry.orgId },
      `*[_type == "marketingAsset" && task._ref == $taskId && _id in path("*")] | order(_createdAt asc)[0]{
        _id, _rev, "assetId": image.asset._ref
      }`,
      { taskId: entry.taskId },
      { cache: 'no-store' },
    ),
  ])
  if (!found) return { task, entry: null, draft: null, staleReleaseCopies: 0 }
  const [draft, releases] = await Promise.all([
    scopedFetch<GalleryState['draft']>(
      clientReadUncached,
      { orgId: entry.orgId },
      `*[_type == "marketingAsset" && _id == $draftId][0]{ _rev, "assetId": image.asset._ref }`,
      { draftId: `drafts.${found._id}` },
      { cache: 'no-store' },
    ),
    // At an API version whose `raw` perspective includes release versions;
    // the clients' own does not see them at all.
    scopedFetch<{ n: number } | null>(
      clientReadUncached.withConfig({
        apiVersion: '2025-02-19',
        perspective: 'raw',
      }),
      { orgId: entry.orgId },
      `{ "n": count(*[_type == "marketingAsset" && _id in path("versions.*." + $id) && image.asset._ref != $imageAssetId]) }`,
      { id: found._id, imageAssetId: entry.imageAssetId },
      { cache: 'no-store' },
    ),
  ])
  return {
    task,
    entry: found,
    draft,
    staleReleaseCopies: releases?.n ?? 0,
  }
}

/** The image fields a render writes on its entry and on a draft of it. */
function imageFields(imageAssetId: string, studio?: TaskRenderCard) {
  return {
    image: {
      _type: 'image',
      asset: { _type: 'reference', _ref: imageAssetId },
    },
    // The entry's own file, so deleting the entry deletes it once nothing
    // references it (the gallery delete's orphan check).
    createdImageAssetId: imageAssetId,
    // The card it was made from, its Format with it, moves with the image.
    ...(studio ? { studio: { tab: studio.tab, format: studio.format } } : {}),
  }
}

/** A replaced image's patch: the new image, and no stale card record. */
function replaceImage(patch: Patch, entry: TaskRenderGalleryEntry) {
  const set = patch.set(imageFields(entry.imageAssetId, entry.studio))
  return entry.studio ? set : set.unset(['studio'])
}

/** Sanity refused a revision guard: something moved since the read. */
function isRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes('revision')
  )
}

/**
 * Save this render to its Task's gallery entry: create it, or replace its
 * IMAGE (and a Studio draft's) only.
 *
 * ONE mechanism guards every write: read the state; write whatever is not on
 * this render yet — the entry (created, or patched under its revision) and
 * a draft (patched under ITS revision) — in ONE transaction that also carries
 * a revision guard on the Task as read (a no-op patch, as the gallery delete
 * guards its own document); then read again, and repeat until a read shows
 * everything on this render. So nothing lands after a newer attach moved the
 * Task (`superseded`), a draft or entry that changed under the write is read
 * again, and a draft or release copy made from the old image while this ran
 * is seen by the verifying read.
 *
 * A stale release copy cannot be written from here (a release is Studio's to
 * change), so it FAILS the save, and the Task's pending mark stays for a
 * retry, as the gallery's own edit and delete refuse the same case.
 *
 * At most four writes, each followed by its verifying read, so the last
 * write is verified too before the save gives up.
 *
 * NOT covered: a draft or release copy made AFTER the verifying read from a
 * stale copy of the entry held in someone's browser. Studio writes that copy,
 * not this save, so no condition on this save's writes can refuse it.
 */
export async function saveTaskRenderToGallery(
  entry: TaskRenderGalleryEntry,
): Promise<'created' | 'replaced' | 'unchanged' | 'superseded'> {
  let result: 'created' | 'replaced' | 'unchanged' = 'unchanged'
  for (let attempt = 0; ; attempt++) {
    const state = await readState(entry)
    const { task, entry: found, draft } = state
    if (!task || task.assetId !== entry.imageAssetId) return 'superseded'
    if (found && state.staleReleaseCopies > 0)
      throw new Error(
        `The gallery entry ${found._id} is part of a Content Release in Studio; its image is replaced once the release lets it go`,
      )
    const entryDone = found?.assetId === entry.imageAssetId
    const draftDone = !draft || draft.assetId === entry.imageAssetId
    if (found && entryDone && draftDone) return result
    if (attempt === 4) break
    const tx = clientWrite
      .transaction()
      .patch(entry.taskId, (p) =>
        p.ifRevisionId(task._rev).unset(['_galleryGuard']),
      )
    if (!found) {
      // A create that lost a race to another attach is a no-op; the next
      // read shows what it left.
      // From THIS read of the Task, which the transaction's guard binds.
      const subject = task.subject
        ? await entry.admitSubject(task.subject)
        : null
      const title = task.title ?? ''
      const { set } = detailsPatch({
        title: title.trim() || 'Studio render',
        // The subject's NAME only when the subject passed: a rejected one's
        // name must not reach this organization's gallery through the alt.
        alt: renderAlt({
          title,
          alt: task.alt,
          subjectName: subject ? task.subjectName : null,
        }),
        scope: 'edition',
        conferenceId: entry.conferenceId,
        subject: subject ?? undefined,
        tags: [],
        credit: undefined,
      })
      tx.createIfNotExists({
        _id: taskRenderAssetDocumentId(entry.taskId),
        _type: 'marketingAsset',
        organization: { _type: 'reference', _ref: entry.orgId },
        kind: 'image',
        source: 'studio',
        task: { _type: 'reference', _ref: entry.taskId, _weak: true },
        ...set,
        ...imageFields(entry.imageAssetId, entry.studio),
      })
    } else {
      if (!entryDone)
        tx.patch(found._id, (p) =>
          replaceImage(p.ifRevisionId(found._rev), entry),
        )
      if (draft && !draftDone)
        tx.patch(`drafts.${found._id}`, (p) =>
          replaceImage(p.ifRevisionId(draft._rev), entry),
        )
    }
    try {
      await tx.commit()
    } catch (error) {
      if (isRevisionConflict(error)) continue
      throw error
    }
    // Replacing the image outranks a create that turned out a no-op.
    if (!found) result = 'created'
    else if (!entryDone || result === 'unchanged') result = 'replaced'
  }
  throw new Error(
    `The gallery entry of Task ${entry.taskId} could not be saved: it kept changing`,
  )
}
