import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { runPhotoWallRetention } from '@/lib/photo-wall/retention'
import { sweepPhotoWall } from '@/lib/photo-wall/sweep'

/**
 * The Photo Wall's retention cron (spec §11): daily, every wall whose
 * deletion date (`endDate` + 30 days) is tomorrow or earlier is closed to
 * writes, every wall whose deletion date is today or earlier and that has
 * been closed for over 15 minutes has its posts and photos deleted with
 * their history, and the orphan sweep (§11.2) runs after. 03:10 UTC: the
 * same Oslo day as the other daily purges (`cleanup-orphaned-blobs` 03:00,
 * `cleanup-notifications` 04:00), on a slot of its own.
 *
 * Its own route, as the feedback fold is: a purge that keeps failing must
 * not stop the purges `cleanup-notifications` carries, and a wall with
 * hundreds of photos needs a time budget of its own. A run cut short by the
 * deadline leaves `purgedAt` unset and the next run repeats the purge.
 * Every request of the purge and the sweep is aborted at the deadline, so
 * the reserve only has to cover the report; the one exception is a stuck
 * delete's finish (`deleteWallPost`), whose requests carry no signal.
 */
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

    const now = new Date(startedAt)
    const deadline = new Date(startedAt + maxDuration * 1000 - RESERVE_MS)
    const retention = await runPhotoWallRetention({ now, deadline })
    console.log('[photo-wall] retention run', retention)
    const sweep = await sweepPhotoWall({ now, deadline })
    console.log('[photo-wall] sweep run', sweep)
    return NextResponse.json({ success: true, retention, sweep })
  } catch (error) {
    console.error('Photo Wall retention cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
