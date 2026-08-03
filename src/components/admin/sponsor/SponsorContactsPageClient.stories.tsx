import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SponsorContactsPageClient } from './SponsorContactsPageClient'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  mockSponsor,
  mockContactPerson,
  mockBillingInfo,
} from '@/__mocks__/sponsor-data'
import type { Conference } from '@/lib/conference/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { Format } from '@/lib/proposal/types'

// Renders the real page shell against an msw-backed `sponsor.crm.list`. The
// handler applies the same status / billing / contact filters the tRPC resolver
// does, so the stories exercise the actual filter round-trip rather than a
// static list.

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

const roster: SponsorForConferenceExpanded[] = [
  mockSponsor({
    _id: 'sfc-acme',
    status: 'closed-won',
    sponsor: { ...mockSponsor().sponsor, name: 'Acme Corporation' },
    contactPersons: [
      mockContactPerson({
        _key: 'c-acme-2',
        name: 'Chris Green',
        email: 'chris@acme.example',
        role: 'Event Coordinator',
      }),
      mockContactPerson({
        _key: 'c-acme-1',
        name: 'Jane Smith',
        email: 'jane@acme.example',
        isPrimary: true,
      }),
    ],
    billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
  }),
  mockSponsor({
    _id: 'sfc-nordic',
    status: 'closed-won',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-nordic',
      name: 'Nordic Systems AS',
      orgNumber: undefined,
    },
    contactPersons: [
      mockContactPerson({
        _key: 'c-nordic',
        name: 'Bob Wilson',
        email: 'bob@nordic.example',
        role: 'CEO',
        isPrimary: true,
      }),
    ],
    billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
  }),
  mockSponsor({
    _id: 'sfc-tiny',
    status: 'closed-won',
    tier: undefined,
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-tiny',
      name: 'Tiny Startup',
      orgNumber: undefined,
    },
    contactPersons: [],
    billing: undefined,
  }),
  mockSponsor({
    _id: 'sfc-cloudco',
    status: 'negotiating',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-cloudco',
      name: 'CloudCo',
    },
    contactPersons: [
      mockContactPerson({
        _key: 'c-cloudco',
        name: 'Alice Brown',
        email: 'alice@cloudco.example',
        isPrimary: true,
      }),
    ],
  }),
  mockSponsor({
    _id: 'sfc-lost',
    status: 'closed-lost',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sponsor-formerly',
      name: 'Formerly Interested Inc',
    },
    contactPersons: [
      mockContactPerson({
        _key: 'c-lost',
        name: 'Sam Taylor',
        email: 'sam@formerly.example',
        isPrimary: true,
      }),
    ],
  }),
]

/** Mirrors the resolver's filtering so the stories test the real round-trip. */
function applyFilters(input: Record<string, unknown> | undefined) {
  const status = input?.status as string[] | undefined
  const hasContactInfo = input?.hasContactInfo as boolean | undefined
  const billingComplete = input?.billingComplete as boolean | undefined
  const searchQuery = (input?.searchQuery as string | undefined)?.toLowerCase()

  return roster.filter((sfc) => {
    if (status && status.length > 0 && !status.includes(sfc.status))
      return false

    const contactCount = sfc.contactPersons?.length ?? 0
    if (hasContactInfo === true && contactCount === 0) return false
    if (hasContactInfo === false && contactCount > 0) return false

    if (billingComplete !== undefined) {
      const complete =
        !!sfc.billing?.email &&
        !!sfc.billing.invoiceFormat &&
        (sfc.billing.invoiceFormat !== 'ehf' || !!sfc.sponsor.orgNumber)
      if (complete !== billingComplete) return false
    }

    if (searchQuery) {
      const haystack = [
        sfc.sponsor.name,
        ...(sfc.contactPersons ?? []).flatMap((c) => [c.name, c.email]),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(searchQuery)) return false
    }

    return true
  })
}

const listHandler = http.get('/api/trpc/sponsor.crm.list', ({ request }) => {
  const raw = new URL(request.url).searchParams.get('input')
  const input = raw ? JSON.parse(raw) : undefined
  return HttpResponse.json({ result: { data: applyFilters(input) } })
})

const meta = {
  title: 'Systems/Sponsors/Admin/Contacts/SponsorContactsPage',
  component: SponsorContactsPageClient,
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
    msw: { handlers: [listHandler] },
    docs: {
      description: {
        component:
          'Sponsor contacts page. Opens on accepted (won) sponsors; the stage, billing and contact filters run server-side through `sponsor.crm.list`.',
      },
    },
  },
  args: { conference },
} satisfies Meta<typeof SponsorContactsPageClient>

export default meta
type Story = StoryObj<typeof meta>

/** Default view: accepted sponsors only, out of the full five-sponsor roster. */
export const Default: Story = {}

export const EmptyRoster: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.crm.list', () =>
          HttpResponse.json({ result: { data: [] } }),
        ),
      ],
    },
  },
}
