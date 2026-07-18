import { urlBase64ToUint8Array } from '@/lib/push/encoding'

/**
 * Browser-side helpers for the double-opt-in push flow (issue #444).
 *
 * These only ever run in response to a user gesture — permission is NEVER
 * requested on load. Detection helpers are SSR-safe (guarded on `window`).
 */

/** True when the app is running as an installed / standalone PWA. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

/** True on iOS / iPadOS Safari (including iPadOS masquerading as desktop). */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && 'ontouchend' in document)
  )
}

/** True when the browser exposes the APIs required for web push. */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * iOS/iPadOS only deliver web push to an INSTALLED PWA (16.4+). When we're on
 * iOS Safari but not yet standalone, the toggle must be replaced with install
 * guidance rather than shown as a broken control.
 */
export function iosNeedsInstall(): boolean {
  return isIOS() && !isStandalone()
}

export interface BrowserPushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Narrow a `PushSubscription.toJSON()` result to our stored shape. */
function toStoredSubscription(
  sub: PushSubscription,
): BrowserPushSubscription | null {
  const json = sub.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return { endpoint, keys: { p256dh, auth } }
}

/** Current permission state, or `'unsupported'` when Notifications are absent. */
export function getNotificationPermission():
  NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/** Return the already-registered push subscription, if any. */
export async function getExistingSubscription(): Promise<BrowserPushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing ? toStoredSubscription(existing) : null
}

/**
 * Run the full subscribe flow AFTER a user gesture: request permission, then
 * (if granted) create a PushManager subscription with the VAPID key. Returns
 * the subscription JSON to hand to `push.subscribe`, or a failure reason.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<
  | { ok: true; subscription: BrowserPushSubscription }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error' }
> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!vapidPublicKey) return { ok: false, reason: 'error' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // The DOM lib types `applicationServerKey` as a `BufferSource` backed
        // by a concrete `ArrayBuffer`; our decoded key is a plain `Uint8Array`.
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      }))

    const stored = toStoredSubscription(subscription)
    if (!stored) return { ok: false, reason: 'error' }
    return { ok: true, subscription: stored }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

/**
 * Tear down the browser subscription. Returns the removed endpoint (so the
 * caller can tell the server which record to delete), or `null` if none.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (!existing) return null
  const endpoint = existing.endpoint
  await existing.unsubscribe().catch(() => undefined)
  return endpoint
}
