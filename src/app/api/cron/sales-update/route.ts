import { NextRequest, NextResponse } from 'next/server'
import { fetchEventTickets } from '@/lib/tickets/server'
import { calculateTicketStatistics } from '@/lib/tickets/data-processing'
import { analyzeTicketSales } from '@/lib/tickets/target-calculations'
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

    // Calculate comprehensive ticket statistics (same logic as admin/tickets page)
    const stats = await calculateTicketStatistics(tickets, conference)

    // Analyze ticket targets vs actual performance
    let targetAnalysis = null

    // Validate target configuration before analysis
    const config = conference.ticket_targets
    if (
      config?.enabled &&
      conference.ticket_capacity &&
      config.sales_start_date &&
      config.target_curve &&
      tickets.length > 0
    ) {
      try {
        targetAnalysis = analyzeTicketSales({
          capacity: conference.ticket_capacity,
          salesStartDate: config.sales_start_date,
          conferenceStartDate: conference.start_date,
          targetCurve: config.target_curve,
          milestones: config.milestones,
          tickets,
        })
      } catch (error) {
        console.log(
          'Target analysis calculation failed:',
          (error as Error).message,
        )
      }
    }

    // Send update to Slack
    await sendSalesUpdateToSlack({
      conference,
      ticketsByCategory: stats.ticketsByCategory,
      paidTickets: stats.paidTickets,
      sponsorTickets: stats.sponsorTickets,
      speakerTickets: stats.speakerTickets,
      totalTickets: stats.totalTickets,
      totalRevenue: stats.totalRevenue,
      targetAnalysis, // Include target analysis results
      lastUpdated: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      data: {
        conference: conference.title,
        paidTickets: stats.paidTickets,
        sponsorTickets: stats.sponsorTickets,
        speakerTickets: stats.speakerTickets,
        totalTickets: stats.totalTickets,
        totalRevenue: stats.totalRevenue,
        categories: stats.ticketsByCategory,
        targetAnalysis: targetAnalysis
          ? {
              enabled: targetAnalysis.config.enabled,
              capacity: targetAnalysis.capacity,
              currentTargetPercentage:
                targetAnalysis.performance.currentTargetPercentage,
              actualPercentage: targetAnalysis.performance.actualPercentage,
              variance: targetAnalysis.performance.variance,
              isOnTrack: targetAnalysis.performance.isOnTrack,
              nextMilestone: targetAnalysis.performance.nextMilestone,
              daysToNextMilestone:
                targetAnalysis.performance.daysToNextMilestone,
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
