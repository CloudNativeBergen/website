'use client'

import { api } from '@/lib/trpc/client'
import type { NotificationItem } from '@/lib/notification/types'
import { NotificationList } from './NotificationList'

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
 */
export function NotificationPanel({
  unreadCount,
  onClose,
}: NotificationPanelProps) {
  const utils = api.useUtils()

  const { data: items = [], isLoading } = api.notification.list.useQuery(
    { limit: 20 },
    { staleTime: 10_000 },
  )

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
    // item has a link) is handled by the wrapping <Link>.
    if (!item.readAt) {
      markRead.mutate({ ids: [item.id] })
    }
    onClose()
  }

  return (
    <NotificationList
      items={items}
      isLoading={isLoading}
      unreadCount={unreadCount}
      onMarkAllRead={() => markAllRead.mutate()}
      isMarkingAll={markAllRead.isPending}
      onItemClick={handleItemClick}
    />
  )
}
