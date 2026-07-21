'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'

/**
 * The query param the service worker appends to the URL it OPENS on a
 * notification click (see public/sw.js) so a COLD open — which spawns a brand-new
 * client that never received the `notification-click` postMessage — can still
 * clear the notification. Its value is the notification's ORIGINAL app-relative
 * `link`.
 */
const MARK_READ_PARAM = 'markread'

/**
 * Cache-API handoff for the notification click intent (see public/sw.js). iOS
 * launches the installed PWA at its start_url and IGNORES the service worker's
 * `openWindow()` / `WindowClient.navigate()`, so on iOS neither the deep-link
 * navigation nor the `markread` query param ever reaches the window (cold OR
 * warm). To survive that, the SW stashes `{ link, ts }` in this cache under a
 * fixed synthetic key BEFORE opening any window; the freshly-launched client
 * reads it here and does the navigation + mark-read itself.
 */
const PENDING_NAV_CACHE = 'cndn-pending-nav'
const PENDING_NAV_KEY = '/__cndn_pending_notification'

/** How long a stashed click intent is honoured. Anything older is discarded. */
const PENDING_NAV_MAX_AGE_MS = 5 * 60 * 1000

/**
 * iOS may boot the app in parallel with the SW's cache write, so the entry can
 * be absent on the very first read. Re-check after these delays (ms), stopping
 * as soon as an entry is found & consumed.
 */
const PENDING_NAV_RETRY_DELAYS_MS = [600, 1600]

/** Whether Cache Storage is usable in this environment (no-op on the server). */
function hasCacheStorage(): boolean {
  return typeof window !== 'undefined' && typeof caches !== 'undefined'
}

/** Best-effort delete of the pending-nav entry; never throws. */
async function clearPendingNav(): Promise<void> {
  if (!hasCacheStorage()) return
  try {
    const cache = await caches.open(PENDING_NAV_CACHE)
    await cache.delete(PENDING_NAV_KEY)
  } catch {
    // Cache unavailable (private mode / quota); nothing to clear.
  }
}

/**
 * True for an app-relative deep link ("/..."; never "//..." or a backslash
 * trick). Mirrors — and slightly tightens (it also rejects protocol-relative
 * "//..." paths) — the SW's `sanitizeNotificationUrl` and the server's
 * `MarkReadByLinkSchema`, so we never fire the mutation for a tampered param.
 */
function isAppRelativeLink(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('://')
  )
}

/** The message the service worker posts on a notificationclick (see public/sw.js). */
interface NotificationClickMessage {
  type: 'notification-click'
  url: string
}

function isNotificationClickMessage(
  data: unknown,
): data is NotificationClickMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'notification-click' &&
    typeof (data as { url?: unknown }).url === 'string'
  )
}

/**
 * Marks the caller's matching hub notification READ when the app is opened or
 * focused via a notification click — for EVERY notification type, not just
 * messages.
 *
 * Gap this closes: opening a message thread self-clears its notification
 * (`ConversationThread` fires `markReadByLink` on mount), but a proposal-decision
 * / travel / sponsor / system push lands on its resource page which does NOT,
 * so the bell stayed lit. The service worker now posts the clicked notification's
 * app-relative url to the page; here we mark the caller's notification(s) with a
 * matching `link` read and refresh the bell.
 *
 * `markReadByLink` is recipient-guarded, link-matched, and app-relative-validated
 * server-side, so firing it for the landing url is safe and precise — it can only
 * ever clear the CALLER'S OWN notification whose link equals that url. It is also
 * idempotent, so double-handling a message click (the thread also marks it read)
 * is harmless.
 *
 * Renders nothing. Mounted once app-wide (see SessionProviderWrapper).
 */
export function NotificationClickSync() {
  // Only `status` is needed: mark-read is a cookie-authenticated server mutation,
  // so the client's session DATA never gates it — we fire unless the client is
  // DEFINITIVELY unauthenticated (`status`), which also survives the iOS
  // cold-open `loading` window (see the cold-open effect below).
  const { status } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const utils = api.useUtils()
  const markReadByLink = api.notification.markReadByLink.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate()
      utils.notification.list.invalidate()
    },
  })
  const mutate = markReadByLink.mutate

  // COLD-OPEN path: on mount and on every navigation, consume a `markread` query
  // param the SW appended to the opened URL, mark that notification's link read,
  // and STRIP the param via history.replaceState so it doesn't linger (a reload
  // or shared URL must not re-fire it). The param carries the notification's
  // original app-relative link — NOT the current URL — so it matches the stored
  // `link` markReadByLink validates against.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const link = params.get(MARK_READ_PARAM)
    if (link === null) return

    // Strip the param regardless of validity OR sign-in state so a junk value
    // (or a param that arrived on a signed-out load) can't linger in the URL and
    // re-fire on a later reload/share.
    params.delete(MARK_READ_PARAM)
    const query = params.toString()
    const stripped =
      window.location.pathname +
      (query ? `?${query}` : '') +
      window.location.hash
    window.history.replaceState(window.history.state, '', stripped)

    // Only mark-read for a signed-in caller (markReadByLink is a protected
    // procedure); a definitively signed-out visitor just gets the param stripped
    // above.
    if (status !== 'unauthenticated' && isAppRelativeLink(link)) {
      // Recipient-guarded + link-matched + re-validated server-side, so this can
      // only ever clear the CALLER'S OWN notification whose link equals `link`.
      mutate({ links: [link] })
    }
  }, [status, pathname, mutate])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const onMessage = (event: MessageEvent) => {
      if (!isNotificationClickMessage(event.data)) return
      const { url } = event.data
      // Mark read in EVERY receiving tab (idempotent) so each open tab's bell
      // clears. Cookie-authenticated server-side, so gate only on a definitively
      // unauthenticated client (mirrors the cold-open path).
      if (status !== 'unauthenticated') mutate({ links: [url] })

      // The SW broadcasts this to ALL window clients. Only the FOREGROUND tab may
      // navigate and clear the cold-open handoff: a background tab must not
      // hijack-navigate every open window, and must not delete the pending-nav
      // entry — an iOS cold-launched window may still need to consume it.
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return
      }

      // WARM navigation: iOS ignores the SW's `existing.navigate()`, so drive the
      // deep-link navigation from here. Skip when already on the target page
      // (avoid redundant navigations / loops).
      if (isAppRelativeLink(url) && url !== pathname) {
        router.push(url)
      }

      // This foreground tab handled the click, so a later COLD boot must NOT
      // re-consume the same intent from the Cache-API handoff. Clear it.
      void clearPendingNav()
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [status, mutate, pathname, router])

  // COLD-OPEN path (iOS-critical): when a tap launches the app from closed, iOS
  // boots it at the start_url and ignores the SW's openWindow/navigate, so the
  // deep link never loads and nothing is marked read. Recover the click intent
  // the SW stashed in the Cache API: navigate to it and mark it read here.
  //
  // Runs regardless of sign-in so the entry is always consumed (never lingers to
  // re-fire on a later boot); the mutation only fires when signed in.
  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const consume = async (): Promise<boolean> => {
      if (cancelled || !hasCacheStorage()) return false
      try {
        const cache = await caches.open(PENDING_NAV_CACHE)
        const res = await cache.match(PENDING_NAV_KEY)
        if (!res) return false

        // An entry exists — consume it EXACTLY once, whatever its contents.
        let payload: unknown = null
        try {
          payload = await res.json()
        } catch {
          payload = null
        }
        await cache.delete(PENDING_NAV_KEY)

        if (cancelled) return true
        if (
          payload &&
          typeof payload === 'object' &&
          typeof (payload as { link?: unknown }).link === 'string' &&
          typeof (payload as { ts?: unknown }).ts === 'number'
        ) {
          const { link, ts } = payload as { link: string; ts: number }
          const isFresh = Date.now() - ts <= PENDING_NAV_MAX_AGE_MS
          if (isAppRelativeLink(link) && isFresh) {
            // MARK READ even when we're already on the target page — the
            // navigation guard below only suppresses a redundant push, it must
            // not suppress the mark-read. The mutation's REAL auth is the request
            // cookie, not this client's `useSession` state: on an iOS cold open
            // the session is often still `loading` (the deep-link page seeded
            // `undefined` because `auth()` read falsy under cacheComponents — see
            // SessionProviderWrapper), so gating on session DATA would drop the
            // mark-read. Fire unless DEFINITIVELY unauthenticated.
            if (status !== 'unauthenticated') mutate({ links: [link] })
            // Navigate only when not already there (avoid a redundant push/loop).
            if (link !== window.location.pathname) router.push(link)
          }
        }
        return true
      } catch {
        // Cache unavailable; nothing to consume.
        return false
      }
    }

    const attempt = async () => {
      if (cancelled) return
      const found = await consume()
      if (found) {
        // Consumed — cancel any still-pending retries.
        cancelled = true
        for (const t of timers) clearTimeout(t)
      }
    }

    // Check immediately, then re-check on a bounded schedule to cover the iOS
    // race where the app boots before the SW's cache write lands.
    void attempt()
    for (const delay of PENDING_NAV_RETRY_DELAYS_MS) {
      timers.push(setTimeout(() => void attempt(), delay))
    }

    return () => {
      cancelled = true
      for (const t of timers) clearTimeout(t)
    }
  }, [status, mutate, router])

  return null
}
