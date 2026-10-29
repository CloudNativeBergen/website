import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { foldExpiredFeedback } from '@/lib/feedback/server'

/**
 * The 24-month fold (speaker feedback spec §12.2, #1438): daily, every talk
 * whose conference ended more than 24 months ago and that still has Feedback
 * Responses has them folded into its totals and deleted, in guarded chunks.
 * A run cut short leaves only unfolded responses; the next run goes on.
 *
 * Its own route rather than a step of `cleanup-notifications`, as F8's
 * summary is: a failure here (a chunk that keeps losing its guards, an
 * outage) must not stop the purges that route carries, and a backlog of
 * folds needs a time budget of its own. 04:40 UTC, after the purges.
 */

/**
 * Each request of a fold ends after 5 s, and no chunk starts unless its
 * worst case and the sweep after it (`CHUNK_BUDGET_MS`) end before the
 * deadline: the end of the budget, less room to answer. A talk cut off there
 * keeps the chunks it folded; the next run goes on.
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

    const report = await foldExpiredFeedback({
      now: new Date(startedAt),
      deadline: new Date(startedAt + maxDuration * 1000 - RESERVE_MS),
    })
    console.log('[feedback] fold run', report)
    return NextResponse.json({ success: true, ...report })
  } catch (error) {
    console.error('Feedback fold cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
