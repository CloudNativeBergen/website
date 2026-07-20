import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import {
  resolveActiveReminderConference,
  runSpeakerReminders,
  runDayOfAgenda,
} from '@/lib/reminders'

/**
 * Daily scheduled-reminders cron.
 *
 * Runs the fixed speaker-prep reminder registry and then the day-of agenda for
 * the single ACTIVE conference (earliest not-yet-ended edition — see
 * `resolveActiveReminderConference`). Auth mirrors the other crons: a
 * `Bearer ${CRON_SECRET}` header.
 *
 * TZ ASSUMPTION: scheduled at 06:00 UTC (see `vercel.json`). Our events run in
 * Central European time (CET/CEST), where 06:00 UTC is 07:00–08:00 local — the
 * same calendar date. Reminders are DAY-OF granularity, so this early-morning
 * delivery lands before the conference day for the day-of agenda and tolerates
 * the fixed offset.
 */
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

    const conference = await resolveActiveReminderConference()
    if (!conference) {
      return NextResponse.json({
        success: true,
        message: 'No active conference — nothing to remind',
      })
    }

    // Never-throw jobs: each returns a summary even on internal failure.
    const reminders = await runSpeakerReminders(conference)
    const dayOf = await runDayOfAgenda(conference)

    console.log(
      `Reminders cron for ${conference._id}: sent=${reminders.sent} skipped=${reminders.skipped} failed=${reminders.failed}` +
        ` | day-of: scheduleDay=${dayOf.isScheduleDay} sent=${dayOf.sent} skipped=${dayOf.skipped} failed=${dayOf.failed}`,
    )

    return NextResponse.json({
      success: true,
      conference: conference._id,
      reminders,
      dayOf,
    })
  } catch (error) {
    console.error('Error in reminders cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
