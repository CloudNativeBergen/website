import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import {
  COSPEAKER_INVITATION_RETENTION_DAYS,
  deleteResolvedCoSpeakerInvitations,
} from '@/lib/cospeaker/sanity'

/**
 * Daily co-speaker invitation RETENTION sweep (#1045 item 2).
 *
 * Deletes invitations whose effective status is `declined`, `canceled` or
 * `expired` once they have been resolved for
 * {@link COSPEAKER_INVITATION_RETENTION_DAYS} days. Accepted invitations are
 * kept. The reasoning for both, and every unattended-safety rule this job
 * relies on, lives on `deleteResolvedCoSpeakerInvitations`.
 *
 * This is a SEPARATE route from `/api/cron/cospeaker-invitations`, which nudges
 * and alerts on LIVE invitations and is not touched by this. Two jobs, two
 * concerns, two things an operator can turn off independently.
 *
 * DRY RUN: `?dryRun=1` reports exactly what a real run would delete and writes
 * nothing. The Vercel cron never passes it; an operator can, with the same
 * `CRON_SECRET`, to inspect the first production run before anything is
 * destroyed.
 */
export async function GET(request: NextRequest) {
  noStore()
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Invalid or missing authorization token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'

    const result = await deleteResolvedCoSpeakerInvitations({ dryRun })

    // Ids only. The whole point of the job is that the invited email, name and
    // decline reason stop existing — logging them here would put them straight
    // back into a log store with its own retention.
    console.log(
      `Co-speaker invitation retention${result.dryRun ? ' (DRY RUN)' : ''}:` +
        ` scanned=${result.scanned}` +
        ` deleted=${result.deleted}` +
        ` skipped=${result.skipped}` +
        ` failed=${result.failed}` +
        ` capped=${result.capped}` +
        ` ids=${result.ids.join(',') || 'none'}`,
    )

    return NextResponse.json({
      success: true,
      retentionDays: COSPEAKER_INVITATION_RETENTION_DAYS,
      ...result,
    })
  } catch (error) {
    console.error('Co-speaker invitation retention cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
