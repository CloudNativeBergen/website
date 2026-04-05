import { NextRequest, NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isConferenceOver } from '@/lib/conference/state'
import { buildConferenceStatusSummary } from '@/lib/status/summary'
import { sendWeeklyUpdateToSlack } from '@/lib/slack/weeklyUpdate'
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
        organizers: true,
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
        `Conference ${conference.title} has ended. Skipping weekly update.`,
      )
      return NextResponse.json(
        {
          success: true,
          message: 'Conference has ended. Weekly updates are no longer sent.',
          conference: conference.title,
        },
        { status: 200 },
      )
    }

    const summary = await buildConferenceStatusSummary(conference)

    for (const err of summary.errors) {
      console.log(`${err.section} fetch failed:`, err.message)
    }

    const complimentary =
      (summary.tickets?.speakerTickets ?? 0) +
      (summary.tickets?.organizerTickets ?? 0) +
      (summary.tickets?.sponsorTickets ?? 0)

    await sendWeeklyUpdateToSlack({
      conference,
      ticketsByCategory: summary.tickets?.categoryBreakdown ?? {},
      paidTickets: summary.tickets?.paidTickets ?? 0,
      sponsorTickets: summary.tickets?.sponsorTickets ?? 0,
      speakerTickets: summary.tickets?.speakerTickets ?? 0,
      organizerTickets: summary.tickets?.organizerTickets ?? 0,
      freeTicketsClaimed: summary.tickets?.freeTicketsClaimed ?? 0,
      totalTickets: summary.tickets?.totalTickets ?? 0,
      totalRevenue: summary.tickets?.totalRevenue ?? 0,
      targetAnalysis: summary.targetProgress
        ? {
            progression: [],
            capacity: summary.targetProgress.capacity,
            performance: {
              currentPercentage: summary.targetProgress.currentPercentage,
              targetPercentage: summary.targetProgress.targetPercentage,
              variance: summary.targetProgress.variance,
              isOnTrack: summary.targetProgress.isOnTrack,
              nextMilestone: summary.targetProgress.nextMilestone
                ? {
                    date: '',
                    label: summary.targetProgress.nextMilestone.label,
                    daysAway: summary.targetProgress.nextMilestone.daysAway,
                  }
                : null,
            },
            statistics: {
              totalPaidTickets: summary.tickets?.paidTickets ?? 0,
              totalRevenue: summary.tickets?.totalRevenue ?? 0,
              totalOrders: 0,
              averageTicketPrice: 0,
              categoryBreakdown: summary.tickets?.categoryBreakdown ?? {},
              sponsorTickets: summary.tickets?.sponsorTickets ?? 0,
              speakerTickets: summary.tickets?.speakerTickets ?? 0,
              totalCapacityUsed: summary.tickets?.totalTickets ?? 0,
            },
          }
        : null,
      sponsorPipeline: summary.sponsors,
      proposalSummary: summary.proposals
        ? {
            submitted: summary.proposals.submitted,
            accepted: summary.proposals.accepted,
            confirmed: summary.proposals.confirmed,
            rejected: summary.proposals.rejected,
            withdrawn: summary.proposals.withdrawn,
            total: summary.proposals.total,
          }
        : null,
      lastUpdated: summary.lastUpdated,
    })

    return NextResponse.json({
      success: true,
      data: {
        conference: summary.conferenceTitle,
        paidTickets: summary.tickets?.paidTickets ?? 0,
        sponsorTickets: summary.tickets?.sponsorTickets ?? 0,
        speakerTickets: summary.tickets?.speakerTickets ?? 0,
        totalTickets: summary.tickets?.totalTickets ?? 0,
        totalRevenue: summary.tickets?.totalRevenue ?? 0,
        categories: summary.tickets?.categoryBreakdown ?? {},
        targetAnalysis: summary.targetProgress
          ? {
              enabled: true,
              capacity: summary.targetProgress.capacity,
              currentTargetPercentage: summary.targetProgress.targetPercentage,
              actualPercentage: summary.targetProgress.currentPercentage,
              variance: summary.targetProgress.variance,
              isOnTrack: summary.targetProgress.isOnTrack,
              nextMilestone: summary.targetProgress.nextMilestone,
            }
          : null,
        sponsorPipeline: summary.sponsors,
        proposalSummary: summary.proposals,
        complimentary,
        lastUpdated: summary.lastUpdated,
        errors: summary.errors,
      },
    })
  } catch (error) {
    console.error('Error in weekly update cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
