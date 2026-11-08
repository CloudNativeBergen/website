/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PaymentDetailsModal } from './PaymentDetailsModal'
import type { OrderPaymentDetails } from '@/lib/tickets/provider/types'

afterEach(cleanup)

const order: OrderPaymentDetails = {
  provider: 'checkin',
  externalId: '1001',
  orderId: '5001',
  kid: null,
  invoiceReference: null,
  createdAt: '2025-01-15T10:30:00Z',
  invoiceDate: null,
  deliveryDate: null,
  dueAt: '2025-02-15T23:59:59Z',
  contact: {
    firstName: 'Maria',
    lastName: 'Jensen',
    email: 'maria@example.com',
  },
  billing: null,
  currency: 'NOK',
  paymentMethod: 'INVOICE',
  paymentStatus: 'PAID',
  actionRequired: null,
  totalMinor: 1500000,
  amountLeftMinor: 0,
  vatMinor: 375000,
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
    show({
      seatSums: [
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
      ],
    })
    expect(
      screen.getByText(/3 seat amounts sum to .* — matches this total/),
    ).toBeTruthy()
    expect(screen.queryByText(/Ticket rows repeat the order total/)).toBeNull()
  })

  it('warns loudly, and names the one line to flip, on a per-order reading', () => {
    show({
      paymentDetails: { ...order, totalMinor: 500000 },
      seatSums: [
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
      ],
    })
    expect(screen.getByText('Ticket rows repeat the order total')).toBeTruthy()
    expect(screen.getByText('CheckinProvider.amountBasis')).toBeTruthy()
    expect(
      screen.getByText(/inflated by the number of seats per order/),
    ).toBeTruthy()
  })

  it('explains a VAT-sized difference without crying basis mismatch', () => {
    show({
      paymentDetails: { ...order, totalMinor: 1875000 },
      seatSums: [
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
      ],
    })
    expect(screen.getByText(/Amount basis is not in question/)).toBeTruthy()
    expect(screen.queryByText('Ticket rows repeat the order total')).toBeNull()
    expect(
      screen.queryByText('Order total and ticket amounts disagree'),
    ).toBeNull()
  })

  it('says unknown rather than guessing at an unexplained difference', () => {
    show({
      paymentDetails: { ...order, totalMinor: 900000 },
      seatSums: [
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
      ],
    })
    expect(
      screen.getByText('Order total and ticket amounts disagree'),
    ).toBeTruthy()
    expect(screen.getByText(/the cause is unknown/)).toBeTruthy()
  })

  it('refuses to claim confirmation from a single-seat order', () => {
    show({
      paymentDetails: { ...order, totalMinor: 500000 },
      seatSums: [{ amountMinor: 500000, currency: 'NOK' }],
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
      seatSums: [
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
        { amountMinor: 500000, currency: 'NOK' },
      ],
    })
    expect(screen.queryByText(/seat amounts sum to/)).toBeNull()
    expect(screen.queryByText('Ticket rows repeat the order total')).toBeNull()
  })
})
