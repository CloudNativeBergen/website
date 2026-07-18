import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { mockDateBeforeEach } from '@/lib/storybook'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import { UserMenu } from '@/components/UserMenu'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import type { Speaker } from '@/lib/speaker/types'

// Deterministic tRPC responses for the REAL NotificationBell rendered in the
// signed-in header states. Mirrors the pattern in DashboardLayout.stories:
// splits httpBatchLink's comma-batched GET paths so `notification.unreadCount`
// resolves to 3 (badge) and `notification.list` to a small inbox.
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

const mockSpeaker: Speaker = {
  _id: 'spk-1',
  _rev: 'rev-1',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  name: 'Jane Doe',
  email: 'jane@example.com',
  slug: 'jane-doe',
  isOrganizer: false,
}

const meta = {
  title: 'Components/Layout/Header',
  // Pin Date so the msw notification fixtures (and their relative-time labels)
  // are deterministic, per the AGENTS.md deterministic-dates rule.
  beforeEach: mockDateBeforeEach(new Date('2026-07-18T12:00:00Z')),
  // Wrap in the real (httpBatchLink) TRPCProvider so the bell's queries are
  // comma-batched into a single request that `notificationHandlers` splits —
  // matching the DashboardLayout.stories pattern.
  decorators: [
    (Story) => (
      <TRPCProvider>
        <Story />
      </TRPCProvider>
    ),
  ],
  parameters: {
    msw: { handlers: notificationHandlers },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Main site header with conference logo, date/location info, registration button, theme toggle, the notification bell (signed-in only), and the role-aware user avatar menu (see `Components/Layout/UserMenu`). Uses `useSession` for authentication state — stories use a mock wrapper to demonstrate logged-out, signed-in speaker, and organizer states. In production the bell is gated by `PublicHeaderBell` on `session?.speaker`; the mock shell below gates on the `isLoggedIn` prop, and the gate itself is covered by the `PublicHeaderBell` unit test.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function MockHeader({
  isLoggedIn = false,
  isOrganizer = false,
  isPast = false,
  showRegistration = true,
}: {
  isLoggedIn?: boolean
  isOrganizer?: boolean
  isPast?: boolean
  showRegistration?: boolean
}) {
  return (
    <header className="relative z-50 flex-none lg:pt-11">
      <Container className="flex flex-wrap items-center justify-center sm:justify-between lg:flex-nowrap">
        <div className="mt-10 lg:mt-0">
          <ConferenceLogo
            variant="horizontal"
            className="h-14 w-auto text-brand-slate-gray dark:text-white"
          />
        </div>
        <div className="font-jetbrains order-first -mx-4 flex flex-auto basis-full overflow-x-auto border-b border-brand-cloud-blue/10 py-4 text-sm whitespace-nowrap sm:-mx-6 lg:order-0 lg:mx-0 lg:basis-auto lg:border-0 lg:py-0">
          <div
            className={`mx-auto flex items-center gap-4 px-4 ${isPast ? 'text-brand-cloud-gray' : 'text-brand-cloud-blue'}`}
          >
            <p>
              <time dateTime="2026-09-15">September 15, 2026</time>
            </p>
            <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
            <p>Bergen, Norway</p>
            {isPast && (
              <span className="ml-2 rounded-full bg-brand-cloud-gray/20 px-2 py-0.5 text-sm font-semibold text-brand-cloud-gray">
                Past Event
              </span>
            )}
            <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
            <a
              href="#"
              className="text-brand-cloud-blue hover:text-brand-slate-gray"
            >
              2025 Conference
            </a>
          </div>
        </div>
        <div className="hidden whitespace-nowrap sm:mt-10 sm:flex lg:mt-0 lg:grow lg:basis-0 lg:justify-end">
          {showRegistration && (
            <a
              href="#"
              className="inline-flex items-center justify-center rounded-full bg-brand-cloud-blue px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-cloud-blue/90"
            >
              Get your ticket
            </a>
          )}
        </div>
        <div className="mt-10 ml-10 sm:flex lg:mt-0 lg:ml-4">
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {/* The REAL NotificationBell, shown only in signed-in states — its
                unreadCount/list queries are stubbed by the msw handlers above.
                Production gates this via PublicHeaderBell on `session?.speaker`;
                here the mock shell gates on the `isLoggedIn` prop so the
                signed-out variants render no bell (no layout shift). */}
            {isLoggedIn && <NotificationBell />}
            {isLoggedIn ? (
              <UserMenu
                name="Jane Doe"
                picture="https://placehold.co/40x40/4f46e5/fff/png?text=JD"
                speaker={{ ...mockSpeaker, isOrganizer }}
                account={{
                  provider: 'github',
                  providerAccountId: '12345',
                  type: 'oauth',
                }}
              />
            ) : (
              <a href="/cfp/list" className="flex items-center">
                <UserCircleIcon className="h-10 w-10 text-brand-slate-gray dark:text-white" />
              </a>
            )}
          </div>
        </div>
      </Container>
    </header>
  )
}

export const Default: Story = {
  render: () => <MockHeader />,
  parameters: {
    docs: {
      description: {
        story: 'Default header with registration button and no user session.',
      },
    },
  },
}

export const LoggedIn: Story = {
  render: () => <MockHeader isLoggedIn />,
  parameters: {
    docs: {
      description: {
        story:
          'Signed-in speaker — the avatar opens the role-aware user menu (CfP links, current sign-in provider, sign out). No Admin section.',
      },
    },
  },
}

export const LoggedInOrganizer: Story = {
  render: () => <MockHeader isLoggedIn isOrganizer />,
  parameters: {
    docs: {
      description: {
        story:
          'Signed-in organizer — the avatar menu additionally exposes the gated Admin section (shown only when `speaker.isOrganizer`).',
      },
    },
  },
}

export const PastEvent: Story = {
  render: () => <MockHeader isPast showRegistration={false} />,
  parameters: {
    docs: {
      description: {
        story:
          'Header for a past conference. Registration button is hidden and date/location text is muted with a "Past Event" badge.',
      },
    },
  },
}

export const PastEventLoggedIn: Story = {
  render: () => <MockHeader isPast isLoggedIn showRegistration={false} />,
}
