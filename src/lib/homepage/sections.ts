import type { TypedObject } from 'sanity'
import type { Conference } from '@/lib/conference/types'
import { resolveHomepageLifecycle, type HomepageStage } from './lifecycle'
import type { SectionVariant } from './variants'
import type { RichTextContentBlock } from './richText'

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
 * The one pressure-release valve is {@link RichTextSection}, whose content is an
 * ALLOWLISTED portable-text vocabulary (see `./richText`) — a constrained escape
 * hatch for the one distinctive thing a conference needs, not an open one. It
 * extends this decision rather than overturning it: still no HTML string, still
 * no embed, still every value rendered through a vetted house component.
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
  // "Vanity Metrics" and "Rich Text" are what WE call these internally. The
  // organizer choosing a block from a menu is not a developer, and neither
  // phrase describes what they get.
  homepageMetrics: 'Key Numbers',
  homepageCtaBanner: 'Call-to-action Banner',
  homepageRichText: 'Text Block',
  homepageFaq: 'FAQ',
  homepageCountdown: 'Countdown',
  homepageVenue: 'Venue',
}

/**
 * One plain sentence per block, for the surfaces where an organizer is CHOOSING
 * rather than recognising — chiefly the composer's "Add section" menu, where a
 * bare list of thirteen labels asks them to guess what "Save the Date" or
 * "Program Highlights" will put on their page.
 *
 * Written for the customer: what appears on the page, and where the content
 * comes from. No section-type names, no "phase-aware", no "configuration".
 */
export const SECTION_DESCRIPTIONS: Record<HomepageSectionType, string> = {
  homepageHero:
    'The top of the page — your conference name, tagline and main buttons.',
  homepageSaveTheDate:
    'An announcement card with the dates, the venue and what happens next.',
  homepageFeaturedSpeakers:
    'A shelf or grid of the speakers you have chosen to feature.',
  homepageProgramHighlights:
    'A taste of the programme, once your schedule is published.',
  homepageOrganizers: 'The people behind the conference.',
  homepageSponsors:
    'Sponsor logos grouped by tier, with an optional invitation to sponsor.',
  homepageGallery: 'Photos from the conference.',
  homepageMetrics:
    'A row of big numbers — attendees, talks, years running, whatever you like.',
  homepageCtaBanner: 'A wide band with a heading and one button.',
  homepageRichText: 'Your own words, with headings, lists and links.',
  homepageFaq:
    'Questions and answers — your own, or the ones from your tickets page.',
  homepageCountdown: 'A live counter ticking down to the conference.',
  homepageVenue: 'Where the conference happens, with a link to directions.',
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageHero'>
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageSaveTheDate'>
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageFeaturedSpeakers'>
  heading?: string
  description?: string
}

export interface ProgramHighlightsSection extends BaseSection {
  _type: 'homepageProgramHighlights'
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageProgramHighlights'>
}

/**
 * Organizers band. Content is `conference.organizers`; blank/absent copy
 * renders {@link DEFAULT_ORGANIZERS_HEADING} /
 * {@link defaultOrganizersDescription}.
 */
export interface OrganizersSection extends BaseSection {
  _type: 'homepageOrganizers'
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageOrganizers'>
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageSponsors'>
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageGallery'>
  heading?: string
  description?: string
}

/** Standalone vanity-metrics band (content from `conference.vanityMetrics`). */
export interface MetricsSection extends BaseSection {
  _type: 'homepageMetrics'
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageMetrics'>
  heading?: string
}

/** Generic call-to-action banner (heading + body + one house Button). */
export interface CtaBannerSection extends BaseSection {
  _type: 'homepageCtaBanner'
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageCtaBanner'>
  heading: string
  body?: string
  buttonLabel: string
  buttonHref: string
}

/**
 * The registry's one CONSTRAINED escape hatch: organizer-authored rich content,
 * stored as portable text over a strict allowlist (prose, headings, lists, safe
 * links, code/preformatted, images from our own asset pipeline, small tables,
 * callouts). See `./richText` for the vocabulary, the two-sided enforcement and
 * why this is not a raw-HTML block. `content` is typed loosely on purpose —
 * what is READ from the dataset is untrusted until sanitized at render.
 */
export interface RichTextSection extends BaseSection {
  _type: 'homepageRichText'
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageRichText'>
  heading?: string
  content: TypedObject[] | RichTextContentBlock[]
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageFaq'>
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageCountdown'>
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
  /** Presentation variant. Absent = the default (see SECTION_VARIANTS). */
  variant?: SectionVariant<'homepageVenue'>
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
 * Stages in which the event is still AHEAD, so a save-the-date band is honest.
 *
 * `programme` belongs here: it means "programme published, event still ahead"
 * ({@link HomepageStage}), and it is reached the moment `programDate` rolls past
 * — whether or not anything was actually published. The stages left out are the
 * ones where a countdown to the event would be a lie: `post-event`, plus the
 * `cancelled` / `archived` overrides (which the renderer replaces the page for
 * anyway, but which must never grow a countdown if called directly).
 */
function isPreEventStage(stage: HomepageStage): boolean {
  return (
    stage === 'announced' ||
    stage === 'cfp-open' ||
    stage === 'curating' ||
    stage === 'programme'
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
 *     the old "a schedule document exists" test. A published-but-EMPTY
 *     schedule used to win the
 *     slot and then render an all-zero statistics band (live in production);
 *     it now falls through to featured speakers or organizers, which have
 *     something to show.
 *  2. {@link SaveTheDateSection} is inserted after the Hero while the event has
 *     nothing to say about its own content yet — no programme AND no featured
 *     speakers, before the event. That is the day-one page, and without the band
 *     it is a hero sitting directly on top of a sponsorship pitch.
 *
 *     "Before the event" is the whole pre-event span ({@link isPreEventStage}),
 *     NOT just the stages up to `curating`. The `programme` stage is entered by
 *     `programDate` rolling past, which says nothing about whether a programme
 *     exists: an organizer who set a programme date and has not published yet
 *     loses the band AND fails the `hasProgramme` middle-slot test on the same
 *     day, leaving a hero over a sponsorship pitch purely because a date passed.
 *     The two conditions are therefore driven by the SAME fact — the band shows
 *     exactly while there is no programme and no speakers to lead with.
 *
 * A conference that already has a programme or featured speakers is untouched.
 */
export function getDefaultSections(conference: Conference): HomepageSection[] {
  const { stage, content } = resolveHomepageLifecycle(conference)

  const sections: HomepageSection[] = [
    { _key: 'default-hero', _type: 'homepageHero' },
  ]

  if (
    isPreEventStage(stage) &&
    !content.hasProgramme &&
    !content.hasFeaturedSpeakers
  ) {
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
