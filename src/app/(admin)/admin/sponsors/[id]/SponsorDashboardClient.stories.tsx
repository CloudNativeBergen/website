import type { Meta, StoryObj } from '@storybook/react'
import { SponsorDashboardClient } from './SponsorDashboardClient'
import { http, HttpResponse } from 'msw'

const meta: Meta<typeof SponsorDashboardClient> = {
  title: 'Admin/Sponsor CRM/SponsorDashboardClient',
  component: SponsorDashboardClient,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof SponsorDashboardClient>

const mockOverview = {
  sponsor: {
    _id: 'sponsor-1',
    name: 'Acme Corp',
    logo: 'https://via.placeholder.com/150',
  },
  status: 'negotiating',
  tier: { title: 'Gold Tier', price: 10000 },
  conference: { _ref: 'conf-1' },
}

const trpcResult = (data: any) => HttpResponse.json({ result: { data } })

export const Default: Story = {
  args: {
    sponsorId: 'sponsor-1',
    conferenceId: 'conf-1',
    initialOverview: mockOverview,
  },
  parameters: {
    msw: {
      handlers: [
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
              _createdAt: new Date().toISOString(),
            },
          ]),
        ),
      ],
    },
  },
}
