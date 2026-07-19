import { NextRequest, NextResponse } from 'next/server'
import { deleteNotificationsOlderThan } from '@/lib/notification/sanity'
import { deleteExpiredMessagingData } from '@/lib/messaging/retention'
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

    // Messaging retention runs on the SAME daily trigger, AFTER the notification
    // cleanup: a conference's messages, conversations, per-conversation
    // preferences and message notifications are purged 24 months after it ends.
    // Ordered after the notification pass so the 90-day hub cleanup has already
    // removed aged-out message notifications; whatever remains for a fully
    // expired conference is swept here.
    const messaging = await deleteExpiredMessagingData()

    console.log(
      `Messaging retention: purged ${messaging.conferences} expired conference(s) —` +
        ` messages=${messaging.messages}` +
        ` conversations=${messaging.conversations}` +
        ` preferences=${messaging.preferences}` +
        ` notifications=${messaging.notifications}`,
    )

    return NextResponse.json({
      success: true,
      deleted,
      messaging,
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
