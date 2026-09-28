/**
 * The ORIGINAL file of a GIF or video, to post by hand (spec §5). Never a
 * rendition: Sanity's image pipeline re-encodes whatever it serves with a
 * parameter — measured on 2026-09-28, a GIF fetched with `?dl=` came back as
 * different bytes (still animated, but not the file uploaded) — so:
 *
 *  - a video is a FILE asset, which the CDN serves unchanged; `?dl=` only adds
 *    `content-disposition: attachment` (measured: same SHA-256 as uploaded);
 *  - a GIF is an IMAGE asset, whose unchanged bytes are served only WITHOUT
 *    parameters, inline — and a cross-origin `download` attribute is ignored.
 *    It is relayed by our own route, which adds the attachment header.
 */

/** `Speaker wave!.gif` → `speaker-wave.gif`: a plain name to save as. */
export function originalFilename(title: string, kind: 'gif' | 'video'): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'asset'
  return `${base}.${kind === 'gif' ? 'gif' : 'mp4'}`
}

/** The same-origin route that relays a GIF's original bytes. */
export function gifOriginalRoute(assetId: string): string {
  return `/api/admin/marketing-assets/original?asset=${encodeURIComponent(assetId)}`
}

/**
 * Where the original of one gallery row is downloaded, or null for a kind
 * posted another way (an image goes into the post; a track never does).
 */
export function originalDownloadUrl(row: {
  _id: string
  kind: string
  title: string
  videoUrl: string | null
  imageUrl: string | null
}): string | null {
  if (row.kind === 'video' && row.videoUrl)
    return `${row.videoUrl}?dl=${encodeURIComponent(originalFilename(row.title, 'video'))}`
  if (row.kind === 'gif' && row.imageUrl) return gifOriginalRoute(row._id)
  return null
}
