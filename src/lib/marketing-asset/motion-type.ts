/**
 * GIFs and short videos in the gallery (docs/MARKETING_ASSETS_SPEC.md §4.1):
 * a GIF up to 10 MB, an MP4 up to 100 MB. MP4 is the one video format every
 * platform we looked at agrees on, so a QuickTime `.mov` is refused even
 * though it is the same kind of box file. Client-safe: constants, the byte
 * sniffs and the browser-side kind check. The server decides from the bytes.
 */

export const MARKETING_ASSET_GIF_TYPE = 'image/gif'
export const MARKETING_ASSET_VIDEO_TYPE = 'video/mp4'

const MB = 1024 * 1024
export const MARKETING_ASSET_MAX_GIF_BYTES = 10 * MB
export const MARKETING_ASSET_MAX_VIDEO_BYTES = 100 * MB

export const MARKETING_ASSET_MAX_GIF_LABEL = `${MARKETING_ASSET_MAX_GIF_BYTES / MB} MB`
export const MARKETING_ASSET_MAX_VIDEO_LABEL = `${MARKETING_ASSET_MAX_VIDEO_BYTES / MB} MB`

export const MARKETING_ASSET_GIF_TYPE_REFUSAL = 'That file is not a GIF.'
export const MARKETING_ASSET_GIF_SIZE_REFUSAL = `The GIF is larger than ${MARKETING_ASSET_MAX_GIF_LABEL}.`
export const MARKETING_ASSET_VIDEO_TYPE_REFUSAL =
  'Only MP4 video can be added. Export a .mov again as MP4 and retry.'
export const MARKETING_ASSET_VIDEO_SIZE_REFUSAL = `The video is larger than ${MARKETING_ASSET_MAX_VIDEO_LABEL}.`
export const MARKETING_ASSET_POSTER_REFUSAL =
  'This browser could not read the video’s first frame. Try another browser, or export the video again as H.264 MP4.'

/** How many leading bytes {@link sniffMotionType} needs. */
export const MOTION_SNIFF_BYTES = 12

/**
 * The `ftyp` major brands of an MP4. A QuickTime file says `qt  `; an MP4
 * written by anything we know says one of these.
 */
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'dash',
])

const text = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to))

/** A GIF by its signature: `GIF87a` or `GIF89a`. */
export function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false
  const signature = text(bytes, 0, 6)
  return signature === 'GIF87a' || signature === 'GIF89a'
}

/**
 * An MP4 by its first box: `ftyp` with an MP4 major brand. Refuses a
 * QuickTime `.mov` (brand `qt  `, or no `ftyp` at all) whatever it is called.
 */
export function isMp4(bytes: Uint8Array): boolean {
  if (bytes.length < MOTION_SNIFF_BYTES) return false
  return text(bytes, 4, 8) === 'ftyp' && MP4_BRANDS.has(text(bytes, 8, 12))
}

export type MotionKind = 'gif' | 'video'

/**
 * Which motion kind the browser should upload a picked file as, from its type
 * or extension, or null when it is neither. A quick answer for the form only.
 */
export function motionKindForFile(file: {
  name: string
  type: string
}): MotionKind | null {
  const ext = file.name.toLowerCase().split('.').pop()
  if (file.type === MARKETING_ASSET_GIF_TYPE || ext === 'gif') return 'gif'
  if (file.type === MARKETING_ASSET_VIDEO_TYPE || ext === 'mp4') return 'video'
  return null
}

/** A `.mov` (or any QuickTime) the form refuses by name before uploading. */
export function isQuickTimeFile(file: { name: string; type: string }): boolean {
  return (
    file.type === 'video/quicktime' || /\.mov$/i.test(file.name.trim())
  )
}
