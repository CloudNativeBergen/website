import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { NotificationList } from './NotificationList'
import { mockDateBeforeEach } from '@/lib/storybook'
import type { NotificationItem } from '@/lib/notification/types'

// createdAt values are computed relative to RENDER time (the factory below is
// invoked per story render, not at module load) so the compact relative labels
// are deterministic in the visual snapshot: "4m ago" is always "4m ago", no
// matter how long the Storybook module has been loaded.
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const makeItems = (): NotificationItem[] => [
  {
    // A COLLAPSED message notification (M5): one persistent item per
    // conversation whose title carries the accumulated unread count.
    id: 'notification.message.conversation.proposal.p1.sp-1',
    type: 'message_received',
    title: '3 new messages — Scaling Kubernetes to 10,000 nodes',
    message: 'Sounds great — let’s lock in the demo cluster size today.',
    link: '/cfp/proposal/p1#messages',
    readAt: null,
    createdAt: minutesAgo(1),
    actor: { _id: 'a3', name: 'Maria Jensen' },
  },
  {
    // DIRECT-THREAD IDENTITY on the hub (V1a): a collapsed message notification
    // for an organizer-initiated thread that personally addresses the recipient
    // — the "Direct message" title carries the distinction, so the panel needs
    // no extra styling; this row verifies it renders and reads well.
    id: 'notification.message.conversation.gen-42.sp-1',
    type: 'message_received',
    title: 'Direct message from Ola Organizer',
    message: 'Quick question about your travel dates before we book.',
    link: '/cfp/messages/conversation.gen-42',
    readAt: null,
    createdAt: minutesAgo(2),
    actor: { _id: 'a4', name: 'Ola Organizer' },
  },
  {
    // The self-notification written by `push.sendTest` (a `system` type) so a
    // speaker's "send test" appears in the hub, not just as an OS push. Renders
    // generically (title/message, no actor) and deep-links to the settings card.
    id: 'notification.test.sp-1',
    type: 'system',
    title: 'Test notification',
    message: 'Your push, hub, and badge are working.',
    link: '/cfp/profile#notification-settings',
    readAt: null,
    createdAt: minutesAgo(1),
    actor: null,
  },
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
  // AGENTS.md deterministic-dates rule: pin Date so the relative-time labels
  // ("4m ago") are absolutely fixed for Chromatic.
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
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

// Also carries the audience-aware "View all messages" footer quick link and
// the header settings gear (both present only when their href prop is
// provided; the Empty story shows them absent).
export const UnreadAndRead: Story = {
  args: {
    // Placeholder for typing; the render below rebuilds items at render time so
    // the relative-time labels are stable.
    items: [],
    unreadCount: 3,
    messagesHref: '/cfp/messages',
    onMessagesClick: fn(),
    settingsHref: '/cfp/profile#notification-settings',
    onSettingsClick: fn(),
    // Panel wiring: a "View all notifications" footer link, and linkless rows
    // route to the standalone page where they're readable.
    viewAllHref: '/notifications',
    onViewAllClick: fn(),
    linklessHref: '/notifications',
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

// A full page was returned, so keyset pagination offers a "Show more" button.
export const HasMore: Story = {
  args: {
    items: [],
    unreadCount: 2,
    hasMore: true,
    onShowMore: fn(),
  },
  render: (args) => <NotificationList {...args} items={makeItems()} />,
}

// While an admin impersonates a speaker the panel is read-only: "Mark all read"
// is replaced by a subtle hint and no read-state mutations can fire.
export const ReadOnlyImpersonating: Story = {
  args: {
    items: [],
    unreadCount: 2,
    readOnly: true,
  },
  render: (args) => <NotificationList {...args} items={makeItems()} />,
}
