import type { TypedObject } from 'sanity'
import type { Conference } from '@/lib/conference/types'
import { isProgramPublished } from '@/lib/conference/state'

/**
 * Front-page builder (F1 + F2): the CLOSED, typed section registry.
 *
 * The homepage is composed from an ordered list of typed section configs stored
 * on the conference as `homepageSections[]`. The registry is deliberately CLOSED
 * — a fixed discriminated union keyed on the Sanity `_type` — because every block
 * maps to a vetted house component. There is intentionally no raw-HTML / embed
 * block: an open block would be a brand-consistency and XSS hazard on a
 * multi-tenant deployment.
 *
 * ZERO-MIGRATION GUARANTEE: when `homepageSections` is ABSENT (every legacy
 * conference), the page renders {@link getDefaultSections} — a phase-aware
 * reproduction of the pre-builder homepage, pixel-for-pixel. Sections carry only
 * their OWN presentation config; their content still comes from the existing
 * conference sources (featured speakers, schedules, sponsors, gallery, …).
 */

/**
 * The discriminator is the Sanity `_type` (Sanity-native — array items already
 * carry it), so no redundant `type` field is stored. Namespaced with `homepage`
 * so the inline object type names never collide with other schema types.
 */
export const HOMEPAGE_SECTION_TYPES = [
  'homepageHero',
  'homepageFeaturedSpeakers',
  'homepageProgramHighlights',
  'homepageOrganizers',
  'homepageSponsors',
  'homepageGallery',
  'homepageMetrics',
  'homepageCtaBanner',
  'homepageRichText',
  'homepageFaq',
  'homepageCountdown',
  'homepageVenue',
] as const

/** Default heading for the FAQ block when none is configured. */
export const DEFAULT_FAQ_HEADING = 'Frequently asked questions'

export type HomepageSectionType = (typeof HOMEPAGE_SECTION_TYPES)[number]

export function isHomepageSectionType(
  value: unknown,
): value is HomepageSectionType {
  return (
    typeof value === 'string' &&
    (HOMEPAGE_SECTION_TYPES as readonly string[]).includes(value)
  )
}

/** A single Hero CTA override (F1). Replaces the phase-aware CTA row when set. */
export interface HeroCtaOverride {
  _key?: string
  label: string
  href: string
}

/** Fields every section shares. `hidden` drives the F1 per-section visibility. */
interface BaseSection {
  _key: string
  /** When true the renderer skips this section entirely. */
  hidden?: boolean
}

/**
 * The Hero. Stays SMART by default: an absent override renders exactly today's
 * tagline/description/phase-aware CTA row. Provided overrides win (see
 * {@link Hero}).
 */
export interface HeroSection extends BaseSection {
  _type: 'homepageHero'
  heroHeadline?: string
  heroSubheadline?: string
  /** When non-empty, replaces the phase-aware CTA row with these buttons. */
  ctaOverrides?: HeroCtaOverride[]
}

export interface FeaturedSpeakersSection extends BaseSection {
  _type: 'homepageFeaturedSpeakers'
}

export interface ProgramHighlightsSection extends BaseSection {
  _type: 'homepageProgramHighlights'
}

export interface OrganizersSection extends BaseSection {
  _type: 'homepageOrganizers'
}

export interface SponsorsSection extends BaseSection {
  _type: 'homepageSponsors'
}

export interface GallerySection extends BaseSection {
  _type: 'homepageGallery'
}

/** Standalone vanity-metrics band (content from `conference.vanityMetrics`). */
export interface MetricsSection extends BaseSection {
  _type: 'homepageMetrics'
  heading?: string
}

/** Generic call-to-action banner (heading + body + one house Button). */
export interface CtaBannerSection extends BaseSection {
  _type: 'homepageCtaBanner'
  heading: string
  body?: string
  buttonLabel: string
  buttonHref: string
}

/** Generic portable-text block, rendered with the shared portable-text renderer. */
export interface RichTextSection extends BaseSection {
  _type: 'homepageRichText'
  heading?: string
  content: TypedObject[]
}

/**
 * A single FAQ entry for the block's OWN item source. The answer is plain text,
 * mirroring how `conference.ticketFaqs` models answers (see `TicketFaq`) so the
 * `source: 'ticketFaqs'` toggle can render the exact same shape.
 */
export interface HomepageFaqItem {
  _key?: string
  question: string
  answer: string
}

/**
 * FAQ accordion block. To avoid duplicating content, `source: 'ticketFaqs'`
 * renders the existing `conference.ticketFaqs`; the default `'own'` renders this
 * block's own {@link HomepageFaqItem} list.
 */
export interface FaqSection extends BaseSection {
  _type: 'homepageFaq'
  heading?: string
  /** `'own'` (default) renders `items`; `'ticketFaqs'` renders the ticket FAQs. */
  source?: 'own' | 'ticketFaqs'
  items?: HomepageFaqItem[]
}

/**
 * Countdown to the conference start. The target is `conference.startDate` unless
 * `targetOverride` is set. The renderer resolves the target server-side and the
 * client component ticks after hydration (SSR-safe — see {@link resolveCountdownTarget}
 * and the `Countdown` component).
 */
export interface CountdownSection extends BaseSection {
  _type: 'homepageCountdown'
  heading?: string
  /** ISO date/timestamp that overrides `conference.startDate` as the target. */
  targetOverride?: string
  /** Shown once the target passes. Blank hides the block after the target. */
  liveMessage?: string
}

/**
 * Venue block. Name and address come from `conference.venueName` /
 * `venueAddress`; the block carries only presentation copy. The "Get directions"
 * link is CONSTRUCTED from the address at render (no map tiles/embeds, and no
 * tenant-entered URL is stored).
 */
export interface VenueSection extends BaseSection {
  _type: 'homepageVenue'
  heading?: string
  description?: string
}

export type HomepageSection =
  | HeroSection
  | FeaturedSpeakersSection
  | ProgramHighlightsSection
  | OrganizersSection
  | SponsorsSection
  | GallerySection
  | MetricsSection
  | CtaBannerSection
  | RichTextSection
  | FaqSection
  | CountdownSection
  | VenueSection

/** True when the program is published AND at least one schedule day exists. */
export function hasPublishedSchedule(conference: Conference): boolean {
  return (
    isProgramPublished(conference) && (conference.schedules?.length ?? 0) > 0
  )
}

/**
 * The pre-builder homepage, reproduced as an ordered section list. This is what
 * renders when `homepageSections` is ABSENT — it MUST stay pixel-identical to the
 * legacy page, including the phase-dependent MIDDLE slot:
 *
 *   Hero → Gallery → (ProgramHighlights | FeaturedSpeakers | Organizers) → Sponsors
 *
 * The middle slot is mutually exclusive exactly as the legacy `if/else` chain:
 * a published schedule wins over featured speakers, which win over the organizers
 * fallback. Each section's own renderer additionally data-guards (e.g. Gallery
 * renders nothing without featured images), matching the legacy conditionals.
 */
export function getDefaultSections(conference: Conference): HomepageSection[] {
  const sections: HomepageSection[] = [
    { _key: 'default-hero', _type: 'homepageHero' },
    { _key: 'default-gallery', _type: 'homepageGallery' },
  ]

  const hasFeaturedSpeakers = (conference.featuredSpeakers?.length ?? 0) > 0
  const hasOrganizers = (conference.organizers?.length ?? 0) > 0

  if (hasPublishedSchedule(conference)) {
    sections.push({
      _key: 'default-program',
      _type: 'homepageProgramHighlights',
    })
  } else if (hasFeaturedSpeakers) {
    sections.push({
      _key: 'default-featured-speakers',
      _type: 'homepageFeaturedSpeakers',
    })
  } else if (hasOrganizers) {
    sections.push({ _key: 'default-organizers', _type: 'homepageOrganizers' })
  }

  sections.push({ _key: 'default-sponsors', _type: 'homepageSponsors' })
  return sections
}

/**
 * Resolve the ordered section list to render for a conference. A NON-EMPTY
 * stored `homepageSections` composition wins; otherwise the phase-aware default
 * (the legacy layout). An empty stored array falls back to the default so a
 * tenant can never accidentally blank their whole homepage.
 */
export function resolveHomepageSections(
  conference: Conference,
): HomepageSection[] {
  const stored = conference.homepageSections
  if (stored && stored.length > 0) return stored
  return getDefaultSections(conference)
}
