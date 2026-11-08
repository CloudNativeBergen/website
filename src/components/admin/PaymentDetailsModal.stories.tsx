import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import type { OrderPaymentDetails } from '@/lib/tickets/provider/types'

const FIXED_NOW = new Date('2025-03-01T12:00:00Z')

const baseOrder: OrderPaymentDetails = {
  provider: 'checkin',
  externalId: '1001',
  orderId: '5001',
  kid: '00012345678',
  invoiceReference: 'INV-2025-001',
  createdAt: '2025-01-15T10:30:00Z',
  invoiceDate: '2025-01-15T10:30:00Z',
  deliveryDate: '2025-06-12T08:00:00Z',
  dueAt: '2025-02-15T23:59:59Z',
  contact: {
    firstName: 'Maria',
    lastName: 'Jensen',
    email: 'maria@techgiant.com',
  },
  billing: {
    firstName: 'Erik',
    lastName: 'Olsen',
    email: 'billing@techgiant.com',
  },
  currency: 'NOK',
  paymentMethod: 'INVOICE',
  paymentStatus: 'PAID',
  actionRequired: null,
  totalMinor: 1500000,
  amountLeftMinor: 0,
  vatMinor: 375000,
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
  beforeEach: () => {
    const OriginalDate = globalThis.Date
    const fixedTime = FIXED_NOW.getTime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate

    return () => {
      globalThis.Date = OriginalDate
    }
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
      amountLeftMinor: 1500000,
      dueAt: '2025-08-15T23:59:59Z',
    },
  },
}

export const Overdue: Story = {
  args: {
    paymentDetails: {
      ...baseOrder,
      paymentStatus: 'PENDING',
      paid: false,
      amountLeftMinor: 1500000,
      dueAt: '2025-01-15T23:59:59Z',
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

/**
 * The provider's order total checked against that order's seat amounts (#1093).
 * A consistent reading stays a quiet one-liner; a per-order or unexplained one
 * has to be seen.
 */
export const BasisConsistent: Story = {
  args: {
    paymentDetails: baseOrder,
    seatSums: [
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
    ],
  },
}

export const BasisPerOrderWarning: Story = {
  args: {
    paymentDetails: { ...baseOrder, totalMinor: 500000 },
    seatSums: [
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
    ],
  },
}

export const BasisVatDifference: Story = {
  args: {
    paymentDetails: { ...baseOrder, totalMinor: 1875000 },
    seatSums: [
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
    ],
  },
}

export const BasisUnexplained: Story = {
  args: {
    paymentDetails: { ...baseOrder, totalMinor: 900000 },
    seatSums: [
      { amountMinor: 500000, currency: 'NOK' },
      { amountMinor: 500000, currency: 'NOK' },
    ],
  },
}
