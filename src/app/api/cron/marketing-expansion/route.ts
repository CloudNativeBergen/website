import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { describeCeilingWarning } from '@/lib/marketing/ceilings'
import {
  resolveExpansionConferences,
  runPlanExpansion,
} from '@/lib/marketing/expansion-run'
import { getCurrentDateTime, osloTodayDateString } from '@/lib/time'

/**
 * Daily Marketing Plan expansion cron (spec §5.4): recurring recipes expand
 * over the subjects that exist by now (confirmed speakers, scheduled talks,
 * recorded talks), and recently signed contracts get their sponsor cards.
 * Shaped like `/api/cron/reminders`: `Bearer ${CRON_SECRET}`, at most
 * `MAX_CONFERENCES_PER_RUN` editions, sequential, one try/catch per
 * conference so one tenant's failure never stops the rest. Ceiling warnings
 * are logged; they never block (§5.4).
 */
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
    const conferenceIds = await resolveExpansionConferences(
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
    for (const conferenceId of conferenceIds) {
      try {
        const result = await runPlanExpansion(conferenceId, now)
        const warnings = result.warnings.map(describeCeilingWarning)
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
    const summary = {
      conferences: results.length,
      failed: results.filter((r) => !r.ok).length,
      created: results.reduce((n, r) => n + (r.created ?? 0), 0),
    }
    console.log(
      `Marketing expansion summary: conferences=${summary.conferences} created=${summary.created} failedConferences=${summary.failed}`,
    )
    return NextResponse.json({ success: true, summary, results })
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
