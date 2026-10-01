import { getPlatformConstraints } from '@/lib/social/provider/constraints'
import { SOCIAL_PLATFORM_LABELS, type SocialPlatform } from '@/lib/social/types'
import {
  DEFAULT_STUDIO_FORMAT,
  STUDIO_FORMATS,
  STUDIO_FORMAT_IDS,
  type StudioFormat,
} from './format'
import type { MarketingAssetRow } from './types'

/**
 * Which Format suits a post's Channel, and what the platform does to one that
 * does not (docs/MARKETING_STUDIO_FORMATS_SPEC.md §6). Client-safe: the
 * server ranks the post picker with it and the editor warns with it, so the
 * two never disagree.
 */

/**
 * The Format a Channel's feed is laid out for: LinkedIn → landscape, Bluesky
 * → square. Null for a Channel with no native Format, whose picker keeps its
 * order.
 */
export function channelFormat(
  platform: SocialPlatform | null | undefined,
): StudioFormat | null {
  if (platform === 'linkedin') return 'landscape'
  if (platform === 'bluesky') return 'square'
  return null
}

const aspect = (format: StudioFormat) =>
  STUDIO_FORMATS[format].width / STUDIO_FORMATS[format].height

/**
 * The Format an image's shape is nearest to, compared on the log of the
 * aspect ratio so "twice as wide" and "twice as tall" are equally far. An
 * unknown size reads as square, like everything else without a Format.
 */
export function shapeFormat(
  width: number | null | undefined,
  height: number | null | undefined,
): StudioFormat {
  if (!width || !height || width <= 0 || height <= 0)
    return DEFAULT_STUDIO_FORMAT
  const ratio = Math.log(width / height)
  let nearest: StudioFormat = DEFAULT_STUDIO_FORMAT
  for (const format of STUDIO_FORMAT_IDS) {
    if (
      Math.abs(ratio - Math.log(aspect(format))) <
      Math.abs(ratio - Math.log(aspect(nearest)))
    )
      nearest = format
  }
  return nearest
}

/**
 * A gallery entry's Format: the one the studio recorded (the row projection
 * reads a studio card without one as square, spec §6), else an upload's
 * shape.
 */
export function entryFormat(
  row: Pick<MarketingAssetRow, 'studio' | 'width' | 'height'>,
): StudioFormat {
  return row.studio?.format ?? shapeFormat(row.width, row.height)
}

/**
 * What picking an entry of `format` into a post on `platform` warns, or null
 * when the Format is the Channel's own (or the Channel has none). A warning
 * only: the organizer may want it, and the pick goes through.
 */
export function formatMismatchWarning(
  platform: SocialPlatform,
  format: StudioFormat,
): string | null {
  const wanted = channelFormat(platform)
  if (wanted === null || wanted === format) return null
  const name = SOCIAL_PLATFORM_LABELS[platform]
  const shape = STUDIO_FORMATS[format].label.toLowerCase()
  const crop = getPlatformConstraints(platform)?.imageAspectRatio ?? null
  if (crop === null) {
    return `${name} does not crop images: this ${shape} one shows at its own shape, not as a ${STUDIO_FORMATS[wanted].label.toLowerCase()}.`
  }
  const lost = aspect(format) < crop ? 'top and bottom' : 'sides'
  return `${name} crops images to ${crop}:1 in the feed, so this ${shape} one loses its ${lost}. Check the crop, or pick a ${STUDIO_FORMATS[wanted].label.toLowerCase()} entry.`
}
