import 'server-only'
import {
  getConfiguredWebPush,
  getWebPushConfigError,
  isPushConfigured,
} from './vapid'
import { getSpeakerPushState, prunePushSubscription } from './sanity'
import { isValidPushEndpoint } from './validate'
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
  /**
   * A short, human-readable failure summary composed from the push service's
   * response (HTTP status + response body/message), truncated. Present only on
   * failure. NEVER contains the subscription endpoint (a secret capability URL);
   * it is safe to surface to the authenticated owner of the subscription.
   */
  errorMessage?: string
}

/** A push service returns 404/410 when a subscription is permanently dead. */
function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

/** Cap the push-service response body we log (it can be an arbitrary page). */
const MAX_LOGGED_BODY = 300
/** Cap the composed error summary we hand back to callers/clients. */
const MAX_ERROR_MESSAGE = 200

/** Truncate with an ellipsis so long push-service responses stay bounded. */
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * Compose a short, greppable failure summary from a web-push error. The push
 * service response `body` (e.g. FCM's `VapidPkHashMismatch`) is the most useful
 * signal, so it wins over the library's generic `message`. Returns `undefined`
 * only when there is genuinely nothing to report. NEVER includes the endpoint.
 */
function composeErrorMessage(
  statusCode: number | undefined,
  message: string | undefined,
  body: string | undefined,
): string | undefined {
  const detail = body?.trim() || message?.trim() || undefined
  if (statusCode === undefined && !detail) return undefined
  const parts: string[] = []
  if (statusCode !== undefined) parts.push(`HTTP ${statusCode}`)
  if (detail) parts.push(detail)
  return truncate(parts.join(' — '), MAX_ERROR_MESSAGE)
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
    // Distinguish "no keys" from "keys present but MALFORMED" (bad subject /
    // wrong-length key) — the latter previously threw out of this function and
    // surfaced as an unexplained 'internal error' on the test button.
    const configError = getWebPushConfigError()
    return {
      ok: false,
      gone: false,
      errorMessage: configError
        ? `VAPID configuration invalid: ${configError}`
        : 'VAPID keys not configured',
    }
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
    // web-push throws a `WebPushError` carrying the push service's HTTP status,
    // response body, and a generic message. Capture all three: the status alone
    // (the old behaviour) can't distinguish a transient 500 from a permanent
    // 403 VapidPkHashMismatch (subscription made under a different/older
    // applicationServerKey), which is only diagnosable from the body.
    const err = error as {
      statusCode?: number
      message?: unknown
      body?: unknown
    }
    const statusCode =
      typeof err?.statusCode === 'number' ? err.statusCode : undefined
    const message = typeof err?.message === 'string' ? err.message : undefined
    const body = typeof err?.body === 'string' ? err.body : undefined

    // Log the ORIGIN only — the full endpoint is a secret capability URL and is
    // never logged anywhere in this module (matches deliverPushToRecipient).
    let endpointOrigin: string
    try {
      endpointOrigin = new URL(subscription.endpoint).origin
    } catch {
      endpointOrigin = 'unknown'
    }
    console.error('[push] delivery failed', {
      endpointOrigin,
      statusCode,
      message,
      body: body === undefined ? undefined : truncate(body, MAX_LOGGED_BODY),
    })

    return {
      ok: false,
      statusCode,
      gone: isGoneStatus(statusCode),
      errorMessage: composeErrorMessage(statusCode, message, body),
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
 *   - `message_received`         → `messages`
 *   - `message_stale`            → `messages` (S5 — a stale-thread nudge is a
 *        messaging event; it previously fell through to `otherUpdates`)
 *   - `conversation_assigned`    → `messages` (S4 — a follow-up assignment is a
 *        messaging event)
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
    case 'message_received':
    case 'message_stale':
    case 'conversation_assigned':
      return 'messages'
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

  // Bound recipient-level concurrency. Typical fan-outs are 1–5 recipients so
  // this changes nothing there; it only stops a broadcast-sized fan-out from
  // opening hundreds of simultaneous Sanity reads/prunes and push requests. A
  // tiny chunked loop keeps the zero-dependency, never-throw contract.
  const RECIPIENT_CONCURRENCY = 5
  const recipients = Array.from(byRecipient.entries())
  for (let i = 0; i < recipients.length; i += RECIPIENT_CONCURRENCY) {
    const chunk = recipients.slice(i, i + RECIPIENT_CONCURRENCY)
    await Promise.allSettled(
      chunk.map(([recipientId, recipientItems]) =>
        deliverPushToRecipient(recipientId, recipientItems),
      ),
    )
  }
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

  // Defense in depth against SSRF: only ever POST to a subscription whose stored
  // endpoint still passes the same public-https validation the input schemas
  // enforce. A stored endpoint that no longer qualifies (e.g. persisted before
  // this validation existed) is pruned and skipped rather than requested.
  const subscriptions: typeof state.subscriptions = []
  for (const subscription of state.subscriptions) {
    if (isValidPushEndpoint(subscription.endpoint)) {
      subscriptions.push(subscription)
      continue
    }
    console.error(
      `Skipping push to invalid stored endpoint for speaker ${recipientId}`,
    )
    await prunePushSubscription(recipientId, subscription.endpoint).catch(
      (error) => {
        console.error(
          `Failed to prune invalid push subscription for speaker ${recipientId}:`,
          error,
        )
      },
    )
  }
  if (subscriptions.length === 0) return

  for (const item of items) {
    const category = pushCategoryForNotificationType(item.notificationType)
    if (!state.preferences[category]) continue

    const payload: PushMessagePayload = {
      title: item.title,
      body: item.message ?? '',
      // The SW re-sanitises this to a same-origin path; hub links are already
      // app-relative (e.g. /cfp/proposal/<id>). A notification with NO deep link
      // (system/announcement types) targets the standalone notifications page
      // so a push tap on a closed app opens somewhere the message is readable —
      // never the bare app root, where it would be lost.
      url: item.link ?? '/notifications',
      // Stable per-thread tag (message notifications) → the SW passes it to
      // showNotification so repeat pushes for the same thread REPLACE the prior
      // one instead of stacking. Undefined for one-shot types (they stack).
      ...(item.tag ? { tag: item.tag } : {}),
    }

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
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
