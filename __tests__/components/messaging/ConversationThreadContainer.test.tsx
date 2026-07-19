/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConversationThread } from '@/components/messaging'

// Mutable session the mocked `useSession()` returns; each test may override it
// (e.g. to exercise the impersonation read-only mode).
let mockSession: {
  speaker?: { _id: string }
  isImpersonating?: boolean
} | null = { speaker: { _id: 'me' } }
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSession }),
}))

// jsdom leaves visibilityState unset; the C4 "re-mark while visible" path needs
// it to read as visible.
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => 'visible',
})

// --- tRPC surface, driven by mutable state the tests set before rendering ---
const markReadMutate = vi.fn()
let markReadOnSuccess: (() => void) | undefined
const noopMutation = { mutate: vi.fn(), isPending: false }

const unreadCountInvalidate = vi.fn()
const notificationListInvalidate = vi.fn()

let getConversationResult: { data: unknown; error: unknown } = {
  data: undefined,
  error: null,
}
let listMessagesResult: Record<string, unknown> = {}

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      message: {
        listMessages: { invalidate: vi.fn() },
        getConversation: { invalidate: vi.fn() },
        listConversations: { invalidate: vi.fn() },
      },
      notification: {
        unreadCount: { invalidate: unreadCountInvalidate },
        list: { invalidate: notificationListInvalidate },
      },
    }),
    message: {
      getConversation: { useQuery: () => getConversationResult },
      listMessages: { useInfiniteQuery: () => listMessagesResult },
      send: { useMutation: () => noopMutation },
      setPreference: { useMutation: () => noopMutation },
    },
    notification: {
      markReadByLink: {
        useMutation: (opts?: { onSuccess?: () => void }) => {
          markReadOnSuccess = opts?.onSuccess
          return { mutate: markReadMutate }
        },
      },
    },
  },
}))

function loadedMessages() {
  return {
    data: { pages: [[]] },
    isLoading: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

function messagesPage(
  items: Array<{
    _id: string
    authorId: string
    body: string
    createdAt: string
  }>,
) {
  return {
    data: { pages: [items] },
    isLoading: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

const NOT_FOUND = { data: { code: 'NOT_FOUND' } }
function notFoundMessages() {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    error: NOT_FOUND,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }
}

function generalConversation(id: string) {
  return {
    data: {
      conversation: {
        _id: id,
        conversationType: 'general',
        subject: 'Travel',
      },
      participants: [],
      preference: { muted: false, emailOverride: 'default' },
    },
    error: null,
  }
}

beforeEach(() => {
  markReadMutate.mockClear()
  unreadCountInvalidate.mockClear()
  notificationListInvalidate.mockClear()
  markReadOnSuccess = undefined
  mockSession = { speaker: { _id: 'me' } }
})

describe('ConversationThread — auto-mark-read', () => {
  it('marks BOTH audience link variants read once messages have loaded', () => {
    getConversationResult = generalConversation('conversation.abc')
    listMessagesResult = loadedMessages()

    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )

    expect(markReadMutate).toHaveBeenCalledTimes(1)
    expect(markReadMutate).toHaveBeenCalledWith({
      links: [
        '/admin/messages/conversation.abc',
        '/cfp/messages/conversation.abc',
      ],
    })
  })

  it('invalidates the bell count and list on success', () => {
    getConversationResult = generalConversation('conversation.abc')
    listMessagesResult = loadedMessages()

    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )

    expect(markReadOnSuccess).toBeTypeOf('function')
    markReadOnSuccess?.()
    expect(unreadCountInvalidate).toHaveBeenCalledTimes(1)
    expect(notificationListInvalidate).toHaveBeenCalledTimes(1)
  })

  it('does not mark read while messages are still loading', () => {
    getConversationResult = generalConversation('conversation.abc')
    listMessagesResult = {
      ...loadedMessages(),
      isLoading: true,
      isSuccess: false,
    }

    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('does not mark read before the conversation resolves', () => {
    getConversationResult = { data: undefined, error: null }
    listMessagesResult = loadedMessages()

    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )
    expect(markReadMutate).not.toHaveBeenCalled()
  })

  it('never marks read while impersonating a speaker (C1)', () => {
    mockSession = { speaker: { _id: 'me' }, isImpersonating: true }
    getConversationResult = generalConversation('conversation.abc')
    listMessagesResult = messagesPage([
      {
        _id: 'm1',
        authorId: 'org',
        body: 'hi',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])

    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )

    expect(markReadMutate).not.toHaveBeenCalled()
    // Composer is replaced by the read-only notice.
    expect(
      screen.getByText(/read-only while impersonating/i),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/write a message/i)).not.toBeInTheDocument()
  })

  it('re-marks read when a newer message arrives while visible (C4)', () => {
    getConversationResult = generalConversation('conversation.abc')
    listMessagesResult = messagesPage([
      {
        _id: 'm1',
        authorId: 'org',
        body: 'hi',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])

    const { rerender } = render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )
    expect(markReadMutate).toHaveBeenCalledTimes(1)

    // A newer message lands via the poll (server newest-first, so it's the new
    // head of the page) — the newest id advances while the tab is visible.
    listMessagesResult = messagesPage([
      {
        _id: 'm2',
        authorId: 'org',
        body: 'new',
        createdAt: '2026-01-01T00:05:00Z',
      },
      {
        _id: 'm1',
        authorId: 'org',
        body: 'hi',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ])
    rerender(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )
    expect(markReadMutate).toHaveBeenCalledTimes(2)
  })
})

describe('ConversationThread — not-found scoping (C5)', () => {
  it('shows the error state (no composer) for a not-found conversationId', () => {
    getConversationResult = { data: undefined, error: NOT_FOUND }
    listMessagesResult = notFoundMessages()

    render(
      <ConversationThread
        conversationId="conversation.zzz"
        audience="speaker"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load/i)
    expect(screen.queryByLabelText(/write a message/i)).not.toBeInTheDocument()
  })

  it('shows an empty startable thread (with composer) for a not-found proposalId', () => {
    getConversationResult = { data: undefined, error: NOT_FOUND }
    listMessagesResult = notFoundMessages()

    render(<ConversationThread proposalId="prop-1" audience="speaker" />)

    expect(screen.getByText(/start the conversation/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/write a message/i)).toBeInTheDocument()
  })
})
