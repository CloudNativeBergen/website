'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'

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
  const utils = api.useUtils()
  const markReadByLink = api.notification.markReadByLink.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate()
      utils.notification.list.invalidate()
    },
  })
  const mutate = markReadByLink.mutate

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
