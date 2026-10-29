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
 * under the `raw` perspective at API version {@link COUNT_API_VERSION}: `raw`
 * sees drafts, and from that version on it also sees Content Release
 * `versions.**` documents, which the clients' own `apiVersion` (2023-05-03)
 * does not. That matters since #1160: an organizer can re-upload another
 * tenant's image bytes, get the SAME deduplicated asset id back, and then ask
 * for it to be deleted — a count blind to release-only references would read
 * 0 and delete the other tenant's file. Not verified against a real release
 * document (production has none); Sanity's refusal to delete a strongly
 * referenced document stays the backstop. A failed count (`-1`) also keeps
 * the asset: fail closed.
 */
/** The first API version whose `raw` perspective includes release versions. */
export const COUNT_API_VERSION = '2025-02-19'

/**
 * How many documents, in any tenant, reference `assetId`: the count
 * {@link deleteAssetIfOrphaned} decides by. -1 when it could not be read.
 */
export async function countAssetReferences(assetId: string): Promise<number> {
  try {
    const result = await clientReadUncached
      .withConfig({ apiVersion: COUNT_API_VERSION })
      .fetch<{ n: number }>(
        // groq-global: an asset can be shared by documents in any tenant, so the
        // safety check must see all of them. The object wrapper is not needed:
        // the API answers a bare `count()` with a plain number, 0 included. It
        // is the `sanity documents query` CLI that errors on a bare zero.
        groq`{ "n": count(*[references($assetId)]) }`,
        { assetId },
        { cache: 'no-store', perspective: 'raw' },
      )
    return result?.n ?? -1
  } catch {
    return -1
  }
}

/**
 * Whether a document other than `except` (and its draft and release
 * versions) holds `assetId` NOW: true, false, or null when it can't be told.
 * Without `except`, whether any document does.
 *
 * The query that finds the holders lags the document store, so a holder it
 * names may have let go already (a Wall Post whose Delete unset its `photo`
 * moments ago, or one the retention cron just deleted). Each is read again
 * through the doc endpoint, the latest committed version, and counts only if
 * it still references the asset; the first that does answers true.
 */
export async function isAssetHeld(
  assetId: string,
  {
    except,
    signal,
    seen,
  }: {
    except?: string
    /** Ends every request: the client's `timeout` does not bound a read. */
    signal?: AbortSignal
    /** Collects every id the holder queries named, for a caller's log. */
    seen?: string[]
  } = {},
): Promise<boolean | null> {
  const client = clientReadUncached.withConfig({
    apiVersion: COUNT_API_VERSION,
  })
  const queries =
    except === undefined
      ? [
          // groq-global: an asset can be held by a document of any tenant.
          groq`*[references($assetId)]._id`,
          // groq-global: the recheck, as wide.
          groq`*[references($assetId) || photo.asset._ref == $assetId]._id`,
        ]
      : [
          // groq-global: an asset can be held by a document of any tenant.
          groq`*[references($assetId) && !(_id in [$except, "drafts." + $except]) && !(_id in path("versions.*." + $except))]._id`,
          // groq-global: the recheck, as wide.
          groq`*[(references($assetId) || photo.asset._ref == $assetId) && !(_id in [$except, "drafts." + $except]) && !(_id in path("versions.*." + $except))]._id`,
        ]
  // The view can also MISS a holder (#1646: an approved post's photo read
  // as free). "Not held" is only answered once a second query, by
  // `references()` and the Wall Post's `photo.asset._ref` path, finds no
  // holder either. A weak reference does not stop Sanity's delete: this
  // read is all that protects it.
  for (const query of queries) {
    let holders: string[]
    try {
      holders = await client.fetch<string[]>(
        query,
        except === undefined ? { assetId } : { assetId, except },
        {
          cache: 'no-store',
          perspective: 'raw',
          ...(signal ? { signal } : {}),
        },
      )
    } catch {
      return null
    }
    for (const id of holders ?? []) {
      seen?.push(id)
      let doc: Record<string, unknown> | null | undefined
      try {
        doc = await client.getDocument(id, signal ? { signal } : undefined)
      } catch {
        return null
      }
      // `getDocument('a,b')` reads a list: checked on what came back.
      if (doc && doc._id === id && refersTo(doc, assetId)) return true
    }
  }
  return false
}

/** Whether any reference in `value` points at `id`. */
function refersTo(value: unknown, id: string): boolean {
  if (Array.isArray(value)) return value.some((v) => refersTo(v, id))
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record._ref === id) return true
  return Object.values(record).some((v) => refersTo(v, id))
}

async function deleteAssetIfOrphaned(
  assetId: string | null,
): Promise<OrphanedAssetDeletion> {
  if (!assetId) return { id: null, deleted: false, remainingReferences: 0 }

  const remainingReferences = await countAssetReferences(assetId)
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
