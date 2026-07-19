'use client'

import Link from 'next/link'
import Image from 'next/image'
import { CheckCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { formatRelativeTime } from '@/lib/notification/format'
import type { NotificationItem } from '@/lib/notification/types'

export interface NotificationListProps {
  /** Items to render, newest first. Ignored while `isLoading` is true. */
  items: NotificationItem[]
  /** When true, renders skeleton rows instead of items. */
  isLoading?: boolean
  /** When true, renders a load-failure state (distinct from the empty state). */
  isError?: boolean
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
  /** Fired when "Show more" is pressed to load the next page. */
  onShowMore?: () => void
  /** When true, a "Show more" button is rendered under the list. */
  hasMore?: boolean
  /** Puts the "Show more" button in a loading state while the next page loads. */
  isLoadingMore?: boolean
  /**
   * Read-only mode (e.g. an admin impersonating a speaker): hides "Mark all
   * read" and shows a subtle hint that read state is untouched. Item activation
   * still navigates; the container is responsible for not marking read.
   */
  readOnly?: boolean
  /**
   * Audience-aware href of the Messages inbox (/admin/messages or
   * /cfp/messages). When provided, a "View all messages" quick link is rendered
   * as a footer; omitted → no footer. Kept as a prop so this component stays
   * presentational (the container derives the audience from the session).
   */
  messagesHref?: string
  /**
   * Fired when the messages quick link is activated — the container closes the
   * popover (same flow as item clicks); navigation is handled by the `<Link>`.
   */
  onMessagesClick?: () => void
  /**
   * Href of the notification/messaging settings page. When provided, a gear
   * shortcut is rendered in the header (left of "Mark all read"); omitted → no
   * gear. A prop for the same reason as `messagesHref`: this component stays
   * presentational.
   */
  settingsHref?: string
  /**
   * Fired when the settings gear is activated — the container closes the
   * popover (same flow as item clicks); navigation is handled by the `<Link>`.
   */
  onSettingsClick?: () => void
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

/**
 * Load-failure state, deliberately DISTINCT from the empty state: a failed
 * fetch must not read as "you're all caught up".
 */
function ErrorState() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    >
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
        Couldn&apos;t load notifications
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Check your connection and reopen the panel to retry.
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
  isError = false,
  unreadCount,
  onMarkAllRead,
  isMarkingAll = false,
  onItemClick,
  onShowMore,
  hasMore = false,
  isLoadingMore = false,
  readOnly = false,
  messagesHref,
  onMessagesClick,
  settingsHref,
  onSettingsClick,
}: NotificationListProps) {
  return (
    // `role="region"` makes the aria-label an actual named landmark — on a
    // generic div the label is not exposed to assistive tech at all.
    <div role="region" aria-label="Notifications" className="flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Notifications
        </h2>
        <div className="flex items-center gap-1">
          {settingsHref && (
            <Link
              href={settingsHref}
              prefetch={false}
              onClick={onSettingsClick}
              aria-label="Notification settings"
              // 44px tap target; negative margin keeps the header compact.
              className="-my-2.5 flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-500 dark:hover:bg-gray-800/60 dark:hover:text-gray-300"
            >
              <Cog6ToothIcon aria-hidden="true" className="h-5 w-5" />
            </Link>
          )}
          {readOnly ? (
            <span
              title="Viewing as speaker — read state is left untouched"
              className="ml-2 shrink-0 text-xs font-medium whitespace-nowrap text-gray-400 dark:text-gray-500"
            >
              Speaker view · read-only
            </span>
          ) : (
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0 || isMarkingAll}
              className="rounded text-xs font-medium text-brand-cloud-blue transition hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:text-gray-300 dark:disabled:text-gray-600"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800/70">
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : isError ? (
          <ErrorState />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {items.map((item) => (
              <ListItem key={item.id} item={item} onItemClick={onItemClick} />
            ))}
            {hasMore && (
              <div className="p-2">
                <button
                  type="button"
                  onClick={onShowMore}
                  disabled={isLoadingMore}
                  className="w-full rounded-lg px-4 py-2 text-center text-xs font-medium text-brand-cloud-blue transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-inset disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:bg-gray-800/60 dark:disabled:text-gray-600"
                >
                  {isLoadingMore ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {messagesHref && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          <Link
            href={messagesHref}
            prefetch={false}
            onClick={onMessagesClick}
            // min-h-11 keeps the tap target ≥44px.
            className="flex min-h-11 items-center justify-center px-4 py-3 text-xs font-medium text-brand-cloud-blue transition hover:bg-gray-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-inset dark:hover:bg-gray-800/60"
          >
            View all messages &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
