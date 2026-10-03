/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { mockSponsor } from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

// Mock next-auth/react
const mockSession = {
  speaker: { _id: 'speaker-1', name: 'Test Organizer', isOrganizer: true },
  user: { name: 'Test Organizer' },
}
vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: mockSession }),
}))

// Mock tRPC hooks
const mockReadinessData = vi.fn<() => any>()
const mockBestTemplateData = vi.fn<() => any>()
const mockGeneratePdf = vi.fn<(opts?: any) => any>()
const mockCheckStatus = vi.fn<() => any>()

vi.mock('@/lib/trpc/client', () => ({
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
          useMutation: (opts: any) => mockGeneratePdf(opts),
        },
      },
      crm: {
        checkSignatureStatus: {
          useMutation: (opts: any) => mockCheckStatus(),
        },
      },
    },
  },
}))

// Mock sub-components that have their own tRPC dependencies
vi.mock('@/components/admin/sponsor-crm/ContractReadinessIndicator', () => ({
  __esModule: true,
  ContractReadinessIndicator: () => (
    <div data-testid="readiness-indicator">Readiness OK</div>
  ),
}))

vi.mock('@/components/admin/sponsor-crm/SponsorPortalSection', () => ({
  __esModule: true,
  SponsorPortalSection: () => (
    <div data-testid="portal-section">Portal Section</div>
  ),
}))

vi.mock('@/components/admin/sponsor-crm/OrganizerSignatureCapture', () => ({
  __esModule: true,
  OrganizerSignatureCapture: () => (
    <div data-testid="organizer-signature">Organizer Signature</div>
  ),
}))

vi.mock('@heroicons/react/24/outline', () => {
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

// vi.mock calls are hoisted automatically by Vitest
import { SponsorContractView } from '@/components/admin/sponsor-crm/SponsorContractView'

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
      mutate: vi.fn(),
      isPending: false,
    })
    mockCheckStatus.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
  }

  beforeEach(() => {
    defaultTrpcMocks()
  })

  it('still offers to resend the registration link once registration is complete (#1263)', () => {
    const onSendRegistration = vi.fn()
    render(
      <SponsorContractView
        conferenceId="conf-2026"
        sponsor={mockSponsor({
          status: 'closed-won',
          registrationComplete: true,
          registrationToken: 'tok-1',
        })}
        onSendRegistration={onSendRegistration}
      />,
    )
    screen.getByRole('button', { name: 'Resend registration link' }).click()
    expect(onSendRegistration).toHaveBeenCalledTimes(1)
  })

  it('offers no resend once the deal is no longer won, even with registration complete', () => {
    render(
      <SponsorContractView
        conferenceId="conf-2026"
        sponsor={mockSponsor({
          status: 'closed-lost',
          registrationComplete: true,
          registrationToken: 'tok-1',
        })}
        onSendRegistration={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Resend registration link' }),
    ).not.toBeInTheDocument()
  })

  it('offers no resend when the host cannot open the Send modal', () => {
    render(
      <SponsorContractView
        conferenceId="conf-2026"
        sponsor={mockSponsor({
          status: 'closed-won',
          registrationComplete: true,
          registrationToken: 'tok-1',
        })}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Resend registration link' }),
    ).not.toBeInTheDocument()
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
      renderView({ registrationComplete: false, status: 'closed-won' })
      expect(screen.getByTestId('portal-section')).toBeInTheDocument()
    })

    it('shows warning instead of portal when sponsor is not closed-won', () => {
      renderView({ registrationComplete: false, status: 'negotiating' })
      expect(
        screen.getByText(
          /Move the sponsor to Closed Won before sending registration/,
        ),
      ).toBeInTheDocument()
      expect(screen.queryByTestId('portal-section')).not.toBeInTheDocument()
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
      expect(screen.getByText(/100\s000/)).toBeInTheDocument()
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

  describe('confirmation step survives the handoff (#1264)', () => {
    const toConfirm = () => {
      mockGeneratePdf.mockImplementation((opts: any) => ({
        mutate: () => opts.onSuccess({ pdf: 'QUJD', filename: 'c.pdf' }),
        isPending: false,
      }))
      const onSendContract = vi.fn()
      const view = render(
        <SponsorContractView
          conferenceId="conf-2026"
          sponsor={mockSponsor({ registrationComplete: true })}
          onSendContract={onSendContract}
        />,
      )
      fireEvent.click(screen.getByText('Generate contract PDF'))
      fireEvent.click(screen.getByText('Looks good, continue'))
      return { ...view, onSendContract }
    }

    it('keeps the reviewed PDF and the confirmation step after handing off to the composer', () => {
      const { onSendContract } = toConfirm()
      fireEvent.click(screen.getByText('Continue to send'))
      expect(onSendContract).toHaveBeenCalledWith(
        expect.objectContaining({ contractTemplateId: 'tmpl-1' }),
      )
      // Still on the confirmation step: a composer closed without sending
      // comes back here, not to a regenerate.
      expect(screen.getByText('Continue to send')).toBeInTheDocument()
    })

    it('returns to the overview once the record carries the sent agreement', () => {
      const { rerender, onSendContract } = toConfirm()
      fireEvent.click(screen.getByText('Continue to send'))
      rerender(
        <SponsorContractView
          conferenceId="conf-2026"
          sponsor={mockSponsor({
            registrationComplete: true,
            contractStatus: 'contract-sent',
            signatureStatus: 'pending',
            signatureId: 'agr-1',
          })}
          onSendContract={onSendContract}
        />,
      )
      expect(screen.queryByText('Continue to send')).not.toBeInTheDocument()
      expect(screen.getByText(/Contract sent/)).toBeInTheDocument()
    })
  })

  describe('contract signed state', () => {
    it('offers "Send signed copy" only for a digitally signed document', () => {
      const signed = {
        contractStatus: 'contract-signed' as const,
        signatureStatus: 'signed' as const,
        contractDocument: {
          asset: { url: 'https://cdn.example.com/signed.pdf' },
        } as any,
      }
      const { unmount } = render(
        <SponsorContractView
          conferenceId="conf-2026"
          sponsor={mockSponsor(signed)}
          onSendContract={vi.fn()}
        />,
      )
      // Signed by hand: the stored document is the unsigned original.
      expect(screen.queryByText('Send signed copy')).not.toBeInTheDocument()
      unmount()
      render(
        <SponsorContractView
          conferenceId="conf-2026"
          sponsor={mockSponsor({
            ...signed,
            contractSignedBy: 'Kari Nordmann',
          })}
          onSendContract={vi.fn()}
        />,
      )
      expect(screen.getByText('Send signed copy')).toBeInTheDocument()
    })

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
