/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import type { CheckinPayOrder } from '@/lib/tickets/types'

afterEach(cleanup)

const order: CheckinPayOrder = {
  id: 1001,
  belongsTo: 42,
  orderId: 5001,
  orderType: 'SALE',
  documentType: 'INVOICE',
  kid: null,
  invoiceReference: null,
  archivedAt: null,
  createdAt: '2025-01-15T10:30:00Z',
  invoiceDate: null,
  deliveryDate: null,
  dueAt: '2025-02-15T23:59:59Z',
  contactCrm: {
    firstName: 'Maria',
    lastName: 'Jensen',
    email: { email: 'maria@example.com' },
  },
  billingCrm: null,
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

function show(
  props: Partial<React.ComponentProps<typeof PaymentDetailsModal>>,
) {
  return render(
    <PaymentDetailsModal
      isOpen
      onClose={vi.fn()}
      isLoading={false}
      error={null}
      paymentDetails={order}
      {...props}
    />,
  )
}

describe('PaymentDetailsModal amount-basis check', () => {
  it('confirms quietly when the seats sum to the order total', () => {
    show({ seatSums: ['5000.00', '5000.00', '5000.00'] })
    expect(
      screen.getByText(/3 seat amounts sum to .* — matches this total/),
    ).toBeTruthy()
    expect(screen.queryByText(/Ticket rows repeat the order total/)).toBeNull()
  })

  it('warns loudly, and names the one line to flip, on a per-order reading', () => {
    show({
      paymentDetails: { ...order, sum: '5000.00' },
      seatSums: ['5000.00', '5000.00', '5000.00'],
    })
    expect(screen.getByText('Ticket rows repeat the order total')).toBeTruthy()
    expect(screen.getByText('CheckinProvider.amountBasis')).toBeTruthy()
    expect(
      screen.getByText(/inflated by the number of seats per order/),
    ).toBeTruthy()
  })

  it('explains a VAT-sized difference without crying basis mismatch', () => {
    show({
      paymentDetails: { ...order, sum: '18750.00' },
      seatSums: ['5000.00', '5000.00', '5000.00'],
    })
    expect(screen.getByText(/Amount basis is not in question/)).toBeTruthy()
    expect(screen.queryByText('Ticket rows repeat the order total')).toBeNull()
    expect(
      screen.queryByText('Order total and ticket amounts disagree'),
    ).toBeNull()
  })

  it('says unknown rather than guessing at an unexplained difference', () => {
    show({
      paymentDetails: { ...order, sum: '9000.00' },
      seatSums: ['5000.00', '5000.00'],
    })
    expect(
      screen.getByText('Order total and ticket amounts disagree'),
    ).toBeTruthy()
    expect(screen.getByText(/the cause is unknown/)).toBeTruthy()
  })

  it('refuses to claim confirmation from a single-seat order', () => {
    show({
      paymentDetails: { ...order, sum: '5000.00' },
      seatSums: ['5000.00'],
    })
    expect(screen.getByText(/Single-seat order/)).toBeTruthy()
    expect(screen.queryByText(/matches this total\./)).toBeNull()
  })

  it('renders nothing when no seat amounts are available', () => {
    show({ seatSums: undefined })
    expect(screen.queryByText(/seat amounts sum to/)).toBeNull()
    expect(screen.queryByText(/Single-seat order/)).toBeNull()
    expect(screen.queryByText('Ticket rows repeat the order total')).toBeNull()
  })

  it('renders nothing when the payment read failed', () => {
    show({
      paymentDetails: null,
      error: 'Failed to fetch payment details',
      seatSums: ['5000.00', '5000.00', '5000.00'],
    })
    expect(screen.queryByText(/seat amounts sum to/)).toBeNull()
    expect(screen.queryByText('Ticket rows repeat the order total')).toBeNull()
  })
})
