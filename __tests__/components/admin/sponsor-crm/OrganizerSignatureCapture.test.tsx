/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, act } from '@testing-library/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any

// Capture the onSignatureChange callback passed to SignaturePadCanvas
let capturedOnSignatureChange: ((dataUrl: string | null) => void) | null = null

vi.mock('@/components/sponsor/SignaturePadCanvas', () => ({
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

vi.mock('@heroicons/react/24/outline', () => ({
  __esModule: true,
  CheckIcon: (props: any) => <svg {...props} data-testid="icon-check" />,
  PencilSquareIcon: (props: any) => (
    <svg {...props} data-testid="icon-pencil" />
  ),
  TrashIcon: (props: any) => <svg {...props} data-testid="icon-trash" />,
}))

// vi.mock calls are hoisted automatically by Vitest
import { OrganizerSignatureCapture } from '@/components/admin/sponsor-crm/OrganizerSignatureCapture'

const STORAGE_KEY = 'organizer-signature-org-1'
const FAKE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

describe('OrganizerSignatureCapture', () => {
  const onSignatureReady = vi.fn<(dataUrl: string | null) => void>()

  beforeEach(() => {
    onSignatureReady.mockClear()
    capturedOnSignatureChange = null
    localStorage.clear()
  })

  const renderCapture = (overrides?: {
    disabled?: boolean
    organizerId?: string
  }) =>
    render(
      <OrganizerSignatureCapture
        organizerId={overrides?.organizerId ?? 'org-1'}
        organizerName="Jane Organizer"
        onSignatureReady={onSignatureReady}
        disabled={overrides?.disabled}
      />,
    )

  describe('initial state (no saved signature)', () => {
    it('shows the signature pad and instructions', () => {
      renderCapture()
      expect(screen.getByText(/Counter-signature/)).toBeInTheDocument()
      expect(screen.getByText(/saved locally/)).toBeInTheDocument()
      expect(screen.getByTestId('signature-pad')).toBeInTheDocument()
    })

    it('calls onSignatureReady with null on mount', () => {
      renderCapture()
      expect(onSignatureReady).toHaveBeenCalledWith(null)
    })

    it('does not show Redraw or Remove buttons', () => {
      renderCapture()
      expect(screen.queryByText('Redraw')).not.toBeInTheDocument()
      expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    })
  })

  describe('drawing a signature', () => {
    it('does not save until Done is clicked', () => {
      renderCapture()

      act(() => {
        capturedOnSignatureChange?.(FAKE_SIGNATURE)
      })

      // Not saved yet — still drawing
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('saves to localStorage and notifies parent when Done is clicked', () => {
      renderCapture()

      act(() => {
        capturedOnSignatureChange?.(FAKE_SIGNATURE)
      })

      fireEvent.click(screen.getByText('Done'))

      expect(localStorage.getItem(STORAGE_KEY)).toBe(FAKE_SIGNATURE)
      expect(onSignatureReady).toHaveBeenCalledWith(FAKE_SIGNATURE)
    })

    it('supports multiple strokes before saving', () => {
      renderCapture()

      // Simulate multiple strokes — pad should stay visible
      act(() => {
        capturedOnSignatureChange?.('data:image/png;base64,stroke1')
      })
      expect(screen.getByTestId('signature-pad')).toBeInTheDocument()

      act(() => {
        capturedOnSignatureChange?.('data:image/png;base64,stroke2')
      })
      expect(screen.getByTestId('signature-pad')).toBeInTheDocument()

      act(() => {
        capturedOnSignatureChange?.(FAKE_SIGNATURE)
      })
      expect(screen.getByTestId('signature-pad')).toBeInTheDocument()

      // Only saves when Done is clicked, with the latest data
      fireEvent.click(screen.getByText('Done'))
      expect(localStorage.getItem(STORAGE_KEY)).toBe(FAKE_SIGNATURE)
    })

    it('does not save when signature is null (cleared pad)', () => {
      renderCapture()

      act(() => {
        capturedOnSignatureChange?.(null)
      })

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(onSignatureReady).toHaveBeenCalledWith(null)
    })
  })

  describe('with existing saved signature', () => {
    beforeEach(() => {
      localStorage.setItem(STORAGE_KEY, FAKE_SIGNATURE)
    })

    it('shows preview on mount', () => {
      renderCapture()
      expect(
        screen.getByAltText("Jane Organizer's signature"),
      ).toBeInTheDocument()
      expect(screen.getByText('Redraw')).toBeInTheDocument()
      expect(screen.getByText('Remove')).toBeInTheDocument()
    })

    it('notifies parent with saved signature on mount', () => {
      renderCapture()
      expect(onSignatureReady).toHaveBeenCalledWith(FAKE_SIGNATURE)
    })

    it('shows signature pad when Redraw is clicked', () => {
      renderCapture()
      fireEvent.click(screen.getByText('Redraw'))
      expect(screen.getByTestId('signature-pad')).toBeInTheDocument()
    })

    it('clears signature from localStorage when Remove is clicked', () => {
      renderCapture()
      fireEvent.click(screen.getByText('Remove'))

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(onSignatureReady).toHaveBeenCalledWith(null)
    })
  })

  describe('disabled state', () => {
    it('shows informative message when disabled and no saved signature', () => {
      renderCapture({ disabled: true })
      expect(screen.getByText(/No counter-signature saved/)).toBeInTheDocument()
    })

    it('shows read-only preview when disabled with saved signature', () => {
      localStorage.setItem(STORAGE_KEY, FAKE_SIGNATURE)
      renderCapture({ disabled: true })

      expect(
        screen.getByAltText("Jane Organizer's signature"),
      ).toBeInTheDocument()
      expect(screen.queryByText('Redraw')).not.toBeInTheDocument()
      expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    })
  })

  describe('per-organizer storage isolation', () => {
    it('uses different storage keys for different organizer IDs', () => {
      localStorage.setItem('organizer-signature-org-1', FAKE_SIGNATURE)

      renderCapture({ organizerId: 'org-2' })

      // Should not find the signature from org-1
      expect(onSignatureReady).toHaveBeenCalledWith(null)
      expect(screen.getByTestId('signature-pad')).toBeInTheDocument()
    })
  })
})
