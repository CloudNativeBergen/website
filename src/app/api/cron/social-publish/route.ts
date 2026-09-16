import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { runPublishTick } from '@/lib/social/publish-engine'
import { sanitySocialVariantStore } from '@/lib/social/sanity'
import { resolveSocialPublishAdapter } from '@/lib/social/provider'
import {
  notifyMarketingAwaitingManual,
  notifyMarketingFailure,
} from '@/lib/marketing/notifications'

/**
 * Per-minute social publish reconciliation (dashboard #785). Every tick fails
 * stale `publishing` claims, then claims (compare-and-set) and dispatches each
 * due variant through its platform adapter — or moves it to `awaiting-manual`
 * when no adapter is configured — and then notifies the assignee (#1006).
 * Vercel Cron is best-effort and may fire twice:
 * the CAS claim makes a duplicate tick harmless, and a missed tick is caught up
 * by the next one. Auth mirrors the other crons: `Bearer ${CRON_SECRET}`.
 *
 * `maxDuration` bounds a tick well under the 15-minute stale-claim window.
 */
export const maxDuration = 60

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

    const startedAt = Date.now()
    const summary = await runPublishTick({
      store: sanitySocialVariantStore,
      resolveAdapter: resolveSocialPublishAdapter,
      onAwaitingManual: notifyMarketingAwaitingManual,
      onFailed: notifyMarketingFailure,
      // A few seconds before Vercel kills the function: the engine stops
      // claiming when a publish could no longer finish in time.
      deadline: new Date(startedAt + (maxDuration - 5) * 1000),
    })
    console.log(
      `Social publish tick: due=${summary.due} published=${summary.published} awaitingManual=${summary.awaitingManual} requeued=${summary.requeued} failed=${summary.failed} stale=${summary.staleFailed} deferred=${summary.deferred} lostRace=${summary.lostRace} settleLost=${summary.settleLost} candidates=${summary.candidates} errors=${summary.errors.length} | ${Date.now() - startedAt}ms`,
    )
    for (const error of summary.errors) {
      console.error(`Social publish tick error: ${error}`)
    }

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error('Social publish cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
