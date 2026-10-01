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
 * The size an entry's image is posted at: its pixels inside the stored crop,
 * which a post keeps and the rendition applies before the platform's own crop
 * (`defaultCropRect`). A crop that trims everything is ignored there, and so
 * here.
 */
export function croppedSize(
  row: Pick<MarketingAssetRow, 'width' | 'height' | 'crop'>,
): { width: number | null; height: number | null } {
  const { width, height, crop } = row
  if (!width || !height || !crop) return { width, height }
  const keptX = 1 - crop.left - crop.right
  const keptY = 1 - crop.top - crop.bottom
  if (keptX <= 0 || keptY <= 0 || keptX > 1 || keptY > 1)
    return { width, height }
  return { width: width * keptX, height: height * keptY }
}

/**
 * A gallery entry's Format: the one the studio recorded (the row projection
 * reads a studio card without one as square, spec §6), else the shape an
 * upload is posted at.
 */
export function entryFormat(
  row: Pick<MarketingAssetRow, 'studio' | 'width' | 'height' | 'crop'>,
): StudioFormat {
  if (row.studio) return row.studio.format
  const { width, height } = croppedSize(row)
  return shapeFormat(width, height)
}

/**
 * How much of an upload a platform's crop may take before picking it warns:
 * 10% of its width or height. 16:9, the commonest camera and screen shape,
 * loses 7% to LinkedIn's 1.91:1 and stays silent; 3:2 loses 21% and warns.
 */
export const CROP_LOSS_TOLERANCE = 0.1

/** An entry as picking it is judged: its Format, and its posted size if known. */
export interface PickedEntry {
  format: StudioFormat
  /** The size it is posted at (`croppedSize`); unknown leaves the Format to judge. */
  size?: { width: number | null; height: number | null } | null
  /** A studio card: captured at its Format's pixels, judged by its Format. */
  studio?: boolean
}

/**
 * What picking `entry` into a post on `platform` warns, or null. A warning
 * only: the organizer may want it, and the pick goes through.
 *
 * A studio card, or an upload of unknown size, warns when its Format is not
 * the Channel's. An upload of known size warns when the platform's crop takes
 * more than {@link CROP_LOSS_TOLERANCE} of it, whatever Format it ranked as: a
 * 4:1 banner ranks as landscape yet loses half its width. Where the size is
 * known the warning says how much, and from which edges.
 */
export function formatMismatchWarning(
  platform: SocialPlatform,
  entry: PickedEntry,
): string | null {
  const wanted = channelFormat(platform)
  if (wanted === null) return null
  const name = SOCIAL_PLATFORM_LABELS[platform]
  const crop = getPlatformConstraints(platform)?.imageAspectRatio ?? null
  const { width, height } = entry.size ?? {}
  const shape = width && height ? width / height : null
  if (crop === null) {
    if (entry.format === wanted) return null
    return `${name} does not crop images: this one is posted at its own shape rather than ${STUDIO_FORMATS[wanted].label.toLowerCase()}.`
  }
  const judgedByFormat = entry.studio === true || shape === null
  const loss =
    shape === null ? null : 1 - Math.min(shape, crop) / Math.max(shape, crop)
  const quiet = judgedByFormat
    ? entry.format === wanted
    : (loss ?? 0) <= CROP_LOSS_TOLERANCE
  if (quiet) return null
  const tall = (shape ?? aspect(entry.format)) < crop
  const lost =
    loss === null
      ? `its ${tall ? 'top and bottom' : 'sides'}`
      : `about ${Math.round(loss * 100)}% of its ${tall ? 'height (top and bottom)' : 'width (sides)'}`
  const target = STUDIO_FORMATS[wanted]
  return `${name} posts go out cropped to ${crop}:1, so this image loses ${lost}. Check the crop, or pick a ${target.label.toLowerCase()} (${target.width}×${target.height}) entry.`
}
