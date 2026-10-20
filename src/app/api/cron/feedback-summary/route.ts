import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { deliverFeedbackSummaries } from '@/lib/feedback/summary'

/**
 * The Session Feedback summary (speaker feedback spec §11.1, #1437): daily,
 * each talk whose Feedback Window has closed since the last run gets its one
 * summary, bell and email, for every speaker who is not erased.
 *
 * Its own route rather than a step of `cleanup-notifications`: a failure here
 * (an outage mid-run) must not stop the GDPR purges that route carries, nor
 * theirs this one; and it sends email, one at a time, which needs a time
 * budget of its own. 08:00 UTC, so the mail lands in the morning in Europe.
 */

/**
 * Resend allows about two requests a second, so 300 s is room for a few
 * hundred emails. No talk is started in the last minute: a talk not started
 * stays unclaimed and goes out on the next run, while one cut off after its
 * claim would lose the emails it had not sent yet.
 */
export const maxDuration = 300
const RESERVE_MS = 60_000

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
