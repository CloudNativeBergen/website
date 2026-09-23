import { getDomain } from 'tldts'
import { normalizeDomain } from '@/lib/conference/domains'
import { platformDomainSuffix } from '@/lib/domain-verification/platform'
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
 * Every http(s) URL in a run of text — and every bare `www.` host, which
 * LinkedIn autolinks exactly as it does a scheme-carrying URL. Deliberately
 * greedy on the URL body and then trimmed of trailing sentence punctuation,
 * because copy written by hand ends links with a full stop or a closing
 * bracket far more often than a URL legitimately ends with one.
 */
const URL_IN_TEXT = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+/gi

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]}'"»…]+$/u, '')
}

/**
 * The registrable domain (eTLD+1) of a host, with the Public Suffix List's
 * PRIVATE section honoured — so `cndn.vercel.app` is its own site and a
 * sponsor's `demo.vercel.app` is a different one, exactly as browsers scope
 * cookies. `null` for IP literals, single-label hosts (`localhost`) and hosts
 * that are themselves a public suffix.
 */
function registrableDomain(host: string): string | null {
  return getDomain(host, { allowPrivateDomains: true })
}

/**
 * A hostname the way the URL parser writes it — lower-case, punycode, no
 * terminal dot — so an IDN `domains[]` entry typed in Unicode compares equal
 * to the `URL.hostname` of a link to it. `null` for something that is not a
 * hostname at all.
 */
function canonicalHost(host: string): string | null {
  try {
    return new URL(`https://${host}`).hostname.replace(/\.$/, '')
  } catch {
    return null
  }
}

/**
 * True when `host` is on the conference's OWN site. Per `domains[]` entry
 * (wildcards skipped: `*.vercel.app` is a hosting zone, not a site):
 *
 * - the entry itself, or anything UNDER it (`www.`, a deeper path host);
 * - the entry's registrable APEX and `www.` of it — the edition host
 *   `2026.cloudnativedays.no` is what is listed, and the apex an organizer
 *   types by hand redirects straight to it;
 * - but NOT other siblings under that apex, and NOT the apex when the entry
 *   is a tenant host minted on the platform's own zone (`acme.konf.run`):
 *   `konf.run` is not on the Public Suffix List, so by registrable domain
 *   every hosted tenant would be one site and a post naming another
 *   conference's edition, or the platform itself, would be refused as ours.
 *   The zone is `PLATFORM_DOMAIN_SUFFIX`; the server resolves it and hands
 *   it to the browser in the editor read (`platformZone`), so the live
 *   editor and the router agree — the editor disables Save on an issue, so
 *   a stricter browser rule would block copy the server accepts.
 *
 * A host with no registrable domain (`localhost`, an IP) matches exactly. The
 * entry's `:port` is dropped first: a dev entry such as `localhost:3000`
 * carries one and `conferenceBaseUrl` KEEPS it in the links it derives, while
 * `URL.hostname` never does.
 */
function isOwnDomain(
  host: string,
  domains: readonly string[],
  platformZone: string | null | undefined,
): boolean {
  const zone =
    platformZone === undefined ? platformDomainSuffix() : platformZone
  // A host minted on the platform zone belongs to the tenant holding that
  // host — never to an entry at or above the zone, be it the zone itself
  // (the operator's conference listing `konf.run`) or an ancestor of a
  // nested zone (`example.com` above `events.example.com`).
  const mintedOnZone = zone !== null && host.endsWith(`.${zone}`)
  return domains.some((entry) => {
    const raw = normalizeDomain(entry).replace(/:\d+$/, '')
    if (!raw || raw.startsWith('*.')) return false
    const e = canonicalHost(raw)
    if (!e) return false
    if (host === e) return true
    if (host.endsWith(`.${e}`)) {
      return mintedOnZone ? e !== zone && e.endsWith(`.${zone}`) : true
    }
    // A host minted on the platform zone (`acme.konf.run`, or on a nested
    // zone `acme.events.example.com`) is the whole site: no apex expansion,
    // whatever registrable domain the zone happens to sit under.
    if (zone !== null && (e === zone || e.endsWith(`.${zone}`))) return false
    const apex = registrableDomain(e)
    if (!apex || apex === e) return false
    return host === apex || host === `www.${apex}`
  })
}

/**
 * The URLs in `text` that point at the conference's own site, as written.
 * Exported for the copy-ready view, so what the rule refuses and what that
 * view warns about can never be two different notions of "our link".
 */
export function ownDomainUrlsIn(
  text: string,
  domains: readonly string[] = [],
  platformZone?: string | null,
): string[] {
  if (domains.length === 0) return []
  const found: string[] = []
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = trimTrailingPunctuation(match[0])
    let host: string
    try {
      // A bare `www.` host has no scheme for the parser; LinkedIn treats it
      // as https. A fully-qualified `example.no.` keeps its terminal dot
      // through WHATWG parsing but names the same host.
      host = new URL(
        /^www\./i.test(url) ? `https://${url}` : url,
      ).hostname.replace(/\.$/, '')
    } catch {
      continue
    }
    if (isOwnDomain(host, domains, platformZone)) found.push(url)
  }
  return found
}

/**
 * Spec §3.1 (#1134): on a platform that posts the link as the FIRST COMMENT,
 * the body may not link to the conference's own site.
 *
 * Split out of {@link validatePublishInput} because the publish engine needs
 * exactly THIS rule before it hands a variant to an organizer — and only this
 * one. Running the whole validator there would re-apply the media rules, and
 * an image deleted from the post since scheduling would turn a hand-over into
 * a failure, which the copy-ready view has always handled with a banner
 * instead. One implementation, two callers, no drift.
 */
export function firstCommentIssues(
  constraints: PlatformConstraints,
  text: string,
  conferenceDomains: readonly string[] = [],
  platformZone?: string | null,
): ValidationIssue[] {
  if (constraints.linkPlacement !== 'comment') return []
  const ours = ownDomainUrlsIn(text, conferenceDomains, platformZone)
  if (ours.length === 0) return []
  return [
    {
      field: 'body',
      message: `The link is posted as the first comment, never in the body: remove ${ours.join(', ')} from the text. If it came from a Recipe or Template, fix that too, or the next draft will carry it again.`,
    },
  ]
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
  issues.push(
    ...firstCommentIssues(
      constraints,
      input.text,
      context.conferenceDomains,
      context.platformZone,
    ),
  )

  return issues
}
