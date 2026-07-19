import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { MessagesInbox } from '@/components/messaging'
import type { ConversationListItem } from '@/lib/messaging/types'
import type { Speaker } from '@/lib/speaker/types'

// Renders the REAL MessagesInbox container (not just its presentational
// ConversationList): the inbox owns the `message.listConversations` infinite
// query and the "You: " snippet prefix derived from the session. The rows'
// fixture shapes mirror ConversationList.stories; here they arrive through
// msw so the container's own data wiring is exercised, not bypassed.

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

/** The signed-in viewer — row 1's last message is theirs, so it renders "You: ". */
const CALLER_ID = 'speaker-me'

const makeItems = (): ConversationListItem[] => [
  {
    _id: 'conversation.proposal.talk-1',
    conversationType: 'proposal',
    subject: 'Scaling Kubernetes to 10,000 nodes',
    proposalId: 'talk-1',
    proposalTitle: 'Scaling Kubernetes to 10,000 nodes',
    createdAt: minutesAgo(60 * 24 * 3),
    lastMessageAt: minutesAgo(24),
    unreadCount: 0,
    lastMessage: {
      authorId: CALLER_ID,
      authorName: 'Kari Nordmann',
      excerpt: 'Thanks — I have updated the abstract with the new numbers.',
    },
    counterpart: { name: 'Kari Nordmann' },
  },
  {
    _id: 'conversation.abc123',
    conversationType: 'general',
    subject: 'Question about speaker travel',
    createdAt: minutesAgo(60 * 24 * 2),
    lastMessageAt: minutesAgo(60 * 5),
    unreadCount: 2,
    lastMessage: {
      authorId: 'organizer-1',
      authorName: 'Ola Organizer',
      excerpt:
        'We cover flights booked before June — send us the receipt and we will sort it out.',
    },
    counterpart: {
      name: 'Ola Organizer',
      image: '/images/default-avatar.png',
    },
  },
  {
    _id: 'conversation.proposal.talk-2',
    conversationType: 'proposal',
    subject: 'Designing for Failure',
    proposalId: 'talk-2',
    proposalTitle: 'Designing for Failure',
    createdAt: minutesAgo(60 * 24 * 10),
    lastMessageAt: minutesAgo(60 * 24 * 4),
    unreadCount: 12,
    lastMessage: {
      authorId: 'organizer-2',
      authorName: 'Grace Hopper',
      excerpt: 'Could you keep the demo under ten minutes?',
    },
    counterpart: { name: 'Organizers' },
  },
]

/** msw handler answering the inbox's `message.listConversations` infinite query
 * with a single page (fewer than PAGE_SIZE rows ⇒ no "show more"). */
const conversationHandlers = (items: ConversationListItem[]) => [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) =>
          proc === 'message.listConversations'
            ? { result: { data: items } }
            : { result: { data: null } },
        ),
    ),
  ),
]

const speaker = {
  _id: CALLER_ID,
  name: 'Jane Doe',
  email: 'jane@example.com',
  slug: 'jane-doe',
} as unknown as Speaker

const session: Session = {
  user: { name: 'Jane Doe', email: 'jane@example.com' },
  speaker,
  expires: '2027-01-01T00:00:00.000Z',
} as unknown as Session

const meta = {
  title: 'Components/Messaging/MessagesInbox',
  component: MessagesInbox,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The inbox container mounted on both `/cfp/messages` (speaker) and `/admin/messages` (organizer). Loads the caller’s conversations via `message.listConversations` and renders `ConversationList`; the row links are audience-derived. Data is msw-mocked per story.',
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <SessionProvider session={session} refetchOnWindowFocus={false}>
        <TRPCProvider>
          <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : 'p-4'}>
            <div className="mx-auto w-full max-w-2xl">
              <Story />
            </div>
          </div>
        </TRPCProvider>
      </SessionProvider>
    ),
  ],
} satisfies Meta<typeof MessagesInbox>

export default meta
type Story = StoryObj<typeof meta>

/** Speaker audience with no conversations yet — the empty state. */
export const SpeakerEmpty: Story = {
  args: { audience: 'speaker' },
  parameters: { msw: { handlers: conversationHandlers([]) } },
}

/** Organizer audience with no conversations yet — the empty state. */
export const OrganizerEmpty: Story = {
  args: { audience: 'organizer' },
  parameters: { msw: { handlers: conversationHandlers([]) } },
}

/** Speaker inbox with a representative Who/What/When mix (rows link to /cfp). */
export const SpeakerPopulated: Story = {
  args: { audience: 'speaker' },
  parameters: { msw: { handlers: conversationHandlers(makeItems()) } },
}

export const SpeakerEmptyDark: Story = {
  args: { audience: 'speaker' },
  parameters: { dark: true, msw: { handlers: conversationHandlers([]) } },
}

export const SpeakerPopulatedDark: Story = {
  args: { audience: 'speaker' },
  parameters: {
    dark: true,
    msw: { handlers: conversationHandlers(makeItems()) },
  },
}
