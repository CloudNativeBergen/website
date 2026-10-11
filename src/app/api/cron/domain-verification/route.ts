import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { runDomainVerificationSweep } from '@/lib/domain-verification'

/**
 * Daily CONTINUOUS RE-VERIFICATION of every claimed domain (#683).
 *
 * First-time verification cannot catch dangling DNS: a conference ends, the
 * domain lapses, someone else registers it — and the claim (and with it the
 * OAuth redirect grant) is still ours to honour. The victim of the resulting
 * token theft sees a perfectly normal successful login, so nothing but a
 * scheduled re-check will ever notice.
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

    const summary = await runDomainVerificationSweep()
    console.log(
      `Domain verification sweep: checked=${summary.checked}` +
        ` verified=${summary.verified}` +
        ` platformOwned=${summary.platformOwned}` +
        ` hardFailures=${summary.hardFailures}` +
        ` softFailures=${summary.softFailures}` +
        ` unverifiable=${summary.unverifiable}` +
        ` delisted=${summary.delisted.length}` +
        ` errored=${summary.errored.length}`,
    )

    return NextResponse.json({ success: true, ...summary })
  } catch (error) {
    console.error('Error in domain verification cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
