import { NextRequest, NextResponse } from 'next/server'
import { fetchEventTickets } from '@/lib/tickets/api'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type {
  ProcessTicketSalesInput,
  TicketAnalysisResult,
} from '@/lib/tickets/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isConferenceOver } from '@/lib/conference/state'
import { getOrganizerCount, getSpeakers } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'
import { getProposals } from '@/lib/proposal/server'
import { sendSalesUpdateToSlack } from '@/lib/slack/salesUpdate'
import type { ProposalSummaryData } from '@/lib/slack/salesUpdate'
import {
  aggregateSponsorPipeline,
  type SponsorPipelineData,
} from '@/lib/sponsor-crm/pipeline'
import { listSponsorsForConference } from '@/lib/sponsor-crm/sanity'
import { calculateTicketStatistics } from '@/lib/tickets/utils'
import { unstable_noStore as noStore } from 'next/cache'

export async function GET(request: NextRequest) {
  noStore()
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Invalid or missing authorization token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const hostname = request.headers.get('host') || url.hostname

    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        sponsors: true,
        featuredSpeakers: false,
        featuredTalks: false,
      })

    if (conferenceError || !conference) {
      console.error(
        `Failed to load conference for domain ${hostname}:`,
        conferenceError,
      )
      return NextResponse.json(
        { error: 'Failed to load conference configuration' },
        { status: 500 },
      )
    }

    if (isConferenceOver(conference)) {
      console.log(
        `Conference ${conference.title} has ended. Skipping sales update.`,
      )
      return NextResponse.json(
        {
          success: true,
          message: 'Conference has ended. Sales updates are no longer sent.',
          conference: conference.title,
        },
        { status: 200 },
      )
    }

    if (!conference.checkin_customer_id || !conference.checkin_event_id) {
      console.error('Conference missing checkin configuration')
      return NextResponse.json(
        { error: 'Conference not configured for ticket sales tracking' },
        { status: 400 },
      )
    }

    const allTickets = await fetchEventTickets(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )

    const paidTickets = allTickets.filter((t) => parseFloat(t.sum) > 0)
    const freeTickets = allTickets.filter((t) => parseFloat(t.sum) === 0)

    const { count: organizerCount, err: organizerErr } =
      await getOrganizerCount()
    if (organizerErr) {
      console.log('Failed to fetch organizer count:', organizerErr)
    }

    const { speakers, err: speakersErr } = await getSpeakers(
      conference._id,
      [Status.confirmed],
      false,
    )
    if (speakersErr) {
      console.log('Failed to fetch speakers:', speakersErr)
    }

    let analysis: TicketAnalysisResult | null = null

    const targetConfig = conference.ticket_targets
    if (
      targetConfig &&
      targetConfig.enabled &&
      conference.ticket_capacity &&
      targetConfig.sales_start_date &&
      targetConfig.target_curve &&
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
          capacity: conference.ticket_capacity,
          conference,
          conferenceDate:
            conference.start_date ||
            conference.program_date ||
            new Date().toISOString(),
          speakerCount: speakers.length,
        }

        const processor = new TicketSalesProcessor(input)
        analysis = processor.process()
      } catch (error) {
        console.log(
          'Target analysis calculation failed:',
          (error as Error).message,
        )
      }
    }

    const basicStats = calculateTicketStatistics(paidTickets)
    const statistics = analysis?.statistics || {
      ...basicStats,
      categoryBreakdown: {},
      sponsorTickets: 0,
      speakerTickets: 0,
      totalCapacityUsed: paidTickets.length,
    }

    let proposalSummary: ProposalSummaryData | null = null
    try {
      const { proposals } = await getProposals({
        conferenceId: conference._id,
        returnAll: true,
      })
      proposalSummary = {
        submitted: proposals.filter((p) => p.status === Status.submitted)
          .length,
        accepted: proposals.filter((p) => p.status === Status.accepted).length,
        confirmed: proposals.filter((p) => p.status === Status.confirmed)
          .length,
        rejected: proposals.filter((p) => p.status === Status.rejected).length,
        withdrawn: proposals.filter((p) => p.status === Status.withdrawn)
          .length,
        total: proposals.length,
      }
    } catch (error) {
      console.log('Proposal summary fetch failed:', (error as Error).message)
    }

    let sponsorPipeline: SponsorPipelineData | null = null
    const { sponsors: crmSponsors, error: sponsorsError } =
      await listSponsorsForConference(conference._id)

    if (sponsorsError) {
      console.log('Sponsor pipeline data fetch failed:', sponsorsError.message)
    } else if (crmSponsors && crmSponsors.length > 0) {
      sponsorPipeline = aggregateSponsorPipeline(crmSponsors)
    }

    await sendSalesUpdateToSlack({
      conference,
      ticketsByCategory: statistics.categoryBreakdown,
      paidTickets: statistics.totalPaidTickets,
      sponsorTickets: statistics.sponsorTickets,
      speakerTickets: statistics.speakerTickets,
      organizerTickets: organizerCount,
      freeTicketsClaimed: freeTickets.length,
      totalTickets: statistics.totalCapacityUsed,
      totalRevenue: statistics.totalRevenue,
      targetAnalysis: analysis,
      sponsorPipeline,
      proposalSummary,
      lastUpdated: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      data: {
        conference: conference.title,
        paidTickets: statistics.totalPaidTickets,
        sponsorTickets: statistics.sponsorTickets,
        speakerTickets: statistics.speakerTickets,
        totalTickets: statistics.totalCapacityUsed,
        totalRevenue: statistics.totalRevenue,
        categories: statistics.categoryBreakdown,
        targetAnalysis: analysis
          ? {
            enabled: true,
            capacity: analysis.capacity,
            currentTargetPercentage: analysis.performance.targetPercentage,
            actualPercentage: analysis.performance.currentPercentage,
            variance: analysis.performance.variance,
            isOnTrack: analysis.performance.isOnTrack,
            nextMilestone: analysis.performance.nextMilestone,
          }
          : null,
        sponsorPipeline,
        proposalSummary,
        lastUpdated: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Error in sales update cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
