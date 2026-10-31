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
  InboxFilter,
} from '@/lib/messaging/types'
import { FilterChip } from '@/components/admin/sponsor-crm/MobileFilterSheet'
import { ConversationList } from './ConversationList'
import { NewConversationForm } from './NewConversationForm'

/** Page size for the inbox (mirrors the server keyset page). */
const PAGE_SIZE = 20

/** The id of the list container, targeted by every tab's `aria-controls`. */
const PANEL_ID = 'messages-conversation-panel'
/** Deterministic per-tab id so the tabpanel can be `aria-labelledby` the tab. */
const tabId = (view: ConversationView) => `messages-tab-${view}`

type OrganizerStatus = 'active' | 'resolved' | 'archived'

/**
 * Organizer inbox (#916): ONE list, narrowed by a status (Open / Resolved /
 * Archived) and, on open threads, by combinable filter chips. The seven old
 * `?view=` tabs map onto this: `active` is Open with no chip, the four
 * open-thread views are Open plus that one chip, `resolved` and `archived` are
 * statuses. `all` stays a server capability with no UI.
 */
const ORGANIZER_STATUSES: { view: OrganizerStatus; label: string }[] = [
  { view: 'active', label: 'Open' },
  { view: 'resolved', label: 'Resolved' },
  { view: 'archived', label: 'Archived' },
]

const FILTER_CHIPS: { filter: InboxFilter; label: string }[] = [
  { filter: 'needs-reply', label: 'Needs reply' },
  { filter: 'unassigned', label: 'Unassigned' },
  { filter: 'mine', label: 'Mine' },
  { filter: 'my-teams', label: 'My teams' },
]

/**
 * TRIAGE FIRST: with no `?filter=` an organizer lands on open threads that need
 * a reply. Turning every chip off is written as `?filter=none`, so "all open
 * threads" has its own URL instead of colliding with the landing state.
 */
const DEFAULT_FILTERS: InboxFilter[] = ['needs-reply']
const NO_FILTERS = 'none'

/** Speakers get a subtle two-way toggle (Active / Archived) and no chips —
 *  the organizer-only filters carry no speaker meaning. */
const SPEAKER_TABS: { view: ConversationView; label: string }[] = [
  { view: 'active', label: 'Active' },
  { view: 'archived', label: 'Archived' },
]

/**
 * Read the organizer inbox state from the URL. A legacy `?view=` (bookmarks,
 * the dashboard's My areas cards) is honoured when the new params are absent,
 * so every old view URL lands on the matching status + chip. Unknown values
 * fall back to the landing state.
 */
export function parseOrganizerInboxParams(
  params: URLSearchParams,
  available: readonly InboxFilter[],
): { status: OrganizerStatus; filters: InboxFilter[] } {
  const isAvailable = (value: string): value is InboxFilter =>
    (available as readonly string[]).includes(value)
  const legacy = params.get('view')
  if (legacy && !params.has('status') && !params.has('filter')) {
    if (legacy === 'resolved' || legacy === 'archived') {
      return { status: legacy, filters: [] }
    }
    if (legacy === 'active') return { status: 'active', filters: [] }
    if (isAvailable(legacy)) return { status: 'active', filters: [legacy] }
  }
  const status = params.get('status')
  if (status === 'resolved' || status === 'archived') {
    return { status, filters: [] }
  }
  const filter = params.get('filter')
  if (filter === null) return { status: 'active', filters: DEFAULT_FILTERS }
  return {
    status: 'active',
    filters: [...new Set(filter.split(',').filter(isAvailable))],
  }
}

/** Write the organizer inbox state into `params`, dropping any legacy `view`. */
function writeOrganizerInboxParams(
  params: URLSearchParams,
  status: OrganizerStatus,
  filters: readonly InboxFilter[],
) {
  params.delete('view')
  if (status === 'active') params.delete('status')
  else params.set('status', status)
  const isDefault =
    filters.length === DEFAULT_FILTERS.length &&
    DEFAULT_FILTERS.every((f) => filters.includes(f))
  if (status !== 'active' || isDefault) params.delete('filter')
  else params.set('filter', filters.length ? filters.join(',') : NO_FILTERS)
}

/** The count-badge value for a view or chip (undefined ⇒ no badge). */
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
    case 'my-teams':
      return counts.myTeams
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
  /**
   * Override the per-row destination (see `ConversationList.hrefFor`). The
   * three-pane workspace uses this to keep every row inside `/admin/messages`;
   * the standalone inbox leaves it undefined and gets the shared
   * `conversationLinkPath` deep-link contract.
   */
  hrefFor?: (item: ConversationListItem) => string
  /** The conversation open beside the list — its row renders as selected. */
  selectedId?: string
  /**
   * `card` (default) is the standalone inbox page. `rail` makes the inbox a
   * height-filling column whose LIST scrolls on its own, for the workspace's
   * left pane.
   */
  variant?: 'card' | 'rail'
  /**
   * Controlled composer. Supply BOTH to hoist the "new conversation" affordance
   * out of the inbox: the inline trigger beside the view toggle is dropped and
   * the caller owns the button, while the inbox still renders the form itself.
   *
   * `/admin/messages` uses this to put New in `AdminPageHeader`'s action slot —
   * where every other admin page puts its primary CTA. Uncontrolled (the
   * standalone `/cfp/messages` inbox) is unchanged.
   */
  showNew?: boolean
  onShowNewChange?: (show: boolean) => void
}

/** A small count badge shown after a label; omitted when the count is 0. */
function TabCount({ count }: { count?: number }) {
  if (!count || count <= 0) return null
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-200 px-1 text-[10px] leading-none font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/**
 * View toggle: a subtle segmented control — the speaker's Active / Archived and
 * the organizer's Open / Resolved / Archived status.
 */
function ViewToggle<V extends ConversationView>({
  view,
  onChange,
  tabs,
  counts,
}: {
  view: V
  onChange: (view: V) => void
  tabs: { view: V; label: string }[]
  /** Per-view badges (organizer statuses); speakers pass none. */
  counts?: ConversationViewCounts
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter conversations"
      className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800"
    >
      {tabs.map((tab) => {
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
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue sm:px-4 ${
              active
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
            <TabCount count={countForView(tab.view, counts)} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Organizer filter chips: toggle buttons (`aria-pressed`) in the shared admin
 * filter-chip style. The row WRAPS instead of scrolling, so no chip is clipped
 * at 393px. Each chip's count already reflects the other selected chips.
 */
function OrganizerFilterChips({
  chips,
  selected,
  counts,
  onToggle,
  onClear,
}: {
  chips: { filter: InboxFilter; label: string }[]
  selected: readonly InboxFilter[]
  counts: ConversationViewCounts | undefined
  onToggle: (filter: InboxFilter) => void
  onClear: () => void
}) {
  return (
    <div
      role="group"
      aria-label="Filter open conversations"
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map(({ filter, label }) => (
        <FilterChip
          key={filter}
          active={selected.includes(filter)}
          onClick={() => onToggle(filter)}
          label={
            <span className="inline-flex items-center gap-1.5">
              {label}
              <TabCount count={countForView(filter, counts)} />
            </span>
          }
        />
      ))}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

/**
 * Inbox container for both audiences: loads the caller's conversations and
 * renders {@link ConversationList}.
 *
 * ORGANIZERS get one list with a status toggle (Open / Resolved / Archived) and,
 * on Open, combinable filter chips (#916). State lives in `?status=` and
 * `?filter=` (comma-separated); the landing state (Open + Needs reply) writes
 * no params, and a legacy `?view=` still resolves (see
 * {@link parseOrganizerInboxParams}).
 *
 * SPEAKERS keep the Active / Archived toggle persisted in `?view=`.
 *
 * When `allowNew` is set a {@link NewConversationForm} opens a general thread —
 * speakers with the organizers; organizers with a chosen recipient speaker.
 */
export function MessagesInbox({
  audience,
  allowNew = false,
  hrefFor,
  selectedId,
  variant = 'card',
  showNew: showNewProp,
  onShowNewChange,
}: MessagesInboxProps) {
  const isOrganizer = audience === 'organizer'
  const basePath = isOrganizer ? '/admin/messages' : '/cfp/messages'
  // Controlled only when the caller supplies BOTH halves — a `showNew` with no
  // setter would render a composer nothing can close.
  const composerIsHoisted = showNewProp !== undefined && !!onShowNewChange
  const [ownShowNew, setOwnShowNew] = useState(false)
  const showNew = composerIsHoisted ? (showNewProp ?? false) : ownShowNew
  const setShowNew = (next: boolean) => {
    if (composerIsHoisted) onShowNewChange?.(next)
    else setOwnShowNew(next)
  }

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // TEAMS-3 soft lens: the caller's teams + every configured team (key/title).
  // Organizer-only. When NO team is configured conference-wide the `My teams`
  // chip is an inert lens, so it (and the per-row team chips) are hidden.
  const { data: teamLens } = api.message.teamLens.useQuery(undefined, {
    staleTime: 5 * 60_000,
    enabled: isOrganizer,
  })
  const teamsConfigured = (teamLens?.teams.length ?? 0) > 0
  const chips = teamsConfigured
    ? FILTER_CHIPS
    : FILTER_CHIPS.filter((c) => c.filter !== 'my-teams')
  const availableFilters = chips.map((c) => c.filter)

  // Routing-team TITLES for the per-row chips (L2): a sponsor thread → `sponsors`
  // team title, everything else → `cfp` team title. Undefined ⇒ no chips.
  const routingTeamTitles =
    isOrganizer && teamsConfigured
      ? {
          sponsors: teamLens?.teams.find((t) => t.key === 'sponsors')?.title,
          cfp: teamLens?.teams.find((t) => t.key === 'cfp')?.title,
        }
      : undefined

  // The URL is the source of truth; local state drives the immediate switch and
  // re-syncs when the URL changes out from under us (browser back/forward).
  const urlState = isOrganizer
    ? parseOrganizerInboxParams(searchParams, availableFilters)
    : {
        status: (searchParams.get('view') === 'archived'
          ? 'archived'
          : 'active') as OrganizerStatus,
        filters: [] as InboxFilter[],
      }
  const urlKey = `${urlState.status}|${urlState.filters.join(',')}`
  const [state, setLocalState] = useState(urlState)
  // Adjusting state DURING render ("you might not need an effect"): a click
  // sets both local state and the URL, so this branch is then a no-op.
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey)
  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey)
    setLocalState(urlState)
  }
  const { status, filters } = state

  const setInboxState = useCallback(
    (next: { status: OrganizerStatus; filters: InboxFilter[] }) => {
      setLocalState(next)
      const params = new URLSearchParams(searchParams.toString())
      if (isOrganizer) {
        writeOrganizerInboxParams(params, next.status, next.filters)
      } else if (next.status === 'active') {
        // A speaker's landing view (Active) is the canonical no-param state.
        params.delete('view')
      } else {
        params.set('view', next.status)
      }
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, isOrganizer],
  )
  const setStatus = (next: ConversationView) =>
    setInboxState({
      status: next as OrganizerStatus,
      // Chips only narrow open threads; returning to Open starts unfiltered.
      filters: [],
    })
  const toggleFilter = (filter: InboxFilter) =>
    setInboxState({
      status: 'active',
      filters: filters.includes(filter)
        ? filters.filter((f) => f !== filter)
        : [...filters, filter],
    })

  // The viewer's own speaker id drives the rows' "You: " snippet prefix.
  const { data: session } = useSession()
  const callerId = session?.speaker?._id
  const utils = api.useUtils()

  // Count badges (organizer only, one bounded round trip, not polled hot). The
  // chip counts are narrowed by the other selected chips so none of them lies.
  const { data: viewCounts } = api.message.viewCounts.useQuery(
    filters.length ? { filters } : undefined,
    { staleTime: 30_000, enabled: isOrganizer },
  )

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.message.listConversations.useInfiniteQuery(
    filters.length ? { view: status, filters } : { view: status },
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
  const isArchivedView = status === 'archived'
  // ConversationList's per-row tweaks key on a single view: one chip behaves
  // like its old view (e.g. no needs-reply dot inside Needs reply).
  const listView: ConversationView =
    status === 'active' && filters.length === 1 ? filters[0] : status

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

  const isRail = variant === 'rail'

  return (
    <div
      className={
        isRail
          ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden'
          : 'space-y-4'
      }
    >
      <div
        className={`flex flex-col gap-2 ${isRail ? 'shrink-0 px-2 pt-1' : ''}`}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {isOrganizer ? (
              <ViewToggle
                view={status}
                onChange={setStatus}
                tabs={ORGANIZER_STATUSES}
                counts={viewCounts}
              />
            ) : (
              <ViewToggle
                view={status as ConversationView}
                onChange={setStatus}
                tabs={SPEAKER_TABS}
              />
            )}
          </div>
          {allowNew && !composerIsHoisted && !showNew && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              title={isRail ? 'New conversation' : undefined}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-brand-cloud-blue py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500 ${
                isRail ? 'px-3 lg:px-2.5' : 'px-3'
              }`}
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              {isRail ? (
                // From `lg` up the rail is a ~288px column, so the label goes
                // to assistive tech only there.
                <span className="lg:sr-only">New</span>
              ) : (
                <>
                  <span className="hidden sm:inline">New conversation</span>
                  <span className="sm:hidden">New</span>
                </>
              )}
            </button>
          )}
        </div>
        {isOrganizer && status === 'active' && (
          <OrganizerFilterChips
            chips={chips}
            selected={filters}
            counts={viewCounts}
            onToggle={toggleFilter}
            onClear={() => setInboxState({ status: 'active', filters: [] })}
          />
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
        view={listView}
        emptyHeadline={
          filters.length > 1
            ? 'No open conversations match these filters'
            : undefined
        }
        routingTeamTitles={routingTeamTitles}
        isLoading={isLoading}
        isError={isError}
        hasMore={hasNextPage}
        onShowMore={() => fetchNextPage()}
        isLoadingMore={isFetchingNextPage}
        onUnarchive={isArchivedView ? handleUnarchive : undefined}
        onNewConversation={allowNew ? () => setShowNew(true) : undefined}
        panelId={PANEL_ID}
        labelledById={tabId(status)}
        hrefFor={hrefFor}
        selectedId={selectedId}
        variant={variant}
      />
    </div>
  )
}
