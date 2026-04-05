import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import BadgeValidator from './BadgeValidator'

const mockSvgContent =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="#4A90D9"/><text x="100" y="110" text-anchor="middle" fill="white" font-size="16">Badge</text></svg>'

async function uploadAndValidate(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const file = new File([mockSvgContent], 'badge.svg', {
    type: 'image/svg+xml',
  })
  const input = canvasElement.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement
  await userEvent.upload(input, file)
  await waitFor(() => {
    expect(canvas.getByText('badge.svg')).toBeInTheDocument()
  })
  const validateButton = canvas.getByRole('button', {
    name: /validate badge/i,
  })
  await userEvent.click(validateButton)
  await waitFor(
    () => {
      expect(canvas.queryByText('Validating...')).not.toBeInTheDocument()
    },
    { timeout: 3000 },
  )
}

const mockSuccessResponse = {
  checks: [
    {
      name: 'SVG Extraction',
      status: 'success',
      message: 'Successfully extracted credential from SVG metadata',
    },
    {
      name: 'structure',
      status: 'success',
      message: 'Credential structure is valid (OpenBadges 3.0)',
    },
    {
      name: 'issuer',
      status: 'success',
      message: 'Issuer profile verified: Cloud Native Days Norway',
      details: {
        id: 'https://cloudnativedays.no/api/badge/issuer',
        name: 'Cloud Native Days Norway',
      },
    },
    {
      name: 'proof',
      status: 'success',
      message: 'Cryptographic proof verified successfully (eddsa-rdfc-2022)',
      details: {
        cryptosuite: 'eddsa-rdfc-2022',
        created: '2025-06-16T10:00:00Z',
        verificationMethod: 'https://cloudnativedays.no/api/badge/issuer#key-1',
      },
    },
    {
      name: 'achievement',
      status: 'success',
      message: 'Achievement verified: Speaker at Cloud Native Days Bergen 2025',
    },
    {
      name: 'temporal',
      status: 'success',
      message: 'Credential is within its validity period',
    },
  ],
  credential: {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: 'https://cloudnativedays.no/api/badge/credential/abc-123',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: 'https://cloudnativedays.no/api/badge/issuer',
      name: 'Cloud Native Days Norway',
      url: 'https://cloudnativedays.no',
    },
    credentialSubject: {
      type: ['AchievementSubject'],
      achievement: {
        id: 'https://cloudnativedays.no/api/badge/achievement/speaker-2025',
        name: 'Speaker at Cloud Native Days Bergen 2025',
        description:
          'Presented a talk at Cloud Native Days Bergen 2025 conference',
      },
    },
    validFrom: '2025-06-16T10:00:00Z',
    proof: [
      {
        type: 'DataIntegrityProof',
        created: '2025-06-16T10:00:00Z',
        verificationMethod: 'https://cloudnativedays.no/api/badge/issuer#key-1',
        cryptosuite: 'eddsa-rdfc-2022',
        proofPurpose: 'assertionMethod',
        proofValue: 'z3...',
      },
    ],
  },
}

const mockErrorResponse = {
  checks: [
    {
      name: 'SVG Extraction',
      status: 'success',
      message: 'Successfully extracted credential from SVG metadata',
    },
    {
      name: 'structure',
      status: 'error',
      message:
        'Credential structure is invalid: Missing required field: issuer',
      details: { issues: ['Missing required field: issuer'] },
    },
  ],
  credential: null,
}

const mockWarningResponse = {
  checks: [
    {
      name: 'SVG Extraction',
      status: 'success',
      message: 'Successfully extracted credential from SVG metadata',
    },
    {
      name: 'structure',
      status: 'success',
      message: 'Credential structure is valid (OpenBadges 3.0)',
    },
    {
      name: 'issuer',
      status: 'warning',
      message:
        'Issuer profile could not be verified: Failed to fetch issuer endpoint',
      details: { url: 'https://example.com/issuer' },
    },
    {
      name: 'temporal',
      status: 'warning',
      message: 'Credential validity period has expired',
      details: {
        validFrom: '2024-01-01T00:00:00Z',
        validUntil: '2024-12-31T23:59:59Z',
      },
    },
  ],
  credential: {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: 'https://example.com/badge/123',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: 'https://example.com/issuer',
    },
    credentialSubject: {
      type: ['AchievementSubject'],
      achievement: {
        name: 'Test Badge',
      },
    },
    validFrom: '2024-01-01T00:00:00Z',
  },
}

const meta: Meta<typeof BadgeValidator> = {
  title: 'Systems/Proposals/Admin/BadgeValidator',
  component: BadgeValidator,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Admin component for validating OpenBadges 3.0 baked SVG badges. Uploads an SVG file, extracts the embedded credential, and runs a series of validation checks including structure, issuer profile, cryptographic proof, achievement, and temporal validity.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-4xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof BadgeValidator>

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/badge.admin.validate', () => {
          return HttpResponse.json({
            result: { data: mockSuccessResponse },
          })
        }),
      ],
    },
  },
}

export const ValidationSuccess: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/badge.admin.validate', () => {
          return HttpResponse.json({
            result: { data: mockSuccessResponse },
          })
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await uploadAndValidate(canvasElement)
  },
}

export const ValidationErrors: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/badge.admin.validate', () => {
          return HttpResponse.json({
            result: { data: mockErrorResponse },
          })
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await uploadAndValidate(canvasElement)
  },
}

export const ValidationWarnings: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/badge.admin.validate', () => {
          return HttpResponse.json({
            result: { data: mockWarningResponse },
          })
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await uploadAndValidate(canvasElement)
  },
}

export const ServerError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/badge.admin.validate', () => {
          return HttpResponse.json(
            {
              error: {
                message: 'Internal server error',
                code: -32603,
                data: { code: 'INTERNAL_SERVER_ERROR' },
              },
            },
            { status: 500 },
          )
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await uploadAndValidate(canvasElement)
  },
}
