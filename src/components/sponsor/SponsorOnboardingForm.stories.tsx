import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { SponsorOnboardingForm } from './SponsorOnboardingForm'

const meta = {
  title: 'Systems/Sponsors/Onboarding/SponsorOnboardingForm',
  component: SponsorOnboardingForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Form for sponsors to complete their onboarding by providing contact information, billing details, and company information.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SponsorOnboardingForm>

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
  conferenceName: 'Cloud Native Days Bergen 2026',
  conferenceStartDate: '2026-10-15',
  contactPersons: [],
  billing: null,
  onboardingComplete: false,
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

const mockCompletedSponsor = {
  ...mockSponsorWithExistingData,
  onboardingComplete: true,
}

function createTRPCBatchResponse(results: unknown[]) {
  return results.map((result) => ({
    result: {
      data: result,
    },
  }))
}

function createTRPCBatchError(message: string, code: string) {
  return [
    {
      error: {
        message,
        code: -32600,
        data: {
          code,
          httpStatus: code === 'NOT_FOUND' ? 404 : 500,
        },
      },
    },
  ]
}

/**
 * Default state showing the onboarding form for a new sponsor without any pre-filled data.
 */
export const Default: Story = {
  args: {
    token: 'valid-token-123',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('http://localhost:6006/api/trpc/onboarding.validate', () => {
          return HttpResponse.json(createTRPCBatchResponse([mockSponsorData]))
        }),
        http.post(
          'http://localhost:6006/api/trpc/onboarding.complete',
          async () => {
            await delay(1000)
            return HttpResponse.json(
              createTRPCBatchResponse([{ success: true }]),
            )
          },
        ),
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
        http.get('http://localhost:6006/api/trpc/onboarding.validate', () => {
          return HttpResponse.json(
            createTRPCBatchResponse([mockSponsorWithExistingData]),
          )
        }),
        http.post(
          'http://localhost:6006/api/trpc/onboarding.complete',
          async () => {
            await delay(1000)
            return HttpResponse.json(
              createTRPCBatchResponse([{ success: true }]),
            )
          },
        ),
      ],
    },
  },
}

/**
 * Loading state while validating the onboarding token.
 */
export const Loading: Story = {
  args: {
    token: 'loading-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get(
          'http://localhost:6006/api/trpc/onboarding.validate',
          async () => {
            await delay(999999)
            return HttpResponse.json(createTRPCBatchResponse([mockSponsorData]))
          },
        ),
      ],
    },
  },
}

/**
 * Error state when the onboarding token is invalid or expired.
 */
export const InvalidToken: Story = {
  args: {
    token: 'invalid-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('http://localhost:6006/api/trpc/onboarding.validate', () => {
          return HttpResponse.json(
            createTRPCBatchError(
              'Invalid or expired onboarding token',
              'NOT_FOUND',
            ),
          )
        }),
      ],
    },
  },
}

/**
 * Success state after onboarding has already been completed.
 */
export const AlreadyCompleted: Story = {
  args: {
    token: 'completed-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('http://localhost:6006/api/trpc/onboarding.validate', () => {
          return HttpResponse.json(
            createTRPCBatchResponse([mockCompletedSponsor]),
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
        http.get('http://localhost:6006/api/trpc/onboarding.validate', () => {
          return HttpResponse.json(
            createTRPCBatchResponse([
              {
                ...mockSponsorData,
                tierTitle: null,
                sponsorName: 'Local Tech Meetup',
              },
            ]),
          )
        }),
        http.post(
          'http://localhost:6006/api/trpc/onboarding.complete',
          async () => {
            await delay(1000)
            return HttpResponse.json(
              createTRPCBatchResponse([{ success: true }]),
            )
          },
        ),
      ],
    },
  },
}
