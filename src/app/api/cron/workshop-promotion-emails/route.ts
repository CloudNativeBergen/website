import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { deliverDuePromotionEmails } from '@/lib/workshop/promoted'

/**
 * The backstop for the promotion emails (#1357). A capacity change stores,
 * with each sign-up it promotes, that an email is owed, and sends it in the
 * same request; when that request dies between the write and the send (a
 * reply lost, a timeout), the debt is still stored, and this run pays it.
 * Hourly: an attendee promoted by a request that died hears within the hour.
 */

/** 100 owed emails (`BACKSTOP_LIMIT`), a few reads and a claim each: well within. */
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

    const outcome = await deliverDuePromotionEmails()
    if (outcome.found > 0) {
      console.log(
        `[workshop] promotion-email backstop: ${outcome.emailed} of ${outcome.found} owed emails sent, ${outcome.conferences} conference(s)`,
      )
    }
    return NextResponse.json({ success: true, ...outcome })
  } catch (error) {
    console.error('Workshop promotion emails cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
