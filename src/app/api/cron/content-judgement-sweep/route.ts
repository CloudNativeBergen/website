import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { sweepOrphanJudgements } from '@/lib/content-judgement'

/** Daily orphan erasure (content judgement spec §12), 04:50 UTC. */
export const maxDuration = 300
const RESERVE_MS = 10_000

export async function GET(request: NextRequest) {
  noStore()
  const startedAt = Date.now()
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

    const report = await sweepOrphanJudgements({
      now: new Date(startedAt),
      deadline: new Date(startedAt + maxDuration * 1000 - RESERVE_MS),
    })
    console.log('[content-judgement] sweep run', report)
    return NextResponse.json({ success: true, ...report })
  } catch (error) {
    console.error('Content judgement sweep cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
