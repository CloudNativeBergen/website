import { NextRequest, NextResponse } from 'next/server'
import type { Conference } from '@/lib/conference/types'
import { getConferencesForWeeklyUpdate } from '@/lib/conference/sanity'
import { buildConferenceStatusSummary } from '@/lib/status/summary'
import { sendWeeklyUpdateToSlack } from '@/lib/slack/weeklyUpdate'
import { unstable_noStore as noStore } from 'next/cache'

/**
 * Send the weekly Slack status update for ONE conference. Isolated so a caller
 * can run it under a per-conference try/catch and continue with the rest.
 */
async function sendWeeklyUpdateForConference(conference: Conference) {
  const summary = await buildConferenceStatusSummary(conference)

  for (const err of summary.errors) {
    console.log(
      `[${conference.title}] ${err.section} fetch failed:`,
      err.message,
    )
  }

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

  return {
    conference: summary.conferenceTitle,
    paidTickets: summary.tickets?.paidTickets ?? 0,
    totalTickets: summary.tickets?.totalTickets ?? 0,
    totalRevenue: summary.tickets?.totalRevenue ?? 0,
    errors: summary.errors.length,
  }
}

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

    // The deployment serves multiple conferences: send the weekly update to
    // EVERY qualifying edition, not just the one owning the request Host.
    const conferences = await getConferencesForWeeklyUpdate()

    if (conferences.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active conference with a sales channel — nothing to send.',
        results: [],
      })
    }

    // Process SEQUENTIALLY and ISOLATED per conference: one tenant's failure
    // (a bad config, a Slack error, a status-summary throw) must not abort the
    // weekly update for the others.
    const results: Array<{
      conferenceId: string
      title?: string
      ok: boolean
      durationMs: number
      data?: Awaited<ReturnType<typeof sendWeeklyUpdateForConference>>
      error?: string
    }> = []

    for (const conference of conferences) {
      const startedAt = Date.now()
      try {
        const data = await sendWeeklyUpdateForConference(conference)
        const durationMs = Date.now() - startedAt
        console.log(
          `Weekly update sent for ${conference.title} (${conference._id}) in ${durationMs}ms`,
        )
        results.push({
          conferenceId: conference._id,
          title: conference.title,
          ok: true,
          durationMs,
          data,
        })
      } catch (error) {
        const durationMs = Date.now() - startedAt
        console.error(
          `Weekly update failed for ${conference.title} (${conference._id}) after ${durationMs}ms:`,
          error,
        )
        results.push({
          conferenceId: conference._id,
          title: conference.title,
          ok: false,
          durationMs,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const summary = {
      conferences: results.length,
      failed: results.filter((r) => !r.ok).length,
    }
    console.log(
      `Weekly update summary: conferences=${summary.conferences} failed=${summary.failed}`,
    )

    return NextResponse.json({
      success: true,
      summary,
      results,
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
