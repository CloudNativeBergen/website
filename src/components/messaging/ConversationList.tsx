'use client'

import Link from 'next/link'
import {
  ArchiveBoxXMarkIcon,
  BellSlashIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { conversationLinkPath, ORGANIZERS_LABEL } from '@/lib/messaging/links'
import { formatRelativeTime } from '@/lib/notification/format'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'
import type {
  ConversationListItem,
  ConversationView,
} from '@/lib/messaging/types'
import {
  deriveThreadTeamChip,
  type RoutingTeamTitles,
} from '@/lib/messaging/threadTeam'

export interface ConversationListProps {
  /** Conversations, newest activity first. Ignored while `isLoading`. */
  items: ConversationListItem[]
  /**
   * The viewer's audience. Drives the per-row deep link (organizers → /admin,
   * speakers → /cfp) via the shared {@link conversationLinkPath} contract.
   */
  isOrganizer: boolean
  /**
   * The viewer's own speaker id — rows whose last message they authored get a
   * "You: " snippet prefix. Optional so the list renders before the session
   * resolves (no prefix until it does).
   */
  callerId?: string
  isLoading?: boolean
  isError?: boolean
  hasMore?: boolean
  onShowMore?: () => void
  isLoadingMore?: boolean
  /**
   * Archived-view affordance (all audiences, T2d): when provided, each row shows
   * a trailing "Unarchive" button that un-archives the conversation for the
   * caller (organizer → global archive; speaker → their per-user archive) WITHOUT
   * navigating into the thread. Omitted (the default) in every non-archived view.
   */
  onUnarchive?: (item: ConversationListItem) => void
  /**
   * The active inbox view — drives the view-aware empty copy (V1d), the amber
   * needs-reply dot suppression in the needs-reply view (V1j), and hiding the
   * assignee badge in the Mine view (V1k). Defaults to `active`.
   */
  view?: ConversationView
  /**
   * When set (speaker inbox, Active view empty state), the adoption-pitch empty
   * state renders a "New conversation" CTA that invokes this (V1d rider).
   */
  onNewConversation?: () => void
  /**
   * Tab wiring (V1-r1): the id given to the list container so the inbox tabs can
   * point their `aria-controls` at it; when provided the container becomes a
   * `role="tabpanel"` labelled by {@link labelledById}.
   */
  panelId?: string
  /** The id of the currently-selected tab, for the tabpanel's `aria-labelledby`. */
  labelledById?: string
  /**
   * TEAMS-3 (L2): resolved routing-team TITLES ({ sponsors, cfp }) for the
   * per-row team chip. Supplied only for the organizer audience when teams are
   * configured; `undefined` suppresses chips (no teams configured / speaker
   * audience), leaving the standalone "Sponsor" chip as today.
   */
  routingTeamTitles?: RoutingTeamTitles
  /**
   * Override the per-row destination. Defaults to the shared
   * {@link conversationLinkPath} contract (which sends an organizer's PROPOSAL
   * thread out to `/admin/proposals/<id>#messages`).
   *
   * The three-pane reading surface passes a builder that keeps every row —
   * proposal-attached ones included — inside `/admin/messages/<conversationId>`,
   * because there the proposal context is a pane rather than another page. This
   * is a PRESENTATION choice local to that surface: `conversationLinkPath` is
   * the notification/deep-link contract and stays untouched.
   */
  hrefFor?: (item: ConversationListItem) => string
  /**
   * The conversation currently open beside the list (three-pane surface). Its
   * row is highlighted and marked `aria-current="page"`. Undefined ⇒ no row is
   * selected, which is the standalone inbox's behaviour.
   */
  selectedId?: string
  /**
   * `card` (default) is the standalone inbox: a bordered, rounded, self-sized
   * card. `rail` is the workspace list pane: flush with its column, filling the
   * available height and scrolling inside itself so the PAGE never scrolls.
   */
  variant?: 'card' | 'rail'
}

/**
 * View-aware empty-state copy (V1d). Organizer views each get a purpose-specific
 * line; the speaker Active view is an adoption pitch (a maintainer-picked
 * marketing surface). Returns a headline plus, optionally, a pitch body and a
 * flag to render the "New conversation" CTA beside it.
 */
function emptyStateFor(
  view: ConversationView,
  isOrganizer: boolean,
): { headline: string; body?: string; pitch?: boolean } {
  if (isOrganizer) {
    switch (view) {
      case 'needs-reply':
        // The organizer LANDING view, so its zero state must offer a next step
        // rather than dead-ending on a congratulation.
        return {
          headline: 'Nothing needs a reply 🎉',
          body: 'Every open thread already has an organizer reply as its latest message. Switch to Active to browse them all.',
        }
      case 'my-teams':
        return { headline: 'Nothing active for your teams' }
      case 'unassigned':
        return { headline: 'No unassigned conversations' }
      case 'mine':
        return { headline: 'Nothing assigned to you' }
      case 'resolved':
        return { headline: 'No resolved conversations' }
      case 'archived':
        return { headline: 'No archived conversations' }
      default:
        return { headline: 'No conversations yet' }
    }
  }
  // Speaker audience.
  if (view === 'archived') return { headline: 'No archived conversations' }
  return {
    headline: 'No conversations yet',
    body: 'Questions about your proposal or the conference? Message the organizers directly — replies arrive here, by email, and as push notifications.',
    pitch: true,
  }
}

/**
 * The organizer follow-up owner, as a compact avatar at the row's trailing edge
 * (organizer audience only). Uses the organizer's photo when available (V1k),
 * falling back to initials. `title` carries the full name for a hover tooltip;
 * the accessible label spells out the assignment.
 */
function AssigneeBadge({ name, image }: { name: string; image?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      title={name}
      aria-label={`Assigned to ${name}`}
      className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-cloud-blue/10 text-[11px] font-semibold text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300"
    >
      {image ? (
        <SpeakerAvatarImage
          src={image}
          name={name}
          size={24}
          textSizeClass="text-[11px]"
        />
      ) : (
        initial
      )}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
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
 * WHO: the row avatar. A counterpart with an image gets the photo (initials
 * fallback on load failure); a named counterpart without one gets initials; the
 * collective 'Organizers' counterpart (speaker audience, no single person) gets
 * a neutral group glyph — initials would wrongly suggest a person.
 */
function RowAvatar({ item }: { item: ConversationListItem }) {
  const { name, image } = item.counterpart
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full"
    >
      {image ? (
        <SpeakerAvatarImage src={image} name={name} size={40} />
      ) : name === ORGANIZERS_LABEL ? (
        <span className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-700">
          <UserGroupIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        </span>
      ) : (
        <MissingAvatar name={name} size={40} />
      )}
    </span>
  )
}

/**
 * Presentational inbox: one row per conversation linking to its thread for the
 * given audience. Each row reads Who (counterpart avatar + name) / What
 * (subject, snippet) / When (relative time) at a glance. Pure — the container
 * supplies data and pagination handlers so this renders without tRPC in
 * Storybook and tests.
 */
export function ConversationList({
  items,
  isOrganizer,
  callerId,
  isLoading = false,
  isError = false,
  hasMore = false,
  onShowMore,
  isLoadingMore = false,
  onUnarchive,
  view = 'active',
  onNewConversation,
  panelId,
  labelledById,
  routingTeamTitles,
  hrefFor,
  selectedId,
  variant = 'card',
}: ConversationListProps) {
  const buildHref =
    hrefFor ??
    ((item: ConversationListItem) => conversationLinkPath(item, isOrganizer))
  return (
    <div
      id={panelId}
      role={panelId ? 'tabpanel' : 'region'}
      tabIndex={panelId ? 0 : undefined}
      aria-label={panelId ? undefined : 'Conversations'}
      aria-labelledby={panelId ? labelledById : undefined}
      className={`divide-y divide-gray-100 focus:outline-none dark:divide-gray-800/70 ${
        variant === 'rail'
          ? 'min-h-0 flex-1 overflow-y-auto bg-white dark:bg-gray-800'
          : 'overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
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
        (() => {
          const empty = emptyStateFor(view, isOrganizer)
          return (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <ChatBubbleLeftRightIcon
                aria-hidden="true"
                className="h-10 w-10 text-gray-300 dark:text-gray-600"
              />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {empty.headline}
              </p>
              {empty.body && (
                <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  {empty.body}
                </p>
              )}
              {empty.pitch && onNewConversation && (
                <button
                  type="button"
                  onClick={onNewConversation}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  New conversation
                </button>
              )}
            </div>
          )
        })()
      ) : (
        <>
          {items.map((item) => {
            const isUnread = item.unreadCount > 0
            const isOwnLastMessage =
              !!callerId && item.lastMessage?.authorId === callerId
            // Organizer-only signals; a speaker never sees needs-reply or the
            // assignee (both are organizer-side concepts). The needs-reply dot
            // is suppressed WITHIN the needs-reply view — every row there needs a
            // reply, so the marker is redundant (V1j).
            const showNeedsReply =
              isOrganizer && item.needsReply === true && view !== 'needs-reply'
            const isResolved = item.status === 'resolved'
            // Hide the assignee badge in the Mine view — every row is the
            // caller's own, so the badge carries no information there (V1k).
            const assignee =
              isOrganizer && view !== 'mine' ? item.assignedTo : null
            // DIRECT-THREAD IDENTITY (V1a): a thread that personally addresses
            // the viewer gets a brand-blue left edge and a "Direct" chip so it
            // reads distinctly from the organizer broadcast threads.
            const isDirect = item.direct === true
            // TEAMS-3 (L2): the row's team chip, derived from the thread's
            // routing team (sponsor → sponsors, else cfp). Organizer-only, and
            // only when teams are configured (routingTeamTitles set). For a
            // sponsor row the chip MERGES with — rather than duplicates — the
            // amber Sponsor chip: the single amber chip shows the team title
            // (fallback 'Sponsor'). A non-sponsor routed thread gets a quiet
            // indigo team chip alongside the orthogonal gray 'Proposal' type chip.
            const teamChip = isOrganizer
              ? deriveThreadTeamChip(item.conversationType, routingTeamTitles)
              : null
            // Three-pane surface: the row whose thread is open beside the list.
            const isSelected = !!selectedId && item._id === selectedId
            return (
              // A `relative` row wrapper so the Unarchive ACTION can be a sibling
              // overlay of the row link rather than a <button> nested inside an
              // <a> (invalid HTML) — V1-r1. The left accent edge lives here so it
              // spans the full row height.
              <div
                key={item._id}
                className={`relative border-l-2 ${
                  isSelected
                    ? 'border-brand-cloud-blue bg-brand-cloud-blue/5 dark:border-blue-500 dark:bg-blue-500/10'
                    : isDirect
                      ? 'border-brand-cloud-blue dark:border-blue-500'
                      : 'border-transparent'
                }`}
              >
                <Link
                  href={buildHref(item)}
                  aria-current={isSelected ? 'page' : undefined}
                  prefetch={false}
                  className={`flex gap-3 py-3 pl-4 transition hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand-cloud-blue focus-visible:ring-inset dark:hover:bg-gray-800/60 dark:focus-visible:bg-gray-800/60 ${
                    assignee || onUnarchive ? 'pr-20' : 'pr-4'
                  }`}
                >
                  <RowAvatar item={item} />
                  <span className="min-w-0 flex-1">
                    {/* WHO + WHEN: counterpart name, mute glyph, unread pill,
                        relative time. */}
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {item.counterpart.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {item.muted && (
                          <BellSlashIcon
                            title="Muted"
                            aria-label="Muted"
                            className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
                          />
                        )}
                        {isUnread && (
                          <span
                            // MESSAGES, not conversations: this pill is the
                            // per-row tier (the aggregate bell/app badge counts
                            // conversations). Spell it out so the two tiers
                            // never read as the same number.
                            aria-label={`${item.unreadCount} unread message${
                              item.unreadCount === 1 ? '' : 's'
                            }`}
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-cloud-blue px-1.5 text-[11px] leading-none font-semibold text-white dark:bg-blue-600"
                          >
                            {item.unreadCount > 9 ? '9+' : item.unreadCount}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatRelativeTime(item.lastMessageAt)}
                        </span>
                      </span>
                    </span>
                    {/* WHAT: subject (the talk title for proposal threads — the
                        chip marks the type instead of repeating it). A brand-blue
                        'Direct' chip leads a direct thread; a small amber dot
                        leads the subject when the thread needs an organizer reply
                        (least-noisy affordance, consistent with the unread pill);
                        a gray status chip marks a closed thread. */}
                    <span className="mt-0.5 flex items-center gap-2">
                      {isDirect && (
                        <span className="shrink-0 rounded-full bg-brand-cloud-blue/10 px-2 py-0.5 text-[10px] font-semibold text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300">
                          Direct
                        </span>
                      )}
                      {showNeedsReply && (
                        <span
                          title="Needs reply"
                          aria-label="Needs reply"
                          className="h-2 w-2 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400"
                        />
                      )}
                      <span
                        className={`truncate text-sm text-gray-900 dark:text-white ${
                          isUnread ? 'font-bold' : 'font-semibold'
                        }`}
                      >
                        {conversationTitle(item)}
                      </span>
                      {item.conversationType === 'proposal' && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          Proposal
                        </span>
                      )}
                      {/* SPONSOR thread chip (G2b) — mirrors the Proposal chip,
                          amber to match the sponsor bubble/badge. When teams are
                          configured (L2) this SAME chip shows the sponsors-team
                          title instead of the bare 'Sponsor', so the team chip
                          and the Sponsor chip never both appear. */}
                      {item.conversationType === 'sponsor' && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          {teamChip?.label ?? 'Sponsor'}
                        </span>
                      )}
                      {/* Non-sponsor routed thread's team chip (L2): the cfp-team
                          title, indigo so it reads as a TEAM facet distinct from
                          the gray 'Proposal' type chip. Hidden when the cfp team
                          is unnamed/absent (teamChip null). */}
                      {item.conversationType !== 'sponsor' &&
                        teamChip?.tone === 'team' && (
                          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                            {teamChip.label}
                          </span>
                        )}
                      {isResolved && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          {isOrganizer ? 'Resolved' : 'Closed by organizers'}
                        </span>
                      )}
                    </span>
                    {/* Snippet: one truncated line; "You: " when the viewer wrote
                        the last message. */}
                    {item.lastMessage && (
                      <span className="mt-0.5 block truncate text-sm text-gray-500 dark:text-gray-400">
                        {isOwnLastMessage && (
                          <span className="font-medium text-gray-600 dark:text-gray-300">
                            You:{' '}
                          </span>
                        )}
                        {item.lastMessage.excerpt}
                      </span>
                    )}
                  </span>
                </Link>
                {/* Trailing action column, a SIBLING of the row link (not nested
                    inside the <a>): the follow-up owner's avatar (organizer
                    audience) and, in the archived view, an Unarchive button that
                    acts WITHOUT navigating into the thread (V1-r1). */}
                {(assignee || onUnarchive) && (
                  <span className="absolute inset-y-0 right-2 flex flex-col items-end justify-center gap-1.5">
                    {assignee && (
                      <AssigneeBadge
                        name={assignee.name}
                        image={assignee.image}
                      />
                    )}
                    {onUnarchive && (
                      <button
                        type="button"
                        onClick={() => onUnarchive(item)}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-cloud-blue transition hover:bg-brand-cloud-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-blue-300 dark:hover:bg-blue-400/10"
                      >
                        <ArchiveBoxXMarkIcon
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        Unarchive
                      </button>
                    )}
                  </span>
                )}
              </div>
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
