/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ApprovalSummary } from '@/components/travel-support/ApprovalSummary'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'

vi.mock('@/hooks/useExchangeRates', () => ({
  useExchangeRates: () => ({ convertCurrency: (amount: number) => amount }),
}))

describe('ApprovalSummary', () => {
  it('renders an approved request that has no banking details yet', () => {
    const travelSupport = {
      _id: 'ts1',
      status: 'approved',
      expenses: [],
    } as unknown as TravelSupportWithExpenses
    render(<ApprovalSummary travelSupport={travelSupport} />)
    expect(screen.getAllByText(/kr/).length).toBeGreaterThan(0)
  })

  it('shows the payout day in Oslo time, not UTC', () => {
    const travelSupport = {
      _id: 'ts1',
      status: 'paid',
      paidAt: '2026-05-15T23:30:00Z',
      expectedPaymentDate: '2026-05-10',
      expenses: [],
    } as unknown as TravelSupportWithExpenses
    render(<ApprovalSummary travelSupport={travelSupport} />)
    expect(screen.getByText(/Paid on/).textContent).toMatch(/16/)
  })
})
