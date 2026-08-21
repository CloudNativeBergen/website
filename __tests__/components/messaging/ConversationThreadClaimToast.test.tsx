/**
 * @vitest-environment jsdom
 *
 * Claim-on-reply (B1b), CLIENT half: the `claimed` flag `message.send` returns
 * has to become something the organizer can actually see. The assignee badge
 * does re-render from the query invalidation, but silently — so the container
 * raises an EPHEMERAL toast (src/components/admin/NotificationProvider), not a
 * persistent hub notification.
 *
 * The real NotificationProvider is mounted (not a spy), so this asserts the
 * rendered TEXT a user reads, not that some function was called.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { ConversationThread } from '@/components/messaging/ConversationThread'

type SendResult = { conversationId: string; claimed: boolean }

const { sendOnSuccess } = vi.hoisted(() => ({
  sendOnSuccess: { current: null as null | ((r: SendResult) => void) },
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { speaker: { _id: 'org-1' }, user: { email: 'o@example.com' } },
  }),
}))

const emptyQuery = { data: undefined, isLoading: false, isError: false }
const emptyMutation = { mutate: vi.fn(), isPending: false }

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      message: {
        listMessages: { invalidate: vi.fn() },
        getConversation: { invalidate: vi.fn() },
        listConversations: { invalidate: vi.fn() },
      },
    }),
    message: {
      getConversation: { useQuery: () => emptyQuery },
      listMessages: {
        useInfiniteQuery: () => ({ ...emptyQuery, hasNextPage: false }),
      },
      // Capture the container's own onSuccess so it can be driven with a real
      // server payload shape.
      send: {
        useMutation: (opts: { onSuccess: (r: SendResult) => void }) => {
          sendOnSuccess.current = opts.onSuccess
          return emptyMutation
        },
      },
      setPreference: { useMutation: () => emptyMutation },
      setStatus: { useMutation: () => emptyMutation },
      setAssignee: { useMutation: () => emptyMutation },
      setArchived: { useMutation: () => emptyMutation },
    },
    notification: { markReadByLink: { useMutation: () => emptyMutation } },
    sponsor: { crm: { listOrganizers: { useQuery: () => emptyQuery } } },
  },
}))

function renderThread() {
  render(
    <NotificationProvider>
      <ConversationThread
        conversationId="conversation.gen-1"
        audience="organizer"
      />
    </NotificationProvider>,
  )
}

afterEach(() => {
  cleanup()
  sendOnSuccess.current = null
})

describe('ConversationThread — claim-on-reply toast (B1b)', () => {
  it('announces the claim when the send reports claimed', () => {
    renderThread()

    act(() => {
      sendOnSuccess.current!({
        conversationId: 'conversation.gen-1',
        claimed: true,
      })
    })

    expect(screen.getByText('You now own this thread')).toBeInTheDocument()
    expect(
      screen.getByText('It was unassigned, so replying assigned it to you.'),
    ).toBeInTheDocument()
  })

  it('stays quiet on an ordinary reply that claimed nothing', () => {
    renderThread()

    act(() => {
      sendOnSuccess.current!({
        conversationId: 'conversation.gen-1',
        claimed: false,
      })
    })

    // Paired with the test above, this pins the toast to the FLAG rather than to
    // "a send happened" — every organizer reply would otherwise announce
    // ownership it did not take.
    expect(screen.queryByText('You now own this thread')).toBeNull()
  })
})
