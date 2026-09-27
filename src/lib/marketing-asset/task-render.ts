import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { detailsPatch } from './sanity'
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
 * The entry never records `createdImageAssetId`: the Task's own upload made
 * the file, and Sanity may have handed that upload bytes it already held, so
 * deleting the asset in the gallery never deletes the file (see the gallery's
 * delete). The file this replaces is the render the Task REPLACED, which the
 * Task already records for the shared orphan check (#1162); the caller runs
 * that check after this, so the old file goes only once nothing holds it.
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

export function taskRenderAssetDocumentId(taskId: string): string {
  return `marketingAsset-task-${taskId}`
}

/** What the entry and its Task hold now. */
async function readState(entry: TaskRenderGalleryEntry) {
  const [taskAssetId, existing] = await Promise.all([
    scopedFetch<string | null>(
      clientReadUncached,
      { conferenceId: entry.conferenceId },
      `*[_type == "marketingTask" && _id == $taskId][0].asset.asset._ref`,
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
  return { taskAssetId, existing }
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

/**
 * `superseded`: the Task holds another render now, so nothing is written —
 * a slower attach must never put an older render back.
 */
export async function saveTaskRenderToGallery(
  entry: TaskRenderGalleryEntry,
): Promise<'created' | 'replaced' | 'unchanged' | 'superseded'> {
  let created = false
  // Twice at most: a create that lost a race to another attach is a no-op,
  // so what it left is read back and, if need be, replaced.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { taskAssetId, existing } = await readState(entry)
    if (taskAssetId !== entry.imageAssetId) return 'superseded'
    if (existing) {
      if (existing.assetId === entry.imageAssetId)
        return created ? 'created' : 'unchanged'
      const image = {
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: entry.imageAssetId },
        },
      }
      // The image only, on the entry and on any Studio draft of it (which
      // would otherwise put the old image back when published). Revision
      // guarded: an entry another attach just moved fails this one.
      const tx = clientWrite
        .transaction()
        .patch(existing._id, (p) => p.ifRevisionId(existing._rev).set(image))
      if (await hasDraft(entry.orgId, existing._id))
        tx.patch(`drafts.${existing._id}`, (p) => p.set(image))
      await tx.commit()
      return 'replaced'
    }
    if (created) break
    const { set } = detailsPatch({
      title: entry.title.trim() || 'Studio render',
      alt: entry.alt,
      scope: 'edition',
      conferenceId: entry.conferenceId,
      subject: entry.subject ?? undefined,
      tags: [],
      credit: undefined,
    })
    await clientWrite.createIfNotExists({
      _id: taskRenderAssetDocumentId(entry.taskId),
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: entry.orgId },
      kind: 'image',
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: entry.imageAssetId },
      },
      source: 'studio',
      task: { _type: 'reference', _ref: entry.taskId, _weak: true },
      ...set,
    })
    created = true
  }
  throw new Error(
    `The gallery entry of Task ${entry.taskId} could not be found after creating it`,
  )
}
