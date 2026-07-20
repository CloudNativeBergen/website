'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
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
  const { data: session } = useSession()
  const isSignedIn = Boolean(session?.speaker)
  const pathname = usePathname()
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
    // procedure); a signed-out visitor just gets the param stripped above.
    if (isSignedIn && isAppRelativeLink(link)) {
      // Recipient-guarded + link-matched + re-validated server-side, so this can
      // only ever clear the CALLER'S OWN notification whose link equals `link`.
      mutate({ links: [link] })
    }
  }, [isSignedIn, pathname, mutate])

  useEffect(() => {
    if (!isSignedIn) return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const onMessage = (event: MessageEvent) => {
      if (!isNotificationClickMessage(event.data)) return
      // The url is the notification's app-relative link (the SW only ever posts
      // a sanitized "/..." path). The schema re-validates it; a non-matching url
      // (e.g. the "/" fallback) simply clears nothing.
      mutate({ links: [event.data.url] })
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [isSignedIn, mutate])

  return null
}
