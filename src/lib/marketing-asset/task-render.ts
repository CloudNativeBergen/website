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
 * attaches racing past the read cannot make two entries.
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

export async function saveTaskRenderToGallery(
  entry: TaskRenderGalleryEntry,
): Promise<'created' | 'replaced' | 'unchanged'> {
  const existing = await scopedFetch<{
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
  )
  if (existing) {
    if (existing.assetId === entry.imageAssetId) return 'unchanged'
    await clientWrite
      .patch(existing._id)
      .ifRevisionId(existing._rev)
      .set({
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: entry.imageAssetId },
        },
      })
      .commit()
    return 'replaced'
  }
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
  return 'created'
}
