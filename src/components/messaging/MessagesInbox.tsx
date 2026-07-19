'use client'

import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type {
  ConversationListItem,
  ConversationView,
  ConversationViewCounts,
} from '@/lib/messaging/types'
import { ConversationList } from './ConversationList'
import { NewConversationForm } from './NewConversationForm'

/** Page size for the inbox (mirrors the server keyset page). */
const PAGE_SIZE = 20

/** The id of the list container, targeted by every tab's `aria-controls`. */
const PANEL_ID = 'messages-conversation-panel'
/** Deterministic per-tab id so the tabpanel can be `aria-labelledby` the tab. */
const tabId = (view: ConversationView) => `messages-tab-${view}`

/** Organizer inbox tabs. `all` is deliberately omitted from the UI (kept as a
 *  server capability); `active` is the default landing view. */
const ORGANIZER_TABS: { view: ConversationView; label: string }[] = [
  { view: 'active', label: 'Active' },
  { view: 'needs-reply', label: 'Needs reply' },
  { view: 'unassigned', label: 'Unassigned' },
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

/** The count-badge value for a tab (undefined ⇒ no badge; zero is omitted). */
function countForView(
  view: ConversationView,
  counts: ConversationViewCounts | undefined,
): number | undefined {
  if (!counts) return undefined
  switch (view) {
    case 'active':
      return counts.active
    case 'needs-reply':
      return counts.needsReply
    case 'unassigned':
      return counts.unassigned
    case 'mine':
      return counts.mine
    case 'resolved':
      return counts.resolved
    case 'archived':
      return counts.archived
    default:
      return undefined
  }
}

export interface MessagesInboxProps {
  /** The viewer's audience — drives per-row links and the inbox base path. */
  audience: 'speaker' | 'organizer'
  /** When true, a "New conversation" affordance (general threads) is shown. */
  allowNew?: boolean
}

/** A small count badge shown after a tab label; omitted when the count is 0. */
function TabCount({ count, active }: { count?: number; active: boolean }) {
  if (!count || count <= 0) return null
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold ${
        active
          ? 'bg-white/25 text-white'
          : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/**
 * Organizer view tabs: a horizontally scrollable row (no wrap, scrollbar hidden)
 * so the tabs never crowd or reflow at 393px. Each tab is a 44px target, exposes
 * its selected state via `aria-selected`, and carries a per-view count badge.
 */
function OrganizerViewTabs({
  view,
  counts,
  onChange,
}: {
  view: ConversationView
  counts: ConversationViewCounts | undefined
  onChange: (view: ConversationView) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter conversations"
      className="no-scrollbar flex flex-1 gap-1 overflow-x-auto"
    >
      {ORGANIZER_TABS.map((tab) => {
        const active = tab.view === view
        const count = countForView(tab.view, counts)
        return (
          <button
            key={tab.view}
            id={tabId(tab.view)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={PANEL_ID}
            onClick={() => onChange(tab.view)}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue ${
              active
                ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {tab.label}
            <TabCount count={count} active={active} />
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
            id={tabId(tab.view)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={PANEL_ID}
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
 * the query key so each view fetches fresh. The selected view is persisted in
 * the `?view=` query string (V1i) so back-navigation restores it; the default
 * `active` omits the param. When `allowNew` is set a {@link NewConversationForm}
 * opens a general thread — speakers with the organizers; organizers with a
 * chosen recipient speaker.
 */
export function MessagesInbox({
  audience,
  allowNew = false,
}: MessagesInboxProps) {
  const isOrganizer = audience === 'organizer'
  const basePath = isOrganizer ? '/admin/messages' : '/cfp/messages'
  const [showNew, setShowNew] = useState(false)

  // The selected view is persisted in the URL (`?view=`) so it survives
  // back/forward navigation. Local state drives the immediate switch; the URL is
  // written alongside, and an effect syncs the state back when the URL changes
  // out from under us (browser back/forward). Any value not valid for this
  // audience falls back to `active`.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabs = isOrganizer ? ORGANIZER_TABS : SPEAKER_TABS
  const paramView = searchParams.get('view')
  const urlView: ConversationView =
    paramView && tabs.some((t) => t.view === paramView)
      ? (paramView as ConversationView)
      : 'active'
  const [view, setLocalView] = useState<ConversationView>(urlView)

  // Restore the view from the URL when it changes independently of a tab click
  // (browser back/forward). Adjusting state DURING render — React's endorsed
  // "you might not need an effect" pattern — keeps the switch in sync without an
  // effect's extra commit; a tab click sets both local state and the URL, so the
  // two agree and this branch is a no-op.
  const [prevUrlView, setPrevUrlView] = useState<ConversationView>(urlView)
  if (urlView !== prevUrlView) {
    setPrevUrlView(urlView)
    setLocalView(urlView)
  }

  const setView = useCallback(
    (next: ConversationView) => {
      setLocalView(next)
      const params = new URLSearchParams(searchParams.toString())
      // Default `active` is the canonical no-param state.
      if (next === 'active') params.delete('view')
      else params.set('view', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  // The viewer's own speaker id drives the rows' "You: " snippet prefix.
  const { data: session } = useSession()
  const callerId = session?.speaker?._id
  const utils = api.useUtils()

  // Per-view conversation counts for the tab badges (one bounded round trip,
  // fetched alongside the first inbox page, not polled hot).
  const { data: viewCounts } = api.message.viewCounts.useQuery(undefined, {
    staleTime: 30_000,
  })

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
      {/* SINGLE-ROW toolbar (V1b): the view tabs flex and scroll; the compact
          "New" button is pinned to the right and never wraps below them. */}
      <div className="flex items-center gap-2">
        {isOrganizer ? (
          <OrganizerViewTabs
            view={view}
            counts={viewCounts}
            onChange={setView}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <SpeakerViewToggle view={view} onChange={setView} />
          </div>
        )}
        {allowNew && !showNew && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">New conversation</span>
            <span className="sm:hidden">New</span>
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
        view={view}
        isLoading={isLoading}
        isError={isError}
        hasMore={hasNextPage}
        onShowMore={() => fetchNextPage()}
        isLoadingMore={isFetchingNextPage}
        onUnarchive={isArchivedView ? handleUnarchive : undefined}
        onNewConversation={allowNew ? () => setShowNew(true) : undefined}
        panelId={PANEL_ID}
        labelledById={tabId(view)}
      />
    </div>
  )
}
