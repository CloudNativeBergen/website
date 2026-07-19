import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import type { Speaker } from '@/lib/speaker/types'

// These stories render the REAL NotificationBell (not a mock shell): a prior
// replica of the DashboardLayout bell drifted from production, so the badge cap
// ('9+') and the unread states are verified against the actual component here.
// Session comes from next-auth's SessionProvider; the bell's `unreadCount`
// tRPC query is served by the msw handlers below (same comma-batch-splitting
// pattern as Header.stories / DashboardLayout.stories).

const notificationItems = () => [
  {
    id: 'n1',
    type: 'proposal_status_changed',
    title: 'Your proposal was accepted',
    message: 'Congratulations! "Scaling Kubernetes" was accepted.',
    link: '/cfp/proposal/1',
    readAt: null,
    createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    actor: { _id: 'a1', name: 'Program Committee' },
  },
  {
    id: 'n2',
    type: 'message_received',
    title: 'New message from the organizers',
    readAt: null,
    createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    actor: null,
  },
]

/** msw handlers answering the bell's `unreadCount` (and the panel's `list`)
 * for a given unread total — the badge reads only `unreadCount`. */
const makeHandlers = (unread: number) => [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) =>
          proc === 'notification.unreadCount'
            ? { result: { data: unread } }
            : proc === 'notification.list'
              ? { result: { data: notificationItems() } }
              : { result: { data: null } },
        ),
    ),
  ),
]

const speaker = {
  _id: 'speaker-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  slug: 'jane-doe',
} as unknown as Speaker

const session: Session = {
  user: {
    name: 'Jane Doe',
    email: 'jane@example.com',
  },
  speaker,
  expires: '2027-01-01T00:00:00.000Z',
} as unknown as Session

const meta = {
  title: 'Components/Notifications/NotificationBell',
  component: NotificationBell,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The notification hub entry point (the REAL component): a bell with an unread badge that opens the inbox panel. The badge caps at `9+`; it is absent at zero unread. Session is injected via `SessionProvider`; the `unreadCount` tRPC query is msw-mocked per story.',
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <SessionProvider session={session} refetchOnWindowFocus={false}>
        <TRPCProvider>
          <NotificationProvider>
            <div
              className={
                ctx.parameters.dark
                  ? 'dark flex justify-center bg-gray-950 p-10'
                  : 'flex justify-center bg-white p-10'
              }
            >
              <Story />
            </div>
          </NotificationProvider>
        </TRPCProvider>
      </SessionProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof NotificationBell>

export default meta
type Story = StoryObj<typeof meta>

/** Zero unread — no badge, just the bell. */
export const Unread0: Story = {
  parameters: { msw: { handlers: makeHandlers(0) } },
}

/** A low count renders the exact number in the badge. */
export const Unread3: Story = {
  parameters: { msw: { handlers: makeHandlers(3) } },
}

/** Past the cap: any count over nine collapses to '9+'. */
export const Unread12: Story = {
  parameters: { msw: { handlers: makeHandlers(12) } },
}

export const Unread0Dark: Story = {
  parameters: { dark: true, msw: { handlers: makeHandlers(0) } },
}

export const Unread3Dark: Story = {
  parameters: { dark: true, msw: { handlers: makeHandlers(3) } },
}

export const Unread12Dark: Story = {
  parameters: { dark: true, msw: { handlers: makeHandlers(12) } },
}
