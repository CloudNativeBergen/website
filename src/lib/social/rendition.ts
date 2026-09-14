import { createImageUrlBuilder } from '@sanity/image-url'
import { SANITY_IMAGE_REF_PATTERN } from '@/lib/homepage/richText'
import { parseImageRefDimensions } from '@/lib/homepage/richTextImage'

/**
 * The rendition function (spec §9 step 2, #1005): the image a platform
 * actually receives, computed from (asset, Studio crop/hotspot, platform
 * aspect ratio, per-variant override) as a Sanity CDN URL. Pure and
 * browser-safe — the editor previews with it, the adapter fetches bytes
 * from it — so the organizer sees exactly what goes out.
 *
 * Built from the PUBLIC project/dataset env like `richTextImage.ts`: the
 * token-bearing clients in `@/lib/sanity/client` must not enter the browser
 * bundle. Only ids matching {@link SANITY_IMAGE_REF_PATTERN} produce a URL,
 * so the host is always `cdn.sanity.io`.
 */

/** A rectangle in normalized (0–1) coordinates of the FULL source image. */
export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

/** Sanity's Studio crop: fractions trimmed from each edge. */
export interface StudioCrop {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ImageAsset {
  assetId: string
  /** Source pixel size, from `asset->metadata.dimensions` or the id. */
  width: number
  height: number
  hotspot?: { x: number; y: number } | null
  crop?: StudioCrop | null
}

/** An asset from its id alone (the id encodes the pixel size). */
export function imageAssetFromRef(assetId: string): ImageAsset | null {
  const dims = parseImageRefDimensions(assetId)
  return dims ? { assetId, ...dims } : null
}

const FULL: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 }

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const round = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * The platform's default crop: the largest window of `aspectRatio` that
 * fits inside the Studio crop, centred on the hotspot (or the crop's centre)
 * and clamped to stay inside it. `null` aspect = the platform shows the
 * whole (Studio-cropped) image.
 */
export function defaultCropRect(
  asset: ImageAsset,
  aspectRatio: number | null,
): NormalizedRect {
  const crop = asset.crop
  const region = crop
    ? {
        x: clamp(crop.left, 0, 1),
        y: clamp(crop.top, 0, 1),
        width: clamp(1 - crop.left - crop.right, 0, 1),
        height: clamp(1 - crop.top - crop.bottom, 0, 1),
      }
    : FULL
  if (aspectRatio === null || region.width === 0 || region.height === 0) {
    return region
  }
  const regionAspect =
    (region.width * asset.width) / (region.height * asset.height)
  let width: number
  let height: number
  if (regionAspect > aspectRatio) {
    height = region.height
    width = (aspectRatio * height * asset.height) / asset.width
  } else {
    width = region.width
    height = (width * asset.width) / aspectRatio / asset.height
  }
  const centreX = asset.hotspot ? asset.hotspot.x : region.x + region.width / 2
  const centreY = asset.hotspot ? asset.hotspot.y : region.y + region.height / 2
  const x = clamp(
    centreX - width / 2,
    region.x,
    region.x + region.width - width,
  )
  const y = clamp(
    centreY - height / 2,
    region.y,
    region.y + region.height - height,
  )
  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
  }
}

export function isValidRect(
  rect: NormalizedRect | null | undefined,
): rect is NormalizedRect {
  if (!rect) return false
  const { x, y, width, height } = rect
  const finite = [x, y, width, height].every(Number.isFinite)
  return (
    finite &&
    width > 0 &&
    height > 0 &&
    x >= 0 &&
    y >= 0 &&
    x + width <= 1 + 1e-6 &&
    y + height <= 1 + 1e-6
  )
}

/** The rect the rendition uses: a valid per-variant override, else the default. */
export function renditionRect(
  asset: ImageAsset,
  aspectRatio: number | null,
  override?: NormalizedRect | null,
): NormalizedRect {
  return isValidRect(override) ? override : defaultCropRect(asset, aspectRatio)
}

const builder = createImageUrlBuilder({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || '',
})

/** Long edge the adapters send; keeps every platform under its byte cap. */
export const RENDITION_MAX_WIDTH = 2000

export function renditionUrl(
  asset: ImageAsset,
  rect: NormalizedRect,
  options: { maxWidth?: number } = {},
): string {
  if (!SANITY_IMAGE_REF_PATTERN.test(asset.assetId)) return ''
  const left = Math.round(rect.x * asset.width)
  const top = Math.round(rect.y * asset.height)
  const width = Math.max(1, Math.round(rect.width * asset.width))
  const height = Math.max(1, Math.round(rect.height * asset.height))
  return builder
    .image({ _type: 'reference', _ref: asset.assetId })
    .rect(left, top, width, height)
    .width(Math.min(options.maxWidth ?? RENDITION_MAX_WIDTH, width))
    .fit('max')
    .auto('format')
    .quality(85)
    .url()
}
