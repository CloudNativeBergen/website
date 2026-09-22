import { domainServesHost, normalizeDomain } from '@/lib/conference/domains'
import type { SocialPlatform } from '../types'
import type {
  LengthCounting,
  PlatformConstraints,
  PublishContext,
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
  // Spec §4.2: 3,000 characters; LinkedIn's organic multi-image post takes up
  // to 20 images. Spec §3.1 (#1134): the link is ALWAYS the first comment —
  // never in the body, never a link attachment.
  linkedin: {
    maxLength: 3000,
    counting: 'characters',
    maxImages: 20,
    imageMimeTypes: RASTER_MIME_TYPES,
    requiresImage: false,
    requiresAlt: false,
    urlLengthCost: null,
    linkPlacement: 'comment',
    imageAspectRatio: 1.91,
    maxBytes: null,
    linkCardDisplacesImages: false,
  },
  // Spec §4.1: 300 graphemes (and the lexicon's 3,000 UTF-8 bytes), ≤ 4
  // images, alt mandatory, link goes into the external embed. The embed
  // slot holds the card OR images: with a link the first image is the
  // card's thumbnail. Bluesky shows images at their native aspect, so the
  // rendition is the Studio-cropped image, never a forced crop.
  bluesky: {
    maxLength: 300,
    counting: 'graphemes',
    maxImages: 4,
    imageMimeTypes: RASTER_MIME_TYPES,
    requiresImage: false,
    requiresAlt: true,
    urlLengthCost: null,
    linkPlacement: 'card',
    imageAspectRatio: null,
    maxBytes: 3000,
    linkCardDisplacesImages: true,
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
 * Every http(s) URL in a run of text. Deliberately greedy on the URL body and
 * then trimmed of trailing sentence punctuation, because copy written by hand
 * ends links with a full stop or a closing bracket far more often than a URL
 * legitimately ends with one.
 */
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`\\]+/gi

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]}'"»…]+$/u, '')
}

/**
 * True when `host` is the conference's OWN — an exact `domains[]` entry, a
 * host the entry's routing wildcard serves ({@link domainServesHost}, the
 * predicate `getConferenceForDomain` resolves with), or a subdomain of a bare
 * entry (an organizer pasting `www.` of the apex they own).
 */
function isOwnDomain(host: string, domains: readonly string[]): boolean {
  return domains.some((entry) => {
    const e = normalizeDomain(entry)
    if (!e) return false
    if (domainServesHost(e, host)) return true
    return !e.startsWith('*.') && host.endsWith(`.${e}`)
  })
}

/** The URLs in `text` that point at the conference's own site, as written. */
function ownDomainUrlsIn(
  text: string,
  domains: readonly string[] = [],
): string[] {
  if (domains.length === 0) return []
  const found: string[] = []
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = trimTrailingPunctuation(match[0])
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      continue
    }
    if (isOwnDomain(host, domains)) found.push(url)
  }
  return found
}

/**
 * Pure. Runs live in the editor, at schedule time, at save time and again
 * at publish, against the same constraints object.
 */
export function validatePublishInput(
  constraints: PlatformConstraints,
  input: PublishInput,
  context: PublishContext = {},
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
    if (constraints.maxBytes !== null) {
      const bytes = new TextEncoder().encode(input.text).byteLength
      if (bytes > constraints.maxBytes) {
        issues.push({
          field: 'body',
          message: `${bytes} bytes, the limit is ${constraints.maxBytes}.`,
        })
      }
    }
  }

  if (constraints.requiresImage && input.media.length === 0) {
    issues.push({ field: 'media', message: 'An image is required.' })
  }
  if (
    constraints.linkCardDisplacesImages &&
    input.link !== undefined &&
    input.media.length > 1
  ) {
    issues.push({
      field: 'media',
      message:
        'With a link the platform shows a link card, and the first image becomes its thumbnail: keep one image or drop the link.',
    })
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

  // Spec §3.1 (#1134). Matched on the HOST, never against `input.link`: the
  // body's URL is frozen when the Task is materialized while `link` is
  // re-derived at save and again at approval, so an exact match would miss
  // exactly the already-materialized drafts this rule exists to catch. URLs
  // on other hosts are someone else's page and are left alone.
  if (constraints.linkPlacement === 'comment') {
    const ours = ownDomainUrlsIn(input.text, context.conferenceDomains ?? [])
    if (ours.length > 0) {
      issues.push({
        field: 'body',
        message: `The link is posted as the first comment, never in the body: remove ${ours.join(', ')} from the text.`,
      })
    }
  }

  return issues
}
