/**
 * @vitest-environment jsdom
 *
 * The page-local proposal message panel.
 *
 * The REAL `ConversationThread` is mounted here (only tRPC is mocked), because
 * the property most likely to break is not the chrome — it is FIRST CONTACT: a
 * proposal conversation is a document that does not exist until the first send,
 * so the panel must hand the thread a `proposalId` and post `{ proposalId }`.
 * A panel that rendered an honest "this conversation doesn't exist" dead end
 * would still pass every shell assertion.
 *
 * What is pinned:
 *  - closed renders NOTHING (no dialog, no thread queries);
 *  - open renders a composer and a real, dimmed backdrop;
 *  - first contact: NOT_FOUND is a startable thread, and Send calls
 *    `message.send` with `{ proposalId }` — not `{ conversationId }`;
 *  - ✕ and Escape each close (a backdrop CLICK is HeadlessUI's own outside-click
 *    machinery, which jsdom cannot exercise honestly — it is verified in the
 *    Storybook capture instead, along with the backdrop being visible at all);
 *  - the header links OUT to the workspace (`/admin/messages/<id>`);
 *  - it never fetches the proposal (no duplicated proposal rail).
 *
 * The panel deliberately imports NO router: nothing mocks `next/navigation`
 * here, so a reintroduced `useRouter()`/`useSearchParams()` throws App Router's
 * "expected app router to be mounted" invariant and fails this file loudly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { ProposalMessagePanel } from '@/components/messaging'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { speaker: { _id: 'organizer-1' } } }),
}))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const sendMutate = vi.fn()
const noopMutation = { mutate: vi.fn(), isPending: false, isError: false }

/** Every query the thread issues, recorded so "never fetched" is assertable. */
const getConversationQuery = vi.fn(() => ({
  data: undefined as unknown,
  error: { data: { code: 'NOT_FOUND' } } as unknown,
}))
const listMessagesQuery = vi.fn(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: true,
  isSuccess: false,
  error: { data: { code: 'NOT_FOUND' } } as unknown,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
}))
/**
 * The read the OLD slide-over's proposal rail made. Kept in the mock so the
 * assertion is on a call count rather than on a crash, and so re-adding a rail
 * fails this file instead of silently doubling the proposal on screen.
 */
const proposalGetByIdQuery = vi.fn(() => ({
  data: undefined,
  isLoading: false,
  error: null,
}))

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
      getConversation: { useQuery: () => getConversationQuery() },
      listMessages: { useInfiniteQuery: () => listMessagesQuery() },
      send: {
        useMutation: () => ({
          mutate: sendMutate,
          isPending: false,
          isError: false,
        }),
      },
      setPreference: { useMutation: () => noopMutation },
      setStatus: { useMutation: () => noopMutation },
      setAssignee: { useMutation: () => noopMutation },
      setArchived: { useMutation: () => noopMutation },
    },
    proposal: {
      admin: { getById: { useQuery: () => proposalGetByIdQuery() } },
    },
    sponsor: { crm: { listOrganizers: { useQuery: () => ({ data: [] }) } } },
    notification: {
      markReadByLink: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}))

const onClose = vi.fn()

beforeEach(() => {
  onClose.mockClear()
  sendMutate.mockClear()
  proposalGetByIdQuery.mockClear()
  getConversationQuery.mockClear()
})

afterEach(cleanup)

const openPanel = () =>
  render(<ProposalMessagePanel proposalId="talk-1" open onClose={onClose} />)

describe('ProposalMessagePanel — open/close', () => {
  it('renders nothing at all while closed', () => {
    render(
      <ProposalMessagePanel
        proposalId="talk-1"
        open={false}
        onClose={onClose}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    // Not merely hidden: the thread never mounted, so it issued no query.
    expect(getConversationQuery).not.toHaveBeenCalled()
  })

  it('renders the thread with a composer when open', () => {
    openPanel()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Write a message')).toBeInTheDocument()
    expect(getConversationQuery).toHaveBeenCalled()
  })

  it('dims the page behind it with a VISIBLE backdrop', () => {
    const { baseElement } = openPanel()

    // The old overlay was a bare `fixed inset-0` with no fill: it swallowed
    // every click on the page behind while looking like nothing was there.
    const backdrop = baseElement.querySelector('[aria-hidden="true"].fixed')
    expect(backdrop?.className).toContain('bg-gray-900/50')
  })

  it('closes on the ✕ button', () => {
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Close messages' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    openPanel()
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('ProposalMessagePanel — what it must NOT be', () => {
  it('links OUT to the workspace instead of embedding the full surface', () => {
    openPanel()

    expect(
      screen.getByRole('link', { name: /Open in Messages/ }),
    ).toHaveAttribute('href', '/admin/messages/conversation.proposal.talk-1')
  })

  it('never fetches the proposal (no duplicated proposal rail)', () => {
    openPanel()

    // Value assertion, not an absence of markup: the rail's ONLY data source is
    // this query, so zero calls is proof no proposal detail can be rendered.
    expect(proposalGetByIdQuery).not.toHaveBeenCalled()
  })
})

describe('ProposalMessagePanel — first contact (#914)', () => {
  it('composes the FIRST message on a proposal with no conversation yet', () => {
    openPanel()

    // The server answered NOT_FOUND for both the conversation and its messages
    // (the mocks above): that is the normal state before anyone has posted, and
    // it must read as an empty, startable thread — not as a dead end.
    expect(
      screen.getByText('Start the conversation with the speakers.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/doesn't exist or you don't have access/i),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('Write a message'), {
      target: { value: 'Could you tighten the abstract?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))

    // `proposalId`, not `conversationId`: only the proposal form auto-creates
    // the conversation. A `conversationId` send would fail against a document
    // that does not exist yet.
    expect(sendMutate).toHaveBeenCalledTimes(1)
    expect(sendMutate).toHaveBeenCalledWith({
      proposalId: 'talk-1',
      body: 'Could you tighten the abstract?',
    })
  })
})
