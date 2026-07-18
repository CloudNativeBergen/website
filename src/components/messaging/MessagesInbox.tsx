'use client'

import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { ConversationList } from './ConversationList'
import { NewConversationForm } from './NewConversationForm'

/** Page size for the inbox (mirrors the server keyset page). */
const PAGE_SIZE = 20

export interface MessagesInboxProps {
  /** The viewer's audience — drives per-row links and the inbox base path. */
  audience: 'speaker' | 'organizer'
  /** When true, a "New conversation" affordance (general threads) is shown. */
  allowNew?: boolean
}

/**
 * Inbox container for both audiences: loads the caller's conversations and
 * renders {@link ConversationList}. Speakers additionally get a
 * {@link NewConversationForm} to open a general thread with the organizers.
 */
export function MessagesInbox({
  audience,
  allowNew = false,
}: MessagesInboxProps) {
  const isOrganizer = audience === 'organizer'
  const basePath = isOrganizer ? '/admin/messages' : '/cfp/messages'
  const [showNew, setShowNew] = useState(false)

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.message.listConversations.useInfiniteQuery(
    {},
    {
      staleTime: 10_000,
      getNextPageParam: (lastPage) =>
        lastPage.length === PAGE_SIZE
          ? lastPage[lastPage.length - 1]?.lastMessageAt
          : undefined,
      initialCursor: undefined,
    },
  )

  const items = data?.pages.flat() ?? []

  return (
    <div className="space-y-4">
      {allowNew && (
        <div>
          {showNew ? (
            <NewConversationForm
              basePath={basePath}
              onCancel={() => setShowNew(false)}
            />
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                New conversation
              </button>
            </div>
          )}
        </div>
      )}

      <ConversationList
        items={items}
        isOrganizer={isOrganizer}
        isLoading={isLoading}
        isError={isError}
        hasMore={hasNextPage}
        onShowMore={() => fetchNextPage()}
        isLoadingMore={isFetchingNextPage}
      />
    </div>
  )
}
