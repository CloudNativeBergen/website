import type { Conference } from '@/lib/conference/types'
import type {
  ConferenceStatusSummary,
  ProposalSummary,
  TicketSummary,
  TargetProgress,
  SectionError,
} from './types'
import {
  aggregateSponsorPipeline,
  type SponsorPipelineData,
} from '@/lib/sponsor-crm/pipeline'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import { getProposals } from '@/lib/proposal/server'
import { Status } from '@/lib/proposal/types'
import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { isTicketingDeniedForConference } from '@/lib/features/ticketing'
import { isPaidTicket } from '@/lib/tickets/classification'
import { buildClassificationContext } from '@/lib/tickets/classificationContext'
import { calculateTicketStatistics } from '@/lib/tickets/utils'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput } from '@/lib/tickets/types'
import { getSpeakers } from '@/lib/speaker/sanity'
import { countOrUnknown } from '@/lib/tickets/freeAllocation'

async function buildSponsorSection(
  conferenceId: string,
): Promise<{ data: SponsorPipelineData | null; error: SectionError | null }> {
  try {
    const { sponsors, error } = await listSponsorsForConference(conferenceId)
    if (error) {
      return {
        data: null,
        error: { section: 'sponsors', message: error.message },
      }
    }
    if (!sponsors || sponsors.length === 0) {
      return { data: null, error: null }
    }
    return { data: aggregateSponsorPipeline(sponsors), error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        section: 'sponsors',
        message: (err as Error).message,
      },
    }
  }
}

async function buildProposalSection(
  conferenceId: string,
): Promise<{ data: ProposalSummary | null; error: SectionError | null }> {
  try {
    const { proposals } = await getProposals({
      conferenceId,
      returnAll: true,
    })

    const byStatus: Record<string, number> = {}
    for (const p of proposals) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1
    }

    return {
      data: {
        total: proposals.length,
        submitted: byStatus[Status.submitted] || 0,
        accepted: byStatus[Status.accepted] || 0,
        confirmed: byStatus[Status.confirmed] || 0,
        rejected: byStatus[Status.rejected] || 0,
        withdrawn: byStatus[Status.withdrawn] || 0,
        byStatus,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        section: 'proposals',
        message: (err as Error).message,
      },
    }
  }
}

/**
 * The ticket numbers in the weekly Slack update and on the admin status page.
 *
 * THE KILL SWITCH REACHES HERE (#836). This section is an ORGANIZER-VISIBLE
 * OUTPUT, and the cron posts it on a schedule with no organizer present: before
 * this gate, an org whose ticketing an operator had switched off kept receiving
 * live ticket counts and revenue in Slack every week. A deny that only silences
 * the UI is not a switch-off.
 *
 * ORDER MATCHES `resolveTicketingAdminAccess`: the deny is asked BEFORE the
 * provider resolves, so no provider call is made on a denied org's behalf.
 * `isTicketingDeniedForConference` is narrow on purpose — only an operator's own
 * active `enabled: false` — so a missing org document or a flaky Sanity read
 * leaves the section exactly as it was, rather than silently blanking a working
 * conference's numbers for a week.
 *
 * A denied org returns the SAME empty shape as an unconfigured one, so both the
 * Slack post and the status page simply omit ticket figures (they already
 * `?? 0` every field). The rest of the summary — sponsors, proposals — is
 * untouched: this switches off ticketing, not the weekly update.
 */
async function buildTicketSection(conference: Conference): Promise<{
  tickets: TicketSummary | null
  targetProgress: TargetProgress | null
  error: SectionError | null
}> {
  if (await isTicketingDeniedForConference(conference)) {
    return { tickets: null, targetProgress: null, error: null }
  }

  const ticketing = await resolveTicketingProvider(conference)
  if (!ticketing.configured) {
    return { tickets: null, targetProgress: null, error: null }
  }

  try {
    const allTickets = await ticketing.provider.fetchEventTickets(
      ticketing.eventRef,
    )

    // PAID BY GRANT, NOT BY PRICE — the same `isPaidTicket` split
    // `/admin/tickets` uses, so the weekly Slack post and the admin page cannot
    // report two different "Paid Tickets" for one event. This used to be
    // `parseTicketAmount(t.sum) > 0`, which sells a 100%-off sponsor grant that
    // carries a nonzero amount.
    //
    // WHAT IT COSTS ON THIS SURFACE: one extra provider call (the event's
    // discount list) per conference per cron run — the ticket-type lookup
    // behind it is TTL-cached per org+event. `buildClassificationContext`
    // absorbs a failed discount read, and `isPaidTicket`'s `comp: 'unknown'`
    // policy then falls back to price, i.e. exactly the numbers this section
    // published before. No second fallback.
    const classification = await buildClassificationContext(
      ticketing,
      conference,
    )
    const paidTickets = allTickets.filter((t) =>
      isPaidTicket(t, classification),
    )

    const organizerTickets = conference.organizers?.length || 0

    // A failed roster read answers an EMPTY list alongside `err`. Assigning
    // its length here published a Sanity outage as "0 speaker allocations", so
    // the error comes along and the count stays unknown.
    const { speakers, err: speakersErr } = await getSpeakers(
      conference._id,
      [Status.confirmed],
      false,
    )
    const speakerTickets = countOrUnknown({
      count: speakers.length,
      err: speakersErr,
    })

    const basicStats = calculateTicketStatistics(paidTickets)
    const categoryBreakdown: Record<string, number> = {}
    for (const t of paidTickets) {
      categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + 1
    }

    // NO free-ticket CLAIMS here, and no sponsor allowance: see `TicketSummary`.
    // Both need sources this section does not read, and the price test that
    // stood in for them disagreed with `/admin/tickets` on the same event.
    const ticketSummary: TicketSummary = {
      paidTickets: basicStats.totalPaidTickets,
      totalRevenue: basicStats.totalRevenue,
      totalTickets: paidTickets.length,
      speakerTickets,
      organizerTickets,
      categoryBreakdown,
    }

    let targetProgress: TargetProgress | null = null
    const targetConfig = conference.ticketTargets
    if (
      targetConfig?.enabled &&
      conference.ticketCapacity &&
      targetConfig.salesStartDate &&
      targetConfig.targetCurve &&
      paidTickets.length > 0
    ) {
      try {
        const input: ProcessTicketSalesInput = {
          tickets: paidTickets.map((t) => ({
            order_id: t.order_id,
            order_date: t.order_date,
            category: t.category,
            sum: t.sum,
          })),
          config: targetConfig,
          capacity: conference.ticketCapacity,
          conference,
          conferenceDate:
            conference.startDate ||
            conference.programDate ||
            new Date().toISOString(),
          speakerCount: speakers.length,
        }

        const processor = new TicketSalesProcessor(input)
        const analysis = processor.process()

        targetProgress = {
          currentPercentage: analysis.performance.currentPercentage,
          targetPercentage: analysis.performance.targetPercentage,
          variance: analysis.performance.variance,
          isOnTrack: analysis.performance.isOnTrack,
          capacity: analysis.capacity,
          nextMilestone: analysis.performance.nextMilestone
            ? {
                label: analysis.performance.nextMilestone.label,
                daysAway: analysis.performance.nextMilestone.daysAway,
              }
            : null,
        }
      } catch {
        // Target analysis is optional — don't fail the whole section
      }
    }

    return { tickets: ticketSummary, targetProgress, error: null }
  } catch (err) {
    return {
      tickets: null,
      targetProgress: null,
      error: {
        section: 'tickets',
        message: (err as Error).message,
      },
    }
  }
}

export async function buildConferenceStatusSummary(
  conference: Conference,
): Promise<ConferenceStatusSummary> {
  const errors: SectionError[] = []

  const [sponsorResult, proposalResult, ticketResult] = await Promise.all([
    buildSponsorSection(conference._id),
    buildProposalSection(conference._id),
    buildTicketSection(conference),
  ])

  if (sponsorResult.error) errors.push(sponsorResult.error)
  if (proposalResult.error) errors.push(proposalResult.error)
  if (ticketResult.error) errors.push(ticketResult.error)

  return {
    conferenceTitle: conference.title,
    lastUpdated: new Date().toISOString(),
    sponsors: sponsorResult.data,
    proposals: proposalResult.data,
    tickets: ticketResult.tickets,
    targetProgress: ticketResult.targetProgress,
    errors,
  }
}
