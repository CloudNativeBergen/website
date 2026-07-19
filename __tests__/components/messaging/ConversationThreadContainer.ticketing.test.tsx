/**
 * @vitest-environment jsdom
 *
 * Container wiring tests for the T2c/T2e organizer ticketing controls on
 * ConversationThread:
 * - an organizer container wires setStatus (and passes the current
 *   status/assignee/global-archive through);
 * - a speaker container NEVER renders the organizer controls or calls their
 *   mutations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

let mockSession: {
  speaker?: { _id: string }
  isImpersonating?: boolean
} | null = { speaker: { _id: 'me' } }
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSession }),
}))

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => 'visible',
})

const statusMutate = vi.fn()
const assigneeMutate = vi.fn()
const archivedMutate = vi.fn()
const noop = { mutate: vi.fn(), isPending: false, isError: false }

let getConversationResult: { data: unknown; error: unknown } = {
  data: undefined,
  error: null,
}
let organizersEnabled: boolean | undefined

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
      getConversation: { useQuery: () => getConversationResult },
      listMessages: {
        useInfiniteQuery: () => ({
          data: {
            pages: [
              [
                {
                  _id: 'm1',
                  authorId: 'org',
                  body: 'hi',
                  createdAt: '2026-01-01T00:00:00Z',
                },
              ],
            ],
          },
          isLoading: false,
          isError: false,
          isSuccess: true,
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: vi.fn(),
        }),
      },
      send: { useMutation: () => noop },
      setPreference: { useMutation: () => noop },
      setStatus: { useMutation: () => ({ ...noop, mutate: statusMutate }) },
      setAssignee: { useMutation: () => ({ ...noop, mutate: assigneeMutate }) },
      setArchived: { useMutation: () => ({ ...noop, mutate: archivedMutate }) },
    },
    sponsor: {
      crm: {
        listOrganizers: {
          useQuery: (_input: unknown, opts?: { enabled?: boolean }) => {
            organizersEnabled = opts?.enabled
            return {
              data: [{ _id: 'org-2', name: 'Grace Hopper', email: 'g@x' }],
            }
          },
        },
      },
    },
    notification: {
      markReadByLink: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}))

import { ConversationThread } from '@/components/messaging'

function conversation(overrides = {}) {
  return {
    data: {
      conversation: {
        _id: 'conversation.abc',
        conversationType: 'general',
        subject: 'Travel',
        status: 'open',
        assignedTo: null,
        archivedAt: null,
        lastMessageAt: '2026-01-01T00:00:00Z',
        ...overrides,
      },
      participants: [],
      preference: { muted: false, emailOverride: 'default' },
    },
    error: null,
  }
}

beforeEach(() => {
  statusMutate.mockClear()
  assigneeMutate.mockClear()
  archivedMutate.mockClear()
  organizersEnabled = undefined
  mockSession = { speaker: { _id: 'me' } }
})

afterEach(cleanup)

describe('ConversationThread — organizer ticketing wiring (T2e)', () => {
  it('wires the Resolve button to setStatus with the conversation id', () => {
    getConversationResult = conversation()
    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
    expect(statusMutate).toHaveBeenCalledWith({
      conversationId: 'conversation.abc',
      status: 'resolved',
    })
    // The organizer picker query is enabled for an organizer on an existing thread.
    expect(organizersEnabled).toBe(true)
  })

  it('wires the overflow global-archive action to setArchived', () => {
    getConversationResult = conversation()
    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="organizer"
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /more conversation actions/i }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /archive for everyone/i }),
    )
    expect(archivedMutate).toHaveBeenCalledWith({
      conversationId: 'conversation.abc',
      archived: true,
    })
  })
})

describe('ConversationThread — speaker never gets organizer controls', () => {
  it('renders no Resolve/overflow and never enables the organizer picker query', () => {
    getConversationResult = conversation()
    render(
      <ConversationThread
        conversationId="conversation.abc"
        audience="speaker"
      />,
    )
    expect(
      screen.queryByRole('button', { name: /resolve/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /more conversation actions/i }),
    ).not.toBeInTheDocument()
    // The picker query is present but disabled for a speaker.
    expect(organizersEnabled).toBe(false)
    expect(statusMutate).not.toHaveBeenCalled()
  })
})
