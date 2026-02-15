/**
 * @jest-environment jsdom
 */
import {
  describe,
  it,
  expect as jestExpect,
  jest,
  beforeEach,
} from '@jest/globals'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expect = jestExpect as any

import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

// Mock next-auth/react
const mockSession = {
  speaker: { _id: 'speaker-1', name: 'Test Organizer', isOrganizer: true },
  user: { name: 'Test Organizer' },
}
jest.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: mockSession }),
}))

// Mock tRPC hooks
const mockReadinessData = jest.fn<() => any>()
const mockBestTemplateData = jest.fn<() => any>()
const mockGeneratePdf = jest.fn<() => any>()
const mockSendContract = jest.fn<() => any>()
const mockCheckStatus = jest.fn<() => any>()

jest.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      contractTemplates: {
        contractReadiness: {
          useQuery: () => mockReadinessData(),
        },
        findBest: {
          useQuery: () => mockBestTemplateData(),
        },
        generatePdf: {
          useMutation: (opts: any) => mockGeneratePdf(),
        },
      },
      crm: {
        sendContract: {
          useMutation: (opts: any) => mockSendContract(),
        },
        checkSignatureStatus: {
          useMutation: (opts: any) => mockCheckStatus(),
        },
      },
    },
  },
}))

// Mock sub-components that have their own tRPC dependencies
jest.mock('@/components/admin/sponsor-crm/ContractReadinessIndicator', () => ({
  __esModule: true,
  ContractReadinessIndicator: () => (
    <div data-testid="readiness-indicator">Readiness OK</div>
  ),
}))

jest.mock('@/components/admin/sponsor-crm/SponsorPortalSection', () => ({
  __esModule: true,
  SponsorPortalSection: () => (
    <div data-testid="portal-section">Portal Section</div>
  ),
}))

jest.mock('@/components/admin/sponsor-crm/OrganizerSignatureCapture', () => ({
  __esModule: true,
  OrganizerSignatureCapture: () => (
    <div data-testid="organizer-signature">Organizer Signature</div>
  ),
}))

jest.mock('@heroicons/react/24/outline', () => {
  const icon = (name: string) => (props: any) => (
    <svg {...props} data-testid={`icon-${name}`} />
  )
  return {
    __esModule: true,
    CheckCircleIcon: icon('check'),
    ExclamationTriangleIcon: icon('warning'),
    DocumentTextIcon: icon('document'),
    PaperAirplaneIcon: icon('send'),
    ArrowPathIcon: icon('refresh'),
    ArrowTopRightOnSquareIcon: icon('external'),
    CheckIcon: icon('check-small'),
  }
})

// Use require() after jest.mock to ensure mocks are applied before module loads
const { SponsorContractView } =
  require('@/components/admin/sponsor-crm/SponsorContractView') as typeof import('@/components/admin/sponsor-crm/SponsorContractView')

describe('SponsorContractView', () => {
  const defaultTrpcMocks = () => {
    mockReadinessData.mockReturnValue({
      data: { ready: true, canSend: true, missing: [] },
    })
    mockBestTemplateData.mockReturnValue({
      data: {
        _id: 'tmpl-1',
        title: 'Standard Agreement',
        language: 'en',
      },
    })
    mockGeneratePdf.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    })
    mockSendContract.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    })
    mockCheckStatus.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    })
  }

  beforeEach(() => {
    defaultTrpcMocks()
  })

  const renderView = (
    sponsorOverrides: Partial<SponsorForConferenceExpanded> = {},
  ) =>
    render(
      <SponsorContractView
        conferenceId="conf-2026"
        sponsor={mockSponsor(sponsorOverrides)}
      />,
    )

  describe('overview step', () => {
    it('renders the 3-step flow', () => {
      renderView()
      expect(screen.getByText('Sponsor registration')).toBeInTheDocument()
      expect(screen.getByText(/Generate .* send contract/)).toBeInTheDocument()
      expect(screen.getByText('Digital signing')).toBeInTheDocument()
    })

    it('shows portal section when registration not complete', () => {
      renderView({ registrationComplete: false })
      expect(screen.getByTestId('portal-section')).toBeInTheDocument()
    })

    it('shows completion message when registration is done', () => {
      renderView({
        registrationComplete: true,
        registrationCompletedAt: '2026-02-01T12:00:00Z',
      })
      expect(
        screen.getByText(/Company details, contacts, billing/),
      ).toBeInTheDocument()
    })

    it('shows "Generate contract PDF" button when registration complete', () => {
      renderView({ registrationComplete: true })
      expect(screen.getByText('Generate contract PDF')).toBeInTheDocument()
    })

    it('shows template info when a template is found', () => {
      renderView({ registrationComplete: true })
      expect(
        screen.getByText(/Standard Agreement.*English/),
      ).toBeInTheDocument()
    })

    it('shows warning when no template exists', () => {
      mockBestTemplateData.mockReturnValue({ data: null })
      renderView({ registrationComplete: true })
      expect(screen.getByText(/No contract template found/)).toBeInTheDocument()
    })

    it('shows "Waiting for sponsor" when registration not started', () => {
      renderView({ registrationComplete: false, registrationToken: undefined })
      expect(
        screen.getByText(/Waiting for sponsor to complete registration/),
      ).toBeInTheDocument()
    })
  })

  describe('contract sent state', () => {
    it('shows contract details when contract is sent', () => {
      renderView({
        contractStatus: 'contract-sent',
        signatureStatus: 'pending',
        signatureId: 'sig-123',
        contractSentAt: '2026-02-10T10:00:00Z',
        contractValue: 100000,
        contractCurrency: 'NOK',
        signerEmail: 'jane@acme.com',
      })

      expect(screen.getByText('Contract details')).toBeInTheDocument()
      expect(screen.getByText(/100,000/)).toBeInTheDocument()
      expect(screen.getAllByText(/jane@acme.com/).length).toBeGreaterThan(0)
    })

    it('shows "Check status" button when awaiting signature', () => {
      renderView({
        contractStatus: 'contract-sent',
        signatureStatus: 'pending',
        signatureId: 'sig-123',
      })

      expect(screen.getByText('Check status')).toBeInTheDocument()
    })
  })

  describe('contract signed state', () => {
    it('shows signed confirmation', () => {
      renderView({
        contractStatus: 'contract-signed',
        signatureStatus: 'signed',
        contractSignedAt: '2026-02-15T10:00:00Z',
      })

      expect(screen.getByText(/Contract signed/)).toBeInTheDocument()
    })

    it('shows "View signed contract" link when document available', () => {
      renderView({
        contractStatus: 'contract-signed',
        signatureStatus: 'signed',
        contractDocument: {
          asset: { url: 'https://cdn.example.com/signed.pdf' },
        } as any,
      })

      expect(screen.getByText('View signed contract')).toBeInTheDocument()
    })
  })

  describe('counter-signature display', () => {
    it('shows organizer counter-sign info when present', () => {
      renderView({
        contractStatus: 'contract-sent',
        organizerSignedBy: 'Hans Admin',
        organizerSignedAt: '2026-02-09T08:00:00Z',
      })

      expect(screen.getByText('Counter-signed')).toBeInTheDocument()
      expect(screen.getByText(/Hans Admin/)).toBeInTheDocument()
    })

    it('does not show counter-sign info when absent', () => {
      renderView({ contractStatus: 'contract-sent' })
      expect(screen.queryByText('Counter-signed')).not.toBeInTheDocument()
    })
  })

  describe('readiness indicator', () => {
    it('shows readiness indicator when registration is complete', () => {
      renderView({ registrationComplete: true })
      expect(screen.getByTestId('readiness-indicator')).toBeInTheDocument()
    })
  })
})
