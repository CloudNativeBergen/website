import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, fn, userEvent, within } from 'storybook/test'
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

/** A completed registration can still be re-sent to a new contact (#1263) — while the deal is won. */
export const PortalComplete: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      status: 'closed-won',
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      registrationComplete: true,
      registrationToken: 'abc-123',
    }),
    onSendRegistration: fn(),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Resend registration link' }),
    )
    await expect(args.onSendRegistration).toHaveBeenCalledTimes(1)
  },
}

/** A signature is pending: "Send reminder" hands off to the host's Send modal (#1264). */
export const ContractSent: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agreement-123',
      signingUrl: 'https://example.com/sponsor/contract/sign/agreement-123',
      signerName: 'Jane Doe',
      contractSentAt: '2026-02-01T12:00:00Z',
    }),
    onSendContract: fn(),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Send reminder' }),
    )
    await expect(args.onSendContract).toHaveBeenCalledWith({})
  },
}

/** Signed: "Send signed copy" hands off to the host's Send modal (#1264). */
export const ContractSigned: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-signed',
      signatureStatus: 'signed',
      contractSignedAt: '2026-02-05T15:30:00Z',
      contractDocument: {
        asset: {
          _ref: 'file-1',
          url: 'https://cdn.sanity.io/files/x/signed.pdf',
        },
      },
    }),
    onSendContract: fn(),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Send signed copy' }),
    )
    await expect(args.onSendContract).toHaveBeenCalledWith({})
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

export const CounterSigned: Story = {
  args: {
    conferenceId: 'conf-2026',
    sponsor: mockSponsor({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agreement-456',
      contractSentAt: '2026-02-01T12:00:00Z',
      organizerSignedBy: 'Jane Doe',
      organizerSignedAt: '2026-02-01T11:55:00Z',
    }),
  },
  parameters: {
    msw: { handlers: defaultHandlers },
  },
}
