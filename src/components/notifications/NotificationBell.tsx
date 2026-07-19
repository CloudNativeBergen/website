'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { BellIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'
import { NotificationPanel } from './NotificationPanel'

/**
 * The notification hub entry point: a bell with an unread badge that opens the
 * inbox panel. Available in both the admin and speaker shells — the backend
 * scopes every query to the signed-in speaker, so no client-side role gate is
 * needed.
 *
 * The unread count is polled (30s) and refetched on window focus so the badge
 * stays live without a socket. The panel (and its `list` query) mounts only
 * while the Popover is open.
 */
export function NotificationBell() {
  const { data, isSuccess } = api.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })
  const unreadCount = data ?? 0

  // The newest notification's title, for the rising-count toast (V1l). A small
  // dedicated query (one row) polled on the SAME cadence as the count — the
  // cheapest correct source; the panel's own list query is a separate key that
  // only exists while the panel is open, so we don't rely on it. When no title
  // is available the toast falls back to the generic copy below.
  const { data: latest } = api.notification.list.useQuery(
    { limit: 1 },
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  )
  const newestTitle = latest?.[0]?.title

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
    if (unreadCount > prev && !isImpersonating) {
      const delta = unreadCount - prev
      notify?.showNotification({
        type: 'info',
        // Carry the newest notification's own title when we have it (V1l), so the
        // toast previews the actual event; fall back to the generic headline.
        title: newestTitle || 'You have new notifications',
        message:
          delta === 1
            ? 'You have 1 new notification.'
            : `You have ${delta} new notifications.`,
      })
    }
  }, [isSuccess, unreadCount, isImpersonating, notify, newestTitle])

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
