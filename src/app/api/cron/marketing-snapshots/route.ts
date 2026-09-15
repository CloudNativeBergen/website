import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import {
  conferenceOrgId,
  resolveSnapshotConferences,
  runConferenceSnapshots,
  snapshotDeps,
  type SnapshotRunResult,
} from '@/lib/marketing/snapshots'
import { getCurrentDateTime } from '@/lib/time'

/**
 * Daily Marketing Snapshot cron (spec §6.4): for every conference with a plan,
 * one day-grain attribution reading, one batched unauthenticated Bluesky
 * engagement sweep, and one `marketingSnapshot` per Campaign for yesterday.
 * Views read Snapshots only — this is the single place the vendors are asked.
 *
 * Shaped like `/api/cron/marketing-expansion`: `Bearer ${CRON_SECRET}`, at most
 * `MAX_CONFERENCES_PER_RUN` editions, SEQUENTIAL, one try/catch per conference
 * so one tenant's failure never stops the rest. A source that cannot be read
 * is recorded as unavailable on the Snapshot rather than failing the run.
 *
 * TZ: the engine works in UTC throughout — the reading covers the last
 * completed UTC day and no window reaches into the current one — so the hour
 * the run lands on never decides which day it records. Scheduled at 04:20 UTC
 * (see `vercel.json`), off the minute the notification cleanup occupies.
 */
/** Bounds one run: 20 editions of sequential vendor reads and commits. */
export const maxDuration = 300

/**
 * Stop starting new editions with this much of the budget left, so the one in
 * flight can FINISH: an edition's worst case is one PostHog query (30 s cap),
 * a Bluesky sweep of several 15 s batches, a ticket read and the Sanity
 * commits. Reserving less than that lets the function die mid-edition — and a
 * plan is stamped BEFORE its reading (deliberately, for queue fairness), so it
 * would go to the back of the queue having written nothing.
 *
 * The editions not reached are simply the oldest next time —
 * `lastSnapshotAt` ordering makes the cap backpressure, not starvation.
 */
const RESERVE_MS = 120_000

export async function GET(request: NextRequest) {
  noStore()
  const startedAt = Date.now()
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date(getCurrentDateTime())
    const conferences = await resolveSnapshotConferences()
    const results: {
      conferenceId: string
      ok: boolean
      run?: SnapshotRunResult
      error?: string
    }[] = []
    let deadlineReached = 0

    for (const { conferenceId } of conferences) {
      if (Date.now() - startedAt > maxDuration * 1000 - RESERVE_MS) {
        deadlineReached = conferences.length - results.length
        console.warn(
          `Marketing snapshots: out of budget with ${deadlineReached} edition(s) unserved; they lead the next run`,
        )
        break
      }
      try {
        const orgId = await conferenceOrgId(conferenceId)
        const run = await runConferenceSnapshots(
          conferenceId,
          snapshotDeps(orgId),
          now,
        )
        console.log(
          `Marketing snapshots for ${conferenceId}: date=${run.date} written=${run.written}` +
            (run.skipped ? ` skipped=${run.skipped}` : '') +
            ` posthog=${run.source.posthog} bluesky=${run.source.bluesky}` +
            (run.notes.length ? ` | ${run.notes.join(' | ')}` : ''),
        )
        results.push({ conferenceId, ok: true, run })
      } catch (error) {
        console.error(`Marketing snapshots failed for ${conferenceId}:`, error)
        results.push({
          conferenceId,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const summary = {
      conferences: results.length,
      failed: results.filter((r) => !r.ok).length,
      written: results.reduce((n, r) => n + (r.run?.written ?? 0), 0),
      unserved: deadlineReached,
    }
    console.log(
      `Marketing snapshots summary: conferences=${summary.conferences} written=${summary.written} failedConferences=${summary.failed} unserved=${summary.unserved}`,
    )
    return NextResponse.json({ success: true, summary, results })
  } catch (error) {
    console.error('Error in marketing snapshots cron:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
