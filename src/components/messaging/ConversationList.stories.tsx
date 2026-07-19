import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { mockDateBeforeEach } from '@/lib/storybook'
import { ConversationList } from '@/components/messaging'
import type { ConversationListItem } from '@/lib/messaging/types'

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

/** The viewer in the "You: " stories (last message on row 1 is theirs). */
const CALLER_ID = 'speaker-me'

/**
 * A representative Who/What/When mix: a proposal thread whose last message is
 * the viewer's own ("You: "), a general thread answered by a named organizer
 * (avatar via image), and a proposal thread from the collective 'Organizers'
 * counterpart (group glyph, no single person).
 */
const makeItems = (
  unread: [number, number, number] = [0, 0, 0],
): ConversationListItem[] => [
  {
    _id: 'conversation.proposal.talk-1',
    conversationType: 'proposal',
    subject: 'Scaling Kubernetes to 10,000 nodes',
    proposalId: 'talk-1',
    proposalTitle: 'Scaling Kubernetes to 10,000 nodes',
    createdAt: minutesAgo(60 * 24 * 3),
    lastMessageAt: minutesAgo(24),
    unreadCount: unread[0],
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
    unreadCount: unread[1],
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
    unreadCount: unread[2],
    lastMessage: {
      authorId: 'organizer-2',
      authorName: 'Grace Hopper',
      excerpt: 'Could you keep the demo under ten minutes?',
    },
    counterpart: { name: 'Organizers' },
  },
]

/** Overflow guards: an unbroken subject and a long snippet must both truncate.
 * A FUNCTION (like `makeItems`) so the relative times are computed against the
 * mocked story clock, keeping the labels deterministic. */
const makeLongItems = (): ConversationListItem[] => [
  {
    _id: 'conversation.long-1',
    conversationType: 'general',
    subject:
      'A very long subject about accommodation, travel reimbursement, workshop equipment and the speaker dinner on Thursday evening',
    createdAt: minutesAgo(60 * 24),
    lastMessageAt: minutesAgo(30),
    unreadCount: 2,
    lastMessage: {
      authorId: 'organizer-1',
      authorName: 'Ola Organizer',
      excerpt:
        'This is a deliberately long snippet that goes on and on about the details of the venue, the AV setup, the rehearsal s…',
    },
    counterpart: { name: 'Ola Organizer' },
  },
  {
    _id: 'conversation.proposal.long-2',
    conversationType: 'proposal',
    subject:
      'Observability-Driven-Development-Without-Tears-A-Practitioners-Guide-To-Instrumenting-Everything',
    proposalId: 'talk-9',
    proposalTitle:
      'Observability-Driven-Development-Without-Tears-A-Practitioners-Guide-To-Instrumenting-Everything',
    createdAt: minutesAgo(60 * 48),
    lastMessageAt: minutesAgo(60 * 2),
    unreadCount: 0,
    lastMessage: {
      authorId: CALLER_ID,
      authorName: 'Kari Nordmann',
      excerpt:
        'Supercalifragilisticexpialidocious-unbroken-snippet-string-that-must-truncate-not-wrap-or-overflow-the-row-container',
    },
    counterpart: { name: 'Kari Nordmann' },
  },
]

const meta = {
  title: 'Components/Messaging/ConversationList',
  component: ConversationList,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: { layout: 'padded' },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : ''}>
        <div className="mx-auto w-full max-w-2xl">
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ConversationList>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Speaker inbox — rows link to `/cfp/...`. A full Who/What/When mix: row 1 is
 * read with the viewer's own last message ("You: "), row 2 unread (count pill +
 * organizer avatar), row 3 unread past the 9+ cap (proposal chip + the
 * collective Organizers glyph).
 */
export const SpeakerInbox: Story = {
  args: { items: [], isOrganizer: false, callerId: CALLER_ID },
  render: (args) => (
    <ConversationList {...args} items={makeItems([0, 2, 12])} />
  ),
}

/** Organizer inbox — same data, rows link to `/admin/...`. */
export const OrganizerInbox: Story = {
  args: { items: [], isOrganizer: true },
  render: (args) => <ConversationList {...args} items={makeItems()} />,
}

export const Empty: Story = {
  args: { items: [], isOrganizer: false },
}

export const Loading: Story = {
  args: { items: [], isOrganizer: false, isLoading: true },
}

export const HasMore: Story = {
  args: { items: [], isOrganizer: false, hasMore: true },
  render: (args) => <ConversationList {...args} items={makeItems()} />,
}

export const SpeakerInboxDark: Story = {
  args: { items: [], isOrganizer: false, callerId: CALLER_ID },
  parameters: { dark: true },
  render: (args) => (
    <ConversationList {...args} items={makeItems([0, 2, 12])} />
  ),
}

/**
 * Mixed read/unread — unread rows carry a blue count pill and a bolded subject;
 * read rows are unadorned. The last count exceeds 9 to show the `9+` cap.
 */
export const UnreadMixed: Story = {
  args: { items: [], isOrganizer: true },
  render: (args) => (
    <ConversationList {...args} items={makeItems([3, 0, 12])} />
  ),
}

export const UnreadMixedDark: Story = {
  args: { items: [], isOrganizer: true },
  parameters: { dark: true },
  render: (args) => (
    <ConversationList {...args} items={makeItems([3, 0, 12])} />
  ),
}

/**
 * Truncation guard: a long unbroken subject and a long snippet must both stay
 * on one line (ellipsized) without stretching the row or the container.
 */
export const LongContent: Story = {
  args: { items: [], isOrganizer: false, callerId: CALLER_ID },
  render: (args) => <ConversationList {...args} items={makeLongItems()} />,
}

export const LongContentDark: Story = {
  args: { items: [], isOrganizer: false, callerId: CALLER_ID },
  parameters: { dark: true },
  render: (args) => <ConversationList {...args} items={makeLongItems()} />,
}
