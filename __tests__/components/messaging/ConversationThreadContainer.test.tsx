/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ConversationThread } from '@/components/messaging'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { speaker: { _id: 'me' } } }),
}))

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
})
