import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { ContractSigningPage } from './ContractSigningPage'

const meta = {
  title: 'Systems/Sponsors/Signing/ContractSigningPage',
  component: ContractSigningPage,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Self-hosted contract signing page with a 3-step flow: review contract details, capture signature via SignaturePadCanvas, and show completion confirmation. Used when `CONTRACT_SIGNING_PROVIDER=self-hosted`. The signing token is a UUID stored as `signatureId` on the `sponsorForConference` record.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ContractSigningPage>

export default meta
type Story = StoryObj<typeof meta>

const mockContract = {
  status: 'pending' as const,
  sponsorName: 'Acme Corp',
  conferenceName: 'Cloud Native Days Norway 2026',
  conferenceCity: 'Bergen',
  conferenceStartDate: '2026-10-15',
  organizer: 'Cloud Native Bergen',
  tierName: 'Gold',
  contractValue: 75000,
  contractCurrency: 'NOK',
  signerEmail: 'jane@acme.example.com',
  contractPdfUrl: null,
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
        httpStatus:
          code === 'NOT_FOUND'
            ? 404
            : code === 'PRECONDITION_FAILED'
              ? 412
              : 500,
      },
    },
  }
}

/**
 * Review step showing contract details (sponsor, event, tier, value).
 * The signer reviews the agreement and clicks &quot;Proceed to Sign&quot;.
 */
export const ReviewStep: Story = {
  args: {
    token: 'review-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(trpcResponse(mockContract))
        }),
        http.post('/api/trpc/signing.submitSignature', async () => {
          await delay(1000)
          return HttpResponse.json(
            trpcResponse({
              success: true,
              sponsorName: 'Acme Corp',
              conferenceName: 'Cloud Native Days Norway 2026',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Review step with a PDF document available for inline preview.
 */
export const WithPdfPreview: Story = {
  args: {
    token: 'pdf-preview-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(
            trpcResponse({
              ...mockContract,
              contractPdfUrl: 'https://example.com/contract.pdf',
            }),
          )
        }),
        http.post('/api/trpc/signing.submitSignature', async () => {
          await delay(1000)
          return HttpResponse.json(
            trpcResponse({
              success: true,
              sponsorName: 'Acme Corp',
              conferenceName: 'Cloud Native Days Norway 2026',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Contract that has already been signed. Shows the &quot;Already Signed&quot;
 * confirmation state with a green checkmark.
 */
export const AlreadySigned: Story = {
  args: {
    token: 'signed-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(
            trpcResponse({
              status: 'signed',
              sponsorName: 'Acme Corp',
              conferenceName: 'Cloud Native Days Norway 2026',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Loading state while fetching contract details from the server.
 */
export const Loading: Story = {
  args: {
    token: 'loading-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', async () => {
          await delay(999999)
          return HttpResponse.json(trpcResponse(mockContract))
        }),
      ],
    },
  },
}

/**
 * Error state when the signing token is invalid or the contract is not found.
 */
export const InvalidToken: Story = {
  args: {
    token: 'invalid-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(
            trpcError('Contract not found or link has expired.', 'NOT_FOUND'),
          )
        }),
      ],
    },
  },
}

/**
 * Error state for a contract that has been rejected or cancelled by the organizer.
 */
export const RejectedContract: Story = {
  args: {
    token: 'rejected-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(
            trpcError(
              'This contract has been rejected. Please contact the organizer.',
              'PRECONDITION_FAILED',
            ),
          )
        }),
      ],
    },
  },
}

/**
 * Sign step showing the signature pad, name input, and legal agreement checkbox.
 * The signer draws their signature and submits.
 */
export const SignStep: Story = {
  args: {
    token: 'sign-token',
    initialStep: 'sign',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(trpcResponse(mockContract))
        }),
        http.post('/api/trpc/signing.submitSignature', async () => {
          await delay(1000)
          return HttpResponse.json(
            trpcResponse({
              success: true,
              sponsorName: 'Acme Corp',
              conferenceName: 'Cloud Native Days Norway 2026',
            }),
          )
        }),
      ],
    },
  },
}

/**
 * Completion step shown after a successful signature submission.
 * Displays a success confirmation with a green checkmark.
 */
export const CompletionStep: Story = {
  args: {
    token: 'complete-token',
    initialStep: 'complete',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(trpcResponse(mockContract))
        }),
      ],
    },
  },
}

/**
 * Minimal contract details — community partner without a tier or contract value.
 */
export const CommunityPartner: Story = {
  args: {
    token: 'community-token',
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/signing.getContract', () => {
          return HttpResponse.json(
            trpcResponse({
              status: 'pending',
              sponsorName: 'Local Tech Meetup',
              conferenceName: 'Cloud Native Days Norway 2026',
              conferenceCity: 'Bergen',
              conferenceStartDate: '2026-10-15',
              organizer: 'Cloud Native Bergen',
              tierName: null,
              contractValue: null,
              contractCurrency: null,
              signerEmail: 'hello@localtechmeetup.no',
              contractPdfUrl: null,
            }),
          )
        }),
        http.post('/api/trpc/signing.submitSignature', async () => {
          await delay(1000)
          return HttpResponse.json(
            trpcResponse({
              success: true,
              sponsorName: 'Local Tech Meetup',
              conferenceName: 'Cloud Native Days Norway 2026',
            }),
          )
        }),
      ],
    },
  },
}
