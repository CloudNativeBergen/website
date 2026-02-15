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
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expect = jestExpect as any

// Mock tRPC hooks before importing the component
const mockGetContract = jest.fn<() => any>()
const mockSubmitSignature = jest.fn<() => any>()
let submitOnSuccess: ((...args: any[]) => void) | undefined
let submitOnError: ((...args: any[]) => void) | undefined

jest.mock('@/lib/trpc/client', () => ({
  api: {
    signing: {
      getContract: {
        useQuery: (input: any) => mockGetContract(),
      },
      submitSignature: {
        useMutation: (opts: any) => {
          submitOnSuccess = opts?.onSuccess
          submitOnError = opts?.onError
          return mockSubmitSignature()
        },
      },
    },
  },
}))

jest.mock('@heroicons/react/24/outline', () => {
  const icon = (name: string) => (props: any) => (
    <svg {...props} data-testid={`icon-${name}`} />
  )
  return {
    __esModule: true,
    ArrowDownTrayIcon: icon('download'),
    CheckCircleIcon: icon('check-circle'),
    DocumentTextIcon: icon('document'),
    EnvelopeIcon: icon('envelope'),
    ExclamationTriangleIcon: icon('warning'),
    PencilIcon: icon('pencil'),
    ShieldCheckIcon: icon('shield'),
  }
})

// Mock SignaturePadCanvas
let capturedOnSignatureChange: ((dataUrl: string | null) => void) | null = null
jest.mock('@/components/sponsor/SignaturePadCanvas', () => ({
  __esModule: true,
  SignaturePadCanvas: ({
    onSignatureChange,
  }: {
    onSignatureChange: (dataUrl: string | null) => void
  }) => {
    capturedOnSignatureChange = onSignatureChange
    return <div data-testid="signature-pad">Signature Pad</div>
  },
}))

// Use require() after jest.mock to ensure mocks are applied before module loads
const { ContractSigningPage } =
  require('@/components/sponsor/ContractSigningPage') as typeof import('@/components/sponsor/ContractSigningPage')

const MOCK_CONTRACT = {
  status: 'pending',
  sponsorName: 'Acme Corp',
  conferenceName: 'Cloud Native Days 2026',
  conferenceCity: 'Bergen',
  conferenceStartDate: '2026-06-10',
  organizer: 'Cloud Native Bergen',
  tierName: 'Ingress',
  contractValue: 100000,
  contractCurrency: 'NOK',
  signerEmail: 'jane@acme.com',
  contractPdfUrl: 'https://example.com/contract.pdf',
}

describe('ContractSigningPage', () => {
  beforeEach(() => {
    capturedOnSignatureChange = null
    submitOnSuccess = undefined
    submitOnError = undefined
  })

  describe('loading state', () => {
    it('shows loading spinner while fetching contract', () => {
      mockGetContract.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)
      expect(screen.getByText(/Loading contract/)).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error when contract fetch fails', () => {
      mockGetContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Token expired' },
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)
      expect(screen.getByText('Unable to Load Contract')).toBeInTheDocument()
      expect(screen.getByText('Token expired')).toBeInTheDocument()
    })

    it('shows error when contract is not found', () => {
      mockGetContract.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)
      expect(screen.getByText('Contract not found.')).toBeInTheDocument()
    })
  })

  describe('already signed state', () => {
    it('shows already signed message for signed contracts', () => {
      mockGetContract.mockReturnValue({
        data: { ...MOCK_CONTRACT, status: 'signed' },
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)
      expect(screen.getByText('Contract Already Signed')).toBeInTheDocument()
      expect(screen.getByText(/Acme Corp/)).toBeInTheDocument()
    })

    it('shows download link when signed contract has PDF URL', () => {
      mockGetContract.mockReturnValue({
        data: {
          status: 'signed',
          sponsorName: 'Acme Corp',
          conferenceName: 'Cloud Native Days 2026',
          contractPdfUrl: 'https://example.com/signed-contract.pdf',
        },
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)
      const downloadLink = screen.getByText('Download Signed Agreement')
      expect(downloadLink).toBeInTheDocument()
      expect(downloadLink.closest('a')).toHaveAttribute(
        'href',
        'https://example.com/signed-contract.pdf',
      )
    })

    it('does not show download link when signed contract has no PDF URL', () => {
      mockGetContract.mockReturnValue({
        data: {
          status: 'signed',
          sponsorName: 'Acme Corp',
          conferenceName: 'Cloud Native Days 2026',
        },
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)
      expect(screen.getByText('Contract Already Signed')).toBeInTheDocument()
      expect(
        screen.queryByText('Download Signed Agreement'),
      ).not.toBeInTheDocument()
    })
  })

  describe('review step', () => {
    beforeEach(() => {
      mockGetContract.mockReturnValue({
        data: MOCK_CONTRACT,
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })
    })

    it('displays contract details', () => {
      render(<ContractSigningPage token="test-token" />)

      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
      expect(
        screen.getAllByText('Cloud Native Days 2026').length,
      ).toBeGreaterThan(0)
      expect(screen.getByText('Ingress')).toBeInTheDocument()
      expect(screen.getByText(/100\s000/)).toBeInTheDocument()
    })

    it('shows PDF iframe when contractPdfUrl is provided', () => {
      render(<ContractSigningPage token="test-token" />)
      const iframe = screen.getByTitle('Contract PDF')
      expect(iframe).toBeInTheDocument()
    })

    it('navigates to sign step when "Proceed to Sign" is clicked', () => {
      render(<ContractSigningPage token="test-token" />)
      fireEvent.click(screen.getByText('Proceed to Sign'))
      // Now on sign step — should see the signature pad
      expect(screen.getByText('Sign the Agreement')).toBeInTheDocument()
    })
  })

  describe('sign step', () => {
    const mutate = jest.fn()

    beforeEach(() => {
      mockGetContract.mockReturnValue({
        data: MOCK_CONTRACT,
        isLoading: false,
        error: null,
      })
      mutate.mockClear()
      mockSubmitSignature.mockReturnValue({
        mutate,
        isPending: false,
      })
    })

    const goToSignStep = () => {
      render(<ContractSigningPage token="test-token" />)
      fireEvent.click(screen.getByText('Proceed to Sign'))
    }

    it('shows signer email', () => {
      goToSignStep()
      expect(screen.getByText('jane@acme.com')).toBeInTheDocument()
    })

    it('has disabled submit button initially', () => {
      goToSignStep()
      const submitBtn = screen.getByText('Submit Signature')
      expect(submitBtn).toBeDisabled()
    })

    it('enables submit when name, signature, and agreement are provided', async () => {
      goToSignStep()

      // Fill in name
      const nameInput = screen.getByPlaceholderText(
        'Enter your full legal name',
      )
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })

      // Draw signature
      capturedOnSignatureChange?.('data:image/png;base64,abc123')

      // Check agreement
      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)

      const submitBtn = screen.getByText('Submit Signature')
      expect(submitBtn).not.toBeDisabled()
    })

    it('keeps submit disabled without agreement checkbox', () => {
      goToSignStep()

      const nameInput = screen.getByPlaceholderText(
        'Enter your full legal name',
      )
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
      capturedOnSignatureChange?.('data:image/png;base64,abc123')

      const submitBtn = screen.getByText('Submit Signature')
      expect(submitBtn).toBeDisabled()
    })

    it('keeps submit disabled without signature', () => {
      goToSignStep()

      const nameInput = screen.getByPlaceholderText(
        'Enter your full legal name',
      )
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)

      const submitBtn = screen.getByText('Submit Signature')
      expect(submitBtn).toBeDisabled()
    })

    it('calls submitSignature mutation on submit', () => {
      goToSignStep()

      const nameInput = screen.getByPlaceholderText(
        'Enter your full legal name',
      )
      fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
      capturedOnSignatureChange?.('data:image/png;base64,abc123')
      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)

      fireEvent.click(screen.getByText('Submit Signature'))

      expect(mutate).toHaveBeenCalledWith({
        token: 'test-token',
        signatureDataUrl: 'data:image/png;base64,abc123',
        signerName: 'Jane Doe',
      })
    })
  })

  describe('complete step', () => {
    it('shows completion banner when navigated via initialStep', () => {
      mockGetContract.mockReturnValue({
        data: MOCK_CONTRACT,
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" initialStep="complete" />)

      expect(
        screen.getByText('Agreement Signed Successfully'),
      ).toBeInTheDocument()
    })

    it('uses signed PDF URL from mutation response, not stale query data', async () => {
      mockGetContract.mockReturnValue({
        data: MOCK_CONTRACT,
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      render(<ContractSigningPage token="test-token" />)

      // Simulate onSuccess with a DIFFERENT contractPdfUrl than the query
      const signedUrl = 'https://example.com/signed-contract.pdf'
      submitOnSuccess?.({
        sponsorName: 'Acme Corp',
        conferenceName: 'Cloud Native Days 2026',
        conferenceCity: 'Bergen',
        organizer: 'Cloud Native Bergen',
        tierName: 'Ingress',
        contractValue: 100000,
        contractCurrency: 'NOK',
        signerName: 'Jane Doe',
        signerEmail: 'jane@acme.com',
        signedAt: '2026-02-15T10:00:00Z',
        contractPdfUrl: signedUrl,
      })

      await waitFor(() => {
        expect(
          screen.getByText('Agreement Signed Successfully'),
        ).toBeInTheDocument()
      })

      const downloadLink = screen.getByText('Download')
      expect(downloadLink.closest('a')).toHaveAttribute('href', signedUrl)
    })

    it('shows submission error when mutation fails', async () => {
      mockGetContract.mockReturnValue({
        data: MOCK_CONTRACT,
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })

      const { rerender } = render(<ContractSigningPage token="test-token" />)

      const { act } = await import('@testing-library/react')
      act(() => {
        submitOnError?.({ message: 'Network error' })
      })
      rerender(<ContractSigningPage token="test-token" />)

      await waitFor(() => {
        expect(
          screen.getByText('Signature submission failed'),
        ).toBeInTheDocument()
      })
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  describe('step indicator', () => {
    beforeEach(() => {
      mockGetContract.mockReturnValue({
        data: MOCK_CONTRACT,
        isLoading: false,
        error: null,
      })
      mockSubmitSignature.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      })
    })

    it('shows Review as active on review step', () => {
      render(<ContractSigningPage token="test-token" />)
      expect(screen.getByText('Review')).toBeInTheDocument()
      expect(screen.getByText('Sign')).toBeInTheDocument()
      expect(screen.getByText('Complete')).toBeInTheDocument()
    })
  })
})
