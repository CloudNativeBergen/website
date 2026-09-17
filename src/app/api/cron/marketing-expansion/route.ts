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
    for (const plan of plans) {
      const { conferenceId } = plan
      try {
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
    // Work-based eligibility is independent of the expansion window and cap:
    // late Studio edits must still move unapproved post-event Tasks.
    const redates = []
    for (const { conferenceId } of await resolveRedateConferences()) {
      const result = await redatePlanForConference(conferenceId)
      if (result.warnings.length) {
        console.warn(
          `Marketing re-date for ${conferenceId}: ${result.warnings.join(' ')}`,
        )
      }
      redates.push({ conferenceId, ...result })
    }
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
