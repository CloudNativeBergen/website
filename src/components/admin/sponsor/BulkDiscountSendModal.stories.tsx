import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { BulkDiscountSendModal } from './BulkDiscountSendModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'
import { mockContactPerson, mockSponsor } from '@/__mocks__/sponsor-data'

const conference = {
  title: 'Cloud Native Days Norway 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-06-10',
  domains: ['cloudnativedays.no'],
  contactEmail: 'organizers@cloudnativedays.no',
  domain: 'cloudnativedays.no',
  sponsorRegistrationLink: 'https://cloudnativedays.no/sponsor-signup',
}

const sponsors = [
  {
    id: 'sp-1',
    name: 'Acme Cloud',
    website: 'https://acme.example',
    tier: {
      title: 'Gold',
      tagline: 'Headline sponsor',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 5,
    sponsorForConferenceId: 'sfc-1',
    linkedCodes: ['ACME-2026'],
  },
  {
    id: 'sp-2',
    name: 'Globex Corp',
    website: 'https://globex.example',
    tier: {
      title: 'Silver',
      tagline: 'Supporting sponsor',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 3,
    sponsorForConferenceId: 'sfc-2',
    linkedCodes: ['GLOBEX-2026'],
  },
  {
    id: 'sp-3',
    name: 'Initech',
    tier: {
      title: 'Bronze',
      tagline: 'Bronze tier',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 1,
    sponsorForConferenceId: 'sfc-3',
    linkedCodes: [],
  },
  {
    id: 'sp-4',
    name: 'Umbrella Corp',
    tier: {
      title: 'Partner',
      tagline: 'Community partner',
      tierType: 'standard' as const,
    },
    ticketEntitlement: 2,
    sponsorForConferenceId: 'sfc-4',
    linkedCodes: ['UMBRELLA-2026'],
  },
]

const existingDiscounts: EventDiscountWithUsage[] = [
  {
    id: 101,
    code: 'ACME-2026',
    triggerValue: 'ACME-2026',
    discountPercent: 100,
    times: 0,
    maxUses: 5,
    actualUsage: 0,
    linkedSponsorId: 'sp-1',
  } as unknown as EventDiscountWithUsage,
  {
    id: 102,
    code: 'GLOBEX-2026',
    triggerValue: 'GLOBEX-2026',
    discountPercent: 100,
    times: 1,
    maxUses: 3,
    actualUsage: 1,
    linkedSponsorId: 'sp-2',
  } as unknown as EventDiscountWithUsage,
  {
    id: 103,
    code: 'UMBRELLA-2026',
    triggerValue: 'UMBRELLA-2026',
    discountPercent: 100,
    times: 0,
    maxUses: 2,
    actualUsage: 0,
    linkedSponsorId: 'sp-4',
  } as unknown as EventDiscountWithUsage,
]

const crmList = [
  mockSponsor({
    _id: 'sfc-1',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sp-1',
      name: 'Acme Cloud',
    },
    contactPersons: [
      mockContactPerson({
        _key: 'cp-1',
        name: 'Alice Smith',
        email: 'alice@acme.example',
        isPrimary: true,
      }),
    ],
  }),
  mockSponsor({
    _id: 'sfc-2',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sp-2',
      name: 'Globex Corp',
    },
    contactPersons: [
      mockContactPerson({
        _key: 'cp-2',
        name: 'Bob Jones',
        email: 'bob@globex.example',
        isPrimary: true,
      }),
    ],
  }),
  mockSponsor({
    _id: 'sfc-3',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sp-3',
      name: 'Initech',
    },
    contactPersons: [
      mockContactPerson({
        _key: 'cp-3',
        name: 'Peter Gibbons',
        email: 'peter@initech.example',
        isPrimary: true,
      }),
    ],
  }),
  mockSponsor({
    _id: 'sfc-4',
    sponsor: {
      ...mockSponsor().sponsor,
      _id: 'sp-4',
      name: 'Umbrella Corp',
    },
    contactPersons: [
      mockContactPerson({
        _key: 'cp-4',
        name: 'No Email Contact',
        email: '',
        isPrimary: true,
      }),
    ],
  }),
]

const templates = [
  {
    _id: 'tpl-discount-en',
    title: 'Sponsor discount codes',
    category: 'discount',
    language: 'en',
    subject: 'Discount codes: {{{CONFERENCE_TITLE}}}',
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'Here are your discount codes for {{{CONFERENCE_TITLE}}}: {{{DISCOUNT_CODES}}}',
          },
        ],
      },
    ],
  },
]

const handlers = [
  http.get('/api/trpc/sponsor.crm.list', () =>
    HttpResponse.json({ result: { data: crmList } }),
  ),
  http.get('/api/trpc/sponsor.emailTemplates.list', () =>
    HttpResponse.json({ result: { data: templates } }),
  ),
]

const meta: Meta<typeof BulkDiscountSendModal> = {
  title: 'Systems/Sponsors/Admin/Email/BulkDiscountSendModal',
  component: BulkDiscountSendModal,
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
  },
}

export default meta
type Story = StoryObj<typeof BulkDiscountSendModal>

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    conference,
    sponsors,
    existingDiscounts,
  },
}

export const Mobile: Story = {
  args: {
    isOpen: true,
    onClose: () => {},
    conference,
    sponsors,
    existingDiscounts,
  },
  parameters: {
    viewport: { value: 'mobile1', isRotated: false },
  },
}
