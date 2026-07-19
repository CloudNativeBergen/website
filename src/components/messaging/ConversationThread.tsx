'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
}: {
  preference: ConversationPreference
  onSetMuted: (muted: boolean) => void
  onSetEmailOverride?: (override: EmailOverride) => void
  isSavingPreference?: boolean
}) {
  const { muted, emailOverride } = preference
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onSetMuted(!muted)}
        disabled={isSavingPreference}
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
          disabled={isSavingPreference || !onSetEmailOverride}
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
  onComposingChange,
  preference,
  onSetMuted,
  onSetEmailOverride,
  isSavingPreference = false,
}: ConversationThreadViewProps) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const body = draft.trim()
    if (!body || isSending) return
    onSend(body)
    setDraft('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      role="region"
      aria-label={subject ? `Conversation: ${subject}` : 'Conversation'}
      className="flex flex-col"
    >
      {(subject || onSetMuted) && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
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
            />
          )}
        </div>
      )}

      <div className="max-h-[60vh] min-h-[8rem] space-y-3 overflow-y-auto py-4">
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

      <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
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
}: ConversationThreadProps) {
  const { data: session } = useSession()
  const meId = session?.speaker?._id
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
      getNextPageParam: (lastPage) =>
        lastPage.length === PAGE_SIZE
          ? lastPage[lastPage.length - 1]?.createdAt
          : undefined,
      initialCursor: undefined,
    },
  )
  const messagesNotFound = errorCode(messagesQuery.error) === 'NOT_FOUND'

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
    if (!markReadLinks || !messagesLoaded) return
    const key = markReadLinks.join('|')
    if (markedKeyRef.current === key) return
    markedKeyRef.current = key
    markReadMutate({ links: markReadLinks })
  }, [markReadLinks, messagesLoaded, markReadMutate])

  useEffect(() => {
    markRead()
  }, [markRead])

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

  const sendMutation = api.message.send.useMutation({ onSuccess: invalidate })
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
      isLoading={messagesQuery.isLoading && !messagesNotFound}
      isError={messagesQuery.isError && !messagesNotFound}
      hasMore={messagesQuery.hasNextPage}
      onShowMore={() => messagesQuery.fetchNextPage()}
      isLoadingMore={messagesQuery.isFetchingNextPage}
      emptyText={emptyText}
      subject={conversationQuery.data?.conversation.subject}
      onSend={handleSend}
      isSending={sendMutation.isPending}
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
