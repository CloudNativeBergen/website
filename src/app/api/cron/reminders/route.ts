import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import {
  resolveActiveReminderConferences,
  runSpeakerReminders,
  runDayOfAgenda,
} from '@/lib/reminders'

/**
 * Daily scheduled-reminders cron.
 *
 * Runs the fixed speaker-prep reminder registry and then the day-of agenda for
 * EVERY active conference (every not-yet-ended edition — see
 * `resolveActiveReminderConferences`). The deployment serves multiple
 * conferences, so the cron iterates all qualifying editions rather than a single
 * one; each is processed under its own try/catch so one tenant's failure cannot
 * abort the rest. Dedup markers are scoped per conference, so iterating never
 * double-sends. Auth mirrors the other crons: a `Bearer ${CRON_SECRET}` header.
 *
 * Conferences are processed SEQUENTIALLY: each edition does per-speaker work
 * (reads + notification writes), and running them in series keeps the Sanity/hub
 * write load bounded and predictable. With the current handful of active
 * editions this stays well inside the Vercel function timeout; if the active set
 * grows large enough to approach it, move to a per-conference fan-out/queue
 * (out of scope for this change).
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

    const conferences = await resolveActiveReminderConferences()
    if (conferences.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active conference — nothing to remind',
        conferences: [],
      })
    }

    // Process each active edition SEQUENTIALLY and ISOLATED: a failure loading or
    // running one conference is caught here so the remaining editions still run.
    // (runSpeakerReminders/runDayOfAgenda are themselves never-throw, so this
    // per-conference guard only trips on an unexpected throw — but it keeps the
    // tenant boundary hard.)
    const results: Array<{
      conferenceId: string
      ok: boolean
      durationMs: number
      reminders?: Awaited<ReturnType<typeof runSpeakerReminders>>
      dayOf?: Awaited<ReturnType<typeof runDayOfAgenda>>
      error?: string
    }> = []

    for (const conference of conferences) {
      const startedAt = Date.now()
      try {
        const reminders = await runSpeakerReminders(conference)
        const dayOf = await runDayOfAgenda(conference)
        const durationMs = Date.now() - startedAt

        console.log(
          `Reminders cron for ${conference._id}: sent=${reminders.sent} skipped=${reminders.skipped} failed=${reminders.failed}` +
            ` | day-of: scheduleDay=${dayOf.isScheduleDay} sent=${dayOf.sent} skipped=${dayOf.skipped} failed=${dayOf.failed}` +
            ` | ${durationMs}ms`,
        )

        results.push({
          conferenceId: conference._id,
          ok: true,
          durationMs,
          reminders,
          dayOf,
        })
      } catch (error) {
        const durationMs = Date.now() - startedAt
        console.error(
          `Reminders cron failed for conference ${conference._id} after ${durationMs}ms:`,
          error,
        )
        results.push({
          conferenceId: conference._id,
          ok: false,
          durationMs,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const summary = {
      conferences: results.length,
      failed: results.filter((r) => !r.ok).length,
      sent: results.reduce(
        (acc, r) => acc + (r.reminders?.sent ?? 0) + (r.dayOf?.sent ?? 0),
        0,
      ),
    }
    console.log(
      `Reminders cron summary: conferences=${summary.conferences} sent=${summary.sent} failedConferences=${summary.failed}`,
    )

    return NextResponse.json({
      success: true,
      summary,
      results,
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
