import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SponsorContractView } from './SponsorContractView'
import {
  mockSponsor,
  mockReadinessReady,
  mockReadinessMissing,
} from '@/__mocks__/sponsor-data'

const defaultHandlers = [
  http.get('/api/trpc/sponsor.contractTemplates.contractReadiness', () => {
    return HttpResponse.json({
      result: { data: mockReadinessReady() },
    })
  }),
  http.get('/api/trpc/sponsor.contractTemplates.findBest', () => {
    return HttpResponse.json({
      result: {
        data: {
          _id: 'tmpl-1',
          title: 'Standard Sponsorship Agreement',
          language: 'en',
        },
      },
    })
  }),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Sponsor Detail/SponsorContractView',
  component: SponsorContractView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Contract management view shown inside the sponsor modal. Primary action is generating a sponsor portal link for self-service registration. Includes an advanced section for manual contract generation and sending for digital signature. Displays contract status, signature progress, and portal completion state.',
      },
    },
  },
} satisfies Meta<typeof SponsorContractView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'verbal-agreement',
      signatureStatus: 'not-started',
    }),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
}

export const PortalComplete: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      registrationComplete: true,
      registrationToken: 'abc-123',
    }),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
}

export const ContractSent: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agreement-123',
      contractSentAt: '2026-02-01T12:00:00Z',
    }),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
}

export const ContractSigned: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-signed',
      signatureStatus: 'signed',
      contractSignedAt: '2026-02-05T15:30:00Z',
    }),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
}

export const MissingData: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'verbal-agreement',
      signatureStatus: 'not-started',
      contactPersons: [],
    }),
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: { data: mockReadinessMissing() },
            })
          },
        ),
        http.get('/api/trpc/sponsor.contractTemplates.findBest', () => {
          return HttpResponse.json({
            result: {
              data: {
                _id: 'tmpl-1',
                title: 'Standard Sponsorship Agreement',
                language: 'en',
              },
            },
          })
        }),
      ],
    },
  },
}

export const NoTemplate: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'verbal-agreement',
    }),
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          '/api/trpc/sponsor.contractTemplates.contractReadiness',
          () => {
            return HttpResponse.json({
              result: { data: mockReadinessReady() },
            })
          },
        ),
        http.get('/api/trpc/sponsor.contractTemplates.findBest', () => {
          return HttpResponse.json({
            result: { data: null },
          })
        }),
      ],
    },
  },
}

export const WithExistingToken: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'verbal-agreement',
      signatureStatus: 'not-started',
      registrationToken: 'existing-token-abc-123',
    }),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
}
