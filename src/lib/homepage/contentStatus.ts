import { isRichTextContentEmpty, sanitizeRichTextContent } from './richText'
import type { Conference } from '@/lib/conference/types'
import type {
  CountdownSection,
  FaqSection,
  HomepageSection,
  HomepageSectionType,
  SponsorsSection,
} from './sections'

/**
 * "Does this band have anything behind it?" — the one module that answers it.
 *
 * WHY THIS EXISTS. Every content band on the homepage SELF-HIDES when its
 * source collection is empty (see the guard table below). That is correct on
 * the live site and invisible in the composer: an organizer adds a Featured
 * Speakers section, saves, and the section renders as literally nothing. The
 * composition editor and the live preview need to say so BEFORE the save —
 * with a count ("6 sponsors in 2 tiers"), a reason, and a link to the surface
 * where that content is actually edited.
 *
 * THE CORRECTNESS BAR: the `willHide` flag of {@link SectionContentStatus} must
 * be TRUE exactly when the real renderer produces nothing for that section — and
 * its `count` must be what the renderer will actually DRAW, not what the
 * collection behind it happens to hold. A preview
 * that shows a band the live page drops is worse than no preview, because the
 * organizer ships believing the page is full. The predicates below are
 * therefore transcriptions of the renderer's own guards, each annotated with
 * the file and guard it mirrors, and `contentStatus.test.ts` pins the
 * equivalence by RENDERING every case through `HomepageSectionRenderer` and
 * asserting an empty container exactly when `willHide` is true. If a guard
 * moves, that test fails — this file is not allowed to drift.
 *
 * WHAT IT DELIBERATELY DOES NOT ANSWER:
 *
 *  - `section.hidden` — the F1 visibility toggle. That is the organizer's own
 *    choice, already visible in the editor, and orthogonal to whether there is
 *    content. The renderer filters hidden sections above `renderSection`, so a
 *    caller composing "will this appear on the page?" must AND the two.
 *  - `cancelled` / `archived` — those lifecycle states REPLACE the whole page
 *    with a notice (`HomepageSectionRenderer`'s `isOverridden` short-circuit),
 *    which is a page-level fact, not a per-section one. Callers check it once
 *    above the loop, exactly as the renderer does.
 *
 * SERVER SAFETY: no PACKAGE import — this module is reachable from server
 * components through the composer and the preview route, and a single value
 * import from a client-only package puts that package's React context in the
 * RSC module graph, killing the production build with `createContext is not a
 * function` (it has happened once already, via `@dnd-kit` in `./editor`). The
 * one runtime import is the relative sibling `./richText`, and it is
 * load-bearing: the rich-text guard is "does the SANITIZED content render
 * anything", and hand-copying a 500-line sanitizer here to avoid an import
 * would be exactly the drift this module exists to prevent — `./editor` takes
 * the same import for the same reason. `contentStatus.test.ts` asserts the
 * parsed module graph: no packages, and no relative import beyond that one.
 */

/** Where a section's content is edited. Stable ids — safe to switch on. */
export type SectionContentSourceId =
  /** Title, tagline, description — the identity fieldset. */
  | 'conference-basics'
  /** `startDate` / `endDate` / CFP / programme dates. */
  | 'dates'
  /** `venueName` / `venueAddress` (and `city`, on basics). */
  | 'venue'
  /** `conference.organizers`. */
  | 'organizers'
  /** `conference.featuredSpeakers`. */
  | 'featured-speakers'
  /** Published schedule + confirmed talks. */
  | 'programme'
  /** `conference.sponsors` and their tiers. */
  | 'sponsors'
  /** `conference.featuredGalleryImages`. */
  | 'gallery'
  /** `conference.vanityMetrics`. */
  | 'vanity-metrics'
  /** `conference.ticketFaqs`. */
  | 'ticket-faqs'
  /** The section's OWN fields — edited in the composer, so no deep link. */
  | 'section-config'

export interface ContentSource {
  id: SectionContentSourceId
  /** What the section pulls, as a noun phrase: "Featured speakers". */
  label: string
  /**
   * Admin route that edits it, or `null` for content edited in the composer
   * itself. Route-only (no anchors): the settings page has no stable fieldset
   * ids, and a link to a hash that does not exist is a worse promise than a
   * link to the page that owns the field.
   */
  href: string | null
  /** Link copy at the point of display: "Choose speakers". */
  manageLabel: string
}

/**
 * The content-source map. ONE definition, consumed by the composer rail, the
 * preview's sample-content chips and the appearance page's content-source rows
 * — three surfaces that must never disagree about where a thing is edited.
 */
export const CONTENT_SOURCES: Record<SectionContentSourceId, ContentSource> = {
  'conference-basics': {
    id: 'conference-basics',
    label: 'Conference basics',
    href: '/admin/settings',
    manageLabel: 'Edit basics',
  },
  dates: {
    id: 'dates',
    label: 'Conference dates',
    href: '/admin/settings',
    manageLabel: 'Edit dates',
  },
  venue: {
    id: 'venue',
    label: 'Venue',
    href: '/admin/settings',
    manageLabel: 'Edit venue',
  },
  organizers: {
    id: 'organizers',
    label: 'Organizers',
    href: '/admin/settings',
    manageLabel: 'Manage organizers',
  },
  'featured-speakers': {
    id: 'featured-speakers',
    label: 'Featured speakers',
    href: '/admin/marketing/featured',
    manageLabel: 'Choose speakers',
  },
  programme: {
    id: 'programme',
    label: 'Programme',
    href: '/admin/schedule',
    manageLabel: 'Edit the schedule',
  },
  sponsors: {
    id: 'sponsors',
    label: 'Sponsors',
    href: '/admin/sponsors',
    manageLabel: 'Manage sponsors',
  },
  gallery: {
    id: 'gallery',
    label: 'Photo gallery',
    href: '/admin/marketing/gallery',
    manageLabel: 'Manage photos',
  },
  'vanity-metrics': {
    id: 'vanity-metrics',
    label: 'Vanity metrics',
    href: '/admin/settings/appearance/homepage',
    manageLabel: 'Edit metrics',
  },
  'ticket-faqs': {
    id: 'ticket-faqs',
    label: 'Ticket FAQs',
    href: '/admin/tickets/content',
    manageLabel: 'Edit ticket FAQs',
  },
  'section-config': {
    id: 'section-config',
    label: 'This section',
    href: null,
    manageLabel: 'Edit below',
  },
}

/**
 * How much of the page this band will actually be.
 *
 *  - `ready` — real content behind it; it renders in full.
 *  - `degraded` — it renders, but thinner than intended (the sponsors band with
 *    no sponsors is the canonical case: the "Become a Sponsor" pitch alone; the
 *    band holding untiered sponsors is the same fact one step in — those logos
 *    are stored, and the page will not draw them).
 *  - `empty-hides` — the live site renders NOTHING for it.
 */
export type SectionContentKind = 'ready' | 'degraded' | 'empty-hides'

interface SectionContentStatusFacts {
  kind: SectionContentKind
  /**
   * TRUE iff the renderer emits nothing for this section — the property the
   * parity test pins. `kind === 'empty-hides'` is the same fact, named for the
   * UI; this boolean is the one to branch on.
   */
  willHide: boolean
  /**
   * How many items the band will ACTUALLY RENDER, or `null` when the section is
   * not backed by a countable collection (hero, save-the-date, CTA banner,
   * countdown, venue).
   *
   * "Will render", not "is stored": the sponsors band drops every sponsor with
   * no tier, so a conference holding ten sponsors of which three are untiered
   * counts SEVEN here. A count the organizer cannot find on the page is the
   * same lie as a band the page does not draw.
   */
  count: number | null
  /** Plural noun for {@link count}: "speakers", "sponsors", "photos". */
  countLabel: string | null
  /** One line for the UI: "6 sponsors in 2 tiers", "No photos yet". */
  summary: string
  /** Why it hides or why it is thin. Absent when `ready`. */
  reason?: string
  /** Where the content behind this band is edited. */
  source: ContentSource
  /** Ready-to-render deep link, or `null` for composer-local content. */
  manage: { label: string; href: string } | null
}

/** A section this deploy's registry knows — the overwhelmingly common case. */
export interface KnownSectionContentStatus extends SectionContentStatusFacts {
  /** Narrowing discriminant: `type` is a registered section type. */
  known: true
  type: HomepageSectionType
}

/**
 * A stored section whose `_type` this deploy has never heard of — data written
 * by a newer schema during deploy skew.
 *
 * A SEPARATE shape rather than a widened `type`, because `type` is what callers
 * key label maps, icon maps and variant pickers by, and every one of those is a
 * `Record<HomepageSectionType, …>` that this value would miss. The union makes
 * the miss a compile error at the point of use instead of an `undefined` label
 * in the composer rail, and `known` is the one check needed to clear it.
 *
 * The BEHAVIOUR mirrors the renderer's unknown-`_type` skip
 * (`SectionRenderer.tsx`): the section contributes nothing to the page, so this
 * reports as hiding. No warning is logged here — the renderer already warns
 * once per process for exactly this `_type`, and the composer surfaces the same
 * fact where it matters more, as a row that says so in words.
 */
export interface UnknownSectionContentStatus extends SectionContentStatusFacts {
  known: false
  /** The stored `_type`, verbatim. NOT a registered section type. */
  type: string
  kind: 'empty-hides'
  willHide: true
}

export type SectionContentStatus =
  KnownSectionContentStatus | UnknownSectionContentStatus

export interface SectionContentStatusOptions {
  /**
   * "Now" in epoch ms, for the two time-dependent guards (programme published,
   * countdown target passed). Injectable so a test — and a preview rendering a
   * hypothetical — can ask the question at a chosen instant.
   */
  now?: number
}

// === renderer-guard transcriptions =======================================
//
// Each helper below reproduces ONE upstream rule. They are inlined rather than
// imported so this module keeps its no-package property, and every one of them
// is pinned by the parity test.

/**
 * `toOsloAnchoredDate` (`@/lib/time`): a bare `YYYY-MM-DD` is pinned to 12:00
 * UTC so the day is stable in every viewer timezone; anything else is parsed
 * as written. `NaN` for an unusable value.
 */
function anchoredMs(value: string): number {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    return Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      12,
    )
  }
  return new Date(value).getTime()
}

/**
 * `resolveCountdownTarget` (`./countdown`): the override wins over the start
 * date; an absent or unparseable value is `null`, and the block renders
 * nothing.
 */
function countdownTargetMs(
  conference: Conference,
  section: Pick<CountdownSection, 'targetOverride'>,
): number | null {
  const raw = section.targetOverride?.trim() || conference.startDate?.trim()
  if (!raw) return null
  const ms = anchoredMs(raw)
  return Number.isNaN(ms) ? null : ms
}

/**
 * `isProgramPublished` (`@/lib/conference/state`): the programme date exists
 * and has arrived. NOTE the parse — plain `new Date()`, i.e. UTC midnight for
 * a bare date, NOT the noon anchoring above. Mirrored as written.
 */
function isProgramPublished(conference: Conference, now: number): boolean {
  if (!conference.programDate) return false
  return now >= new Date(conference.programDate).getTime()
}

/** What the programme band will actually draw, counted the way it draws it. */
interface ProgrammeTally {
  /**
   * Booked slots holding a confirmed talk. This is the band's OWN headline
   * number: `calculateProgramStats` (`ProgramHighlights.tsx`) pushes one entry
   * per slot and prints it as "N+ Sessions".
   */
  sessions: number
  /**
   * DISTINCT confirmed talks behind those slots. Lower than `sessions` when a
   * talk is booked more than once — a repeated workshop is two sessions and one
   * talk, and calling it "2 confirmed talks" invents a talk the organizer does
   * not have.
   */
  talks: number
}

/**
 * `calculateProgramStats` (`ProgramHighlights.tsx:257-327`): every slot whose
 * talk is `confirmed`, across every track of every schedule. No dedupe there —
 * two bookings of one talk are two sessions and draw two cards — so `sessions`
 * is transcribed the same way, and the distinct-talk number is tracked
 * ALONGSIDE it rather than replacing it.
 */
function tallyProgramme(conference: Conference): ProgrammeTally {
  const talkIds = new Set<string>()
  let sessions = 0
  for (const schedule of conference.schedules ?? []) {
    for (const track of schedule.tracks ?? []) {
      for (const slot of track.talks ?? []) {
        if (slot.talk?.status !== 'confirmed') continue
        sessions++
        talkIds.add(String(slot.talk._id))
      }
    }
  }
  return { sessions, talks: talkIds.size }
}

/**
 * `hasProgrammeContent` (`./lifecycle`): published AND holding at least one
 * confirmed talk. The second half is the guard that closed the production bug
 * where an empty published schedule rendered `0+ Sessions / 0+ Speakers`.
 *
 * Takes the tally rather than recomputing it: its one caller already needs the
 * session and talk counts for the status it returns, and walking every track of
 * every schedule a second time to answer "> 0" was pure waste.
 */
function hasProgramme(
  conference: Conference,
  now: number,
  sessions: number,
): boolean {
  return isProgramPublished(conference, now) && sessions > 0
}

/**
 * `SaveTheDate.tsx:47-55`: `formatDatesSafe` returns the literal `'TBD'` when
 * EITHER date is missing (an unparseable pair returns `'Invalid Date Range'`
 * and the band still renders), and `place` joins the trimmed venue name and
 * city. With no dates and no place there is nothing to save the date for.
 */
function saveTheDatePlace(conference: Conference): string {
  return [conference.venueName, conference.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')
}

function hasSaveTheDateDates(conference: Conference): boolean {
  return Boolean(conference.startDate && conference.endDate)
}

/** What the sponsors band will actually draw, counted the way it groups. */
interface SponsorTally {
  /** Sponsors that reach a logo grid — i.e. the ones with a tier. */
  shown: number
  /** Sponsors dropped for having no tier. Stored, but never on the page. */
  untiered: number
  /** Tier HEADINGS, after `special` collapses. */
  tiers: number
}

/**
 * `groupSponsorsByTier` (`@/lib/sponsor/utils`): an untiered sponsor is skipped
 * — it never reaches a logo grid — and every `special` tier collapses into one
 * `SPECIAL` heading. BOTH numbers in "6 sponsors in 2 tiers" come from this
 * walk, so neither can over-report what the band will show.
 */
function tallySponsors(conference: Conference): SponsorTally {
  const tiers = new Set<string>()
  let shown = 0
  let untiered = 0
  for (const entry of conference.sponsors ?? []) {
    if (!entry?.tier) {
      untiered++
      continue
    }
    shown++
    // `String(...)` because upstream uses the title as an OBJECT KEY, and an
    // object key coerces. A tier whose title is missing in stored data groups
    // under `'undefined'` there, so it must group under `'undefined'` here too.
    tiers.add(
      entry.tier.tierType === 'special' ? 'SPECIAL' : String(entry.tier.title),
    )
  }
  return { shown, untiered, tiers: tiers.size }
}

/** `MetricsBlock.tsx:29` — `metrics.slice(0, 6)`. Six cells, no more. */
const METRICS_SHOWN_LIMIT = 6

/** What the metrics band will actually draw, counted the way it slices. */
interface MetricsTally {
  /** Cells the band draws WITH something in them. */
  shown: number
  /** Entries on file. The band's hide guard reads this, not `shown`. */
  stored: number
  /** Entries past the sixth: stored, and never drawn. */
  overflow: number
  /** Entries inside the six with neither label nor value — an empty cell. */
  blank: number
}

/**
 * `MetricsBlock.tsx:18-39`: the band renders the FIRST SIX entries, one cell
 * each, and filters nothing — so an entry with no label and no value still
 * takes one of the six and draws a cell with nothing in it. Both facts cut the
 * number an organizer can actually count on the page, and neither is visible in
 * `vanityMetrics.length`.
 */
function tallyMetrics(conference: Conference): MetricsTally {
  const metrics = conference.vanityMetrics ?? []
  let shown = 0
  let blank = 0
  for (const metric of metrics.slice(0, METRICS_SHOWN_LIMIT)) {
    if (metric?.label?.trim() || metric?.value?.trim()) shown++
    else blank++
  }
  return {
    shown,
    blank,
    stored: metrics.length,
    overflow: Math.max(0, metrics.length - METRICS_SHOWN_LIMIT),
  }
}

/**
 * `SectionRenderer.tsx:398-410`: the "Become a Sponsor" pitch is suppressed
 * once the event is over, so it cannot prop up an otherwise-empty band.
 * `stage === 'post-event'` is `isConferenceOver` unless an explicit
 * `lifecycleStatus` overrides the stage — and in those two states the notice
 * replaces the page anyway.
 */
function isConferenceOver(conference: Conference, now: number): boolean {
  // Transcribed verbatim from `isConferenceOver`, including the calendar-day
  // increment (NOT +24h) and the `>=`. A missing or unparseable `endDate`
  // yields an Invalid Date, and `now >= NaN` is false — the event is not over.
  const dayAfterEnd = new Date(conference.endDate)
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1)
  return now >= dayAfterEnd.getTime()
}

function sponsorsShowCta(
  section: Pick<SponsorsSection, 'showCta'>,
  conference: Conference,
  now: number,
): boolean {
  const overridden =
    conference.lifecycleStatus === 'cancelled' ||
    conference.lifecycleStatus === 'archived'
  const postEvent = !overridden && isConferenceOver(conference, now)
  return section.showCta !== false && !postEvent
}

/** `FaqBlock.tsx:19-23`: own items by default, ticket FAQs on request. */
function faqItemCount(
  section: Pick<FaqSection, 'source' | 'items'>,
  conference: Conference,
): number {
  return section.source === 'ticketFaqs'
    ? (conference.ticketFaqs?.length ?? 0)
    : (section.items?.length ?? 0)
}

// === status construction =================================================

function pluralize(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun.replace(/e?s$/, '') : noun}`
}

function source(id: SectionContentSourceId): ContentSource {
  return CONTENT_SOURCES[id]
}

function manageOf(src: ContentSource): SectionContentStatus['manage'] {
  return src.href === null ? null : { label: src.manageLabel, href: src.href }
}

function status(
  type: HomepageSectionType,
  kind: SectionContentKind,
  src: ContentSource,
  fields: {
    count?: number | null
    countLabel?: string | null
    summary: string
    reason?: string
  },
): KnownSectionContentStatus {
  return {
    known: true,
    type,
    kind,
    willHide: kind === 'empty-hides',
    count: fields.count ?? null,
    countLabel: fields.countLabel ?? null,
    summary: fields.summary,
    ...(fields.reason === undefined ? {} : { reason: fields.reason }),
    source: src,
    manage: manageOf(src),
  }
}

/**
 * A collection-backed band: renders iff the collection is non-empty. Covers
 * featured speakers, organizers, gallery and FAQ, whose guards differ
 * only in which collection they read. (Metrics and sponsors need MORE than
 * this — the band draws fewer than it holds — so they build their status by
 * hand from a tally.)
 */
function collectionStatus(
  type: HomepageSectionType,
  src: ContentSource,
  count: number,
  noun: string,
  reason: string,
): KnownSectionContentStatus {
  if (count === 0) {
    return status(type, 'empty-hides', src, {
      count: 0,
      countLabel: noun,
      summary: `No ${noun} yet`,
      reason,
    })
  }
  return status(type, 'ready', src, {
    count,
    countLabel: noun,
    summary: pluralize(count, noun),
  })
}

/**
 * The content status of ONE section against ONE conference.
 *
 * Pure and synchronous. `section` rather than a bare `_type` because five of
 * the guards read the section's own config (the countdown target and live
 * message, the FAQ source and items, the rich-text content, the CTA banner's
 * button, the sponsors CTA toggle) — a type-only signature could not answer
 * them and would have to guess.
 */
export function sectionContentStatus(
  section: HomepageSection,
  conference: Conference,
  options: SectionContentStatusOptions = {},
): SectionContentStatus {
  const now = options.now ?? Date.now()

  switch (section._type) {
    // The hero is the one band with no data guard at all — it renders from the
    // conference title alone, which every conference has. `Hero.tsx` has no
    // early return, by design: a homepage always has a top.
    case 'homepageHero':
      return status('homepageHero', 'ready', source('conference-basics'), {
        summary: conference.title,
      })

    // SaveTheDate.tsx:55 — `dates === 'TBD' && !place`.
    case 'homepageSaveTheDate': {
      const place = saveTheDatePlace(conference)
      const dates = hasSaveTheDateDates(conference)
      if (!dates && !place) {
        return status('homepageSaveTheDate', 'empty-hides', source('dates'), {
          summary: 'No dates or venue yet',
          reason:
            'Hidden on the live site — there are no conference dates and no venue or city to announce.',
        })
      }
      if (!dates) {
        return status('homepageSaveTheDate', 'degraded', source('dates'), {
          summary: `${place} · dates missing`,
          reason:
            'Renders without a date line — set the start and end dates to complete the announcement.',
        })
      }
      return status('homepageSaveTheDate', 'ready', source('dates'), {
        summary: place ? `Dates and ${place}` : 'Conference dates',
      })
    }

    // SectionRenderer.tsx:214-219 — no featured speakers, no band.
    case 'homepageFeaturedSpeakers':
      return collectionStatus(
        'homepageFeaturedSpeakers',
        source('featured-speakers'),
        conference.featuredSpeakers?.length ?? 0,
        'featured speakers',
        'Hidden on the live site — this band renders nothing until speakers are featured.',
      )

    // SectionRenderer.tsx:316 — `lifecycle.content.hasProgramme`, which is
    // "published AND at least one confirmed talk", not "a schedule exists".
    //
    // The COUNT is sessions, not talks, because sessions is what the band
    // draws: `ProgramHighlights.tsx` prints "N+ Sessions" from one entry per
    // booked slot, and a talk booked twice really does get two slots, two cards
    // and two tallies there. Counting the same slots and calling them "confirmed
    // talks" was the lie — it reported two talks to a conference that has one.
    // Both numbers are now carried: `count` is what the page will say, and the
    // summary names the distinct talks behind it when the two differ.
    case 'homepageProgramHighlights': {
      const { sessions, talks } = tallyProgramme(conference)
      if (!hasProgramme(conference, now, sessions)) {
        const published = isProgramPublished(conference, now)
        return status(
          'homepageProgramHighlights',
          'empty-hides',
          source('programme'),
          {
            // Nothing renders, so nothing is counted — the scheduled sessions
            // of an unpublished programme belong in the summary, where they
            // read as "waiting", not as content already on the page.
            count: 0,
            countLabel: 'sessions',
            summary: published
              ? 'No confirmed talks yet'
              : sessions > 0
                ? `${pluralize(sessions, 'sessions')} waiting to be published`
                : 'Programme not published',
            reason: published
              ? 'Hidden on the live site — the published schedule holds no confirmed talks.'
              : 'Hidden on the live site — the programme date has not arrived, so no schedule is published yet.',
          },
        )
      }
      return status('homepageProgramHighlights', 'ready', source('programme'), {
        count: sessions,
        countLabel: 'sessions',
        summary:
          talks === sessions
            ? pluralize(sessions, 'sessions')
            : `${pluralize(talks, 'confirmed talks')} in ${pluralize(sessions, 'sessions')}`,
      })
    }

    // SectionRenderer.tsx:260-266 — no organizers, no band.
    case 'homepageOrganizers':
      return collectionStatus(
        'homepageOrganizers',
        source('organizers'),
        conference.organizers?.length ?? 0,
        'organizers',
        'Hidden on the live site — this band renders nothing until organizers are added.',
      )

    // Sponsors.tsx NEVER returns null: the band is a `<section>` wrapper around
    // an optional logo wall and an optional pitch card. With no sponsors it
    // degrades to the pitch — and with no sponsors AND the pitch switched off
    // (or the event over, which suppresses the pitch) it renders an EMPTY
    // section: vertical whitespace and nothing else. That is not a hide, so
    // `willHide` stays false; it is called out as a degraded state instead.
    case 'homepageSponsors': {
      const { shown, untiered, tiers } = tallySponsors(conference)
      const src = source('sponsors')
      if (shown === 0 && untiered === 0) {
        const cta = sponsorsShowCta(section, conference, now)
        return status('homepageSponsors', 'degraded', src, {
          count: 0,
          countLabel: 'sponsors',
          summary: 'No sponsors yet',
          reason: cta
            ? 'Renders as the “Become a Sponsor” pitch only — there are no sponsor logos to show.'
            : 'Renders as an empty band — there are no sponsors and the sponsor call-to-action is switched off.',
        })
      }
      // Stored sponsors, none of them tiered: `Sponsors.tsx` keys its heading
      // off the RAW array, so the band still draws its title and blurb — above
      // an empty space where every logo was dropped.
      if (shown === 0) {
        return status('homepageSponsors', 'degraded', src, {
          count: 0,
          countLabel: 'sponsors',
          summary: `${pluralize(untiered, 'sponsors')}, none in a tier`,
          reason:
            'No logos render — a sponsor is only shown once it is assigned to a tier.',
        })
      }
      const summary = `${pluralize(shown, 'sponsors')} in ${pluralize(tiers, 'tiers')}`
      // Some render, some do not. Thinner than the organizer thinks it is,
      // which is the whole reason this module exists — say the number.
      if (untiered > 0) {
        return status('homepageSponsors', 'degraded', src, {
          count: shown,
          countLabel: 'sponsors',
          summary,
          reason: `${pluralize(untiered, 'sponsors')} in no tier ${untiered === 1 ? 'is' : 'are'} left out — a sponsor is only shown once it is assigned to a tier.`,
        })
      }
      return status('homepageSponsors', 'ready', src, {
        count: shown,
        countLabel: 'sponsors',
        summary,
      })
    }

    // SectionRenderer.tsx:350-359 (and ImageGallery.tsx:62) — no images, no band.
    case 'homepageGallery':
      return collectionStatus(
        'homepageGallery',
        source('gallery'),
        conference.featuredGalleryImages?.length ?? 0,
        'photos',
        'Hidden on the live site — this band renders nothing without featured gallery images.',
      )

    // MetricsBlock.tsx:19 — no metrics, no band. The HIDE guard reads the raw
    // array, but the band then draws only the first six, and draws an empty
    // cell for an entry with no label and no value. So a band CAN render while
    // showing fewer numbers than are stored — or none at all — which is the
    // sponsors bug in a second place: the count is the cells with something in
    // them, and everything the band leaves out is named in the reason.
    case 'homepageMetrics': {
      const { shown, stored, overflow, blank } = tallyMetrics(conference)
      const src = source('vanity-metrics')
      if (stored === 0) {
        return status('homepageMetrics', 'empty-hides', src, {
          count: 0,
          countLabel: 'metrics',
          summary: 'No metrics yet',
          reason:
            'Hidden on the live site — this band renders nothing until vanity metrics are added.',
        })
      }
      if (shown === 0) {
        return status('homepageMetrics', 'degraded', src, {
          count: 0,
          countLabel: 'metrics',
          summary: `${pluralize(stored, 'metrics')}, all blank`,
          reason:
            'Renders as an empty band — every metric on file is missing both its label and its value.',
        })
      }
      const leftOut = [
        overflow > 0
          ? `${pluralize(overflow, 'metrics')} past the sixth ${overflow === 1 ? 'is' : 'are'} not drawn — the band shows at most six.`
          : null,
        blank > 0
          ? `${pluralize(blank, 'metrics')} with no label or value ${blank === 1 ? 'draws' : 'draw'} an empty cell.`
          : null,
      ].filter(Boolean)
      if (leftOut.length > 0) {
        return status('homepageMetrics', 'degraded', src, {
          count: shown,
          countLabel: 'metrics',
          summary: pluralize(shown, 'metrics'),
          reason: leftOut.join(' '),
        })
      }
      return status('homepageMetrics', 'ready', src, {
        count: shown,
        countLabel: 'metrics',
        summary: pluralize(shown, 'metrics'),
      })
    }

    // CtaBanner.tsx has no early return: the heading always renders. The button
    // needs BOTH a label and a href (`CtaBanner.tsx:24`), so half a button is a
    // banner with no way out of it.
    case 'homepageCtaBanner': {
      const src = source('section-config')
      const hasButton = Boolean(section.buttonLabel && section.buttonHref)
      if (!hasButton) {
        return status('homepageCtaBanner', 'degraded', src, {
          summary: section.heading?.trim() || 'Untitled banner',
          reason:
            'Renders without a button — a call-to-action banner needs both a button label and a link.',
        })
      }
      return status('homepageCtaBanner', 'ready', src, {
        summary: section.heading?.trim() || 'Untitled banner',
      })
    }

    // RichTextBlock.tsx:22-23 — the guard is on the SANITIZED content, so an
    // array of blocks the allowlist drops (or of blank paragraphs) hides the
    // band even though the stored array is non-empty.
    case 'homepageRichText': {
      const blocks = sanitizeRichTextContent(section.content)
      const src = source('section-config')
      if (blocks.length === 0 || isRichTextContentEmpty(blocks)) {
        return status('homepageRichText', 'empty-hides', src, {
          count: 0,
          countLabel: 'blocks',
          summary: 'Nothing written yet',
          reason:
            'Hidden on the live site — this block has no renderable content.',
        })
      }
      return status('homepageRichText', 'ready', src, {
        count: blocks.length,
        countLabel: 'blocks',
        summary: pluralize(blocks.length, 'blocks'),
      })
    }

    // FaqBlock.tsx:19-23 — whichever source is selected must be non-empty.
    case 'homepageFaq': {
      const usesTicketFaqs = section.source === 'ticketFaqs'
      return collectionStatus(
        'homepageFaq',
        source(usesTicketFaqs ? 'ticket-faqs' : 'section-config'),
        faqItemCount(section, conference),
        'questions',
        usesTicketFaqs
          ? 'Hidden on the live site — this block is set to show the ticket FAQs, and there are none.'
          : 'Hidden on the live site — add at least one question and answer.',
      )
    }

    // TWO guards, in two files. SectionRenderer.tsx:422-423 drops the block when
    // there is no resolvable target; Countdown.tsx:175-176 then hides it again
    // once the target has PASSED, unless a live message is configured. The
    // second is post-hydration, so the server render of a passed countdown
    // briefly shows placeholder dashes — what a visitor ends up looking at is
    // nothing, and that is what the composer must report.
    case 'homepageCountdown': {
      const target = countdownTargetMs(conference, section)
      const src = source(
        section.targetOverride?.trim() ? 'section-config' : 'dates',
      )
      if (target === null) {
        return status('homepageCountdown', 'empty-hides', src, {
          summary: 'No target date',
          reason:
            'Hidden on the live site — set a conference start date, or a target date on this block.',
        })
      }
      if (target - now <= 0) {
        if (!section.liveMessage) {
          return status('homepageCountdown', 'empty-hides', src, {
            summary: 'Target date has passed',
            reason:
              'Hidden on the live site — the countdown target has passed and no message is set to replace it.',
          })
        }
        return status('homepageCountdown', 'degraded', src, {
          summary: 'Target passed — showing the message',
          reason:
            'The countdown has run out; visitors see the live message instead of a counter.',
        })
      }
      return status('homepageCountdown', 'ready', src, {
        summary: 'Counting down',
      })
    }

    // VenueBlock.tsx:21-23 — neither a name nor an address, no band. Both are
    // trimmed, so whitespace is not a venue.
    case 'homepageVenue': {
      const name = conference.venueName?.trim()
      const address = conference.venueAddress?.trim()
      const src = source('venue')
      if (!name && !address) {
        return status('homepageVenue', 'empty-hides', src, {
          summary: 'No venue set',
          reason:
            'Hidden on the live site — add a venue name or address to the conference.',
        })
      }
      return status('homepageVenue', 'ready', src, {
        summary: [name, address].filter(Boolean).join(' · '),
      })
    }

    default: {
      // FORWARD COMPAT, mirroring the renderer's unknown-`_type` skip: stored
      // data from a newer schema reports as hiding rather than crashing the
      // composer. The `never` binding is the compile-time half — adding a
      // fourteenth section type to the registry fails to build here until it
      // gets a real case above.
      //
      // The returned `type` is the raw stored string, and it is typed as such:
      // see {@link UnknownSectionContentStatus} for why this is a shape of its
      // own rather than a `HomepageSectionType` it demonstrably is not.
      const exhaustive: never = section
      const unknown = exhaustive as { _type?: string }
      const src = source('section-config')
      return {
        known: false,
        type: String(unknown?._type),
        kind: 'empty-hides',
        willHide: true,
        count: null,
        countLabel: null,
        summary: 'Unknown section type',
        reason:
          'Hidden on the live site — this section type is not in the registry this deploy knows.',
        source: src,
        manage: manageOf(src),
      }
    }
  }
}
