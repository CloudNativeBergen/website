import { getConfiguredWebPush, isPushConfigured } from './vapid'
import { getSpeakerPushState, prunePushSubscription } from './sanity'
import type {
  PushCategory,
  PushMessagePayload,
  PushSubscriptionRecord,
} from './types'
import type {
  NotificationInput,
  NotificationType,
} from '@/lib/notification/types'

/** Outcome of a single web-push delivery attempt. */
export interface PushSendResult {
  /** True when the push service accepted the message. */
  ok: boolean
  /** HTTP status code returned by the push service, when known. */
  statusCode?: number
  /**
   * True when the subscription is permanently gone (404 / 410) and MUST be
   * pruned from the speaker document.
   */
  gone: boolean
}

/** A push service returns 404/410 when a subscription is permanently dead. */
function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

/**
 * Deliver a single push message to one subscription.
 *
 * Never throws: transport/library errors are captured and reported through the
 * returned {@link PushSendResult}, so a fire-and-forget caller can send to many
 * subscriptions with `Promise.allSettled` and prune the dead ones by looking at
 * `result.gone`. When push is not configured (no VAPID keys) this is a no-op
 * that reports `ok: false, gone: false`.
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushMessagePayload,
): Promise<PushSendResult> {
  const client = getConfiguredWebPush()
  if (!client) {
    return { ok: false, gone: false }
  }

  try {
    const response = await client.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(payload),
    )
    return { ok: true, statusCode: response.statusCode, gone: false }
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    return {
      ok: false,
      statusCode,
      gone: isGoneStatus(statusCode),
    }
  }
}

/**
 * The notification hub is the SINGLE source of truth for WHAT and WHEN to
 * notify; web push is only a delivery CHANNEL. This maps each hub
 * `notificationType` to the speaker push-preference category that gates it.
 *
 *   - `proposal_status_changed`  → `proposalDecisions`
 *       (speaker accept/reject/waitlist AND organizer-facing confirm/withdraw
 *        notifications both carry this type)
 *   - `cospeaker_response`       → `coSpeakerInvites`
 *   - everything else            → `otherUpdates`
 *       (`proposal_submitted`, `travel_support_update`, `sponsor_activity`,
 *        `gallery_tagged`, `schedule_update`, `proposal_comment`, `system`)
 *
 * Note: `talkConfirmed` has no hub type mapped to it today — no hub notification
 * is emitted for a talk confirmation — so the category is preserved for future
 * use but never currently fires.
 */
export function pushCategoryForNotificationType(
  type: NotificationType,
): PushCategory {
  switch (type) {
    case 'proposal_status_changed':
      return 'proposalDecisions'
    case 'cospeaker_response':
      return 'coSpeakerInvites'
    default:
      return 'otherUpdates'
  }
}

/**
 * Bridge from the notification hub to web push (#444). Called by
 * `createNotifications` AFTER its transaction commits: for every persisted
 * notification, fan out a web push to the recipient's own subscriptions, gated
 * by their per-category preference.
 *
 * SECURITY / ISOLATION invariants (do not weaken):
 *   - recipients and content come ONLY from the hub items the caller already
 *     computed — this never re-derives who to notify;
 *   - every subscription is read fresh off the recipient's OWN speaker document
 *     (`getSpeakerPushState(recipientId)`), so there is no cross-user delivery;
 *   - NEVER throws: a push failure must not fail the (already committed)
 *     notification write nor the business mutation that triggered it. All errors
 *     are captured and logged;
 *   - a no-op when push is unconfigured (no VAPID keys) — it never touches the
 *     network.
 */
export async function sendPushForNotifications(
  items: NotificationInput[],
): Promise<void> {
  if (items.length === 0) return
  // No VAPID keys → push is unavailable; skip entirely (never read Sanity or
  // hit the network). This is the graceful-degradation path.
  if (!isPushConfigured()) return

  // Group by recipient so each speaker's push state (subscriptions + prefs) is
  // read exactly once even when a fan-out produced several items for them.
  const byRecipient = new Map<string, NotificationInput[]>()
  for (const item of items) {
    if (!item.recipientId) continue
    const existing = byRecipient.get(item.recipientId)
    if (existing) existing.push(item)
    else byRecipient.set(item.recipientId, [item])
  }

  await Promise.allSettled(
    Array.from(byRecipient.entries()).map(([recipientId, recipientItems]) =>
      deliverPushToRecipient(recipientId, recipientItems),
    ),
  )
}

/** Deliver every notification a single recipient earned, gated per category. */
async function deliverPushToRecipient(
  recipientId: string,
  items: NotificationInput[],
): Promise<void> {
  let state
  try {
    state = await getSpeakerPushState(recipientId)
  } catch (error) {
    console.error(
      `Failed to read push state for speaker ${recipientId}:`,
      error,
    )
    return
  }

  if (state.subscriptions.length === 0) return

  for (const item of items) {
    const category = pushCategoryForNotificationType(item.notificationType)
    if (!state.preferences[category]) continue

    const payload: PushMessagePayload = {
      title: item.title,
      body: item.message ?? '',
      // The SW re-sanitises this to a same-origin path; hub links are already
      // app-relative (e.g. /cfp/proposal/<id>). Fall back to the app root.
      url: item.link ?? '/',
    }

    const results = await Promise.allSettled(
      state.subscriptions.map(async (subscription) => {
        const result = await sendPush(subscription, payload)
        if (result.gone) {
          await prunePushSubscription(recipientId, subscription.endpoint).catch(
            (error) => {
              console.error(
                `Failed to prune dead push subscription for speaker ${recipientId}:`,
                error,
              )
            },
          )
        }
        return result
      }),
    )

    const delivered = results.filter(
      (r) => r.status === 'fulfilled' && r.value.ok,
    ).length
    if (delivered > 0) {
      console.log(
        `Push (${category}) delivered to ${delivered} device(s) for speaker ${recipientId}`,
      )
    }
  }
}
