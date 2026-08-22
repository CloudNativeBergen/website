'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { BellIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { NOTIFICATION_POLL_MS } from '@/lib/notification/polling'
import { useIdlePolling } from '@/hooks/useIdlePolling'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'
import { NotificationPanel } from './NotificationPanel'

/**
 * The notification hub entry point: a bell with an unread badge that opens the
 * inbox panel. Available in both the admin and speaker shells — the backend
 * scopes every query to the signed-in speaker, so no client-side role gate is
 * needed.
 *
 * ## Exactly ONE polled query
 *
 * The bell mounts on every authenticated page, so its poll is the product's
 * highest-volume Sanity read. It therefore owns a SINGLE polled query —
 * `notification.unreadCount`, at {@link NOTIFICATION_POLL_MS} — and nothing
 * else. `AppBadgeSync` reads the same key with the same options, so React Query
 * keeps them one fetch rather than two. The panel's `list` query mounts only
 * while the Popover is open.
 *
 * The toast title used to come from a SECOND polled query
 * (`notification.list({ limit: 1 })`) on the same cadence, which doubled the
 * bell's cost to buy one string that is read a handful of times per session —
 * and read it from a query with its OWN timer, so on a rise the title was
 * frequently still the previous notification's. It is now fetched ONCE, at the
 * moment the count actually rises (see below).
 *
 * ## …and it stops when nobody is there
 *
 * The badge is on every page, so an abandoned tab would otherwise poll forever.
 * {@link useIdlePolling} withdraws the interval after five minutes without
 * interaction and restores it — with an immediate refetch — on the first sign
 * of life, so an idle stop is invisible to anyone actually using the page.
 */
export function NotificationBell() {
  const utils = api.useUtils()
  const refetchInterval = useIdlePolling({
    intervalMs: NOTIFICATION_POLL_MS,
    // Coming back must show the CURRENT count, not the one from before the
    // user walked away — restarting the timer alone would leave it stale for
    // up to a full interval.
    onResume: () => {
      void utils.notification.unreadCount.invalidate()
    },
  })

  const { data, isSuccess } = api.notification.unreadCount.useQuery(undefined, {
    refetchInterval,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })
  const unreadCount = data ?? 0

  // Bridge a rising unread count to the ephemeral toast system so a live
  // notification surfaces even when the bell is closed. `useNotificationSafe`
  // returns `undefined` (rather than throwing) if the toast provider isn't
  // mounted, keeping the bell resilient in any shell.
  const notify = useNotificationSafe()
  const { data: session } = useSession()
  const isImpersonating = session?.isImpersonating === true

  // Previous RESOLVED unread count. `null` until the first successful fetch, so
  // login / first-load never fires a toast — only a subsequent increase does.
  const prevUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    if (!isSuccess) {
      return
    }
    const prev = prevUnreadRef.current
    prevUnreadRef.current = unreadCount
    if (prev === null) {
      // First resolved value: establish the baseline, don't toast.
      return
    }
    // Only a genuine increase toasts — never a decrease (mark-read) or an
    // unchanged refetch. Suppressed entirely while impersonating a speaker.
    if (unreadCount <= prev || isImpersonating) {
      return
    }

    const delta = unreadCount - prev
    const message =
      delta === 1
        ? 'You have 1 new notification.'
        : `You have ${delta} new notifications.`

    // ONE-SHOT, NOT A POLL. The newest row is read here — on the rise itself —
    // rather than kept warm by a second 60s query. A session receives a handful
    // of notifications an hour, so this costs a handful of requests against the
    // 60/hour the removed poll cost; and because it is fetched AT the rise it
    // reflects the notification that caused it, which a separately-timed poll
    // did not reliably do. A failure is not worth surfacing — the toast just
    // wears its generic headline, exactly as it did when the poll had no data.
    void utils.notification.list
      .fetch({ limit: 1 })
      .then((rows) => rows?.[0]?.title)
      .catch(() => undefined)
      .then((title) => {
        notify?.showNotification({
          type: 'info',
          // The newest notification's own title when we have it (V1l), so the
          // toast previews the actual event; otherwise the generic headline.
          title: title || 'You have new notifications',
          message,
        })
      })
  }, [isSuccess, unreadCount, isImpersonating, notify, utils])

  const hasUnread = unreadCount > 0
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label={
          hasUnread ? `Notifications (${unreadCount} unread)` : 'Notifications'
        }
        className="relative -m-2.5 flex h-11 w-11 items-center justify-center rounded-full p-2.5 text-gray-400 transition hover:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-offset-2 dark:text-gray-500 dark:hover:text-gray-400 dark:focus-visible:ring-offset-gray-950"
      >
        <BellIcon aria-hidden="true" className="h-6 w-6" />
        {hasUnread && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-white dark:ring-gray-950">
            {badgeLabel}
          </span>
        )}
      </PopoverButton>

      <PopoverPanel
        // Full-width sheet under the top bar on mobile; anchored dropdown on ≥sm.
        className="fixed inset-x-2 top-16 z-50 max-h-[80vh] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-900/5 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96 dark:bg-gray-900 dark:ring-white/10"
      >
        {({ close }) => (
          <NotificationPanel unreadCount={unreadCount} onClose={close} />
        )}
      </PopoverPanel>
    </Popover>
  )
}
