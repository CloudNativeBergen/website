'use client'

import Link from 'next/link'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { conversationLinkPath } from '@/lib/messaging/links'
import { formatRelativeTime } from '@/lib/notification/format'
import type { ConversationListItem } from '@/lib/messaging/types'

export interface ConversationListProps {
  /** Conversations, newest activity first. Ignored while `isLoading`. */
  items: ConversationListItem[]
  /**
   * The viewer's audience. Drives the per-row deep link (organizers → /admin,
   * speakers → /cfp) via the shared {@link conversationLinkPath} contract.
   */
  isOrganizer: boolean
  isLoading?: boolean
  isError?: boolean
  hasMore?: boolean
  onShowMore?: () => void
  isLoadingMore?: boolean
}

function SkeletonRow() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-1/4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </div>
  )
}

function conversationTitle(item: ConversationListItem): string {
  if (item.subject && item.subject.trim().length > 0) return item.subject
  if (item.proposalTitle && item.proposalTitle.trim().length > 0) {
    return item.proposalTitle
  }
  return 'Conversation'
}

/**
 * Presentational inbox: one row per conversation linking to its thread for the
 * given audience. Pure — the container supplies data and pagination handlers so
 * this renders without tRPC in Storybook and tests.
 */
export function ConversationList({
  items,
  isOrganizer,
  isLoading = false,
  isError = false,
  hasMore = false,
  onShowMore,
  isLoadingMore = false,
}: ConversationListProps) {
  return (
    <div
      role="region"
      aria-label="Conversations"
      className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-gray-800/70 dark:border-gray-700 dark:bg-gray-800"
    >
      {isLoading ? (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </>
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center"
        >
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Couldn&apos;t load conversations
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Check your connection and try again.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <ChatBubbleLeftRightIcon
            aria-hidden="true"
            className="h-10 w-10 text-gray-300 dark:text-gray-600"
          />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            No conversations yet
          </p>
        </div>
      ) : (
        <>
          {items.map((item) => {
            const isUnread = item.unreadCount > 0
            return (
              <Link
                key={item._id}
                href={conversationLinkPath(item, isOrganizer)}
                prefetch={false}
                className="flex items-baseline justify-between gap-3 px-4 py-3 transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-inset dark:hover:bg-gray-800/60 dark:focus-visible:bg-gray-800/60"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm text-gray-900 dark:text-white ${
                      isUnread ? 'font-bold' : 'font-semibold'
                    }`}
                  >
                    {conversationTitle(item)}
                  </span>
                  {item.conversationType === 'proposal' && (
                    <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">
                      Proposal thread
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {isUnread && (
                    <span
                      aria-label={`${item.unreadCount} unread`}
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-cloud-blue px-1.5 text-[11px] leading-none font-semibold text-white dark:bg-blue-600"
                    >
                      {item.unreadCount > 9 ? '9+' : item.unreadCount}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatRelativeTime(item.lastMessageAt)}
                  </span>
                </span>
              </Link>
            )
          })}
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
  )
}
