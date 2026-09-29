import 'server-only'
import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { deleteAssetIfOrphaned } from '@/lib/sanity/orphaned-asset'

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

export interface PendingCleanupSweep {
  deleted: number
  /** Still referenced: some upload of the same bytes kept it. */
  kept: number
  /** The check or the delete failed: tried again on the next run. */
  retried: number
}

/**
 * Run the shared orphan check (#1159) on every recorded asset older than
 * {@link PENDING_CLEANUP_DELAY_MS}: an unreferenced one is deleted, a
 * referenced one kept, and either way its record goes. A failed check or
 * delete keeps the record for the next run.
 */
export async function sweepPendingCleanups(
  now: number = Date.now(),
): Promise<PendingCleanupSweep> {
  const result: PendingCleanupSweep = { deleted: 0, kept: 0, retried: 0 }
  const due = await clientReadUncached.fetch<
    { _id: string; assetId: string }[]
  >(
    // groq-global: platform-internal cleanup queue of Sanity assets, which are
    // shared across tenants; the record carries no tenant.
    groq`*[_type == $type && recordedAt < $before]{ _id, assetId }`,
    {
      type: PENDING_CLEANUP_TYPE,
      before: new Date(now - PENDING_CLEANUP_DELAY_MS).toISOString(),
    },
    { cache: 'no-store' },
  )
  for (const record of due ?? []) {
    const outcome = await deleteAssetIfOrphaned(record.assetId)
    if (outcome.deleted) result.deleted++
    else if (outcome.remainingReferences > 0) result.kept++
    else {
      result.retried++
      continue
    }
    try {
      await clientWrite.delete(record._id)
    } catch (error) {
      console.error('Marketing asset: cleanup record not removed', error)
    }
  }
  return result
}
