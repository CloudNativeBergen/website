import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { mockDateBeforeEach } from '@/lib/storybook'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { Header } from '@/components/Header'
import type { Conference } from '@/lib/conference/types'
import type { Speaker } from '@/lib/speaker/types'

// These stories render the REAL Header (not a mock shell): the earlier replica
// drifted from the component and visually "passed" while the real mobile
// header wrapped and stacked in production. Session state is supplied via
// next-auth's SessionProvider `session` prop; the bell's tRPC queries are
// served by the msw handlers below.

// Deterministic tRPC responses for the NotificationBell in signed-in states —
// same comma-batch-splitting pattern as DashboardLayout.stories.
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
    type: 'travel_support_update',
    title: 'Travel support approved',
    readAt: null,
    createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    actor: null,
  },
]

const notificationHandlers = [
  http.get('/api/trpc/:procs', ({ params }) =>
    HttpResponse.json(
      String(params.procs)
        .split(',')
        .map((proc) =>
          proc === 'notification.list'
            ? { result: { data: notificationItems() } }
            : proc === 'notification.unreadCount'
              ? { result: { data: 3 } }
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

const organizerSpeaker = {
  ...(speaker as object),
  isOrganizer: true,
} as unknown as Speaker

const makeSession = (s: Speaker): Session =>
  ({
    user: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      picture: 'https://placehold.co/40x40/4f46e5/fff/png?text=JD',
    },
    speaker: s,
    account: {
      provider: 'github',
      providerAccountId: '12345',
      type: 'oauth',
    },
    expires: '2027-01-01T00:00:00.000Z',
  }) as unknown as Session

// Minimal Conference fixture carrying every field the Header reads
// (dates/location for the marquee, domains for the previous-year link,
// registration state for the ticket button).
const makeConference = (overrides: Record<string, unknown> = {}): Conference =>
  ({
    _id: 'conf-1',
    title: 'Cloud Native Day Bergen',
    city: 'Bergen',
    country: 'Norway',
    startDate: '2026-09-15',
    endDate: '2026-09-15',
    domains: ['2026.cloudnativebergen.dev'],
    registrationEnabled: true,
    registrationLink: 'https://example.com/tickets',
    ...overrides,
  }) as unknown as Conference

const conference = makeConference()
const pastConference = makeConference({
  startDate: '2024-10-30',
  endDate: '2024-10-30',
  domains: ['2024.cloudnativebergen.dev'],
})

const meta = {
  title: 'Components/Layout/Header',
  component: Header,
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  parameters: {
    msw: { handlers: notificationHandlers },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Main site header (the REAL component): conference logo, date/location marquee, registration button, theme toggle, the notification bell (signed-in only, via `PublicHeaderBell`), and the user avatar menu. Session state is injected through `SessionProvider`; the bell’s tRPC calls are msw-mocked.',
      },
    },
  },
} satisfies Meta<typeof Header>

export default meta
type Story = StoryObj<typeof meta>

function withProviders(session: Session | null, c: Conference) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <TRPCProvider>
        <div className="bg-white dark:bg-gray-950">
          <Header c={c} />
        </div>
      </TRPCProvider>
    </SessionProvider>
  )
}

export const Default: Story = {
  args: { c: conference },
  render: () => withProviders(null, conference),
}

export const LoggedIn: Story = {
  args: { c: conference },
  render: () => withProviders(makeSession(speaker), conference),
}

export const LoggedInOrganizer: Story = {
  args: { c: conference },
  render: () => withProviders(makeSession(organizerSpeaker), conference),
}

export const PastEvent: Story = {
  args: { c: pastConference },
  render: () => withProviders(null, pastConference),
}

export const PastEventLoggedIn: Story = {
  args: { c: pastConference },
  render: () => withProviders(makeSession(speaker), pastConference),
}
