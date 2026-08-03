import type { Conference } from '@/lib/conference/types'
import {
  isCfpOpen,
  isConferenceOver,
  isProgramPublished,
  isRegistrationAvailable,
} from '@/lib/conference/state'
import { toOsloAnchoredDate } from '@/lib/time'
import { hasProposalVideo } from '@/lib/proposal/video'
import type { TicketAvailability } from '@/lib/tickets/public'

/**
 * Homepage lifecycle model (F5).
 *
 * WHY THIS EXISTS: a brand-new conference has no speakers, no sponsors, no
 * schedule and no photos. Before this module the homepage had no defined
 * rendering for that state — sections either vanished (leaving a hero above a
 * "Become a Sponsor" pitch) or rendered their scaffolding around nothing (the
 * Program Highlights band happily printing `0+ Sessions / 0+ Speakers` for a
 * published-but-empty schedule, live in production). Every section now has a
 * DEFINED rendering in every state: it either hides itself or renders a
 * deliberate placeholder.
 *
 * SHAPE OF THE MODEL: one ordered {@link HomepageStage} (mutually exclusive,
 * "where is this event in its life") plus orthogonal FACETS (CFP, tickets, and
 * what content actually exists). A single flat enum would have to be the cross
 * product — "cfp-open-with-programme-and-no-sponsors" — which is unusable.
 *
 * DERIVED, NOT CONFIGURED: every stage but `cancelled` and `archived` falls out
 * of dates the organizer already fills in (`cfpStartDate`, `cfpEndDate`,
 * `programDate`, `startDate`, `endDate`) plus the presence of content. Those two
 * exceptions cannot be derived from any date — an event is cancelled because a
 * human says so — so they are the only explicit switch (`lifecycleStatus`).
 */

/** Ordered life of an event. Exactly one applies at any moment. */
export type HomepageStage =
  /** Dates announced, CFP not yet open. THE DAY-ONE STATE. */
  | 'announced'
  /** Call for papers is open. */
  | 'cfp-open'
  /** CFP has closed; the programme is not published yet (review/selection). */
  | 'curating'
  /** Programme published, event still ahead. */
  | 'programme'
  /** The event has happened. Lead with what came out of it. */
  | 'post-event'
  /** Explicit override: the edition was called off. Replaces the page. */
  | 'cancelled'
  /** Explicit override: the event has ended for good. A tombstone. */
  | 'archived'

/** Where the call for papers stands. `absent` = no CFP dates configured. */
export type CfpState = 'absent' | 'upcoming' | 'open' | 'closed'

/** Where ticket sales stand, as far as the PUBLIC homepage can tell. */
export type TicketState =
  /** No registration link / registration switched off. */
  | 'unavailable'
  /** Sale windows exist but none has opened yet. */
  | 'not-yet-on-sale'
  /** Registration configured and (as far as we know) buyable. */
  | 'on-sale'
  /** Every active public ticket type positively reports zero remaining. */
  | 'sold-out'
  /** Sales are over because the event is over. */
  | 'closed'

/** The one action the page should push hardest in the current state. */
export type PrimaryCta = 'cfp' | 'tickets' | 'programme' | 'info'

/**
 * What the conference actually HAS. Every flag here answers "would this section
 * render anything?", so section-selection logic never has to re-derive it.
 */
export interface HomepageContent {
  /** Featured gallery images — for a first edition this is always false. */
  hasGallery: boolean
  hasFeaturedSpeakers: boolean
  hasOrganizers: boolean
  hasSponsors: boolean
  hasVanityMetrics: boolean
  /**
   * A published schedule that contains at least one CONFIRMED talk. Deliberately
   * stricter than "a schedule document exists": an empty published schedule is
   * what produced the all-zero stat band in production.
   */
  hasProgramme: boolean
  /**
   * At least one talk carries a `recording` URL attachment — the platform's only
   * model of post-event media (there is no conference-level video field). Drives
   * the post-event call to action: "Watch the talks" is a promise, so it is only
   * made when a recording actually exists.
   */
  hasRecordings: boolean
  /**
   * No evidence of a previous edition — no past photos and no vanity metrics to
   * quote. A PROXY, not a fact: the platform models editions as independent
   * conference documents and the homepage render has no cross-edition query, so
   * "did this organizer run this before" is not knowable here. What the homepage
   * needs to decide is narrower and this does answer it: is there any history to
   * SHOW? When false the page must not leave a hole where the retrospective
   * material normally goes.
   */
  isFirstEdition: boolean
}

/** The full resolved state the renderer and section selector work from. */
export interface HomepageLifecycle {
  stage: HomepageStage
  cfp: CfpState
  tickets: TicketState
  content: HomepageContent
  primaryCta: PrimaryCta
  /** True for `cancelled` / `archived`: the notice REPLACES the page. */
  isOverridden: boolean
}

/** Explicit, non-derivable statuses an organizer can put a conference into. */
export const LIFECYCLE_STATUS_VALUES = ['cancelled', 'archived'] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUS_VALUES)[number]

export function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return (
    typeof value === 'string' &&
    (LIFECYCLE_STATUS_VALUES as readonly string[]).includes(value)
  )
}

/** One milestone on the save-the-date roadmap. */
export interface RoadmapStep {
  key: 'cfp' | 'programme' | 'tickets'
  label: string
  /** `done` renders muted; `open` renders as the live, linkable step. */
  status: 'upcoming' | 'open' | 'done'
  /** The status line — a date or a state, never an action. */
  detail: string
  /** Present only when the step is something a visitor can act on today. */
  href?: string
  /** Button copy for an actionable step. Always paired with `href`. */
  actionLabel?: string
}

/**
 * The "what happens next" roadmap for the save-the-date band, derived entirely
 * from dates the organizer has already entered.
 *
 * THE RULE THAT MATTERS: a milestone with no date is OMITTED, never rendered as
 * "TBA" or a blank row. A brand-new conference that has only set its event dates
 * gets an empty roadmap and the band falls back to dates + venue + countdown,
 * which is still a complete announcement. Half-configured events get exactly the
 * steps they have configured.
 */
export function resolveRoadmapSteps(
  conference: Conference,
  lifecycle: Pick<HomepageLifecycle, 'cfp' | 'tickets' | 'content'>,
  formatDate: (value: string) => string,
): RoadmapStep[] {
  const steps: RoadmapStep[] = []

  if (lifecycle.cfp !== 'absent') {
    if (lifecycle.cfp === 'upcoming') {
      steps.push({
        key: 'cfp',
        label: 'Call for speakers',
        status: 'upcoming',
        detail: `Opens ${formatDate(conference.cfpStartDate)}`,
      })
    } else if (lifecycle.cfp === 'open') {
      steps.push({
        key: 'cfp',
        label: 'Call for speakers',
        status: 'open',
        detail: `Open until ${formatDate(conference.cfpEndDate)}`,
        href: '/cfp',
        actionLabel: 'Submit a talk',
      })
    } else {
      steps.push({
        key: 'cfp',
        label: 'Call for speakers',
        status: 'done',
        detail: `Closed ${formatDate(conference.cfpEndDate)}`,
      })
    }
  }

  if (conference.programDate?.trim()) {
    if (lifecycle.content.hasProgramme) {
      steps.push({
        key: 'programme',
        label: 'Programme',
        status: 'open',
        detail: 'Published',
        href: '/program',
        actionLabel: 'See the programme',
      })
    } else {
      // The programme date may already have passed with nothing published yet.
      // "Coming soon" is the honest reading; linking to an empty programme page
      // is the promise this whole module exists to stop making.
      steps.push({
        key: 'programme',
        label: 'Programme',
        status: 'upcoming',
        detail: `Announced ${formatDate(conference.programDate)}`,
      })
    }
  }

  // `unavailable` and `closed` mean we know nothing a visitor can use, so the
  // step is omitted rather than rendered as an empty promise.
  if (lifecycle.tickets === 'on-sale') {
    steps.push({
      key: 'tickets',
      label: 'Tickets',
      status: 'open',
      detail: 'On sale now',
      href: '/tickets',
      actionLabel: 'Get tickets',
    })
  } else if (lifecycle.tickets === 'not-yet-on-sale') {
    steps.push({
      key: 'tickets',
      label: 'Tickets',
      status: 'upcoming',
      detail: 'Not yet on sale',
    })
  } else if (lifecycle.tickets === 'sold-out') {
    steps.push({
      key: 'tickets',
      label: 'Tickets',
      status: 'done',
      detail: 'Sold out',
    })
  }

  return steps
}

/** Parse a `YYYY-MM-DD` (or ISO) field to epoch ms; `null` when unusable. */
function toMs(value?: string | null): number | null {
  const raw = value?.trim()
  if (!raw) return null
  const ms = toOsloAnchoredDate(raw).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Whether a published schedule carries at least one confirmed talk.
 *
 * THE PRODUCTION BUG THIS CLOSES: `programDate` in the past plus a schedule
 * document that has no confirmed talks in it satisfied the old
 * "programme published" test, so the Program Highlights band rendered with
 * every computed statistic at zero. Counting the talks is the only honest test
 * of whether there is a programme to highlight.
 */
export function hasProgrammeContent(conference: Conference): boolean {
  if (!isProgramPublished(conference)) return false
  const schedules = conference.schedules ?? []
  return schedules.some((schedule) =>
    (schedule.tracks ?? []).some((track) =>
      (track.talks ?? []).some((slot) => slot.talk?.status === 'confirmed'),
    ),
  )
}

/** Resolve the CFP facet from the two CFP date fields. */
export function resolveCfpState(conference: Conference): CfpState {
  const start = toMs(conference.cfpStartDate)
  const end = toMs(conference.cfpEndDate)
  if (start === null || end === null) return 'absent'
  if (isCfpOpen(conference)) return 'open'
  return Date.now() < start ? 'upcoming' : 'closed'
}

/**
 * Resolve the ticket facet.
 *
 * `availability` is passed in rather than read off the conference because the
 * public homepage learns it from the TICKETING PROVIDER at render time, not from
 * Sanity (see `getTicketAvailability`). Absent — no binding, or the provider was
 * unreachable — it degrades to `on-sale`, because the conference-level
 * registration toggle is the organizer's own statement that tickets exist. The
 * page must never manufacture a "sold out" claim out of a failed fetch.
 */
export function resolveTicketState(
  conference: Conference,
  availability?: TicketAvailability | null,
): TicketState {
  if (isConferenceOver(conference)) return 'closed'
  if (!isRegistrationAvailable(conference)) return 'unavailable'
  if (availability === 'sold-out') return 'sold-out'
  if (availability === 'upcoming') return 'not-yet-on-sale'
  return 'on-sale'
}

/** True when any talk in the published schedule links a recording. */
function scheduleHasRecordings(conference: Conference): boolean {
  return (conference.schedules ?? []).some((schedule) =>
    (schedule.tracks ?? []).some((track) =>
      (track.talks ?? []).some(
        (slot) => slot.talk && hasProposalVideo(slot.talk),
      ),
    ),
  )
}

/** Resolve which content-bearing sections have anything to show. */
export function resolveHomepageContent(
  conference: Conference,
): HomepageContent {
  const hasGallery = (conference.featuredGalleryImages?.length ?? 0) > 0
  const hasVanityMetrics = (conference.vanityMetrics?.length ?? 0) > 0
  return {
    hasGallery,
    hasVanityMetrics,
    hasFeaturedSpeakers: (conference.featuredSpeakers?.length ?? 0) > 0,
    hasOrganizers: (conference.organizers?.length ?? 0) > 0,
    hasSponsors: (conference.sponsors?.length ?? 0) > 0,
    hasProgramme: hasProgrammeContent(conference),
    hasRecordings:
      (conference.featuredTalks ?? []).some(hasProposalVideo) ||
      scheduleHasRecordings(conference),
    isFirstEdition: !hasGallery && !hasVanityMetrics,
  }
}

/** Resolve the ordered stage. Explicit status wins over any derivation. */
export function resolveHomepageStage(conference: Conference): HomepageStage {
  if (isLifecycleStatus(conference.lifecycleStatus)) {
    return conference.lifecycleStatus
  }
  if (isConferenceOver(conference)) return 'post-event'
  if (isProgramPublished(conference)) return 'programme'
  if (isCfpOpen(conference)) return 'cfp-open'
  // CFP dates exist and the window has passed → review/selection, not day one.
  return resolveCfpState(conference) === 'closed' ? 'curating' : 'announced'
}

/**
 * The single action the page should push. Post-event this is deliberately the
 * PROGRAMME, not tickets — after the event the thing a visitor wants is what
 * happened, and a "Get tickets" button on a finished conference reads as
 * abandonware. Before the event the CFP outranks tickets while it is open,
 * because speakers are the scarcer supply.
 */
export function resolvePrimaryCta(
  stage: HomepageStage,
  cfp: CfpState,
  tickets: TicketState,
  content: HomepageContent,
): PrimaryCta {
  if (stage === 'post-event') return content.hasProgramme ? 'programme' : 'info'
  if (cfp === 'open') return 'cfp'
  if (tickets === 'on-sale') return 'tickets'
  if (content.hasProgramme) return 'programme'
  return 'info'
}

/**
 * Resolve the complete lifecycle state for a conference.
 *
 * Pure: everything comes from the conference document plus the optional live
 * `soldOut` signal, so this is unit-testable without a renderer.
 */
export function resolveHomepageLifecycle(
  conference: Conference,
  options: { ticketAvailability?: TicketAvailability | null } = {},
): HomepageLifecycle {
  const stage = resolveHomepageStage(conference)
  const cfp = resolveCfpState(conference)
  const content = resolveHomepageContent(conference)
  const tickets =
    stage === 'cancelled' || stage === 'archived'
      ? 'unavailable'
      : resolveTicketState(conference, options.ticketAvailability)
  return {
    stage,
    cfp,
    tickets,
    content,
    primaryCta: resolvePrimaryCta(stage, cfp, tickets, content),
    isOverridden: stage === 'cancelled' || stage === 'archived',
  }
}
