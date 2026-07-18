import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { NotificationList } from './NotificationList'
import type { NotificationItem } from '@/lib/notification/types'

// createdAt values are computed relative to RENDER time (the factory below is
// invoked per story render, not at module load) so the compact relative labels
// are deterministic in the visual snapshot: "4m ago" is always "4m ago", no
// matter how long the Storybook module has been loaded.
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const makeItems = (): NotificationItem[] => [
  {
    id: '1',
    type: 'proposal_status_changed',
    title: 'Your proposal was accepted',
    message:
      'Congratulations! "Scaling Kubernetes to 10,000 nodes" has been accepted for the main track.',
    link: '/cfp/proposal/1',
    readAt: null,
    createdAt: minutesAgo(4),
    actor: { _id: 'a1', name: 'Program Committee' },
  },
  {
    id: '2',
    type: 'proposal_comment',
    title: 'New comment on your proposal',
    message: 'Could you clarify the target audience for this session?',
    link: '/cfp/proposal/2',
    readAt: null,
    createdAt: minutesAgo(95),
    actor: {
      _id: 'a2',
      name: 'Maria Jensen',
      image: '/images/default-avatar.png',
    },
  },
  {
    id: '3',
    type: 'travel_support_update',
    title: 'Travel support approved',
    message: 'Your travel reimbursement request has been approved.',
    link: '/cfp/expense',
    readAt: minutesAgo(60 * 26),
    createdAt: minutesAgo(60 * 30),
    actor: null,
  },
  {
    id: '4',
    type: 'system',
    title: 'Schedule published',
    readAt: minutesAgo(60 * 24 * 9),
    createdAt: minutesAgo(60 * 24 * 10),
    actor: null,
  },
]

const meta = {
  title: 'Components/Notifications/NotificationList',
  component: NotificationList,
  parameters: { layout: 'padded' },
  args: {
    onMarkAllRead: fn(),
    onItemClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof NotificationList>

export default meta
type Story = StoryObj<typeof meta>

export const UnreadAndRead: Story = {
  args: {
    // Placeholder for typing; the render below rebuilds items at render time so
    // the relative-time labels are stable.
    items: [],
    unreadCount: 2,
  },
  render: (args) => <NotificationList {...args} items={makeItems()} />,
}

export const Empty: Story = {
  args: {
    items: [],
    unreadCount: 0,
  },
}

export const Loading: Story = {
  args: {
    items: [],
    isLoading: true,
    unreadCount: 0,
  },
}

export const LoadError: Story = {
  args: {
    items: [],
    isError: true,
    unreadCount: 0,
  },
}
