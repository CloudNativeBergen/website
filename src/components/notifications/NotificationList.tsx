'use client'

import Link from 'next/link'
import Image from 'next/image'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { formatRelativeTime } from '@/lib/notification/format'
import type { NotificationItem } from '@/lib/notification/types'

export interface NotificationListProps {
  /** Items to render, newest first. Ignored while `isLoading` is true. */
  items: NotificationItem[]
  /** When true, renders skeleton rows instead of items. */
  isLoading?: boolean
  /** Unread total from the polled counter — drives the "Mark all read" state. */
  unreadCount: number
  /** Fired when "Mark all read" is pressed. */
  onMarkAllRead: () => void
  /** Disables the "Mark all read" button while its mutation is in flight. */
  isMarkingAll?: boolean
  /**
   * Fired when an item is activated (click/Enter). The container marks it read
   * and closes the panel; navigation (if the item has a `link`) is handled by
   * the wrapping `<Link>`.
   */
  onItemClick: (item: NotificationItem) => void
}

function SkeletonRow() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <CheckCircleIcon
        aria-hidden="true"
        className="h-10 w-10 text-gray-300 dark:text-gray-600"
      />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
        You&apos;re all caught up
      </p>
    </div>
  )
}

function ItemBody({ item }: { item: NotificationItem }) {
  const unread = !item.readAt
  return (
    <>
      <span
        aria-hidden="true"
        className={
          unread
            ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-cloud-blue'
            : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent'
        }
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={
              unread
                ? 'truncate text-sm font-semibold text-gray-900 dark:text-white'
                : 'truncate text-sm font-medium text-gray-700 dark:text-gray-300'
            }
          >
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
            {formatRelativeTime(item.createdAt)}
          </span>
        </span>
        {item.message && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-gray-500 dark:text-gray-400">
            {item.message}
          </span>
        )}
        {item.actor?.name && (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            {item.actor.image && (
              <Image
                src={item.actor.image}
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 rounded-full"
              />
            )}
            <span className="truncate">{item.actor.name}</span>
          </span>
        )}
      </span>
    </>
  )
}

const rowClasses =
  'flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50 focus-visible:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-cloud-blue dark:hover:bg-gray-800/60 dark:focus-visible:bg-gray-800/60'

function ListItem({
  item,
  onItemClick,
}: {
  item: NotificationItem
  onItemClick: (item: NotificationItem) => void
}) {
  const unread = !item.readAt
  const wrapperClass = `${rowClasses} ${unread ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`

  if (item.link) {
    return (
      <Link
        href={item.link}
        prefetch={false}
        onClick={() => onItemClick(item)}
        className={wrapperClass}
      >
        <ItemBody item={item} />
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onItemClick(item)}
      className={wrapperClass}
    >
      <ItemBody item={item} />
    </button>
  )
}

/**
 * Presentational render of the notification inbox: header with a "Mark all
 * read" control, and the item list / loading / empty states. Pure — all data
 * and side effects are supplied by the container so this can be storied and
 * tested without tRPC.
 */
export function NotificationList({
  items,
  isLoading = false,
  unreadCount,
  onMarkAllRead,
  isMarkingAll = false,
  onItemClick,
}: NotificationListProps) {
  return (
    <div aria-label="Notifications" className="flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Notifications
        </h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0 || isMarkingAll}
          className="rounded text-xs font-medium text-brand-cloud-blue transition hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:text-gray-300 dark:disabled:text-gray-600"
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800/70">
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((item) => (
            <ListItem key={item.id} item={item} onItemClick={onItemClick} />
          ))
        )}
      </div>
    </div>
  )
}
