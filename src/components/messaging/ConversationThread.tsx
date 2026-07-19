'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSession } from 'next-auth/react'
import {
  BellIcon,
  BellSlashIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import {
  conversationLinkPath,
  proposalConversationId,
} from '@/lib/messaging/links'
import { errorCode } from '@/lib/messaging/trpc'
import { formatRelativeTime } from '@/lib/notification/format'
import type {
  ConversationPreference,
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

function PreferencesBar({
  preference,
  onSetMuted,
  onSetEmailOverride,
  isSavingPreference,
  readOnly = false,
}: {
  preference: ConversationPreference
  onSetMuted: (muted: boolean) => void
  onSetEmailOverride?: (override: EmailOverride) => void
  isSavingPreference?: boolean
  /** Impersonation: render the controls but block every mutation. */
  readOnly?: boolean
}) {
  const { muted, emailOverride } = preference
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onSetMuted(!muted)}
        disabled={isSavingPreference || readOnly}
        aria-pressed={muted}
        title={muted ? 'Muted — click to unmute' : 'Mute this conversation'}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {muted ? (
          <BellSlashIcon className="h-4 w-4" aria-hidden="true" />
        ) : (
          <BellIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {muted ? 'Muted' : 'Mute'}
      </button>

      <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span>Emails</span>
        <select
          value={emailOverride}
          disabled={isSavingPreference || readOnly || !onSetEmailOverride}
          onChange={(e) =>
            onSetEmailOverride?.(e.target.value as EmailOverride)
          }
          aria-label="Email notifications for this conversation"
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-cloud-blue focus:outline-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        >
          <option value="default">Default</option>
          <option value="on">Always</option>
          <option value="off">Never</option>
        </select>
      </label>
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
      {(subject || onSetMuted) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
          {subject ? (
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {subject}
            </h2>
          ) : (
            <span />
          )}
          {onSetMuted && preference && (
            <PreferencesBar
              preference={preference}
              onSetMuted={onSetMuted}
              onSetEmailOverride={onSetEmailOverride}
              isSavingPreference={isSavingPreference}
              readOnly={readOnly}
            />
          )}
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
        !isError && (
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
      isError={messagesQuery.isError && !notFoundIsEmpty}
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
    />
  )
}
