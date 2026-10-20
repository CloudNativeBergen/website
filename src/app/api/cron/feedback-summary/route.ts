import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { deliverFeedbackSummaries } from '@/lib/feedback/server'

/**
 * The Session Feedback summary (speaker feedback spec §11.1, #1437): daily,
 * every talk whose Feedback Window has closed and that has not had its
 * summary yet gets its one summary, bell and email, for every speaker who is
 * not erased. No lookback: the talk's `feedbackSummarySentAt` marker alone
 * decides, so a failed run's talks go out on the next one.
 *
 * Its own route rather than a step of `cleanup-notifications`: a failure here
 * (an outage mid-run) must not stop the GDPR purges that route carries, nor
 * theirs this one; and it sends email, one at a time, which needs a time
 * budget of its own. 08:00 UTC, so the mail lands in the morning in Europe.
 */

/**
 * Resend allows about two requests a second, so 300 s is room for a few
 * hundred emails. The deadline is the end of the budget, less room to answer:
 * the run itself checks, right before each claim, that the talk's emails fit
 * before it at their worst, since a talk cut off after its claim would lose
 * the emails it had not sent yet. A talk that does not fit stays unclaimed
 * and goes out on the next run.
 */
export const maxDuration = 300
const RESERVE_MS = 10_000

export async function GET(request: NextRequest) {
  noStore()
  const startedAt = Date.now()
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

    const report = await deliverFeedbackSummaries({
      now: new Date(startedAt),
      deadline: new Date(startedAt + maxDuration * 1000 - RESERVE_MS),
    })
    console.log('[feedback] summary run', report)
    return NextResponse.json({ success: true, ...report })
  } catch (error) {
    console.error('Feedback summary cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
