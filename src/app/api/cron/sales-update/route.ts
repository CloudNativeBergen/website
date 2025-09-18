import { NextRequest, NextResponse } from 'next/server'
import { fetchEventTickets } from '@/lib/tickets/checkin'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import type {
  ProcessTicketSalesInput,
  TicketAnalysisResult,
} from '@/lib/tickets/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { sendSalesUpdateToSlack } from '@/lib/slack/salesUpdate'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication token
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

    // Check if checkin configuration is available
    if (!conference.checkin_customer_id || !conference.checkin_event_id) {
      console.error('Conference missing checkin configuration')
      return NextResponse.json(
        { error: 'Conference not configured for ticket sales tracking' },
        { status: 400 },
      )
    }

    // Fetch ticket data from CheckIn.no
    const tickets = await fetchEventTickets(
      conference.checkin_customer_id,
      conference.checkin_event_id,
    )

    // Process tickets using the new simplified processor
    let analysis: TicketAnalysisResult | null = null

    // Validate target configuration before analysis
    const targetConfig = conference.ticket_targets
    if (
      targetConfig &&
      targetConfig.enabled &&
      conference.ticket_capacity &&
      targetConfig.sales_start_date &&
      targetConfig.target_curve &&
      tickets.length > 0
    ) {
      try {
        const input: ProcessTicketSalesInput = {
          tickets: tickets.map((t) => ({
            order_id: t.order_id,
            order_date: t.order_date,
            category: t.category,
            sum: t.sum,
          })),
          config: targetConfig, // Use as-is since it already has the correct field names
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

    // Extract statistics from analysis or calculate basic stats
    const statistics = analysis?.statistics || {
      totalPaidTickets: tickets.length,
      totalRevenue: tickets.reduce((sum, t) => sum + parseFloat(t.sum), 0),
      totalOrders: new Set(tickets.map((t) => t.order_id)).size,
      averageTicketPrice: 0,
      categoryBreakdown: {},
      sponsorTickets: 0,
      speakerTickets: 0,
      totalCapacityUsed: tickets.length,
    }

    // Send update to Slack
    await sendSalesUpdateToSlack({
      conference,
      ticketsByCategory: statistics.categoryBreakdown,
      paidTickets: statistics.totalPaidTickets,
      sponsorTickets: statistics.sponsorTickets,
      speakerTickets: statistics.speakerTickets,
      totalTickets: statistics.totalCapacityUsed,
      totalRevenue: statistics.totalRevenue,
      targetAnalysis: analysis, // Include target analysis results
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

// Only allow POST requests
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
