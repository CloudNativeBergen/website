import type { TypedObject } from 'sanity'
import type { Conference } from '@/lib/conference/types'
import { isProgramPublished } from '@/lib/conference/state'
import { resolveHomepageLifecycle } from './lifecycle'

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
 * conference), the page renders {@link getDefaultSections} — a lifecycle-aware
 * reproduction of the pre-builder homepage. Sections carry only their OWN
 * presentation config; their content still comes from the existing conference
 * sources (featured speakers, schedules, sponsors, gallery, …).
 *
 * The guarantee is precise: a conference that has ANY event content to show —
 * a programme, or featured speakers — renders the identical section list it did
 * before the lifecycle work. The composition only changes in states that
 * previously rendered a hole or an all-zero band; see {@link getDefaultSections}.
 */

/**
 * The discriminator is the Sanity `_type` (Sanity-native — array items already
 * carry it), so no redundant `type` field is stored. Namespaced with `homepage`
 * so the inline object type names never collide with other schema types.
 */
export const HOMEPAGE_SECTION_TYPES = [
  'homepageHero',
  'homepageSaveTheDate',
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

/**
 * Human labels for each block type. Lives in this SERVER-SAFE module (not
 * `./editor`, which pulls in the client-only @dnd-kit) so the admin settings
 * page — a server component — can render section names without dragging
 * drag-and-drop code into the RSC module graph.
 */
export const SECTION_LABELS: Record<HomepageSectionType, string> = {
  homepageHero: 'Hero',
  homepageSaveTheDate: 'Save the Date',
  homepageFeaturedSpeakers: 'Featured Speakers',
  homepageProgramHighlights: 'Program Highlights',
  homepageOrganizers: 'Organizers',
  homepageSponsors: 'Sponsors',
  homepageGallery: 'Photo Gallery',
  homepageMetrics: 'Vanity Metrics',
  homepageCtaBanner: 'Call-to-action Banner',
  homepageRichText: 'Rich Text',
  homepageFaq: 'FAQ',
  homepageCountdown: 'Countdown',
  homepageVenue: 'Venue',
}

/**
 * DEFAULT SECTION COPY — the house wording each block falls back to when a
 * tenant has configured nothing. These constants ARE the pre-config strings,
 * moved out of the components verbatim, so an unconfigured section renders
 * exactly what it rendered before the copy became configurable (the
 * zero-migration guarantee above, extended to copy).
 */
export const DEFAULT_FAQ_HEADING = 'Frequently asked questions'
export const DEFAULT_GALLERY_HEADING = 'Conference Moments'
export const DEFAULT_GALLERY_DESCRIPTION =
  'Relive the energy and excitement from our past events. Browse through captured moments featuring speakers, attendees, and the vibrant community atmosphere.'
export const DEFAULT_FEATURED_SPEAKERS_HEADING = 'Featured Speakers'
export const DEFAULT_ORGANIZERS_HEADING = 'Meet Our Organizers'
export const DEFAULT_SPONSORS_HEADING = 'Our sponsors'
export const DEFAULT_SPONSORS_DESCRIPTION =
  'Meet our sponsors who are fueling the cluster and keeping the pods running!'
export const DEFAULT_SPONSORS_CTA_HEADING = 'Become a Sponsor'
export const DEFAULT_SPONSORS_CTA_DESCRIPTION =
  "Level up your brand's visibility among Kubernetes enthusiasts, container wranglers, and cloud architects. We have sponsorship tiers for every cluster size."

/** Default sub-heading under the featured-speakers heading. */
export function defaultFeaturedSpeakersDescription(
  conferenceTitle: string,
): string {
  return `Meet the speakers at ${conferenceTitle}`
}

/** Default sub-heading under the organizers heading. */
export function defaultOrganizersDescription(conferenceTitle: string): string {
  return `The passionate team driving ${conferenceTitle}`
}

/** Default heading for the save-the-date band when none is configured. */
export const DEFAULT_SAVE_THE_DATE_HEADING = 'Save the date'

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

/**
 * The day-one band: dates, place, countdown and the "what happens next" roadmap
 * (CFP → programme → tickets), built entirely from dates the organizer has
 * already entered. It is what stands between a brand-new event and a homepage
 * that is a hero above a "Become a Sponsor" pitch.
 */
export interface SaveTheDateSection extends BaseSection {
  _type: 'homepageSaveTheDate'
  heading?: string
  description?: string
}

/**
 * Featured-speakers band. Content is `conference.featuredSpeakers`; the block
 * carries only the band's copy. Blank/absent renders the house default —
 * {@link DEFAULT_FEATURED_SPEAKERS_HEADING} and
 * {@link defaultFeaturedSpeakersDescription}.
 */
export interface FeaturedSpeakersSection extends BaseSection {
  _type: 'homepageFeaturedSpeakers'
  heading?: string
  description?: string
}

export interface ProgramHighlightsSection extends BaseSection {
  _type: 'homepageProgramHighlights'
}

/**
 * Organizers band. Content is `conference.organizers`; blank/absent copy
 * renders {@link DEFAULT_ORGANIZERS_HEADING} /
 * {@link defaultOrganizersDescription}.
 */
export interface OrganizersSection extends BaseSection {
  _type: 'homepageOrganizers'
  heading?: string
  description?: string
}

/**
 * Sponsors band. Logos come from `conference.sponsors`; the block carries the
 * band copy plus the prospective-sponsor call-to-action card. `showCta` is
 * tri-state by absence: undefined/true shows the card (today's behaviour),
 * false hides it.
 */
export interface SponsorsSection extends BaseSection {
  _type: 'homepageSponsors'
  heading?: string
  description?: string
  /** Absent = shown. Set false to drop the "Become a Sponsor" card. */
  showCta?: boolean
  ctaHeading?: string
  ctaDescription?: string
}

/**
 * Photo-gallery band. Images come from `conference.featuredGalleryImages`;
 * blank/absent copy renders {@link DEFAULT_GALLERY_HEADING} /
 * {@link DEFAULT_GALLERY_DESCRIPTION}.
 */
export interface GallerySection extends BaseSection {
  _type: 'homepageGallery'
  heading?: string
  description?: string
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
  | SaveTheDateSection
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

/**
 * True when the program is published AND at least one schedule day exists.
 *
 * DELIBERATELY WEAK — it does not look inside the schedule. Prefer
 * {@link hasProgrammeContent}, which additionally requires a confirmed talk;
 * this predicate is retained because a published-but-empty schedule still means
 * "the organizer has pressed publish", which some callers care about.
 */
export function hasPublishedSchedule(conference: Conference): boolean {
  return (
    isProgramPublished(conference) && (conference.schedules?.length ?? 0) > 0
  )
}

/**
 * The default homepage, as an ordered section list. This is what renders when
 * `homepageSections` is ABSENT (every legacy conference):
 *
 *   Hero → [SaveTheDate] → Gallery → (ProgramHighlights | FeaturedSpeakers |
 *   Organizers) → Sponsors
 *
 * The middle slot is mutually exclusive exactly as the legacy `if/else` chain:
 * a programme with content wins over featured speakers, which win over the
 * organizers fallback. Each section's own renderer additionally data-guards
 * (e.g. Gallery renders nothing without featured images).
 *
 * TWO LIFECYCLE-DRIVEN DEPARTURES from the pre-lifecycle layout, both of which
 * only fire in states that previously rendered a hole:
 *
 *  1. The middle slot now tests {@link hasProgrammeContent}, not
 *     `hasPublishedSchedule`. A published-but-EMPTY schedule used to win the
 *     slot and then render an all-zero statistics band (live in production);
 *     it now falls through to featured speakers or organizers, which have
 *     something to show.
 *  2. {@link SaveTheDateSection} is inserted after the Hero while the event has
 *     nothing to say about its own content yet — no programme AND no featured
 *     speakers, before the event. That is the day-one page, and without the band
 *     it is a hero sitting directly on top of a sponsorship pitch.
 *
 * A conference that already has a programme or featured speakers is untouched.
 */
export function getDefaultSections(conference: Conference): HomepageSection[] {
  const { stage, content } = resolveHomepageLifecycle(conference)

  const sections: HomepageSection[] = [
    { _key: 'default-hero', _type: 'homepageHero' },
  ]

  const isPreEvent =
    stage === 'announced' || stage === 'cfp-open' || stage === 'curating'
  if (isPreEvent && !content.hasProgramme && !content.hasFeaturedSpeakers) {
    sections.push({
      _key: 'default-save-the-date',
      _type: 'homepageSaveTheDate',
    })
  }

  sections.push({ _key: 'default-gallery', _type: 'homepageGallery' })

  if (content.hasProgramme) {
    sections.push({
      _key: 'default-program',
      _type: 'homepageProgramHighlights',
    })
  } else if (content.hasFeaturedSpeakers) {
    sections.push({
      _key: 'default-featured-speakers',
      _type: 'homepageFeaturedSpeakers',
    })
  } else if (content.hasOrganizers) {
    sections.push({ _key: 'default-organizers', _type: 'homepageOrganizers' })
  }

  sections.push({ _key: 'default-sponsors', _type: 'homepageSponsors' })
  return sections
}

/**
 * Resolve the ordered section list to render for a conference. A NON-EMPTY
 * stored `homepageSections` composition wins; otherwise the lifecycle-aware
 * default. An empty stored array falls back to the default so a tenant can never
 * accidentally blank their whole homepage.
 *
 * NOTE: `cancelled` / `archived` do NOT appear here. Those states REPLACE the
 * page rather than reorder it, so the renderer short-circuits above the section
 * list — see `HomepageSectionRenderer`. Returning a section list for them would
 * let a stored composition leak a ticket CTA onto a cancelled event.
 */
export function resolveHomepageSections(
  conference: Conference,
): HomepageSection[] {
  const stored = conference.homepageSections
  if (stored && stored.length > 0) return stored
  return getDefaultSections(conference)
}
