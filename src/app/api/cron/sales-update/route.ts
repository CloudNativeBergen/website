import { NextRequest, NextResponse } from 'next/server'
import { fetchEventTickets } from '@/lib/tickets/api'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type {
  ProcessTicketSalesInput,
  TicketAnalysisResult,
} from '@/lib/tickets/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendSalesUpdateToSlack } from '@/lib/slack/salesUpdate'

export async function GET(request: NextRequest) {
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
        }

        const processor = new TicketSalesProcessor(input)
        analysis = await processor.process()
      } catch (error) {
        console.log(
          'Target analysis calculation failed:',
          (error as Error).message,
        )
      }
    }

    const statistics = analysis?.statistics || {
      totalPaidTickets: paidTickets.length,
      totalRevenue: paidTickets.reduce((sum, t) => sum + parseFloat(t.sum), 0),
      totalOrders: new Set(paidTickets.map((t) => t.order_id)).size,
      averageTicketPrice: paidTickets.length
        ? paidTickets.reduce((sum, t) => sum + parseFloat(t.sum), 0) /
        paidTickets.length
        : 0,
      categoryBreakdown: {},
      sponsorTickets: 0,
      speakerTickets: 0,
      totalCapacityUsed: paidTickets.length,
    }

    await sendSalesUpdateToSlack({
      conference,
      ticketsByCategory: statistics.categoryBreakdown,
      paidTickets: statistics.totalPaidTickets,
      sponsorTickets: statistics.sponsorTickets,
      speakerTickets: statistics.speakerTickets,
      totalTickets: statistics.totalCapacityUsed,
      totalRevenue: statistics.totalRevenue,
      targetAnalysis: analysis,
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
