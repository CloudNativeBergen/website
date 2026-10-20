import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, within } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { mockDateBeforeEach } from '@/lib/storybook/mockDate'
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'
import type { ProposalWithWorkshopData } from '@/lib/workshop/types'
import { WorkshopTicketsSection } from './tickets/WorkshopTicketsSection'
import { WorkshopsClientPage } from './WorkshopsClientPage'

/**
 * `/admin/workshops` as a whole (#1452): header, "Needs attention" (only when
 * something does), the workshops, the ticket holders, sponsor early access,
 * and the settings last.
 *
 * DARK MODE is resolved by THIS FILE'S decorator from `parameters.theme`.
 * PHONE WIDTH needs `viewport.defaultViewport: 'phone'`.
 */
const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const at = (procedure: string) => `/api/trpc/workshop.admin.${procedure}`

const workshop = (
  _id: string,
  title: string,
  room: string,
  startTime: string,
  confirmed: number,
  capacity: number,
) =>
  ({
    _id,
    title,
    format: 'workshop_120',
    capacity,
    signups: confirmed,
    waitlistCount: 0,
    available: capacity - confirmed,
    speakers: [],
    date: '2026-10-28',
    startTime,
    endTime: `${Number(startTime.slice(0, 2)) + 2}:00`,
    room,
  }) as unknown as ProposalWithWorkshopData

const WORKSHOPS = [
  workshop('ws-1', 'Kubernetes Operators 101', 'Room A', '10:00', 28, 30),
  workshop('ws-2', 'eBPF for the curious', 'Room B', '10:00', 30, 30),
  workshop('ws-3', 'GitOps with Flux', 'Room A', '13:00', 12, 25),
]

const summary = http.get(at('getSummary'), () =>
  trpc({
    success: true,
    data: {
      workshops: WORKSHOPS.map((w, i) => ({
        workshopId: w._id,
        workshopTitle: w.title,
        capacity: w.capacity,
        totalSignups: w.signups + i * 2,
        confirmedSignups: w.signups,
        waitlistSignups: i * 2,
        utilization: (w.signups / w.capacity) * 100,
      })),
      totals: {
        totalWorkshops: 3,
        uniqueParticipants: 61,
        totalSignups: 76,
        totalConfirmed: 70,
        totalWaitlist: 6,
      },
    },
  }),
)

const holders = (flagged: number) =>
  http.get(at('ticketHolders'), () =>
    trpc({
      conferenceId: 'conf-1',
      available: true,
      configured: true,
      holders: 84,
      confirmed: 58,
      waitlistOnly: 3,
      notSignedUp: 23,
      flagged: Array.from({ length: flagged }, (_, i) => ({
        email: `walk-in${i}@example.com`,
        name: `Walk-in ${i + 1}`,
        signups: [],
      })),
      lockedOut: [],
    }),
  )

const handlers = (flagged: number) => [
  summary,
  holders(flagged),
  http.get(at('listEarlySignups'), () =>
    trpc({
      signups: [
        {
          _id: 'su-1',
          userName: 'Ada Lovelace',
          userEmail: 'ada@acme.example',
          status: 'confirmed',
          signedUpAt: '2026-09-20T08:00:00Z',
          workshop: { _id: 'ws-1', title: 'Kubernetes Operators 101' },
          earlyAccess: {
            sponsor: { _id: 'sfc-acme', name: 'Acme AS' },
          },
        },
      ],
      sponsors: [{ _id: 'sfc-acme', name: 'Acme AS' }],
    }),
  ),
  http.get(at('earlyAccessBulkPreview'), () =>
    trpc({ count: 4, refusal: null }),
  ),
]

const answered = buildWorkshopTicketList(
  ['Two-day pass', 'Day pass'],
  [
    { typeName: 'Two-day pass', grantsWorkshop: true },
    { typeName: 'Day pass', grantsWorkshop: false },
  ],
)
const undecided = buildWorkshopTicketList(
  ['Two-day pass', 'Day pass', 'Student'],
  [
    { typeName: 'Two-day pass', grantsWorkshop: true },
    { typeName: 'Day pass', grantsWorkshop: false },
  ],
)

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopsPage',
  component: WorkshopsClientPage,
  // Inside the registration window below: the card's badge reads the clock.
  beforeEach: mockDateBeforeEach(new Date('2026-09-25T12:00:00Z')),
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: handlers(0) },
  },
  args: {
    conferenceId: 'conf-1',
    initialWorkshops: WORKSHOPS,
    workshopRegistrationSponsorStart: '2026-09-15T08:00:00Z',
    workshopRegistrationStart: '2026-09-22T08:00:00Z',
    workshopRegistrationEnd: '2026-10-27T20:00:00Z',
    reminderDisabledReason: null,
    lastReminder: null,
    ticketsSection: (
      <WorkshopTicketsSection
        list={answered}
        providerLabel="Checkin.no"
        sponsorStartSet
      />
    ),
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof WorkshopsClientPage>

export default meta
type Story = StoryObj<typeof meta>

const phone = { viewport: { defaultViewport: 'phone' } }
const dark = { theme: 'dark', backgrounds: { default: 'dark' } }

/** Nothing needs the organizer: no "Needs attention", settings collapsed. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(
      await page.findByRole('region', { name: 'Ticket holders' }),
    ).toBeInTheDocument()
    await expect(
      page.queryByRole('region', { name: 'Needs attention' }),
    ).toBeNull()
  },
}

/** A ticket type to decide and two flagged sign-ups, named at the top. */
export const NeedsAttention: Story = {
  parameters: { msw: { handlers: handlers(2) } },
  args: {
    ticketsSection: (
      <WorkshopTicketsSection
        list={undecided}
        providerLabel="Checkin.no"
        sponsorStartSet
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const region = await within(canvasElement).findByRole('region', {
      name: 'Needs attention',
    })
    await expect(
      await within(region).findByText(/2 people have signed up/),
    ).toBeInTheDocument()
    await expect(region).toHaveTextContent('Workshop tickets need a decision')
  },
}

export const NeedsAttentionPhone: Story = {
  ...NeedsAttention,
  parameters: { ...NeedsAttention.parameters, ...phone },
}

export const NeedsAttentionDark: Story = {
  ...NeedsAttention,
  parameters: { ...NeedsAttention.parameters, ...dark },
}
