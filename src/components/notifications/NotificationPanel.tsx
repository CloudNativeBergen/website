'use client'

import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import type { NotificationItem } from '@/lib/notification/types'
import { NotificationList } from './NotificationList'

/** Page size for the inbox list; a full page implies another page may exist. */
const PAGE_SIZE = 20

export interface NotificationPanelProps {
  /** Unread total from the bell's polled counter; drives "Mark all read". */
  unreadCount: number
  /** Closes the surrounding Popover (called after an item is activated). */
  onClose: () => void
}

/**
 * Data container for the notification inbox. Headless UI unmounts a closed
 * `PopoverPanel` by default, so this component only mounts while the panel is
 * open — the `list` query therefore fires exactly when the user opens the bell,
 * with no explicit `enabled` gate needed.
 *
 * Reads/writes flow through the `notification` tRPC router; every mutation
 * invalidates both `unreadCount` and `list` so the badge and the panel stay in
 * sync (the badge poll is only a backstop).
 *
 * IMPERSONATION: while an admin impersonates a speaker (`session.isImpersonating`)
 * every query is scoped to the SPEAKER's inbox, so marking items read would
 * silently destroy the speaker's real unread state. In that mode the panel is
 * rendered read-only: no `markRead` / `markAllRead` mutations fire and item
 * activation still navigates (via the wrapping `<Link>`) without marking.
 */
export function NotificationPanel({
  unreadCount,
  onClose,
}: NotificationPanelProps) {
  const utils = api.useUtils()
  const { data: session } = useSession()
  const isImpersonating = session?.isImpersonating === true

  // Audience-aware Messages inbox quick link (T-QUICKLINK): organizers land in
  // the admin inbox, speakers in the CFP inbox. Passed down as a plain href so
  // NotificationList stays presentational.
  const messagesHref =
    session?.speaker?.isOrganizer === true ? '/admin/messages' : '/cfp/messages'

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
      // tRPC injects this value into the input's `cursor` field for the next
      // page. A short final page means there's nothing more to fetch.
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
    // Fire-and-forget: mark read on activation, then close. Navigation (if the
    // item has a link) is handled by the wrapping <Link>. While impersonating we
    // must NOT mutate the speaker's read state — just close (and navigate).
    if (!isImpersonating && !item.readAt) {
      markRead.mutate({ ids: [item.id] })
    }
    onClose()
  }

  return (
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
      onMessagesClick={onClose}
    />
  )
}
