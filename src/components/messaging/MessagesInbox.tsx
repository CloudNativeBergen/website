'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type {
  ConversationListItem,
  ConversationView,
} from '@/lib/messaging/types'
import { ConversationList } from './ConversationList'
import { NewConversationForm } from './NewConversationForm'

/** Page size for the inbox (mirrors the server keyset page). */
const PAGE_SIZE = 20

/** Organizer inbox tabs. `all` is deliberately omitted from the UI (kept as a
 *  server capability); `active` is the default landing view. */
const ORGANIZER_TABS: { view: ConversationView; label: string }[] = [
  { view: 'active', label: 'Active' },
  { view: 'needs-reply', label: 'Needs reply' },
  { view: 'mine', label: 'Mine' },
  { view: 'resolved', label: 'Resolved' },
  { view: 'archived', label: 'Archived' },
]

/** Speakers get a subtle two-way toggle (Active / Archived), not a full tab bar
 *  — the organizer-only views carry no speaker meaning. */
const SPEAKER_TABS: { view: ConversationView; label: string }[] = [
  { view: 'active', label: 'Active' },
  { view: 'archived', label: 'Archived' },
]

export interface MessagesInboxProps {
  /** The viewer's audience — drives per-row links and the inbox base path. */
  audience: 'speaker' | 'organizer'
  /** When true, a "New conversation" affordance (general threads) is shown. */
  allowNew?: boolean
}

/**
 * Organizer view tabs: a horizontally scrollable row (no wrap, scrollbar hidden)
 * so the five tabs never crowd or reflow at 393px. Each tab is a 44px target and
 * exposes its selected state via `aria-current`.
 */
function OrganizerViewTabs({
  view,
  onChange,
}: {
  view: ConversationView
  onChange: (view: ConversationView) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter conversations"
      className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1"
    >
      {ORGANIZER_TABS.map((tab) => {
        const active = tab.view === view
        return (
          <button
            key={tab.view}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(tab.view)}
            className={`inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue ${
              active
                ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Speaker view toggle: a subtle segmented control (Active / Archived). Presented
 * as a pill pair rather than a full tab bar to match the lighter speaker surface.
 */
function SpeakerViewToggle({
  view,
  onChange,
}: {
  view: ConversationView
  onChange: (view: ConversationView) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter conversations"
      className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800"
    >
      {SPEAKER_TABS.map((tab) => {
        const active = tab.view === view
        return (
          <button
            key={tab.view}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(tab.view)}
            className={`inline-flex min-h-[44px] items-center rounded-md px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue ${
              active
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Inbox container for both audiences: loads the caller's conversations and
 * renders {@link ConversationList}. A view tab bar (organizer) / toggle
 * (speaker) drives the `listConversations` `view` input — switching views swaps
 * the query key so each view fetches fresh. When `allowNew` is set a
 * {@link NewConversationForm} opens a general thread — speakers with the
 * organizers; organizers with a chosen recipient speaker.
 */
export function MessagesInbox({
  audience,
  allowNew = false,
}: MessagesInboxProps) {
  const isOrganizer = audience === 'organizer'
  const basePath = isOrganizer ? '/admin/messages' : '/cfp/messages'
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState<ConversationView>('active')
  // The viewer's own speaker id drives the rows' "You: " snippet prefix.
  const { data: session } = useSession()
  const callerId = session?.speaker?._id
  const utils = api.useUtils()

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.message.listConversations.useInfiniteQuery(
    { view },
    {
      staleTime: 10_000,
      getNextPageParam: (lastPage) => {
        if (lastPage.length !== PAGE_SIZE) return undefined
        const last = lastPage[lastPage.length - 1]
        // Compound keyset cursor `<lastMessageAt>~<_id>` so conversations
        // sharing an exact `lastMessageAt` page without skips (server splits it).
        return last ? `${last.lastMessageAt}~${last._id}` : undefined
      },
      initialCursor: undefined,
    },
  )

  const items = data?.pages.flat() ?? []
  const isArchivedView = view === 'archived'

  // Un-archive a row from the Archived view. Organizers see BOTH globally- and
  // per-user-archived threads there, so lifting both guarantees the thread leaves
  // the view regardless of which archive hid it; speakers only ever have their
  // per-user archive. Both mutations invalidate the inbox list on success.
  const setArchivedMutation = api.message.setArchived.useMutation({
    onSuccess: () => utils.message.listConversations.invalidate(),
  })
  const setPreferenceMutation = api.message.setPreference.useMutation({
    onSuccess: () => utils.message.listConversations.invalidate(),
  })
  const handleUnarchive = (item: ConversationListItem) => {
    if (isOrganizer) {
      setArchivedMutation.mutate({
        conversationId: item._id,
        archived: false,
      })
    }
    setPreferenceMutation.mutate({
      conversationId: item._id,
      archived: false,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isOrganizer ? (
          <OrganizerViewTabs view={view} onChange={setView} />
        ) : (
          <SpeakerViewToggle view={view} onChange={setView} />
        )}
        {allowNew && !showNew && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            New conversation
          </button>
        )}
      </div>

      {allowNew && showNew && (
        <NewConversationForm
          basePath={basePath}
          requireRecipient={isOrganizer}
          // The standalone inbox owns no success flow of its own — opt in to
          // navigating to the created thread (no longer the default).
          navigateOnCreate
          onCancel={() => setShowNew(false)}
        />
      )}

      <ConversationList
        items={items}
        isOrganizer={isOrganizer}
        callerId={callerId}
        isLoading={isLoading}
        isError={isError}
        hasMore={hasNextPage}
        onShowMore={() => fetchNextPage()}
        isLoadingMore={isFetchingNextPage}
        onUnarchive={isArchivedView ? handleUnarchive : undefined}
      />
    </div>
  )
}
