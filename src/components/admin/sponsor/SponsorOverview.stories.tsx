import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import { mockExchangeRatesBeforeEach } from '@/lib/storybook/mockExchangeRates'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { SponsorOverview } from './SponsorOverview'

const me = { _id: 'org-me', name: 'Hans K.', email: 'hans@example.com' }
const kari = { _id: 'org-kari', name: 'Kari N.', email: 'kari@example.com' }
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const fresh = days(0)

const sponsors = [
  mockSponsor({
    _id: 'sfc-1',
    sponsor: { ...mockSponsor().sponsor, name: 'Nordlys Data' },
    status: 'closed-won',
    contractStatus: 'contract-signed',
    invoiceStatus: 'sent',
    invoiceDueAt: days(-10).slice(0, 10),
    contractValue: 150000,
    assignedTo: me,
    _updatedAt: fresh,
  }),
  mockSponsor({
    _id: 'sfc-2',
    sponsor: { ...mockSponsor().sponsor, name: 'Fjord Cloud' },
    status: 'closed-won',
    contractStatus: 'contract-sent',
    invoiceStatus: 'not-sent',
    contractValue: 80000,
    assignedTo: me,
    _updatedAt: fresh,
  }),
  mockSponsor({
    _id: 'sfc-3',
    sponsor: { ...mockSponsor().sponsor, name: 'Bergen Bytes' },
    status: 'closed-won',
    contractStatus: 'contract-signed',
    invoiceStatus: 'paid',
    contractValue: 5000,
    contractCurrency: 'EUR',
    assignedTo: kari,
    _updatedAt: fresh,
  }),
  mockSponsor({
    _id: 'sfc-4',
    sponsor: { ...mockSponsor().sponsor, name: 'Vestland Ops' },
    status: 'negotiating',
    contractValue: 60000,
  }),
  mockSponsor({
    _id: 'sfc-5',
    sponsor: { ...mockSponsor().sponsor, name: 'Kubehavn' },
    status: 'prospect',
    contractValue: 40000,
    contactPersons: [],
  }),
  mockSponsor({
    _id: 'sfc-6',
    sponsor: { ...mockSponsor().sponsor, name: 'Polar Mesh' },
    status: 'contacted',
    contractValue: 30000,
    nextFollowUpAt: days(-2),
    assignedTo: me,
  }),
  mockSponsor({
    _id: 'sfc-7',
    sponsor: { ...mockSponsor().sponsor, name: 'Old Corp' },
    status: 'closed-lost',
    contractValue: 20000,
    assignedTo: kari,
  }),
]

const activities = [
  {
    _id: 'act-1',
    _createdAt: fresh,
    _updatedAt: fresh,
    sponsorForConference: {
      _id: 'sfc-1',
      sponsor: { _id: 's-1', name: 'Nordlys Data' },
    },
    activityType: 'stage_change',
    description: 'Status changed from Negotiating to Closed Won',
    createdBy: me,
    createdAt: fresh,
  },
  {
    _id: 'act-2',
    _createdAt: fresh,
    _updatedAt: fresh,
    sponsorForConference: {
      _id: 'sfc-4',
      sponsor: { _id: 's-4', name: 'Vestland Ops' },
    },
    activityType: 'note',
    description: 'Wants a booth near the coffee.',
    createdBy: me,
    createdAt: fresh,
  },
]

const handlers = [
  http.get('/api/trpc/sponsor.crm.list', () =>
    HttpResponse.json({ result: { data: sponsors } }),
  ),
  http.get('/api/trpc/sponsor.crm.renewalReminders', () =>
    HttpResponse.json({ result: { data: null } }),
  ),
  http.get('/api/trpc/sponsor.crm.activities.list', () =>
    HttpResponse.json({ result: { data: activities } }),
  ),
  http.get('/api/trpc/sponsor.tiers.listByConference', () =>
    HttpResponse.json({
      result: { data: [{ _id: 'tier-ingress', maxQuantity: 6 }] },
    }),
  ),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Dashboard/Overview',
  component: SponsorOverview,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'The `/admin/sponsors` overview: what needs the signed-in organizer, the pipeline and money at a glance, the pre-event checklist (six weeks before until the last day), latest activity and links to the sub-pages.',
      },
    },
  },
  beforeEach: mockExchangeRatesBeforeEach(),
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="max-w-6xl">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  args: {
    organizerId: me._id,
    revenueGoal: 600000,
    showBeforeEvent: true,
  },
} satisfies Meta<typeof SponsorOverview>

export default meta
type Story = StoryObj<typeof meta>

export const Light: Story = { globals: { theme: 'light' } }

export const Dark: Story = { globals: { theme: 'dark' } }

/** No revenue goal: progress falls back to tier capacity. */
export const TierCapacity: Story = {
  args: { revenueGoal: undefined },
}

/** More than six weeks out: no "Before the event" section. */
export const OutsideEventWindow: Story = {
  args: { showBeforeEvent: false },
}

export const OutsideEventWindowDark: Story = {
  args: { showBeforeEvent: false },
  globals: { theme: 'dark' },
}
