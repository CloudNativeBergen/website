import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { SponsorPortal } from './SponsorPortal'

const meta = {
  title: 'Systems/Sponsors/Portal/SponsorPortal',
  component: SponsorPortal,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Sponsor portal for self-service registration and contract status. Sponsors complete company details, contacts, billing info, and select who signs the contract. After setup, shows a progressive status dashboard with contract signing link.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SponsorPortal>

export default meta
type Story = StoryObj<typeof meta>

const mockSponsorData = {
  _id: 'sfc-123',
  sponsorName: 'Acme Corp',
  sponsorWebsite: 'https://acme.example.com',
  sponsorLogo: null,
  sponsorLogoBright: null,
  sponsorOrgNumber: null,
  sponsorAddress: null,
  tierTitle: 'Gold',
  conferenceName: 'Cloud Native Days Norway 2026',
  conferenceStartDate: '2026-10-15',
  contactPersons: [],
  billing: null,
  registrationComplete: false,
  signerEmail: null,
  signatureStatus: null,
  contractStatus: null,
  signingUrl: null,
  contractValue: null,
  contractCurrency: null,
}

const mockSponsorWithExistingData = {
  ...mockSponsorData,
  sponsorOrgNumber: '123 456 789',
  sponsorAddress: 'Innovation Street 42, 5020 Bergen, Norway',
  contactPersons: [
    {
      _key: 'contact-1',
      name: 'Jane Smith',
      email: 'jane@acme.example.com',
      phone: '+47 123 45 678',
      role: 'Marketing',
      isPrimary: true,
    },
  ],
  billing: {
    email: 'billing@acme.example.com',
    reference: 'PO-2026-001',
    comments: 'Please send invoice before end of month',
  },
}

function trpcResponse(data: unknown) {
  return { result: { data } }
}

function trpcError(message: string, code: string) {
  return {
    error: {
      message,
      code: -32600,
      data: {
        code,
        httpStatus: code === 'NOT_FOUND' ? 404 : 500,
      },
    },
  }
}

/**
 * Default state showing the portal form for a new sponsor without any pre-filled data.
 */
export const Default: Story = {
  args: {
    token: 'valid-token-123',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(trpcResponse(mockSponsorData))
        }),
        http.post('/api/trpc/registration.complete', async () => {
          await delay(1000)
          return HttpResponse.json(trpcResponse({ success: true }))
        }),
      ],
    },
  },
}

/**
 * Form pre-populated with existing sponsor data from a previous partial submission.
 */
export const WithExistingData: Story = {
  args: {
    token: 'existing-data-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(trpcResponse(mockSponsorWithExistingData))
        }),
        http.post('/api/trpc/registration.complete', async () => {
          await delay(1000)
          return HttpResponse.json(trpcResponse({ success: true }))
        }),
      ],
    },
  },
}

/**
 * Loading state while validating the portal token.
 */
export const Loading: Story = {
  args: {
    token: 'loading-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', async () => {
          await delay(999999)
          return HttpResponse.json(trpcResponse(mockSponsorData))
        }),
      ],
    },
  },
}

/**
 * Error state when the portal token is invalid or expired.
 */
export const InvalidToken: Story = {
  args: {
    token: 'invalid-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(
            trpcError('Invalid or expired registration token', 'NOT_FOUND'),
          )
        }),
      ],
    },
  },
}

/**
 * Portal status: setup complete, waiting for contract to be sent.
 */
export const SetupComplete: Story = {
  args: {
    token: 'completed-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(
            trpcResponse({
              ...mockSponsorWithExistingData,
              registrationComplete: true,
              contractValue: 75000,
              contractCurrency: 'NOK',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Portal status: contract sent and pending signature, with signing link.
 */
export const ContractPending: Story = {
  args: {
    token: 'pending-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(
            trpcResponse({
              ...mockSponsorWithExistingData,
              registrationComplete: true,
              signatureStatus: 'pending',
              contractStatus: 'contract-sent',
              signerEmail: 'jane@acme.example.com',
              signingUrl: 'https://secure.eu2.adobesign.com/sign/example',
              contractValue: 75000,
              contractCurrency: 'NOK',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Portal status: contract signed successfully.
 */
export const ContractSigned: Story = {
  args: {
    token: 'signed-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(
            trpcResponse({
              ...mockSponsorWithExistingData,
              registrationComplete: true,
              signatureStatus: 'signed',
              contractStatus: 'contract-signed',
              signerEmail: 'jane@acme.example.com',
              signingUrl: 'https://secure.eu2.adobesign.com/sign/example',
              contractValue: 75000,
              contractCurrency: 'NOK',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Shows the form for a sponsor without a tier assignment (community partner).
 */
export const CommunityPartner: Story = {
  args: {
    token: 'community-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/registration.validate', () => {
          return HttpResponse.json(
            trpcResponse({
              ...mockSponsorData,
              tierTitle: null,
              sponsorName: 'Local Tech Meetup',
            }),
          )
        }),
        http.post('/api/trpc/registration.complete', async () => {
          await delay(1000)
          return HttpResponse.json(trpcResponse({ success: true }))
        }),
      ],
    },
  },
}
