import 'server-only'
import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { countAssetReferences } from '@/lib/sanity/orphaned-asset'

/**
 * A Sanity asset a failed gallery upload stored, waiting for the delayed
 * orphan check (#1167). Hidden from the Studio; see `marketingAssetCleanup`.
 */
export const PENDING_CLEANUP_TYPE = 'marketingAssetCleanup'

/**
 * How long a failed upload's file waits before the orphan check may delete
 * it: far longer than any concurrent move can take (the move route's
 * `maxDuration` is 300 s; a test holds this above it).
 *
 * WHY A DELAY AND NOT "DID THIS UPLOAD CREATE IT": Sanity deduplicates
 * identical bytes into ONE asset, so two uploads of the same file at the same
 * moment — in two tenants, say — both get the asset back as brand new. If one
 * fails and deleted it at once, the other, still moving and not yet
 * referenced by its gallery entry, would lose its file. After this delay any
 * such upload has either written its reference, which the orphan check sees,
 * or failed too.
 */
export const PENDING_CLEANUP_DELAY_MS = 60 * 60 * 1000

/** One record per asset: a later failure of the same bytes re-arms it. */
const recordId = (assetId: string) => `${PENDING_CLEANUP_TYPE}.${assetId}`

/**
 * Durably note assets a failed upload stored, for {@link sweepPendingCleanups}.
 * The id is kept as a plain string, NEVER a reference, so the record itself
 * never counts as a use of the asset. Never throws: a record that cannot be
 * written leaves the file in Sanity (unreferenced, never deleted), which is
 * logged — deleting it here instead is exactly the race this exists to avoid.
 */
export async function recordPendingCleanup(
  assetIds: readonly string[],
  now: number = Date.now(),
): Promise<void> {
  if (assetIds.length === 0) return
  const recordedAt = new Date(now).toISOString()
  try {
    const tx = clientWrite.transaction()
    for (const assetId of assetIds)
      tx.createOrReplace({
        _id: recordId(assetId),
        _type: PENDING_CLEANUP_TYPE,
        assetId,
        recordedAt,
      })
    await tx.commit()
  } catch (error) {
    console.error(
      'Marketing asset: cleanup of a failed upload not recorded',
      assetIds,
      error,
    )
  }
}

/**
 * Take assets a move just returned off the queue (#1243 review): Sanity hands
 * the SAME asset to a later upload of the same bytes, in any tenant, and that
 * upload holds no reference to it until its gallery write. Called before the
 * route goes on (before a video's MP4 streams, before the write). Never
 * throws: a removal that fails is logged and the upload goes on — the sweep's
 * delete of a file then referenced is refused by Sanity, and a gallery write
 * to a file it did delete fails loudly (a strong reference), never silently.
 */
export async function unqueuePendingCleanup(
  assetIds: readonly string[],
): Promise<void> {
  if (assetIds.length === 0) return
  try {
    const tx = clientWrite.transaction()
    // A delete of a record that does not exist is a no-op.
    for (const assetId of assetIds) tx.delete(recordId(assetId))
    await tx.commit()
  } catch (error) {
    console.error(
      'Marketing asset: a reused file was not taken off the cleanup queue',
      assetIds,
      error,
    )
  }
}

export interface PendingCleanupSweep {
  deleted: number
  /** Still referenced: some upload of the same bytes kept it. */
  kept: number
  /** The check or the delete failed, or the record changed: next run. */
  retried: number
}

/**
 * Run the shared orphan check (#1159) on every recorded asset older than
 * {@link PENDING_CLEANUP_DELAY_MS}: an unreferenced one is deleted, a
 * referenced one kept, and either way its record goes.
 *
 * The delete is ONE transaction that first claims the record at the revision
 * this sweep read (`ifRevisionID`), then deletes the record and the asset. A
 * record the route took off the queue since (a later upload reusing the
 * file) or queued again (a newer failure) fails the claim, and the asset is
 * not touched; Sanity also refuses the delete of an asset referenced since
 * the count. What stays open: an upload whose move got the asset back AFTER
 * the count but whose un-queue lands after this commit — a round trip wide —
 * whose gallery write is then refused (a strong reference to a missing
 * document), so the organizer sees a failure to retry, not a broken entry.
 */
export async function sweepPendingCleanups(
  now: number = Date.now(),
): Promise<PendingCleanupSweep> {
  const result: PendingCleanupSweep = { deleted: 0, kept: 0, retried: 0 }
  const due = await clientReadUncached.fetch<
    { _id: string; _rev: string; assetId: string }[]
  >(
    // groq-global: platform-internal cleanup queue of Sanity assets, which are
    // shared across tenants; the record carries no tenant.
    groq`*[_type == $type && recordedAt < $before]{ _id, _rev, assetId }`,
    {
      type: PENDING_CLEANUP_TYPE,
      before: new Date(now - PENDING_CLEANUP_DELAY_MS).toISOString(),
    },
    { cache: 'no-store' },
  )
  for (const record of due ?? []) {
    const references = await countAssetReferences(record.assetId)
    if (references < 0) {
      result.retried++
      continue
    }
    const tx = clientWrite
      .transaction()
      .patch(record._id, (p) =>
        p
          .ifRevisionId(record._rev)
          .set({ claimedAt: new Date(now).toISOString() }),
      )
      .delete(record._id)
    if (references === 0) tx.delete(record.assetId)
    try {
      await tx.commit()
      if (references === 0) result.deleted++
      else result.kept++
    } catch (error) {
      console.error(
        'Marketing asset: cleanup of a failed upload deferred',
        error,
      )
      result.retried++
    }
  }
  return result
}
