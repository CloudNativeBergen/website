import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import {
  resolveExpansionConferences,
  runPlanExpansion,
} from '@/lib/marketing/expansion-run'
import { getCurrentDateTime, osloTodayDateString } from '@/lib/time'
import {
  redatePlanForConference,
  resolveRedateConferences,
  type RedateOutcome,
} from '@/lib/marketing/redate-run'

/**
 * Daily Marketing Plan expansion cron (spec §5.4): recurring recipes expand
 * over the subjects that exist by now (confirmed speakers, scheduled talks,
 * recorded talks), and recently signed contracts get their sponsor cards.
 * Shaped like `/api/cron/reminders`: `Bearer ${CRON_SECRET}`, at most
 * `MAX_CONFERENCES_PER_RUN` editions, sequential, one try/catch per
 * conference so one tenant's failure never stops the rest. Ceiling warnings
 * are logged; they never block (§5.4).
 *
 * TZ ASSUMPTION: scheduled at 05:30 UTC (see `vercel.json`), which is
 * 06:30–07:30 in Europe/Oslo — the same calendar date. Eligibility and every
 * slot are computed in Oslo days from the run's instant, and a cadence slot is
 * only taken 24 h ahead, so the hour the run lands on never decides whether a
 * Task is created.
 */
/** Bounds one run: 50 editions of sequential reads and commits (§5.4). */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  noStore()
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
    const now = getCurrentDateTime()
    const plans = await resolveExpansionConferences(
      osloTodayDateString(new Date(now)),
    )
    const results: {
      conferenceId: string
      ok: boolean
      created?: number
      warnings?: string[]
      skipped?: string
      error?: string
    }[] = []
    // RE-DATE BEFORE EXPANDING, per conference.
    //
    // Expansion allocates each new post a slot from `planOccupancy`, which
    // counts existing Tasks at their STORED dates. Sweeping re-dates only
    // afterwards meant a Milestone changed in the Studio produced occupancy
    // computed from positions the Tasks were about to leave: a new speaker post
    // took a day that looked free, the existing post then re-dated onto that
    // same day, and the two collided on a day the ceiling should have kept
    // clear — with a free day right beside it. Both keep colliding on every
    // later run, because the anchors are what collide.
    //
    // A re-date that could not complete therefore SKIPS that conference's
    // expansion rather than letting it allocate against stale positions. It has
    // to be read off `ok`, not caught: `redatePlanForConference` handles its own
    // failures and returns no moved ids either way, so a throw and a plan that
    // was already correct look exactly alike from outside.
    const redated = new Set<string>()
    const redates: (RedateOutcome & { conferenceId: string })[] = []
    const redate = async (conferenceId: string) => {
      if (redated.has(conferenceId)) return true
      redated.add(conferenceId)
      const result = await redatePlanForConference(conferenceId)
      if (result.warnings.length) {
        console.warn(
          `Marketing re-date for ${conferenceId}: ${result.warnings.join(' ')}`,
        )
      }
      redates.push({ conferenceId, ...result })
      return result.ok
    }
    for (const plan of plans) {
      const { conferenceId } = plan
      try {
        if (!(await redate(conferenceId)))
          throw new Error(
            'Re-dating did not complete, so expansion would allocate slots against stale dates',
          )
        const result = await runPlanExpansion(plan, now)
        const warnings = result.warnings
        console.log(
          `Marketing expansion for ${conferenceId}: created=${result.created}` +
            (result.skipped ? ` skipped=${result.skipped}` : '') +
            (warnings.length ? ` ceilings: ${warnings.join(' ')}` : ''),
        )
        results.push({
          conferenceId,
          ok: true,
          created: result.created,
          warnings,
          ...(result.skipped ? { skipped: result.skipped } : {}),
        })
      } catch (error) {
        console.error(`Marketing expansion failed for ${conferenceId}:`, error)
        results.push({
          conferenceId,
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }
    // Then the independent sweep, for the editions that did NOT expand.
    // Work-based eligibility is independent of the expansion window and cap:
    // late Studio edits must still move unapproved post-event Tasks. Resolved
    // after expansion, so it sees the work the run above created, and `redated`
    // keeps an edition already re-dated above from being processed twice.
    for (const { conferenceId } of await resolveRedateConferences())
      await redate(conferenceId)
    const summary = {
      conferences: results.length,
      failed: results.filter((r) => !r.ok).length,
      created: results.reduce((n, r) => n + (r.created ?? 0), 0),
    }
    console.log(
      `Marketing expansion summary: conferences=${summary.conferences} created=${summary.created} failedConferences=${summary.failed}`,
    )
    return NextResponse.json({ success: true, summary, results, redates })
  } catch (error) {
    console.error('Error in marketing expansion cron:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
