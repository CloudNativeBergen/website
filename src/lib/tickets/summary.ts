/**
 * EVERY COMPUTED TICKET FIGURE, DERIVED ONCE.
 *
 * All of this used to live inside `/admin/tickets/page.tsx`, so a second
 * consumer had to reimplement the arithmetic. This codebase has already paid
 * for that twice: the budget actuals and the weekly Slack summary each grew
 * their own answer to "which tickets are paid" and disagreed with the page (see
 * `./classification` and `@/lib/status/summary`). A CLI is the next consumer,
 * and a widget after it — so the page renders and this module computes.
 *
 * `tickets.admin.summary` returns exactly what this function returns, and the
 * page calls it directly. ONE implementation, two call sites, no payload
 * reshaping in between: the procedure adds authorization and conference
 * resolution, never a number.
 *
 * WHAT IT REFUSES TO FLATTEN. Every uncertainty the modules below model is
 * carried out whole — a per-category `claimed` of `'unknown'`, the tally's
 * `roleBasis`, the provider's VAT basis, the four ticketing access states, and
 * whether per-type revenue is an even split. A number in place of any of them
 * would be this module asserting a fact nobody obtained.
 */
import 'server-only'
import type { Conference } from '@/lib/conference/types'
import { getSpeakers, getOrganizerCount } from '@/lib/speaker/sanity'
import { fetchSpeakerTicketInputs } from '@/lib/speaker/ticketInputs'
import { Status } from '@/lib/proposal/types'
import { calculateDiscountUsage } from '@/lib/discounts'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'
import {
  resolveTicketingAdminAccess,
  ticketingProviderLabel,
  type TicketingAdminAccess,
} from './admin-access'
import type { TicketingProviderType } from './provider'
import { buildClassificationContext } from './classificationContext'
import { isPaidTicket } from './classification'
import { DEFAULT_TARGET_CONFIG } from './config'
import {
  calculateFreeTicketAllocation,
  countOrUnknown,
  type FreeTicketAllocation,
} from './freeAllocation'
import {
  tallyParticipants,
  seatsUsed,
  type ParticipantTally,
} from './participants'
import { TicketSalesProcessor } from './processor'
import {
  joinSpeakerTicketStatus,
  redeemedSpeakerEmails,
  toTicketCandidates,
  SPEAKER_TICKET_CATEGORY,
} from './speakerStatus'
import {
  calculateCategoryStats,
  calculateSponsorTickets,
  calculateTicketStatistics,
  type CategoryStat,
  type SponsorTicketData,
} from './utils'
import type {
  EventTicket,
  ProcessTicketSalesInput,
  TicketAnalysisOutcome,
  TicketStatistics,
} from './types'

export interface TicketSummaryReady {
  state: 'ready'
  providerType: TicketingProviderType
  /** Vendor name for organizer-facing copy. */
  providerLabel: string
  /**
   * Whether the amounts below INCLUDE VAT — read off the adapter (Checkin ex
   * VAT, Tito tax-inclusive), so a surface states the basis instead of leaving
   * the reader to assume one.
   */
  amountsIncludeVat: boolean
  /**
   * Whether per-type revenue is APPORTIONED. A provider reporting one amount
   * per ORDER (Checkin) carries no per-seat price, so a mixed-category order is
   * split evenly across its tickets — the event total is exact, a single type's
   * revenue is approximate. See `./provider/types` (`amountBasis`) and #1102.
   */
  revenueApportioned: boolean
  /** Sellable seats, or 0 when never configured — never an invented default. */
  capacity: number
  ticketCounts: {
    all: number
    /** Bought, by GRANT rather than by price — see `isPaidTicket`. */
    paid: number
    /** Granted. The complement of `paid` over the same one rule. */
    free: number
  }
  /** Humans, deduped ONCE over every admitting ticket. Carries `roleBasis`. */
  participants: ParticipantTally
  /** Chairs in the room: participants plus their repeat seats. */
  seatsUsed: number
  analysis: {
    /** Over the paid tickets — what the cards read. */
    paid: TicketAnalysisOutcome
    /** Over everything — what the free-ticket toggle selects. */
    all: TicketAnalysisOutcome
  }
  /** The paid-ticket statistics, zero-filled only on a genuine empty. */
  statistics: TicketStatistics
  categoryStats: CategoryStat[]
  freeTicketAllocation: FreeTicketAllocation
  sponsorTicketsByTier: Record<string, SponsorTicketData>
  /** Sponsor seats ALLOCATED, not redeemed — the sponsor table's denominator. */
  sponsorAllocationTotal: number
}

/**
 * Nothing to compute, and why. The first three are the ticketing access states
 * a surface routes to `TicketingStateNotice`; `error` is a provider read that
 * FAILED, which is not the same as an event with no tickets (that is a `ready`
 * summary whose analyses are `empty`).
 */
export type TicketSummary =
  | TicketSummaryReady
  | {
      state: 'unconfigured' | 'unavailable' | 'disabled'
      providerType: TicketingProviderType
      providerLabel: string
    }
  | { state: 'error'; message: string }

/**
 * Runs the sales analysis and says which of the three things happened. A thrown
 * analysis comes back as `unavailable` and must be rendered as a failure — it
 * is NOT flattened into the `empty` that means "no tickets", because a consumer
 * substituting a zeroed analysis would present the failure as a confident 0%
 * on track. See `TicketAnalysisOutcome`.
 */
async function analyse(
  tickets: EventTicket[],
  conference: Conference,
  speakerCount: number,
): Promise<TicketAnalysisOutcome> {
  if (tickets.length === 0) return { status: 'empty' }

  try {
    const input: ProcessTicketSalesInput = {
      tickets: tickets.map((t) => ({
        order_id: t.order_id,
        order_date: t.order_date,
        category: t.category,
        sum: t.sum,
      })),
      config: conference.ticketTargets || DEFAULT_TARGET_CONFIG,
      // 0 = never configured, and it stays 0: see `./config`. Everything
      // downstream must treat it as "unknown", not divide by it.
      capacity: conference.ticketCapacity ?? 0,
      conference,
      conferenceDate:
        conference.startDate ||
        conference.programDate ||
        new Date().toISOString(),
      speakerCount,
    }
    return { status: 'ok', analysis: new TicketSalesProcessor(input).process() }
  } catch (error) {
    console.error('Failed to process ticket analysis:', error)
    return { status: 'unavailable', error: (error as Error).message }
  }
}

/**
 * @param conference must be read WITH sponsors — the free-ticket allocation and
 *                   the sponsor tier table are both derived from them.
 */
export async function buildTicketSummary(
  conference: Conference,
): Promise<TicketSummary> {
  const access = await resolveTicketingAdminAccess(conference)
  if (access.state !== 'ready') {
    return {
      state: access.state,
      providerType: access.providerType,
      providerLabel: ticketingProviderLabel(access.providerType),
    }
  }

  let allTickets: EventTicket[]
  try {
    allTickets = await fetchTickets(access)
  } catch (error) {
    return { state: 'error', message: (error as Error).message }
  }

  // CLASSIFY FIRST, then split. The context needs the ticket list (discovery
  // reads co-holding off it to PROPOSE a role for every type nobody declared),
  // and the split needs the context. Proposals move no number, only how sure
  // this summary says it is.
  const classification = await buildClassificationContext(
    access,
    conference,
    allTickets,
  )

  // Paid vs free by GRANT, not by price: see `isPaidTicket`. Revenue, sellable
  // progress and the free-ticket toggle all read these two.
  const paidTickets = allTickets.filter((t) => isPaidTicket(t, classification))
  const freeCount = allTickets.length - paidTickets.length

  // ONE dedup over ALL tickets. Deduping paid and free separately and adding
  // the two counts double-counted everyone holding both a comp and a purchase.
  const participants = tallyParticipants(allTickets, classification)

  const { speakers: confirmedSpeakers, err: speakersErr } = await getSpeakers(
    conference._id,
    [Status.confirmed],
    false,
  )
  const { count: organizerCount, err: organizerErr } = await getOrganizerCount(
    conference._id,
  )

  const [paidAnalysis, allAnalysis] = await Promise.all([
    analyse(paidTickets, conference, confirmedSpeakers.length),
    analyse(allTickets, conference, confirmedSpeakers.length),
  ])

  const statistics: TicketStatistics =
    paidAnalysis.status === 'ok'
      ? paidAnalysis.analysis.statistics
      : {
          ...calculateTicketStatistics(paidTickets),
          categoryBreakdown: {},
          sponsorTickets: 0,
          speakerTickets: 0,
        }

  const sponsorTicketsByTier = calculateSponsorTickets(conference)

  return {
    state: 'ready',
    providerType: access.providerType,
    providerLabel: ticketingProviderLabel(access.providerType),
    amountsIncludeVat: access.provider.amountsIncludeVat,
    revenueApportioned: access.provider.amountBasis === 'per-order',
    capacity: conference.ticketCapacity ?? 0,
    ticketCounts: {
      all: allTickets.length,
      paid: paidTickets.length,
      free: freeCount,
    },
    participants,
    seatsUsed: seatsUsed(participants),
    analysis: { paid: paidAnalysis, all: allAnalysis },
    statistics,
    categoryStats: calculateCategoryStats(
      paidTickets,
      statistics.totalPaidTickets,
    ),
    freeTicketAllocation: await buildFreeTicketAllocation({
      conference,
      allTickets,
      classification,
      speakers: countOrUnknown({
        count: confirmedSpeakers.length,
        err: speakersErr,
      }),
      organizers: countOrUnknown({ count: organizerCount, err: organizerErr }),
    }),
    sponsorTicketsByTier,
    sponsorAllocationTotal: Object.values(sponsorTicketsByTier).reduce(
      (total, tier) => total + tier.tickets,
      0,
    ),
  }
}

async function fetchTickets(
  access: Extract<TicketingAdminAccess, { state: 'ready' }>,
): Promise<EventTicket[]> {
  try {
    return await access.provider.fetchEventTickets(access.eventRef)
  } catch (error) {
    throw new Error(`Unable to fetch tickets: ${(error as Error).message}`)
  }
}

/**
 * Each free-ticket category is claimed in a DIFFERENT way, so each is counted
 * from its own source — see `./freeAllocation`, which owns the rules. This just
 * gathers the three sources.
 */
async function buildFreeTicketAllocation({
  conference,
  allTickets,
  classification,
  speakers,
  organizers,
}: {
  conference: Conference
  allTickets: EventTicket[]
  classification: Awaited<ReturnType<typeof buildClassificationContext>>
  speakers: ReturnType<typeof countOrUnknown>
  organizers: ReturnType<typeof countOrUnknown>
}): Promise<FreeTicketAllocation> {
  // Sponsors: redemptions of their 100%-off codes, reconstructed from the
  // tickets we already hold, so a code with no redemption gets a resolved ZERO
  // rather than falling through to the provider's own counter (the
  // `actualUsage` contract in `@/lib/discounts/types`).
  const discountUsage = calculateDiscountUsage(allTickets)
  const discounts: EventDiscountWithUsage[] | null =
    classification.discounts?.map((discount) => ({
      ...discount,
      actualUsage: discount.triggerValue
        ? (discountUsage[discount.triggerValue.toUpperCase()] ?? {
            usageCount: 0,
            ticketIds: [],
            totalPaid: 0,
          })
        : undefined,
    })) ?? null

  // Speakers: the SAME derivation `/admin/speakers` uses. Without an identified
  // speaker ticket type there is no way to tell an unclaimed comp from a claim
  // filed under a category name we never learned, so claims stay unknown rather
  // than reading as "not claimed".
  const speakerTicketInputs = await fetchSpeakerTicketInputs(conference._id, [
    Status.confirmed,
  ])
  const redeemedEmails = classification.speakerTicketTypeName
    ? redeemedSpeakerEmails(toTicketCandidates(allTickets), [
        classification.speakerTicketTypeName,
        SPEAKER_TICKET_CATEGORY,
      ])
    : null

  return calculateFreeTicketAllocation({
    sponsors:
      conference.sponsors?.map((s) => ({
        name: s.sponsor.name,
        tier: s.tier,
      })) ?? [],
    discounts,
    // A failed read answers 0 WITH an error; rendering that 0 as an allocation
    // would state a fact the server never obtained.
    speakerCount: speakers,
    speakerStatuses: speakerTicketInputs
      ? joinSpeakerTicketStatus(speakerTicketInputs, redeemedEmails)
      : null,
    organizerCount: organizers,
  })
}
