/**
 * Whether an asset can go into a social post today (spec §5). Only a still
 * image: a GIF (by its file, whatever `kind` says) and a video must wait for
 * automatic video posting, and an audio track never goes into a post. The
 * server refuses on this, not only the picker's mark: the attachment schema
 * would accept a GIF's image id.
 */
export function isAttachableToPost(asset: {
  kind: string | null
  assetId: string | null
  mimeType?: string | null
}): boolean {
  if ((asset.kind ?? 'image') !== 'image' || !asset.assetId) return false
  // The id encodes the format (`image-<hash>-WxH-gif`); the MIME type is
  // checked too, for an asset whose id does not say.
  return asset.mimeType !== 'image/gif' && !asset.assetId.endsWith('-gif')
}

/** The picker's refusal and mark, one wording on both sides. */
export const NOT_ATTACHABLE_YET =
  "GIFs and videos can't be attached to a post yet."
