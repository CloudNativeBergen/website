import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'

/** What happened to an asset the caller asked to delete if orphaned. */
export interface OrphanedAssetDeletion {
  id: string | null
  deleted: boolean
  /** Remaining references found before the delete; -1 means the read failed. */
  remainingReferences: number
}

/**
 * Delete a Sanity ASSET, not just a reference to it, once NOTHING references it.
 *
 * Unsetting a reference removes the pointer; the file stays live and publicly
 * fetchable on `cdn.sanity.io` forever. It is only safe to delete once no
 * document of any type, in any tenant, references the asset — a gallery image,
 * a post or another speaker may share it — so the reference count is checked
 * first and a non-zero count keeps the asset and reports it. The count runs
 * under the `raw` perspective so it sees drafts and release versions too; the
 * API's default perspective became `published` at v2025-02-19, which would
 * read a confident 0 for an asset only a draft still uses. A failed count
 * (`-1`) also keeps it: fail closed.
 */
async function deleteAssetIfOrphaned(
  assetId: string | null,
): Promise<OrphanedAssetDeletion> {
  if (!assetId) return { id: null, deleted: false, remainingReferences: 0 }

  let remainingReferences = -1
  try {
    const result = await clientReadUncached.fetch<{ n: number }>(
      // groq-global: an asset can be shared by documents in any tenant, so the
      // safety check must see all of them. A bare zero `count()` is wrapped in
      // an object because Sanity errors on a bare scalar count projection.
      groq`{ "n": count(*[references($assetId)]) }`,
      { assetId },
      { cache: 'no-store', perspective: 'raw' },
    )
    remainingReferences = result?.n ?? -1
  } catch {
    return { id: assetId, deleted: false, remainingReferences: -1 }
  }

  if (remainingReferences !== 0) {
    return { id: assetId, deleted: false, remainingReferences }
  }

  try {
    await clientWrite.delete(assetId)
    return { id: assetId, deleted: true, remainingReferences: 0 }
  } catch {
    return { id: assetId, deleted: false, remainingReferences: 0 }
  }
}

/**
 * Delete an image asset (`image-…`) only if nothing references it. The id's
 * prefix is not checked; the two names exist so call sites say what they hold.
 */
export function deleteImageAssetIfOrphaned(
  assetId: string | null,
): Promise<OrphanedAssetDeletion> {
  return deleteAssetIfOrphaned(assetId)
}

/** Delete a file asset (`file-…`, e.g. video) only if nothing references it. */
export function deleteFileAssetIfOrphaned(
  assetId: string | null,
): Promise<OrphanedAssetDeletion> {
  return deleteAssetIfOrphaned(assetId)
}
