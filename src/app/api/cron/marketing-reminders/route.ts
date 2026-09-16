import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import {
  resolveReminderConferences,
  runMarketingReminders,
} from '@/lib/marketing/reminders'
import { getCurrentDateTime } from '@/lib/time'

/** Daily at 06:20 UTC; bounded discovery and sequential tenant-isolated work. */
export const maxDuration = 300
export async function GET(request: NextRequest) {
  noStore()
  const secret = process.env.CRON_SECRET
  if (!secret)
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    )
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const now = getCurrentDateTime()
    const conferences = await resolveReminderConferences(now)
    const results: {
      conferenceId: string
      ok: boolean
      due?: number
      overdue?: number
      error?: string
    }[] = []
    for (const { conferenceId, planId } of conferences) {
      try {
        const { due, overdue, rotationError } = await runMarketingReminders(
          conferenceId,
          now,
          planId,
        )
        results.push({
          conferenceId,
          ok: !rotationError,
          due,
          overdue,
          ...(rotationError ? { error: rotationError } : {}),
        })
      } catch (error) {
        console.error(`Marketing reminders failed for ${conferenceId}:`, error)
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
      due: results.reduce((n, r) => n + (r.due ?? 0), 0),
      overdue: results.reduce((n, r) => n + (r.overdue ?? 0), 0),
    }
    return NextResponse.json({ success: true, summary, results })
  } catch (error) {
    console.error('Error in marketing reminders cron:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
