'use client'

import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import type { NotificationItem } from '@/lib/notification/types'
import { NotificationList } from './NotificationList'

/**
 * Page size for the standalone inbox. Same as the bell popover, but here a full
 * page is fetched at a time and every page is kept (infinite scroll via an
 * explicit "Show more") — the popover renders only the first page.
 */
const PAGE_SIZE = 20

/**
 * Data container for the STANDALONE notifications page (`/notifications`).
 *
 * A full-page sibling of {@link NotificationPanel}: it reuses the exact same
 * `notification.list` infinite query, `markRead` / `markAllRead` mutations, and
 * the presentational {@link NotificationList}, differing only in that it
 *   - has no popover to close (activation just marks read; links navigate);
 *   - reads the unread total from its own `unreadCount` query rather than the
 *     bell's polled counter;
 *   - renders "Show more" to page through the WHOLE history, not just 20;
 *   - lets the PAGE scroll (`disableInnerScroll`) instead of a nested region;
 *   - keeps linkless rows inert/inline-readable (no `linklessHref`) because the
 *     user is already on the page where they're readable, and shows no "View all
 *     notifications" self-link.
 *
 * IMPERSONATION mirrors the panel: while an admin impersonates a speaker the
 * list is read-only, so marking read can never destroy the speaker's real
 * unread state.
 */
export function NotificationInbox() {
  const utils = api.useUtils()
  const { data: session, status } = useSession()
  const isImpersonating = session?.isImpersonating === true

  // Audience-aware Messages quick link, withheld until the session resolves so
  // an organizer never briefly gets the speaker link (same rule as the panel).
  const sessionReady = status !== 'loading' && !!session
  const messagesHref = sessionReady
    ? session.speaker?.isOrganizer === true
      ? '/admin/messages'
      : '/cfp/messages'
    : undefined
  const settingsHref = sessionReady
    ? '/cfp/profile#notification-settings'
    : undefined

  const { data: unreadData } = api.notification.unreadCount.useQuery(
    undefined,
    {
      staleTime: 10_000,
    },
  )
  const unreadCount = unreadData ?? 0

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.notification.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      staleTime: 10_000,
      getNextPageParam: (lastPage) =>
        lastPage.length === PAGE_SIZE
          ? lastPage[lastPage.length - 1]?.createdAt
          : undefined,
      initialCursor: undefined,
    },
  )

  const items = data?.pages.flat() ?? []

  const invalidate = () => {
    utils.notification.unreadCount.invalidate()
    utils.notification.list.invalidate()
  }

  const markRead = api.notification.markRead.useMutation({
    onSuccess: invalidate,
  })
  const markAllRead = api.notification.markAllRead.useMutation({
    onSuccess: invalidate,
  })

  const handleItemClick = (item: NotificationItem) => {
    // Mark read on activation (fire-and-forget). Navigation, if the item has a
    // link, is handled by the wrapping <Link>. Never mutate while impersonating.
    if (!isImpersonating && !item.readAt) {
      markRead.mutate({ ids: [item.id] })
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
        <NotificationList
          items={items}
          isLoading={isLoading}
          isError={isError}
          unreadCount={unreadCount}
          onMarkAllRead={() => markAllRead.mutate()}
          isMarkingAll={markAllRead.isPending}
          onItemClick={handleItemClick}
          onShowMore={() => fetchNextPage()}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          readOnly={isImpersonating}
          messagesHref={messagesHref}
          settingsHref={settingsHref}
          disableInnerScroll
        />
      </div>
    </div>
  )
}
