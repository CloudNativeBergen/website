import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { mockDateBeforeEach } from '@/lib/storybook'
import { ConversationList } from '@/components/messaging'
import type { ConversationListItem } from '@/lib/messaging/types'

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const makeItems = (): ConversationListItem[] => [
  {
    _id: 'conversation.proposal.talk-1',
    conversationType: 'proposal',
    subject: 'Scaling Kubernetes to 10,000 nodes',
    proposalId: 'talk-1',
    proposalTitle: 'Scaling Kubernetes to 10,000 nodes',
    createdAt: minutesAgo(60 * 24 * 3),
    lastMessageAt: minutesAgo(24),
  },
  {
    _id: 'conversation.abc123',
    conversationType: 'general',
    subject: 'Question about speaker travel',
    createdAt: minutesAgo(60 * 24 * 2),
    lastMessageAt: minutesAgo(60 * 5),
  },
  {
    _id: 'conversation.proposal.talk-2',
    conversationType: 'proposal',
    subject: 'Designing for Failure',
    proposalId: 'talk-2',
    proposalTitle: 'Designing for Failure',
    createdAt: minutesAgo(60 * 24 * 10),
    lastMessageAt: minutesAgo(60 * 24 * 4),
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

/** Speaker inbox — rows link to `/cfp/...`. */
export const SpeakerInbox: Story = {
  args: { items: [], isOrganizer: false },
  render: (args) => <ConversationList {...args} items={makeItems()} />,
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
  args: { items: [], isOrganizer: false },
  parameters: { dark: true },
  render: (args) => <ConversationList {...args} items={makeItems()} />,
}
