'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  ArchiveBoxArrowDownIcon,
  ArchiveBoxXMarkIcon,
  ArrowUturnLeftIcon,
  BellIcon,
  BellSlashIcon,
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import {
  conversationLinkPath,
  proposalConversationId,
} from '@/lib/messaging/links'
import { errorCode } from '@/lib/messaging/trpc'
import { formatRelativeTime } from '@/lib/notification/format'
import { ModalShell } from '@/components/ModalShell'
import type {
  ConversationAssignee,
  ConversationPreference,
  ConversationStatus,
  EmailOverride,
} from '@/lib/messaging/types'

/** How many messages a single keyset page returns (mirrors the server). */
const PAGE_SIZE = 20

/** The maximum message body length (mirrors `SendMessageSchema`). */
const MAX_BODY = 5000

/** A message flattened for display: author identity + own/other alignment. */
export interface DisplayMessage {
  id: string
  authorName: string
  authorImage?: string
  isOrganizer: boolean
  /** True when the current viewer authored the message (right-aligned accent). */
  isOwn: boolean
  body: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Presentational view (pure — storied and tested without tRPC)
// ---------------------------------------------------------------------------

export interface ConversationThreadViewProps {
  /** Messages oldest-first (newest at the bottom, chat convention). */
  messages: DisplayMessage[]
  isLoading?: boolean
  isError?: boolean
  /**
   * The conversation genuinely doesn't exist or the viewer can't access it
   * (server NOT_FOUND, not a transport failure). Distinguished from `isError` so
   * the empty/error state can be HONEST (V1e): a permanent "no access" message
   * with a Back-to-Messages CTA, rather than the retry copy a flaky network gets.
   */
  isNotFound?: boolean
  /** Audience-aware href of the Messages inbox, for the NOT_FOUND Back CTA (V1e). */
  backHref?: string
  /** A full previous page implies older messages remain. */
  hasMore?: boolean
  onShowMore?: () => void
  isLoadingMore?: boolean
  /** Empty-state copy (audience-specific "start the conversation …"). */
  emptyText: string
  /** Optional thread subject shown above the messages. */
  subject?: string
  /** Send a (trimmed, non-empty) message body. */
  onSend: (body: string) => void
  isSending?: boolean
  /**
   * True when the most recent send FAILED. The composer keeps the failed draft,
   * an inline error is shown above it, and a Retry affordance re-submits.
   */
  sendError?: boolean
  /**
   * Advances (via the container) on every SUCCESSFUL send. The composer clears
   * its draft only when this changes — never optimistically — so a failed send
   * can't silently discard the text.
   */
  sendResetKey?: number
  /**
   * Fill the parent's height (standalone thread page): the message list flexes
   * and the composer is pinned to the bottom. Default `false` keeps the normal
   * flow used by the proposal `#messages` embed.
   */
  fillHeight?: boolean
  /**
   * Impersonation read-only mode: the composer is replaced by a subtle notice
   * and the preferences bar is disabled, so an admin viewing as a speaker can't
   * post or mutate preferences as them.
   */
  readOnly?: boolean
  /** Reports composer focus so the container can pause polling while typing. */
  onComposingChange?: (composing: boolean) => void
  /**
   * The viewer's per-conversation preference. When `onSetMuted` is provided the
   * preferences bar renders; the proposal mount omits it until the conversation
   * exists.
   */
  preference?: ConversationPreference
  onSetMuted?: (muted: boolean) => void
  onSetEmailOverride?: (override: EmailOverride) => void
  isSavingPreference?: boolean
  /**
   * Per-user "Archive for me" (ALL participants, T2d). When provided the prefs
   * bar / overflow gains an Archive action that hides the thread from the
   * caller's inbox until a new message resurfaces it (un-archiving lives on the
   * Archived-view rows). Gated by `readOnly` like the other preference controls.
   */
  onArchiveForMe?: () => void
  // --- Organizer ticketing controls (T2c). Each is rendered only when its
  // handler is provided, so the speaker view (which passes none) is unchanged.
  /** Current ticketing status; drives the Resolve/Reopen toggle label. */
  status?: ConversationStatus
  /** Organizer-only: flip the thread between open and resolved. */
  onSetStatus?: (status: ConversationStatus) => void
  /** The organizer picker options for the Assign menu (`{ _id, name }`). */
  organizers?: ConversationAssignee[]
  /** The currently-assigned organizer (null when unassigned). */
  assignedTo?: ConversationAssignee | null
  /** Organizer-only: (re)assign or unassign (`null`) the follow-up owner. */
  onSetAssignee?: (assigneeId: string | null) => void
  /** Whether the thread is GLOBALLY archived (organizer archive state). */
  globallyArchived?: boolean
  /** Organizer-only: set/clear the GLOBAL archive. */
  onSetGlobalArchived?: (archived: boolean) => void
  /**
   * Name of the organizer who globally archived the thread (deref of
   * `archivedBy`). When present alongside `globallyArchived`, the organizer
   * header shows an "Archived for everyone by X" banner with an adjacent
   * Unarchive affordance (V1f).
   */
  archivedByName?: string
  /** True while any organizer ticketing mutation is in flight (disables them). */
  isSavingTicket?: boolean
}

function MessageSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="flex justify-start">
        <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="flex justify-start">
        <div className="h-8 w-1/3 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const { isOwn } = message
  return (
    <div className={isOwn ? 'flex justify-end' : 'flex justify-start'}>
      <div className="max-w-[80%]">
        <div
          className={`flex items-baseline gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
        >
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            {message.authorName}
          </span>
          {message.isOrganizer && (
            <span className="rounded-full bg-brand-cloud-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300">
              Organizer
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatRelativeTime(message.createdAt)}
          </span>
        </div>
        <div
          className={`mt-1 rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
            isOwn
              ? 'bg-brand-cloud-blue text-white dark:bg-blue-600'
              : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
          }`}
        >
          {message.body}
        </div>
      </div>
    </div>
  )
}

/** The shared icon-button styling used by the header preference/ticketing actions. */
const HEADER_BUTTON_CLASS =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800'

function MuteButton({
  muted,
  onSetMuted,
  disabled,
}: {
  muted: boolean
  onSetMuted: (muted: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onSetMuted(!muted)}
      disabled={disabled}
      aria-pressed={muted}
      title={muted ? 'Muted — click to unmute' : 'Mute this conversation'}
      className={HEADER_BUTTON_CLASS}
    >
      {muted ? (
        <BellSlashIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <BellIcon className="h-4 w-4" aria-hidden="true" />
      )}
      {muted ? 'Muted' : 'Mute'}
    </button>
  )
}

function EmailOverrideSelect({
  emailOverride,
  onSetEmailOverride,
  disabled,
  muted = false,
}: {
  emailOverride: EmailOverride
  onSetEmailOverride?: (override: EmailOverride) => void
  disabled?: boolean
  /**
   * When the conversation is muted, mute dominates every channel — email
   * included — so the select is disabled with an explaining tooltip (V1g).
   */
  muted?: boolean
}) {
  return (
    <label
      className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
      title={muted ? 'Muted — no notifications of any kind' : undefined}
    >
      <span>Emails</span>
      <select
        value={emailOverride}
        disabled={disabled || muted || !onSetEmailOverride}
        onChange={(e) => onSetEmailOverride?.(e.target.value as EmailOverride)}
        aria-label="Email notifications for this conversation"
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-cloud-blue focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
      >
        {/* The effective global default (audience-dependent, and a per-user
            toggle) isn't cheaply reachable client-side, so the label points at
            the profile rather than asserting on/off here (V1g). */}
        <option value="default">Default (see profile)</option>
        <option value="on">Always</option>
        <option value="off">Never</option>
      </select>
    </label>
  )
}

/**
 * SPEAKER preference bar: Mute + Emails, plus the per-user "Archive" action
 * (T2d) when `onArchiveForMe` is provided. Every control is blocked under
 * `readOnly` (impersonation).
 */
function PreferencesBar({
  preference,
  onSetMuted,
  onSetEmailOverride,
  onArchiveForMe,
  isSavingPreference,
  readOnly = false,
}: {
  preference: ConversationPreference
  onSetMuted: (muted: boolean) => void
  onSetEmailOverride?: (override: EmailOverride) => void
  onArchiveForMe?: () => void
  isSavingPreference?: boolean
  /** Impersonation: render the controls but block every mutation. */
  readOnly?: boolean
}) {
  const { muted, emailOverride } = preference
  const disabled = isSavingPreference || readOnly
  return (
    <div className="flex items-center gap-2">
      <MuteButton muted={muted} onSetMuted={onSetMuted} disabled={disabled} />
      <EmailOverrideSelect
        emailOverride={emailOverride}
        onSetEmailOverride={onSetEmailOverride}
        disabled={disabled}
        muted={muted}
      />
      {onArchiveForMe && (
        // Icon-only so the three-control bar (Mute + Emails + Archive) stays
        // compact enough at 393px to leave the thread subject room in the header.
        <button
          type="button"
          onClick={onArchiveForMe}
          disabled={disabled}
          title="Archive this conversation"
          aria-label="Archive this conversation"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <ArchiveBoxArrowDownIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * ORGANIZER thread controls (T2c): a visible Resolve/Reopen toggle and Mute
 * button, with the lower-frequency actions (Assign, Emails, per-user Archive,
 * global Archive) tucked into an overflow "…" menu so the header never crowds or
 * wraps at 393px. Every mutation is blocked under `readOnly` (impersonation).
 */
function OrganizerThreadControls({
  status,
  onSetStatus,
  preference,
  onSetMuted,
  onSetEmailOverride,
  onArchiveForMe,
  organizers = [],
  assignedTo,
  onSetAssignee,
  globallyArchived = false,
  onSetGlobalArchived,
  isSavingPreference = false,
  isSavingTicket = false,
  readOnly = false,
}: {
  status?: ConversationStatus
  onSetStatus: (status: ConversationStatus) => void
  preference?: ConversationPreference
  onSetMuted?: (muted: boolean) => void
  onSetEmailOverride?: (override: EmailOverride) => void
  onArchiveForMe?: () => void
  organizers?: ConversationAssignee[]
  assignedTo?: ConversationAssignee | null
  onSetAssignee?: (assigneeId: string | null) => void
  globallyArchived?: boolean
  onSetGlobalArchived?: (archived: boolean) => void
  isSavingPreference?: boolean
  isSavingTicket?: boolean
  readOnly?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const resolved = status === 'resolved'
  const ticketDisabled = isSavingTicket || readOnly
  const prefDisabled = isSavingPreference || readOnly
  const currentAssigneeId = assignedTo?._id ?? null

  return (
    <div className="flex items-center gap-2">
      {/* Primary organizer action: Resolve / Reopen. */}
      <button
        type="button"
        onClick={() => onSetStatus(resolved ? 'open' : 'resolved')}
        disabled={ticketDisabled}
        aria-pressed={resolved}
        title={resolved ? 'Reopen this conversation' : 'Mark as resolved'}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 ${
          resolved
            ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            : 'bg-green-600 text-white hover:bg-green-500'
        }`}
      >
        {resolved ? (
          <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden="true" />
        ) : (
          <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {resolved ? 'Reopen' : 'Resolve'}
      </button>

      {onSetMuted && preference && (
        <MuteButton
          muted={preference.muted}
          onSetMuted={onSetMuted}
          disabled={prefDisabled}
        />
      )}

      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        title="More actions"
        aria-label="More conversation actions"
        aria-haspopup="dialog"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
      </button>

      <ModalShell
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        size="sm"
        title="Conversation options"
      >
        <div className="space-y-5">
          {/* Assign menu: Unassigned + every organizer. */}
          {onSetAssignee && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Assign to
              </p>
              <div className="-mx-1 flex flex-col">
                {[{ _id: null, name: 'Unassigned' }, ...organizers].map(
                  (option) => {
                    const selected = currentAssigneeId === option._id
                    return (
                      <button
                        key={option._id ?? 'unassigned'}
                        type="button"
                        onClick={() => onSetAssignee(option._id)}
                        disabled={ticketDisabled}
                        aria-pressed={selected}
                        className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? 'bg-brand-cloud-blue/10 font-semibold text-brand-cloud-blue dark:bg-blue-400/10 dark:text-blue-300'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="truncate">{option.name}</span>
                        {selected && (
                          <CheckCircleIcon
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  },
                )}
              </div>
            </div>
          )}

          {onSetMuted && preference && onSetEmailOverride && (
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Notifications
              </p>
              <EmailOverrideSelect
                emailOverride={preference.emailOverride}
                onSetEmailOverride={onSetEmailOverride}
                disabled={prefDisabled}
                muted={preference.muted}
              />
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-gray-200 pt-4 dark:border-gray-700">
            {onArchiveForMe && (
              <button
                type="button"
                // Close the overflow sheet after the archive action (V1-r1); the
                // Assign section deliberately stays open for multi-select.
                onClick={() => {
                  onArchiveForMe()
                  setMenuOpen(false)
                }}
                disabled={prefDisabled}
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <ArchiveBoxArrowDownIcon
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                Archive for me
              </button>
            )}
            {onSetGlobalArchived && (
              <button
                type="button"
                // Close the sheet after toggling the global archive (V1-r1).
                onClick={() => {
                  onSetGlobalArchived(!globallyArchived)
                  setMenuOpen(false)
                }}
                disabled={ticketDisabled}
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {globallyArchived ? (
                  <ArchiveBoxXMarkIcon
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <ArchiveBoxArrowDownIcon
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {globallyArchived
                  ? 'Unarchive for everyone'
                  : 'Archive for everyone'}
              </button>
            )}
          </div>
        </div>
      </ModalShell>
    </div>
  )
}

/**
 * Presentational thread: a scrollable message list (oldest-first), an optional
 * preferences bar, and a composer. Pure — every side effect arrives via props so
 * it renders deterministically in Storybook and unit tests.
 */
export function ConversationThreadView({
  messages,
  isLoading = false,
  isError = false,
  isNotFound = false,
  backHref,
  hasMore = false,
  onShowMore,
  isLoadingMore = false,
  emptyText,
  subject,
  onSend,
  isSending = false,
  sendError = false,
  sendResetKey,
  fillHeight = false,
  readOnly = false,
  onComposingChange,
  preference,
  onSetMuted,
  onSetEmailOverride,
  isSavingPreference = false,
  onArchiveForMe,
  status,
  onSetStatus,
  organizers,
  assignedTo,
  onSetAssignee,
  globallyArchived = false,
  onSetGlobalArchived,
  archivedByName,
  isSavingTicket = false,
}: ConversationThreadViewProps) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Synchronous in-flight guard: `isSending` reflects the PREVIOUS render, so a
  // fast double-activation would slip through before it flips. This ref blocks
  // the second fire immediately and is released when the send settles (a
  // `sendResetKey` advance on success, or `sendError` flipping true on failure).
  const sendingRef = useRef(false)

  const submit = () => {
    const body = draft.trim()
    if (!body || isSending || sendingRef.current) return
    sendingRef.current = true
    onSend(body)
  }

  // Clear the composer ONLY after a send succeeds (the container advances
  // `sendResetKey`); skipped on the initial mount so an in-progress draft is
  // never wiped on first render.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    setDraft('')
    sendingRef.current = false
  }, [sendResetKey])

  // A failed send releases the guard so the preserved draft can be retried.
  useEffect(() => {
    if (sendError) sendingRef.current = false
  }, [sendError])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  // Scroll management + a polite live region for newly appended messages.
  // Newest-at-bottom means an incoming message changes the LAST id; a
  // "Show earlier messages" load prepends and leaves the last id untouched.
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const lastIdRef = useRef<string | null>(null)
  const hadMessagesRef = useRef(false)
  const [liveMessage, setLiveMessage] = useState('')
  // Monotonic counter that re-announces back-to-back messages (see below).
  const liveNonceRef = useRef(0)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // Within ~80px of the bottom counts as "following the conversation".
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // INITIAL positioning runs in a LAYOUT effect (before paint) so a long thread
  // never flashes its top for a frame before jumping to the newest message.
  // This is a client component ('use client') so useLayoutEffect never executes
  // on the server — no SSR hydration warning path is reachable.
  useLayoutEffect(() => {
    if (hadMessagesRef.current || messages.length === 0) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    hadMessagesRef.current = true
    lastIdRef.current = messages[messages.length - 1].id
  }, [messages])

  // Subsequent follow-scrolls + a polite announcement for genuinely NEW
  // messages. The initial jump is handled by the layout effect above; this
  // passive effect only reacts to later arrivals (and resets on an empty list).
  useEffect(() => {
    if (messages.length === 0) {
      hadMessagesRef.current = false
      lastIdRef.current = null
      return
    }
    const last = messages[messages.length - 1]
    const prevLastId = lastIdRef.current
    // First population is fully owned by the layout effect (it recorded the id);
    // nothing to follow or announce yet.
    if (!hadMessagesRef.current) {
      hadMessagesRef.current = true
      lastIdRef.current = last.id
      return
    }
    if (last.id !== prevLastId) {
      const el = scrollRef.current
      const prefersReduced =
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      // A genuinely new message arrived. Only follow it if the reader is
      // already near the bottom — don't yank them up mid-history-read.
      if (el && nearBottomRef.current) {
        if (typeof el.scrollTo === 'function') {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: prefersReduced ? 'auto' : 'smooth',
          })
        } else {
          el.scrollTop = el.scrollHeight
        }
      }
      // Announce it politely (skip the viewer's own outgoing messages). This
      // derives an assistive-tech announcement from an incoming-message event —
      // a legitimate effect→state sync, not render-derived state.
      if (!last.isOwn) {
        // Two messages in a row from the SAME author produce an identical
        // phrase; a plain setState would be a no-op and the second would never
        // be announced. Alternate between two meaningful phrasings so
        // consecutive announcements always differ as REAL spoken text — no
        // invisible codepoints, whose handling varies across screen readers.
        liveNonceRef.current += 1
        setLiveMessage(
          liveNonceRef.current % 2 === 0
            ? `Another message from ${last.authorName}`
            : `New message from ${last.authorName}`,
        )
      }
    }
    lastIdRef.current = last.id
  }, [messages])

  return (
    <div
      role="region"
      aria-label={subject ? `Conversation: ${subject}` : 'Conversation'}
      // fillHeight sizes to CONTENT and only SHRINKS (list scrolls) when the
      // thread exceeds the viewport — never grows, so a short thread keeps the
      // composer right under the last message instead of pinned to the bottom
      // of a stretched card.
      className={fillHeight ? 'flex min-h-0 flex-col' : 'flex flex-col'}
    >
      {(subject || onSetMuted || onSetStatus) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
          {subject ? (
            <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
              {subject}
            </h2>
          ) : (
            <span />
          )}
          {/* ORGANIZER (onSetStatus present) → the ticketing control cluster with
              an overflow menu; SPEAKER → the lighter Mute/Emails/Archive bar. */}
          {onSetStatus ? (
            <OrganizerThreadControls
              status={status}
              onSetStatus={onSetStatus}
              preference={preference}
              onSetMuted={onSetMuted}
              onSetEmailOverride={onSetEmailOverride}
              onArchiveForMe={onArchiveForMe}
              organizers={organizers}
              assignedTo={assignedTo}
              onSetAssignee={onSetAssignee}
              globallyArchived={globallyArchived}
              onSetGlobalArchived={onSetGlobalArchived}
              isSavingPreference={isSavingPreference}
              isSavingTicket={isSavingTicket}
              readOnly={readOnly}
            />
          ) : (
            onSetMuted &&
            preference && (
              <PreferencesBar
                preference={preference}
                onSetMuted={onSetMuted}
                onSetEmailOverride={onSetEmailOverride}
                onArchiveForMe={onArchiveForMe}
                isSavingPreference={isSavingPreference}
                readOnly={readOnly}
              />
            )
          )}
        </div>
      )}

      {/* ARCHIVED-FOR-EVERYONE banner (V1f, organizer): a subtle audit line with
          an adjacent Unarchive affordance when the thread is globally archived. */}
      {onSetStatus && globallyArchived && (
        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
          <span className="flex min-w-0 items-center gap-1.5">
            <ArchiveBoxArrowDownIcon
              className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
            <span
              className="truncate"
              title={
                archivedByName
                  ? `Archived for everyone by ${archivedByName}`
                  : undefined
              }
            >
              {archivedByName
                ? `Archived for everyone by ${archivedByName}`
                : 'Archived for everyone'}
            </span>
          </span>
          {onSetGlobalArchived && (
            <button
              type="button"
              onClick={() => onSetGlobalArchived(false)}
              disabled={isSavingTicket || readOnly}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-semibold text-brand-cloud-blue transition hover:bg-brand-cloud-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-400/10"
            >
              <ArchiveBoxXMarkIcon className="h-4 w-4" aria-hidden="true" />
              Unarchive
            </button>
          )}
        </div>
      )}

      {/* SPEAKER resolved note (V1h): a closed thread reopens on reply. Shown for
          the speaker audience only (no organizer ticketing controls). */}
      {!onSetStatus && status === 'resolved' && (
        <div className="mt-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
          <CheckCircleIcon
            className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <span>
            The organizers marked this conversation closed — replying reopens
            it.
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`space-y-3 overflow-y-auto overscroll-contain py-4 ${
          fillHeight ? 'min-h-[8rem] shrink' : 'max-h-[60vh] min-h-[8rem]'
        }`}
      >
        {isLoading ? (
          <MessageSkeleton />
        ) : isNotFound ? (
          // HONEST NOT_FOUND (V1e): a permanent no-access state, not a transient
          // load failure — offer a way back to the inbox instead of a retry.
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-2 py-10 text-center"
          >
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              This conversation doesn&apos;t exist or you don&apos;t have
              access.
            </p>
            {backHref && (
              <Link
                href={backHref}
                prefetch={false}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-cloud-blue transition hover:bg-brand-cloud-blue/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-blue-300 dark:hover:bg-blue-400/10"
              >
                <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden="true" />
                Back to Messages
              </Link>
            )}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-1 py-10 text-center"
          >
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Couldn&apos;t load this conversation
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Check your connection and try again.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {emptyText}
            </p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onShowMore}
                  disabled={isLoadingMore}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-cloud-blue transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:bg-gray-800/60 dark:disabled:text-gray-600"
                >
                  {isLoadingMore ? 'Loading…' : 'Show earlier messages'}
                </button>
              </div>
            )}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </>
        )}
      </div>

      {/* Polite live region: announces newly appended messages to screen
          readers without stealing focus. Empty on initial load (no spam). */}
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {readOnly ? (
        <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-center text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            You&apos;re viewing this conversation as the speaker. Messaging is
            read-only while impersonating.
          </p>
        </div>
      ) : (
        !isError &&
        !isNotFound && (
          <div
            className={`border-t border-gray-200 pt-3 dark:border-gray-700 ${
              fillHeight
                ? 'shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]'
                : ''
            }`}
          >
            {sendError && (
              <div
                role="alert"
                className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-900/20 dark:text-red-300"
              >
                <span>
                  Couldn&apos;t send your message. Your text is saved.
                </span>
                <button
                  type="button"
                  onClick={submit}
                  className="shrink-0 rounded-md px-2 py-1 font-semibold text-red-700 underline-offset-2 transition hover:bg-red-100 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Retry
                </button>
              </div>
            )}
            <label htmlFor="message-composer" className="sr-only">
              Write a message
            </label>
            <textarea
              id="message-composer"
              ref={textareaRef}
              value={draft}
              maxLength={MAX_BODY}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => onComposingChange?.(true)}
              onBlur={() => onComposingChange?.(false)}
              placeholder="Write a message…"
              className="block w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-cloud-blue focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {draft.length}/{MAX_BODY} · ⌘/Ctrl+Enter to send
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={draft.trim().length === 0 || isSending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-cloud-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
                {isSending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Container (wires the presentational view to the `message` tRPC router)
// ---------------------------------------------------------------------------

export interface ConversationThreadProps {
  /** An existing conversation id (general threads, inbox routes). */
  conversationId?: string
  /**
   * A proposal id (proposal mounts). The thread id is the deterministic
   * `conversation.proposal.<id>`; the conversation is auto-created on first send.
   */
  proposalId?: string
  /** The viewer's audience — only affects the empty-state wording. */
  audience: 'speaker' | 'organizer'
  /**
   * Fill the parent's height (standalone thread pages) so the composer pins to
   * the bottom above the mobile keyboard. Left `false` for the proposal embed.
   */
  fillHeight?: boolean
}

/**
 * Data container shared by BOTH audiences. Resolves the conversation id (given
 * directly, or derived from a proposal id), loads the participant context and
 * the keyset-paginated messages, and renders {@link ConversationThreadView}.
 *
 * PROPOSAL MOUNTS: before anyone has posted, the deterministic conversation does
 * not exist yet, so `getConversation` / `listMessages` return NOT_FOUND. That is
 * treated as an empty thread (composer still renders); the first `send` with a
 * `proposalId` creates the conversation and the queries then resolve.
 */
export function ConversationThread({
  conversationId,
  proposalId,
  audience,
  fillHeight = false,
}: ConversationThreadProps) {
  const { data: session } = useSession()
  const meId = session?.speaker?._id
  // IMPERSONATION: while an admin views as a speaker, every query/mutation is
  // scoped to the SPEAKER. Marking their notifications read or posting/mutating
  // preferences as them would corrupt their real state, so the thread goes
  // read-only (mirrors NotificationPanel).
  const isImpersonating = session?.isImpersonating === true
  const utils = api.useUtils()
  const [isComposing, setIsComposing] = useState(false)

  const convId =
    conversationId ??
    (proposalId ? proposalConversationId(proposalId) : undefined)

  // Don't retry a NOT_FOUND (a not-yet-created proposal thread) — it's expected.
  const retry = (count: number, error: unknown) =>
    errorCode(error) !== 'NOT_FOUND' && count < 2

  const conversationQuery = api.message.getConversation.useQuery(
    { id: convId ?? '' },
    { enabled: !!convId, retry, staleTime: 10_000 },
  )
  const conversationExists =
    !!conversationQuery.data &&
    errorCode(conversationQuery.error) !== 'NOT_FOUND'

  const messagesQuery = api.message.listMessages.useInfiniteQuery(
    { conversationId: convId ?? '' },
    {
      enabled: !!convId,
      retry,
      staleTime: 10_000,
      // Pause polling while the composer is focused so a refetch can't yank
      // scroll/state out from under someone mid-message.
      refetchInterval: isComposing ? false : 20_000,
      getNextPageParam: (lastPage) => {
        if (lastPage.length !== PAGE_SIZE) return undefined
        const last = lastPage[lastPage.length - 1]
        // Compound keyset cursor `<createdAt>~<_id>` so messages sharing an
        // exact `createdAt` page without skips (server splits it).
        return last ? `${last.createdAt}~${last._id}` : undefined
      },
      initialCursor: undefined,
    },
  )
  // NOT_FOUND means "no such conversation OR you can't access it" (the server
  // no longer distinguishes non-participants). Treat it as a startable empty
  // thread ONLY in the proposal auto-create context — the first send with a
  // `proposalId` materialises the conversation. For a bare `conversationId`
  // there is nothing to create, so a not-found there is a real error (e.g. a
  // non-participant following a handed link) and must surface as such rather
  // than a working composer whose sends would fail.
  const messagesNotFound = errorCode(messagesQuery.error) === 'NOT_FOUND'
  const notFoundIsEmpty = messagesNotFound && !!proposalId
  // A bare-conversationId NOT_FOUND (no proposal to auto-create) is a genuine
  // "doesn't exist / no access" — surface it honestly (V1e), distinct from a
  // transport failure which keeps the retry copy.
  const isConversationNotFound = messagesNotFound && !notFoundIsEmpty

  const participants = conversationQuery.data?.participants
  const participantById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; image?: string; isOrganizer: boolean }
    >()
    for (const p of participants ?? []) map.set(p._id, p)
    return map
  }, [participants])

  const pages = messagesQuery.data?.pages
  const messages: DisplayMessage[] = useMemo(() => {
    // Server returns newest-first across pages; flatten then reverse to
    // oldest-first (chat convention, newest at the bottom).
    const flat = pages?.flat() ?? []
    return [...flat].reverse().map((msg) => {
      const p = participantById.get(msg.authorId)
      return {
        id: msg._id,
        authorName: p?.name ?? 'Unknown',
        authorImage: p?.image,
        isOrganizer: p?.isOrganizer ?? false,
        isOwn: !!meId && msg.authorId === meId,
        body: msg.body,
        createdAt: msg.createdAt,
      }
    })
  }, [pages, participantById, meId])

  // AUTO-MARK-READ: opening a thread clears its `message_received` notifications
  // for the bell. We mark BOTH audience link variants (a recipient only ever
  // received one) and only once the messages have actually loaded — never on an
  // error/empty state. It fires once per mount and again on regained focus.
  const markReadMutation = api.notification.markReadByLink.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate()
      utils.notification.list.invalidate()
    },
  })
  const markReadMutate = markReadMutation.mutate
  const conversation = conversationQuery.data?.conversation
  const messagesLoaded = messagesQuery.isSuccess
  const markReadLinks = useMemo(
    () =>
      conversation
        ? [
            conversationLinkPath(conversation, true),
            conversationLinkPath(conversation, false),
          ]
        : null,
    [conversation],
  )

  // Guarded so a re-render can't re-fire within the same mount/focus; the focus
  // listener resets the guard so a regained tab re-marks any newly-read items.
  const markedKeyRef = useRef<string | null>(null)
  const markRead = useCallback(() => {
    // Never mark read while impersonating — it would destroy the speaker's
    // real unread state (their inbox is what these queries are scoped to).
    if (!markReadLinks || !messagesLoaded || isImpersonating) return
    const key = markReadLinks.join('|')
    if (markedKeyRef.current === key) return
    markedKeyRef.current = key
    markReadMutate({ links: markReadLinks })
  }, [markReadLinks, messagesLoaded, markReadMutate, isImpersonating])

  useEffect(() => {
    markRead()
  }, [markRead])

  // A message arriving via the 20s poll while the thread is open + visible is
  // rendered on screen but its bell notification would stay unread until the
  // tab blurs/refocuses (markRead fires once per key). Re-mark when the newest
  // message id advances while the document is visible so the bell stays honest.
  const newestMessageId = messages[messages.length - 1]?.id
  const prevNewestIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevNewestIdRef.current
    prevNewestIdRef.current = newestMessageId
    // Only on a genuine advance (not the initial load, which the effect above
    // already handles) and only when the reader can actually see it.
    if (!newestMessageId || prev === undefined || prev === newestMessageId) {
      return
    }
    if (
      typeof document === 'undefined' ||
      document.visibilityState === 'visible'
    ) {
      markedKeyRef.current = null
      markRead()
    }
  }, [newestMessageId, markRead])

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        markedKeyRef.current = null
        markRead()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [markRead])

  const invalidate = () => {
    if (convId) {
      utils.message.listMessages.invalidate({ conversationId: convId })
      utils.message.getConversation.invalidate({ id: convId })
    }
    utils.message.listConversations.invalidate()
  }

  // Advances on every successful send; the presentational view watches this to
  // clear the composer ONLY on success (never optimistically), so a failed send
  // keeps the drafted text instead of silently discarding it.
  const [sendSuccessKey, setSendSuccessKey] = useState(0)
  const sendMutation = api.message.send.useMutation({
    onSuccess: () => {
      setSendSuccessKey((k) => k + 1)
      invalidate()
    },
  })
  const preferenceMutation = api.message.setPreference.useMutation({
    onSuccess: invalidate,
  })

  // ORGANIZER ticketing (T2c/T2e): status / assignee / global-archive. These are
  // organizer-only capabilities, so the queries/mutations are gated on
  // `isOrganizer` — a speaker container never fetches organizers or calls them.
  const isOrganizer = audience === 'organizer'
  const statusMutation = api.message.setStatus.useMutation({
    onSuccess: invalidate,
  })
  const assigneeMutation = api.message.setAssignee.useMutation({
    onSuccess: invalidate,
  })
  const archivedMutation = api.message.setArchived.useMutation({
    onSuccess: invalidate,
  })
  // The organizer picker for the Assign menu — the cheapest existing organizer
  // list the codebase offers (also used by the sponsor CRM assignee picker).
  // Fetched only for an organizer viewing an EXISTING conversation.
  const organizersQuery = api.sponsor.crm.listOrganizers.useQuery(undefined, {
    enabled: isOrganizer && conversationExists,
    staleTime: 5 * 60_000,
  })
  const organizers = useMemo(
    () =>
      (organizersQuery.data ?? []).map((o) => ({ _id: o._id, name: o.name })),
    [organizersQuery.data],
  )
  const isSavingTicket =
    statusMutation.isPending ||
    assigneeMutation.isPending ||
    archivedMutation.isPending

  // Globally archived IFF archivedAt >= lastMessageAt (a newer message
  // auto-resurfaces it — the same timestamp rule the data layer applies).
  // `conversation` is resolved above (shared with the mark-read wiring).
  const globallyArchived =
    !!conversation?.archivedAt &&
    !!conversation.lastMessageAt &&
    conversation.archivedAt >= conversation.lastMessageAt

  const handleSend = (body: string) => {
    // A not-yet-created proposal thread must be opened via `proposalId`; once it
    // exists (or for a real conversation id) post directly to the conversation.
    if (proposalId && !conversationExists) {
      sendMutation.mutate({ proposalId, body })
    } else if (convId) {
      sendMutation.mutate({ conversationId: convId, body })
    }
  }

  const emptyText =
    audience === 'organizer'
      ? 'Start the conversation with the speakers.'
      : 'Start the conversation with the organizers.'

  return (
    <ConversationThreadView
      messages={messages}
      isLoading={messagesQuery.isLoading && !notFoundIsEmpty}
      // Transport error only — a NOT_FOUND routes to the honest not-found state.
      isError={
        messagesQuery.isError && !notFoundIsEmpty && !isConversationNotFound
      }
      isNotFound={isConversationNotFound}
      backHref={isOrganizer ? '/admin/messages' : '/cfp/messages'}
      hasMore={messagesQuery.hasNextPage}
      onShowMore={() => messagesQuery.fetchNextPage()}
      isLoadingMore={messagesQuery.isFetchingNextPage}
      emptyText={emptyText}
      subject={conversationQuery.data?.conversation.subject}
      onSend={handleSend}
      isSending={sendMutation.isPending}
      sendError={sendMutation.isError}
      sendResetKey={sendSuccessKey}
      fillHeight={fillHeight}
      readOnly={isImpersonating}
      onComposingChange={setIsComposing}
      preference={conversationQuery.data?.preference}
      onSetMuted={
        conversationExists && convId
          ? (muted) =>
              preferenceMutation.mutate({ conversationId: convId, muted })
          : undefined
      }
      onSetEmailOverride={
        conversationExists && convId
          ? (emailOverride) =>
              preferenceMutation.mutate({
                conversationId: convId,
                emailOverride,
              })
          : undefined
      }
      isSavingPreference={preferenceMutation.isPending}
      // Per-user "Archive for me" (ALL participants) — rides setPreference. Only
      // offered once the conversation exists (nothing to archive before then).
      onArchiveForMe={
        conversationExists && convId
          ? () =>
              preferenceMutation.mutate({
                conversationId: convId,
                archived: true,
              })
          : undefined
      }
      // ORGANIZER ticketing controls — passed only for an organizer viewing an
      // existing conversation, so a speaker container never wires them.
      status={conversation?.status}
      assignedTo={conversation?.assignedTo}
      organizers={organizers}
      globallyArchived={globallyArchived}
      archivedByName={conversation?.archivedBy?.name}
      isSavingTicket={isSavingTicket}
      onSetStatus={
        isOrganizer && conversationExists && convId
          ? (nextStatus) =>
              statusMutation.mutate({
                conversationId: convId,
                status: nextStatus,
              })
          : undefined
      }
      onSetAssignee={
        isOrganizer && conversationExists && convId
          ? (assigneeId) =>
              assigneeMutation.mutate({ conversationId: convId, assigneeId })
          : undefined
      }
      onSetGlobalArchived={
        isOrganizer && conversationExists && convId
          ? (archived) =>
              archivedMutation.mutate({ conversationId: convId, archived })
          : undefined
      }
    />
  )
}
