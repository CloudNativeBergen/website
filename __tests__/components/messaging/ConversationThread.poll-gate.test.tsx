/**
 * @vitest-environment jsdom
 *
 * A MOUNTED-BUT-HIDDEN THREAD MUST NOT POLL.
 *
 * The messages workspace keeps the thread pane mounted and hides it with
 * `display:none` when it is not the step, so a half-typed reply and the scroll
 * position survive walking out to the proposal pane and back. React Query pauses
 * polling when the WINDOW loses focus, but nothing tells it about a pane the
 * page itself has hidden — so without this gate an organizer parked on the
 * proposal step of a phone kept issuing a `listMessages` read every 20s for a
 * conversation off screen.
 *
 * Two things are proved here, because either alone would be hollow:
 *
 *  1. `isVisible={false}` makes the thread ASK for no interval (`false`), and
 *     `isVisible` defaults to `true` so every other mount is unaffected.
 *  2. Handing react-query `refetchInterval: false` genuinely CLEARS the timer
 *     rather than skipping a tick — proved against the real library, since a
 *     mock of react-query is no evidence about react-query.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { speaker: { _id: 'me' } } }),
}))

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => 'visible',
})

/** The options `listMessages.useInfiniteQuery` was set up with, per render. */
const infiniteOptions: Array<{ refetchInterval?: unknown }> = []
const noopMutation = { mutate: vi.fn(), isPending: false }

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      message: {
        listMessages: { invalidate: vi.fn() },
        getConversation: { invalidate: vi.fn() },
        listConversations: { invalidate: vi.fn() },
      },
      notification: {
        unreadCount: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
    }),
    message: {
      getConversation: { useQuery: () => ({ data: undefined, error: null }) },
      listMessages: {
        useInfiniteQuery: (
          _input: unknown,
          opts?: { refetchInterval?: unknown },
        ) => {
          infiniteOptions.push({ refetchInterval: opts?.refetchInterval })
          return {
            data: { pages: [[]] },
            isLoading: false,
            isError: false,
            isSuccess: true,
            hasNextPage: false,
            isFetchingNextPage: false,
            fetchNextPage: vi.fn(),
          }
        },
      },
      send: { useMutation: () => noopMutation },
      setPreference: { useMutation: () => noopMutation },
      setStatus: { useMutation: () => noopMutation },
      setAssignee: { useMutation: () => noopMutation },
      setArchived: { useMutation: () => noopMutation },
    },
    sponsor: { crm: { listOrganizers: { useQuery: () => ({ data: [] }) } } },
    notification: {
      markReadByLink: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}))

import { ConversationThread } from '@/components/messaging'

/** The interval the most recent render asked for. */
const askedInterval = () =>
  infiniteOptions[infiniteOptions.length - 1]?.refetchInterval

beforeEach(() => {
  infiniteOptions.length = 0
})

afterEach(() => {
  cleanup()
})

describe('ConversationThread — the hidden-pane poll gate', () => {
  it('asks for NO interval while it is mounted but not visible', () => {
    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
        isVisible={false}
      />,
    )
    expect(askedInterval()).toBe(false)
  })

  it('polls every 20s when it IS visible', () => {
    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
        isVisible
      />,
    )
    expect(askedInterval()).toBe(20_000)
  })

  it('defaults to visible, so a standalone thread page is unaffected', () => {
    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="speaker"
      />,
    )
    expect(askedInterval()).toBe(20_000)
  })

  it('stops polling when a visible thread is hidden, and resumes when shown', () => {
    const { rerender } = render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
        isVisible
      />,
    )
    expect(askedInterval()).toBe(20_000)

    rerender(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
        isVisible={false}
      />,
    )
    expect(askedInterval()).toBe(false)

    rerender(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
        isVisible
      />,
    )
    expect(askedInterval()).toBe(20_000)
  })
})

/**
 * `refetchInterval: false` must CLEAR the observer's timer, not merely make the
 * tick a no-op — otherwise "the poll is off" would be a claim about a comment.
 */
describe('react-query honours a refetchInterval flipped to false', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('issues no further fetches once the interval is withdrawn', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryFn = vi.fn(async () => 1)
    const observer = new QueryObserver(client, {
      queryKey: ['message.listMessages'],
      queryFn,
      refetchInterval: 20_000,
      staleTime: 10_000,
    })
    const unsubscribe = observer.subscribe(() => {})

    await vi.advanceTimersByTimeAsync(1)
    expect(queryFn).toHaveBeenCalledTimes(1) // mount fetch
    await vi.advanceTimersByTimeAsync(20_000)
    expect(queryFn).toHaveBeenCalledTimes(2) // one poll

    // …the pane is hidden.
    observer.setOptions({
      queryKey: ['message.listMessages'],
      queryFn,
      refetchInterval: false,
      staleTime: 10_000,
    })
    await vi.advanceTimersByTimeAsync(20_000 * 10)
    expect(queryFn).toHaveBeenCalledTimes(2) // silence, for ten intervals

    unsubscribe()
  })
})
