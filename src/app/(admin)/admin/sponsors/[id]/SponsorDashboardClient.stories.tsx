/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { Conference } from '@/lib/conference/types'
import { SponsorDashboardClient } from './SponsorDashboardClient'
import { http, HttpResponse } from 'msw'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const meta: Meta<typeof SponsorDashboardClient> = {
  title: 'Admin/Sponsor CRM/SponsorDashboardClient',
  component: SponsorDashboardClient,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SponsorDashboardClient>

const mockOverview = {
  sponsor: {
    _id: 'sponsor-1',
    name: 'Acme Corp',
    logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="#1d4ed8"/><text x="24" y="31" font-size="20" text-anchor="middle" fill="#fff" font-family="sans-serif">AC</text></svg>',
  },
  status: 'negotiating',
  tier: { title: 'Gold Tier', price: 10000 },
  conference: { _ref: 'conf-1' },
  nextFollowUpAt: '2026-11-05T08:00:00.000Z',
  contactInitiatedAt: '2026-09-15T08:00:00.000Z',
  outreachCount: 4,
  reminderCount: 1,
}

const trpcResult = (data: any) => HttpResponse.json({ result: { data } })

export const Default: Story = {
  args: {
    sponsorId: 'sponsor-1',
    conference: { _id: 'conf-1', title: 'Cloud Native Days' } as Conference,
    domain: 'cloudnativedays.no',
    initialOverview: mockOverview,
  },
  parameters: {
    msw: {
      handlers: [
        // The full record the header buttons and Manage links open.
        http.get('/api/trpc/sponsor.crm.getById', () =>
          trpcResult(
            mockSponsor({
              _id: 'sponsor-1',
              status: 'negotiating',
              sponsor: { _id: 'sponsor-1', name: 'Acme Corp' } as any,
            }),
          ),
        ),
        http.get('/api/trpc/sponsor.crm.getOverview', () =>
          trpcResult(mockOverview),
        ),
        http.get('/api/trpc/sponsor.crm.getContacts', () =>
          trpcResult({
            sponsor: { _id: 'sponsor-1' },
            contactPersons: [
              {
                _key: 'c1',
                name: 'Jane Doe',
                email: 'jane@acme.com',
                roles: ['decision-maker'],
              },
            ],
            billing: { email: 'billing@acme.com' },
          }),
        ),
        http.get('/api/trpc/sponsor.crm.getContractDetails', () =>
          trpcResult({
            sponsor: { _id: 'sponsor-1' },
            contractValue: 10000,
            contractCurrency: 'NOK',
            contractStatus: 'verbal-agreement',
            invoiceStatus: 'not-sent',
            tags: [{ value: 'warm-lead', label: 'Warm Lead' }],
          }),
        ),
        http.get('/api/trpc/sponsor.crm.activities.list', () =>
          trpcResult([
            {
              _id: 'act-1',
              activityType: 'note',
              description: 'Called Jane, she wants Gold tier.',
              createdBy: { name: 'Admin' },
              _createdAt: '2026-10-01T09:00:00.000Z',
            },
          ]),
        ),
      ],
    },
  },
}

// The story's overview wins over Default's: MSW uses the first matching handler.
const withOverview = (overview: any): Story => ({
  args: { ...Default.args, initialOverview: overview },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.crm.getOverview', () =>
          trpcResult(overview),
        ),
        ...(Default.parameters as any).msw.handlers,
      ],
    },
  },
})

export const OverdueFollowUp: Story = withOverview({
  ...mockOverview,
  nextFollowUpAt: '2026-01-05T08:00:00.000Z',
})

export const NoFollowUp: Story = withOverview({
  ...mockOverview,
  nextFollowUpAt: null,
  contactInitiatedAt: null,
  outreachCount: 0,
  reminderCount: 0,
})
