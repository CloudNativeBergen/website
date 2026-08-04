import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SponsorInvoicesPageClient } from './SponsorInvoicesPageClient'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  mockSponsor,
  mockBillingInfo,
  mockContactPerson,
} from '@/__mocks__/sponsor-data'
import type { Conference } from '@/lib/conference/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { evaluateInvoiceReadiness } from '@/lib/sponsor-crm/invoice'
import { Format } from '@/lib/proposal/types'

// Renders the real page against an msw-backed `sponsor.crm.list` that applies
// the same status / readiness filters the resolver does, so the stories
// exercise the actual round-trip rather than a static list.

const conference: Conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-11-05',
  endDate: '2026-11-05',
  cfpStartDate: '2026-06-01',
  cfpEndDate: '2026-08-31',
  cfpNotifyDate: '2026-09-15',
  cfpEmail: 'cfp@cloudnativedays.no',
  sponsorEmail: 'sponsor@cloudnativedays.no',
  programDate: '2026-10-01',
  registrationEnabled: true,
  contactEmail: 'hello@cloudnativedays.no',
  organizers: [],
  domains: ['cloudnativedays.no'],
  formats: [Format.presentation_25, Format.presentation_45],
  topics: [],
}

const won = (
  overrides: Partial<SponsorForConferenceExpanded>,
): SponsorForConferenceExpanded =>
  mockSponsor({
    status: 'closed-won',
    contractStatus: 'contract-signed',
    contractSignedAt: '2026-03-14T09:30:00Z',
    contactPersons: [mockContactPerson({ isPrimary: true })],
    ...overrides,
  })

const roster: SponsorForConferenceExpanded[] = [
  won({
    _id: 'sfc-acme',
    sponsor: { ...mockSponsor().sponsor, name: 'Acme Corporation' },
    contractValue: 150000,
    billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
    invoiceStatus: 'not-sent',
  }),
  won({
    _id: 'sfc-nordic',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-nordic',
      name: 'Nordic Systems AS',
      orgNumber: undefined,
    },
    contractValue: 75000,
    // EHF without an organisation number — cannot be delivered.
    billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
    invoiceStatus: 'not-sent',
  }),
  won({
    _id: 'sfc-cloudco',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-cloudco',
      name: 'CloudCo',
    },
    // No negotiated value — the amount falls back to the tier price.
    contractValue: undefined,
    billing: mockBillingInfo({
      invoiceFormat: 'pdf',
      reference: 'PO-9921',
      comments: 'Split across two departments, see framework agreement.',
    }),
    invoiceStatus: 'sent',
    invoiceSentAt: '2026-04-01T08:00:00Z',
  }),
  won({
    _id: 'sfc-tiny',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-tiny',
      name: 'Tiny Startup',
      orgNumber: undefined,
    },
    tier: undefined,
    contractValue: undefined,
    billing: undefined,
    invoiceStatus: 'not-sent',
  }),
  won({
    _id: 'sfc-overdue',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-late',
      name: 'Late Payer AS',
    },
    contractValue: 40000,
    billing: mockBillingInfo({ invoiceFormat: 'pdf' }),
    invoiceStatus: 'overdue',
    invoiceSentAt: '2026-02-10T08:00:00Z',
  }),
  won({
    _id: 'sfc-paid',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-settled',
      name: 'Settled Ltd',
    },
    contractValue: 60000,
    contractCurrency: 'EUR',
    billing: mockBillingInfo({ invoiceFormat: 'pdf' }),
    invoiceStatus: 'paid',
    invoiceSentAt: '2026-02-01T08:00:00Z',
    invoicePaidAt: '2026-02-20T08:00:00Z',
  }),
]

function applyFilters(input: Record<string, unknown> | undefined) {
  const invoiceStatus = input?.invoiceStatus as string[] | undefined
  const invoiceReady = input?.invoiceReady as boolean | undefined
  const searchQuery = (input?.searchQuery as string | undefined)?.toLowerCase()

  return roster.filter((sfc) => {
    if (
      invoiceStatus &&
      invoiceStatus.length > 0 &&
      !invoiceStatus.includes(sfc.invoiceStatus)
    ) {
      return false
    }
    if (
      invoiceReady !== undefined &&
      evaluateInvoiceReadiness(sfc).ready !== invoiceReady
    ) {
      return false
    }
    if (searchQuery && !sfc.sponsor.name.toLowerCase().includes(searchQuery)) {
      return false
    }
    return true
  })
}

const listHandler = http.get('/api/trpc/sponsor.crm.list', ({ request }) => {
  const raw = new URL(request.url).searchParams.get('input')
  const input = raw ? JSON.parse(raw) : undefined
  return HttpResponse.json({ result: { data: applyFilters(input) } })
})

/** Backs the "of Y" result line, which reads a bare count rather than a list. */
const countHandler = http.get('/api/trpc/sponsor.crm.count', () =>
  HttpResponse.json({ result: { data: roster.length } }),
)

const meta = {
  title: 'Systems/Sponsors/Admin/Invoicing/SponsorInvoicesPage',
  component: SponsorInvoicesPageClient,
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    msw: { handlers: [listHandler, countHandler] },
    docs: {
      description: {
        component:
          'The finance worklist: every won sponsor with the amount, delivery details and blockers needed to raise an invoice, plus a CSV export of the filtered set. Opens on unfinished work (not sent, sent, overdue).',
      },
    },
  },
  args: { conference },
} satisfies Meta<typeof SponsorInvoicesPageClient>

export default meta
type Story = StoryObj<typeof meta>

/** Default: unfinished invoicing work, mixing ready and blocked rows. */
export const Default: Story = {}

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.crm.list', () =>
          HttpResponse.json({ result: { data: [] } }),
        ),
        http.get('/api/trpc/sponsor.crm.count', () =>
          HttpResponse.json({ result: { data: 0 } }),
        ),
      ],
    },
  },
}
