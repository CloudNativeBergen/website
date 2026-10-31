import { NextRequest, NextResponse } from 'next/server'
import { deleteNotificationsOlderThan } from '@/lib/notification/sanity'
import { deleteExpiredMessagingData } from '@/lib/messaging/retention'
import { nudgeStaleConversations } from '@/lib/messaging/nudge'
import { autoCloseStaleConversations } from '@/lib/messaging/autoClose'
import { deleteExpiredEmailSignInTokens } from '@/lib/auth/email-link/store'
import { deleteExpiredOrganizerInvitations } from '@/lib/organizer-invite'
import { deleteExpiredEmailSignInRateLimits } from '@/lib/auth/email-link/rateLimit'
import { deleteExpiredProvisioningReceipts } from '@/lib/onboarding/provision'
import { deleteExpiredProvisioningRateLimits } from '@/lib/provisioning'
import { deleteExpiredMarketingRateLimits } from '@/lib/marketing/snapshots'
import {
  deleteExpiredMarketingSnapshots,
  deleteExpiredReminderLogs,
} from '@/lib/retention/purge'
import { foldExpiredReviews } from '@/lib/review/retention'
import {
  NOTIFICATION_RETENTION_DAYS,
  SHORT_NOTIFICATION_RETENTION_DAYS,
  SHORT_RETENTION_NOTIFICATION_TYPES,
} from '@/lib/retention/cutoffs'
import { unstable_noStore as noStore } from 'next/cache'

export const maxDuration = 300

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

    // Each pass runs even when an earlier one throws: a Sanity hiccup in the
    // notification purge must not skip the GDPR-bound invitation cleanup.
    const failures: Array<{ pass: string; error: string }> = []
    const pass = async <T>(name: string, run: () => Promise<T>, empty: T) => {
      try {
        return await run()
      } catch (error) {
        console.error(`Cleanup pass ${name} failed:`, error)
        failures.push({
          pass: name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        return empty
      }
    }
    const none = { deleted: 0 }
    // `?dryRun=1` only counts what the 30-day notification, reminder-log,
    // snapshot and review passes would delete, and runs no other pass.
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
    if (dryRun) {
      const [shortNotifications, reminderLogs, snapshots, reviews] =
        await Promise.all([
          deleteNotificationsOlderThan(
            SHORT_NOTIFICATION_RETENTION_DAYS,
            SHORT_RETENTION_NOTIFICATION_TYPES,
            true,
          ),
          deleteExpiredReminderLogs(true),
          deleteExpiredMarketingSnapshots(true),
          foldExpiredReviews(true),
        ])
      console.log(
        `[dry-run] would delete shortNotifications=${shortNotifications.deleted}` +
          ` reminderLogs=${reminderLogs.deleted}` +
          ` marketingSnapshots=${snapshots.deleted}` +
          ` reviews=${reviews.deleted} (folded into ${reviews.talks} talks)`,
      )
      return NextResponse.json({
        dryRun: true,
        shortNotifications: shortNotifications.deleted,
        reminderLogs: reminderLogs.deleted,
        marketingSnapshots: snapshots.deleted,
        reviews,
      })
    }

    const { deleted } = await pass(
      'notifications',
      () => deleteNotificationsOlderThan(NOTIFICATION_RETENTION_DAYS),
      none,
    )

    console.log(
      `Deleted ${deleted} notifications older than ${NOTIFICATION_RETENTION_DAYS} days`,
    )

    // Low-value types (system notes, marketing nags, stale-thread nudges,
    // workshop capacity) go after 30 days instead of 90.
    const shortNotifications = await pass(
      'shortNotifications',
      () =>
        deleteNotificationsOlderThan(
          SHORT_NOTIFICATION_RETENTION_DAYS,
          SHORT_RETENTION_NOTIFICATION_TYPES,
        ),
      none,
    )
    // Reminder dedup markers for editions that ended 60+ days ago.
    const reminderLogs = await pass(
      'reminderLogs',
      deleteExpiredReminderLogs,
      none,
    )
    // Marketing snapshots and reviews, 24 months after the conference ends.
    // Reviews are first folded into `talk.reviewSummary` in the same
    // transaction that deletes them.
    const marketingSnapshots = await pass(
      'marketingSnapshots',
      deleteExpiredMarketingSnapshots,
      none,
    )
    const reviews = await pass('reviews', foldExpiredReviews, {
      talks: 0,
      deleted: 0,
    })
    console.log(
      `Deleted marketingSnapshots=${marketingSnapshots.deleted}` +
        ` reviews=${reviews.deleted} (folded into ${reviews.talks} talks)`,
    )
    console.log(
      `Deleted shortNotifications=${shortNotifications.deleted}` +
        ` (older than ${SHORT_NOTIFICATION_RETENTION_DAYS} days)` +
        ` reminderLogs=${reminderLogs.deleted}`,
    )

    // Messaging retention runs on the SAME daily trigger, AFTER the notification
    // cleanup: a conference's messages, conversations, per-conversation
    // preferences and message notifications are purged 24 months after it ends.
    // Ordered after the notification pass so the 90-day hub cleanup has already
    // removed aged-out message notifications; whatever remains for a fully
    // expired conference is swept here.
    const messaging = await pass('messaging', deleteExpiredMessagingData, {
      conferences: 0,
      messages: 0,
      conversations: 0,
      preferences: 0,
      notifications: 0,
    })

    console.log(
      `Messaging retention: purged ${messaging.conferences} expired conference(s) —` +
        ` messages=${messaging.messages}` +
        ` conversations=${messaging.conversations}` +
        ` preferences=${messaging.preferences}` +
        ` notifications=${messaging.notifications}`,
    )

    // Stale-thread nudge runs on the same daily trigger: open threads whose
    // last message is from a non-organizer and which have gone quiet for 3+ days
    // get one hub notification (to the assignee, else the routed team/all
    // organizers), escalating to the team after a further 3 days. This never
    // throws — a failure only zeroes its summary and is logged.
    const staleNudge = await pass('staleNudge', nudgeStaleConversations, {
      scanned: 0,
      nudged: 0,
      escalated: 0,
      notifications: 0,
      failed: 0,
    })

    console.log(
      `Stale nudge: scanned=${staleNudge.scanned}` +
        ` nudged=${staleNudge.nudged}` +
        ` escalated=${staleNudge.escalated}` +
        ` notifications=${staleNudge.notifications}` +
        ` failed=${staleNudge.failed}`,
    )

    // Auto-close is the nudge's mirror image and runs immediately AFTER it, on
    // the same daily trigger and with no cron entry of its own: where the nudge
    // handles "they are waiting on US", this closes threads where WE are waiting
    // on THEM — last word ours, no reply for 7 days. Ordered after the nudge so
    // the two selections are read from the same organizer set within one run;
    // they are mutually exclusive (opposite last-author tests), so neither can
    // act on a thread the other just touched. Also never throws.
    const autoClose = await pass('autoClose', autoCloseStaleConversations, {
      scanned: 0,
      closed: 0,
      failed: 0,
    })

    console.log(
      `Messaging auto-close: scanned=${autoClose.scanned}` +
        ` closed=${autoClose.closed}` +
        ` failed=${autoClose.failed}`,
    )

    // Email sign-in artifacts. Both types are short-lived by construction —
    // tokens are consumed (and deleted) on use and rate-limit buckets stop
    // being read once their longest window elapses — so this pass exists to
    // remove the leftovers: links that were never clicked, buckets for
    // one-off requesters, and the rare document whose best-effort delete after
    // a consume did not land. Purely additive: neither purge can affect a live
    // session, and a failure only logs.
    const [signInTokens, signInRateLimits] = await Promise.all([
      pass('signInTokens', deleteExpiredEmailSignInTokens, none),
      pass('signInRateLimits', deleteExpiredEmailSignInRateLimits, none),
    ])

    console.log(
      `Email sign-in cleanup: tokens=${signInTokens.deleted}` +
        ` rateLimits=${signInRateLimits.deleted}`,
    )

    // Organizer invitations (platform#49). These hold the email address of a
    // person who may never have used the site, so retention is an obligation to
    // THEM rather than housekeeping: `/privacy` states that an ignored
    // invitation leaves nothing behind, and this is what makes that true.
    // Accepted invitations are kept as the provenance of a live admin grant.
    const organizerInvites = await pass(
      'organizerInvitations',
      deleteExpiredOrganizerInvitations,
      none,
    )
    console.log(
      `Organizer invitation cleanup: deleted=${organizerInvites.deleted}`,
    )

    // Machine provisioning artifacts (#753), on the same daily trigger and for
    // the same reason. The receipts are what make a retried tenant-creation
    // request idempotent, so their retention IS the replay window: purging one
    // means the same `Idempotency-Key` would provision again — 30 days out,
    // which is far past any real retry.
    const [provisioningReceipts, provisioningRateLimits, marketingRateLimits] =
      await Promise.all([
        pass('provisioningReceipts', deleteExpiredProvisioningReceipts, none),
        pass(
          'provisioningRateLimits',
          deleteExpiredProvisioningRateLimits,
          none,
        ),
        // The snapshot-refresh budget (#1018) rides the same primitive and the
        // same daily sweep; an elapsed bucket is nothing but a row.
        pass('marketingRateLimits', deleteExpiredMarketingRateLimits, none),
      ])

    console.log(
      `Provisioning cleanup: receipts=${provisioningReceipts.deleted}` +
        ` rateLimits=${provisioningRateLimits.deleted}` +
        ` | marketing rateLimits=${marketingRateLimits.deleted}`,
    )

    if (failures.length > 0) {
      return NextResponse.json(
        {
          error: 'Internal server error',
          details: failures.map((f) => f.error).join('; '),
          failures,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      deleted,
      shortNotifications: shortNotifications.deleted,
      reminderLogs: reminderLogs.deleted,
      marketingSnapshots: marketingSnapshots.deleted,
      reviews,
      messaging,
      staleNudge,
      autoClose,
      emailSignIn: {
        tokens: signInTokens.deleted,
        rateLimits: signInRateLimits.deleted,
      },
      provisioning: {
        receipts: provisioningReceipts.deleted,
        rateLimits: provisioningRateLimits.deleted,
      },
      marketing: { rateLimits: marketingRateLimits.deleted },
      // Reported like every other pass, not just logged: this one carries a
      // GDPR commitment made on `/privacy`, so whatever watches the cron
      // response has to be able to see it running.
      organizerInvitations: organizerInvites.deleted,
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
