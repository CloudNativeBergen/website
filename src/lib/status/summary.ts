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
import { fetchEventTickets } from '@/lib/tickets/api'
import { calculateTicketStatistics } from '@/lib/tickets/utils'
import { calculateFreeTicketClaimRate } from '@/lib/tickets/utils'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type { ProcessTicketSalesInput } from '@/lib/tickets/types'
import { getSpeakers } from '@/lib/speaker/sanity'

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

async function buildTicketSection(conference: Conference): Promise<{
  tickets: TicketSummary | null
  targetProgress: TargetProgress | null
  error: SectionError | null
}> {
  if (!conference.checkinCustomerId || !conference.checkinEventId) {
    return { tickets: null, targetProgress: null, error: null }
  }

  try {
    const allTickets = await fetchEventTickets(
      conference.checkinCustomerId,
      conference.checkinEventId,
    )

    const paidTickets = allTickets.filter((t) => parseFloat(t.sum) > 0)
    const freeTickets = allTickets.filter((t) => parseFloat(t.sum) === 0)

    const organizerTickets = conference.organizers?.length || 0

    const { speakers } = await getSpeakers(
      conference._id,
      [Status.confirmed],
      false,
    )
    const speakerTickets = speakers.length

    const basicStats = calculateTicketStatistics(paidTickets)
    const categoryBreakdown: Record<string, number> = {}
    for (const t of paidTickets) {
      categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + 1
    }

    const complimentary = organizerTickets + speakerTickets
    const freeTicketsClaimed = freeTickets.length

    const ticketSummary: TicketSummary = {
      paidTickets: basicStats.totalPaidTickets,
      totalRevenue: basicStats.totalRevenue,
      totalTickets: paidTickets.length,
      sponsorTickets: 0,
      speakerTickets,
      organizerTickets,
      freeTicketsClaimed,
      freeTicketClaimRate: calculateFreeTicketClaimRate(
        freeTicketsClaimed,
        complimentary,
      ),
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
