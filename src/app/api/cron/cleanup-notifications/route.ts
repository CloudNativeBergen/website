import { NextRequest, NextResponse } from 'next/server'
import { deleteNotificationsOlderThan } from '@/lib/notification/sanity'
import { unstable_noStore as noStore } from 'next/cache'

/**
 * Notification retention period in days before cleanup.
 * Notifications older than this are permanently deleted by the daily cron,
 * matching the 90-day retention stated in the privacy policy.
 */
const NOTIFICATION_RETENTION_DAYS = 90

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

    const { deleted } = await deleteNotificationsOlderThan(
      NOTIFICATION_RETENTION_DAYS,
    )

    console.log(
      `Deleted ${deleted} notifications older than ${NOTIFICATION_RETENTION_DAYS} days`,
    )

    return NextResponse.json({
      success: true,
      deleted,
    })
  } catch (error) {
    console.error('Error in cleanup notifications cron job:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
