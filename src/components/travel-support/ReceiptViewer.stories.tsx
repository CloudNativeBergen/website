import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ReceiptViewer } from './ReceiptViewer'
import type { ExpenseReceipt } from '@/lib/travel-support/types'
import { withPortalTheme } from '@/lib/storybook'

// Renders the REAL ReceiptViewer (not a mock shell). It was converted from a
// bare `fixed inset-0` overlay to the shared ModalShell with a custom 5-control
// toolbar. Presentation is `centered` (opting out of the mobile bottom sheet):
// a document/image viewer wants the same full-height centered card at every
// width so the receipt is never cropped and zoom/scroll behave consistently.
// The dialog takes its accessible name from ModalShell's `ariaLabel` since the
// toolbar has too many actions for the standard single-close header.

const meta = {
  title: 'Systems/Speakers/TravelSupport/ReceiptViewer',
  component: ReceiptViewer,
  tags: ['autodocs'],
  decorators: [withPortalTheme],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Receipt viewer built on the shared ModalShell (centered full-height presentation) with a custom toolbar: zoom controls for images, download, and close. Renders images inline with zoom and falls back to an iframe for PDFs and other file types.',
      },
    },
  },
} satisfies Meta<typeof ReceiptViewer>

export default meta
type Story = StoryObj<typeof meta>

const imageReceipt: ExpenseReceipt = {
  file: {
    _type: 'file',
    asset: { _ref: 'file-abc123', _type: 'reference' },
  },
  filename: 'hotel-receipt.jpg',
  uploadedAt: '2026-01-15T10:30:00Z',
  url: 'https://placehold.co/800x600/e2e8f0/475569?text=Hotel+Receipt',
}

const pdfReceipt: ExpenseReceipt = {
  file: {
    _type: 'file',
    asset: { _ref: 'file-def456', _type: 'reference' },
  },
  filename: 'flight-invoice.pdf',
  uploadedAt: '2026-01-10T14:00:00Z',
  url: 'https://placehold.co/800x600/e2e8f0/475569?text=PDF+Document',
}

export const ImageReceipt: Story = {
  args: {
    receipt: imageReceipt,
    receiptIndex: 0,
    onClose: fn(),
  },
}

export const PdfReceipt: Story = {
  args: {
    receipt: pdfReceipt,
    receiptIndex: 1,
    onClose: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Non-image files are displayed in an iframe. Zoom controls are hidden for non-image content.',
      },
    },
  },
}
