import { getConfiguredWebPush } from './vapid'
import type { PushMessagePayload, PushSubscriptionRecord } from './types'

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
