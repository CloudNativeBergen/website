import type { SocialPlatform } from '../types'
import type {
  LengthCounting,
  PlatformConstraints,
  PublishInput,
  ValidationIssue,
} from './types'

/**
 * Client-safe platform rules (dashboard #788): the plain-data half of every
 * `SocialPublishAdapter`, kept OUT of the adapter classes so the variant
 * editor can apply them live without credentials or a server round trip.
 * The adapters (#1005 Bluesky, #1006 LinkedIn manual) expose the same object
 * as `constraints` and delegate `validate` to {@link validatePublishInput},
 * so what the editor shows and what the engine refuses never drift.
 */

const RASTER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const PLATFORM_CONSTRAINTS = {
  // Spec §4.2: 3,000 characters, link in body allowed. LinkedIn's organic
  // multi-image post takes up to 20 images.
  linkedin: {
    maxLength: 3000,
    counting: 'characters',
    maxImages: 20,
    imageMimeTypes: RASTER_MIME_TYPES,
    requiresImage: false,
    requiresAlt: false,
    urlLengthCost: null,
    linkInBody: true,
    imageAspectRatio: 1.91,
  },
  // Spec §4.1: 300 graphemes, ≤ 4 images, alt mandatory, link goes into the
  // external embed (and may also appear in the body as a facet). Bluesky
  // shows images at their native aspect (the embed carries `aspectRatio`),
  // so the rendition is the Studio-cropped image, never a forced crop.
  bluesky: {
    maxLength: 300,
    counting: 'graphemes',
    maxImages: 4,
    imageMimeTypes: RASTER_MIME_TYPES,
    requiresImage: false,
    requiresAlt: true,
    urlLengthCost: null,
    linkInBody: true,
    imageAspectRatio: null,
  },
} as const satisfies Partial<Record<SocialPlatform, PlatformConstraints>>

export type ConstrainedPlatform = keyof typeof PLATFORM_CONSTRAINTS

/** `null` for a platform no adapter describes yet: the editor shows no rules. */
export function getPlatformConstraints(
  platform: SocialPlatform,
): PlatformConstraints | null {
  if (!Object.hasOwn(PLATFORM_CONSTRAINTS, platform)) return null
  return PLATFORM_CONSTRAINTS[platform as ConstrainedPlatform]
}

/**
 * Length the way the platform counts it. Bluesky's limit is in graphemes
 * (`RichText.graphemeLength`), so a flag emoji costs one, not four.
 */
export function countLength(text: string, counting: LengthCounting): number {
  if (counting === 'characters') return text.length
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...segmenter.segment(text)].length
}

/**
 * Pure. Runs live in the editor, at schedule time, at save time and again
 * at publish, against the same constraints object.
 */
export function validatePublishInput(
  constraints: PlatformConstraints,
  input: PublishInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (input.text.trim().length === 0) {
    issues.push({ field: 'body', message: 'The post is empty.' })
  } else {
    const length = countLength(input.text, constraints.counting)
    if (length > constraints.maxLength) {
      issues.push({
        field: 'body',
        message: `${length} characters, the limit is ${constraints.maxLength}.`,
      })
    }
  }

  if (constraints.requiresImage && input.media.length === 0) {
    issues.push({ field: 'media', message: 'An image is required.' })
  }
  if (input.media.length > constraints.maxImages) {
    issues.push({
      field: 'media',
      message: `${input.media.length} images, the limit is ${constraints.maxImages}.`,
    })
  }
  const missingAlt =
    constraints.requiresAlt &&
    input.media.some((m) => m.alt.trim().length === 0)
  if (missingAlt) {
    issues.push({
      field: 'media',
      message: 'Every image needs alt text.',
    })
  }
  const badType = input.media.find(
    (m) => !constraints.imageMimeTypes.includes(m.mimeType),
  )
  if (badType) {
    issues.push({
      field: 'media',
      message: `${badType.mimeType.replace('image/', '')} images are not accepted; use ${constraints.imageMimeTypes
        .map((t) => t.replace('image/', ''))
        .join(', ')}.`,
    })
  }

  if (input.link !== undefined && !/^https?:\/\/\S+$/i.test(input.link)) {
    issues.push({
      field: 'link',
      message: 'The link must start with http:// or https://.',
    })
  }

  return issues
}
