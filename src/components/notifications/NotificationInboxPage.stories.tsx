import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { NotificationList } from './NotificationList'
import { mockDateBeforeEach } from '@/lib/storybook'
import type { NotificationItem } from '@/lib/notification/types'

/**
 * Visual stories for the STANDALONE notifications page (`/notifications`),
 * rendered through the shared presentational {@link NotificationList} exactly as
 * {@link NotificationInbox} wires it: full-page card, `disableInnerScroll` so the
 * page (not a nested region) scrolls, an audience-aware Messages footer, the
 * settings gear, and — crucially — NO `linklessHref`, so a linkless system row
 * (e.g. "Test notification") stays an inert, inline-READABLE row on the page.
 */
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString()

const makePageItems = (): NotificationItem[] => [
  {
    // A genuinely LINKLESS system notification: on the page it must be readable
    // inline (an inert row), which is the whole reason the page exists.
    id: 'notification.system.linkless.1',
    type: 'system',
    title: 'Test notification',
    message:
      'Your push, hub, and badge are working — and this row has no link.',
    readAt: null,
    createdAt: minutesAgo(1),
    actor: null,
  },
  {
    id: 'p1',
    type: 'proposal_status_changed',
    title: 'Your proposal was accepted',
    message:
      'Congratulations! "Scaling Kubernetes to 10,000 nodes" has been accepted for the main track.',
    link: '/cfp/proposal/p1',
    readAt: null,
    createdAt: minutesAgo(6),
    actor: { _id: 'a1', name: 'Program Committee' },
  },
  {
    id: 'm1',
    type: 'message_received',
    title: '3 new messages — Scaling Kubernetes to 10,000 nodes',
    message: 'Sounds great — let’s lock in the demo cluster size today.',
    link: '/cfp/proposal/p1#messages',
    readAt: null,
    createdAt: minutesAgo(24),
    actor: { _id: 'a3', name: 'Maria Jensen' },
  },
  {
    id: 't1',
    type: 'travel_support_update',
    title: 'Travel support approved',
    message: 'Your travel reimbursement request has been approved.',
    link: '/cfp/expense',
    readAt: minutesAgo(60 * 26),
    createdAt: minutesAgo(60 * 30),
    actor: null,
  },
  {
    id: 's1',
    type: 'system',
    title: 'Schedule published',
    readAt: minutesAgo(60 * 24 * 9),
    createdAt: minutesAgo(60 * 24 * 10),
    actor: null,
  },
]

const pageArgs = {
  onMarkAllRead: fn(),
  onItemClick: fn(),
  onMessagesClick: fn(),
  onSettingsClick: fn(),
  settingsHref: '/cfp/profile#notification-settings',
  messagesHref: '/cfp/messages',
  disableInnerScroll: true,
}

/** The page shell NotificationInbox renders around the shared list. */
function PageShell({
  items,
  unreadCount,
}: {
  items: NotificationItem[]
  unreadCount: number
}) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
          <NotificationList
            {...pageArgs}
            items={items}
            unreadCount={unreadCount}
          />
        </div>
      </div>
    </div>
  )
}

const meta = {
  title: 'Components/Notifications/NotificationInboxPage',
  component: NotificationList,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: { layout: 'fullscreen' },
  // Placeholder required-props; every story below drives the real content via
  // its own `render`, so these are never actually shown.
  args: { items: [], unreadCount: 0, onMarkAllRead: fn(), onItemClick: fn() },
} satisfies Meta<typeof NotificationList>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
  render: () => <PageShell items={makePageItems()} unreadCount={3} />,
}

// Dark variant: a `.dark` ancestor enables every `dark:` utility beneath it
// (Tailwind class strategy), and the page background matches the dark shell.
export const PopulatedDark: Story = {
  parameters: { backgrounds: { default: 'dark' } },
  render: () => (
    <div className="dark bg-gray-950">
      <PageShell items={makePageItems()} unreadCount={3} />
    </div>
  ),
}

export const Empty: Story = {
  render: () => <PageShell items={[]} unreadCount={0} />,
}

export const EmptyDark: Story = {
  parameters: { backgrounds: { default: 'dark' } },
  render: () => (
    <div className="dark bg-gray-950">
      <PageShell items={[]} unreadCount={0} />
    </div>
  ),
}
