import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import type { CheckinPayOrder } from '@/lib/tickets/types'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

const baseOrder: CheckinPayOrder = {
  id: 1001,
  belongsTo: 42,
  orderId: 5001,
  orderType: 'SALE',
  documentType: 'INVOICE',
  kid: '00012345678',
  invoiceReference: 'INV-2025-001',
  archivedAt: null,
  createdAt: '2025-01-15T10:30:00Z',
  invoiceDate: '2025-01-15T10:30:00Z',
  deliveryDate: '2025-06-12T08:00:00Z',
  dueAt: '2025-02-15T23:59:59Z',
  contactCrm: {
    firstName: 'Maria',
    lastName: 'Jensen',
    email: { email: 'maria@techgiant.com' },
  },
  billingCrm: {
    firstName: 'Erik',
    lastName: 'Olsen',
    email: { email: 'billing@techgiant.com' },
  },
  currency: 'NOK',
  country: 'NO',
  paymentMethod: 'INVOICE',
  paymentStatus: 'PAID',
  actionRequired: null,
  debtStatus: null,
  debtLastUpdatedAt: null,
  sum: '15000.00',
  sumLeft: '0.00',
  sumVat: '3750.00',
  paid: true,
}

const meta = {
  title: 'Systems/Proposals/Admin/PaymentDetailsModal',
  component: PaymentDetailsModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Displays detailed payment information for an order, including payment status, amounts, customer info, and important dates.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    isLoading: false,
    error: null,
  },
} satisfies Meta<typeof PaymentDetailsModal>

export default meta
type Story = StoryObj<typeof meta>

export const Paid: Story = {
  args: {
    paymentDetails: baseOrder,
  },
}

export const Pending: Story = {
  args: {
    paymentDetails: {
      ...baseOrder,
      paymentStatus: 'PENDING',
      paid: false,
      sumLeft: '15000.00',
      dueAt: daysFromNow(30),
    },
  },
}

export const Overdue: Story = {
  args: {
    paymentDetails: {
      ...baseOrder,
      paymentStatus: 'PENDING',
      paid: false,
      sumLeft: '15000.00',
      dueAt: daysFromNow(-14),
      actionRequired: 'Payment is overdue. Please follow up with the customer.',
    },
  },
}

export const Loading: Story = {
  args: {
    paymentDetails: null,
    isLoading: true,
  },
}

export const Error: Story = {
  args: {
    paymentDetails: null,
    error: 'Failed to load payment details. The order may no longer exist.',
  },
}
