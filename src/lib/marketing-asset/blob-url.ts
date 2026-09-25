/**
 * Where a marketing asset waits in Vercel Blob between the browser's direct
 * upload and the server's move into Sanity (spec §4.1), and the check that the
 * move applies to the URL it is handed BEFORE it fetches anything.
 *
 * The URL comes from the client, so it is never trusted: it must be on OUR
 * store's host and name a blob under THIS organization's prefix. Everything
 * else is refused without a request being made.
 */

/** The prefix every marketing-asset blob of any organization starts with. */
export const MARKETING_ASSET_BLOB_PREFIX = 'marketing-asset-'

/** The prefix of one organization's pending uploads. */
export function marketingAssetPrefix(orgId: string): string {
  return `${MARKETING_ASSET_BLOB_PREFIX}${orgId}-`
}

/**
 * What must follow the organization prefix: a 13-digit millisecond timestamp,
 * then a filename of plain characters. Pinning the timestamp is what keeps
 * organization ids apart: `organization-a` is a string prefix of
 * `organization-a-b`, so a bare `startsWith` would let the first reach the
 * second's blobs. After our prefix, theirs continues with `b-`, not digits.
 * KNOWN LIMIT: an organization whose id is OURS plus `-<13 digits>-…` would
 * still match. No id has that shape (they are `organization-<slug>` or a
 * domain), and the blob URL also carries Vercel's unguessable random suffix.
 */
const AFTER_PREFIX = /^\d{13}-[A-Za-z0-9-]+(\.[A-Za-z0-9]+)?$/

/**
 * Whether `pathname` (no leading slash) names a blob under THIS organization's
 * prefix, in the shape {@link marketingAssetPathname} builds. The token route
 * and the move both decide with this one function.
 */
export function isMarketingAssetPathname(
  pathname: string,
  orgId: string,
): boolean {
  if (!orgId) return false
  const prefix = marketingAssetPrefix(orgId)
  return (
    pathname.startsWith(prefix) &&
    AFTER_PREFIX.test(pathname.slice(prefix.length))
  )
}

export type BlobUrlCheck =
  | { ok: true; url: string; filename: string }
  | { ok: false; reason: 'host' | 'prefix' }

/**
 * Decide whether the move may fetch `url` for `orgId`. `storeHost` is our own
 * store's host ({@link blobStoreHost}); `null` (unconfigured) refuses.
 */
export function checkMarketingAssetBlobUrl(
  url: string,
  orgId: string,
  storeHost: string | null,
): BlobUrlCheck {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'host' }
  }
  if (
    !storeHost ||
    parsed.protocol !== 'https:' ||
    parsed.hostname !== storeHost ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return { ok: false, reason: 'host' }
  }

  const pathname = parsed.pathname.slice(1)
  if (
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !isMarketingAssetPathname(pathname, orgId)
  ) {
    return { ok: false, reason: 'prefix' }
  }
  return { ok: true, url: parsed.href, filename: pathname }
}

/**
 * The pathname the browser uploads to: the organization prefix, a timestamp
 * and the original filename reduced to plain characters. Vercel Blob adds its
 * own random suffix before the extension.
 */
export function marketingAssetPathname(
  orgId: string,
  filename: string,
  now: number,
): string {
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
  const safe =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image'
  const safeExt = ext.replace(/[^a-z0-9]/g, '')
  return `${marketingAssetPrefix(orgId)}${now}-${safe}${safeExt ? `.${safeExt}` : ''}`
}

/**
 * Our Blob store's public host, from the same variables `@vercel/blob` reads:
 * `BLOB_STORE_ID`, else the store id inside `BLOB_READ_WRITE_TOKEN`
 * (`vercel_blob_rw_<storeId>_<secret>`). `null` when neither yields a plain id.
 */
export function blobStoreHost(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const fromId = env.BLOB_STORE_ID?.trim().replace(/^store_/, '')
  const fromToken = env.BLOB_READ_WRITE_TOKEN?.split('_')[3]
  const storeId = fromId || fromToken
  if (!storeId || !/^[A-Za-z0-9]+$/.test(storeId)) return null
  return `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
}
