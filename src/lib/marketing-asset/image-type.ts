/** The image types the gallery accepts in this slice (spec §4.1). */
export const MARKETING_ASSET_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const
export type MarketingAssetImageType =
  (typeof MARKETING_ASSET_IMAGE_TYPES)[number]

/** The largest image the gallery takes. Checked by the token AND the move. */
export const MARKETING_ASSET_MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** The cap as people read it, derived so the copy cannot drift from the check. */
export const MARKETING_ASSET_MAX_IMAGE_LABEL = `${MARKETING_ASSET_MAX_IMAGE_BYTES / (1024 * 1024)} MB`

/** The refusals the client and the server both show. */
export const MARKETING_ASSET_TYPE_REFUSAL =
  'Only PNG, JPEG and WebP images can be added.'
export const MARKETING_ASSET_SIZE_REFUSAL = `The image is larger than ${MARKETING_ASSET_MAX_IMAGE_LABEL}.`

/**
 * How long the move's upload to Sanity may take before it gives up. Kept well
 * inside the move route's 60 s `maxDuration`, so the blob delete and the
 * answer still run.
 */
export const SANITY_UPLOAD_DEADLINE_MS = 45_000

/** How many leading bytes {@link sniffImageType} needs. */
export const SNIFF_BYTES = 12

/** Below this short side an image may look soft on social (spec §3). */
export const SOFT_ON_SOCIAL_SHORT_SIDE = 1080

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((b, i) => bytes[offset + i] === b)

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/**
 * The real type of an image from its magic bytes, or `null` for anything the
 * gallery does not accept. Never the client's claim, never the extension.
 */
export function sniffImageType(
  bytes: Uint8Array,
): MarketingAssetImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8))
    return 'image/webp'
  return null
}

/** A short side under 1080 px: warn, never refuse. Unknown size: no warning. */
export function isSoftOnSocial(
  dimensions:
    { width: number | null; height: number | null } | null | undefined,
): boolean {
  if (!dimensions?.width || !dimensions.height) return false
  return (
    Math.min(dimensions.width, dimensions.height) < SOFT_ON_SOCIAL_SHORT_SIDE
  )
}
