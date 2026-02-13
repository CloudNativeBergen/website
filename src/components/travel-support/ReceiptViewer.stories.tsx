import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ReceiptViewer } from './ReceiptViewer'
import type { ExpenseReceipt } from '@/lib/travel-support/types'

const meta = {
  title: 'Systems/Speakers/TravelSupport/ReceiptViewer',
  component: ReceiptViewer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full-screen receipt viewer overlay with zoom controls for images, download button, and close action. Renders images inline with zoom and falls back to an iframe for PDFs and other file types.',
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
