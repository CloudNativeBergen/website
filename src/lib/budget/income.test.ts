import { describe, expect, it } from 'vitest'

import {
  deriveManualTicketIncome,
  deriveSponsorIncome,
  deriveTicketIncome,
} from './income'

describe('deriveSponsorIncome', () => {
  const sponsor = (
    status: string,
    contractValue: number | undefined,
    invoiceStatus = 'not-sent',
    tierAmount?: number,
  ) =>
    ({
      status,
      invoiceStatus,
      contractValue,
      contractCurrency: 'NOK',
      tier: tierAmount
        ? { price: [{ amount: tierAmount, currency: 'NOK' }] }
        : undefined,
    }) as Parameters<typeof deriveSponsorIncome>[0][number]

  it('sums closed-won contract values as signed revenue', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', 25000),
      sponsor('closed-won', 50000, 'paid'),
      sponsor('closed-lost', 25000),
      sponsor('negotiating', 40000),
      sponsor('prospect', 10000),
    ])
    expect(result.signedRevenue).toBe(75000)
    expect(result.paidRevenue).toBe(50000)
    expect(result.openPipelineRevenue).toBe(50000)
    expect(result.signedCount).toBe(2)
    expect(result.totalSponsors).toBe(5)
    expect(result.currency).toBe('NOK')
  })

  it('falls back to the tier price when a deal has no contract value', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', undefined, 'not-sent', 25000),
    ])
    expect(result.signedRevenue).toBe(25000)
  })

  it('treats a stored 0 like calculateSponsorValue: falls back to tier price', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', 0, 'not-sent', 25000),
    ])
    expect(result.signedRevenue).toBe(25000)
  })

  it('handles an empty pipeline', () => {
    const result = deriveSponsorIncome([])
    expect(result.signedRevenue).toBe(0)
    expect(result.paidRevenue).toBe(0)
    expect(result.currency).toBe('NOK')
  })
})

describe('deriveTicketIncome', () => {
  it('counts revenue once per order (order-sum dedupe)', () => {
    // sum is the ORDER total repeated on every ticket of the order.
    const result = deriveTicketIncome([
      { order_id: 1, category: 'Early Bird', sum: '5000' },
      { order_id: 1, category: 'Early Bird', sum: '5000' },
      { order_id: 2, category: 'Standard', sum: '2500' },
    ])
    expect(result.revenue).toBe(7500)
    expect(result.ticketCount).toBe(3)
    expect(result.orderCount).toBe(2)
    expect(result.categoryCounts).toEqual({
      'Early Bird': 2,
      Standard: 1,
    })
    expect(result.source).toBe('live')
  })

  it('ignores unparsable order sums', () => {
    const result = deriveTicketIncome([
      { order_id: 1, category: 'Comp', sum: 'not-a-number' },
    ])
    expect(result.revenue).toBe(0)
    expect(result.ticketCount).toBe(1)
  })
})

describe('deriveManualTicketIncome', () => {
  it('derives revenue ex VAT from manually-entered counts', () => {
    const result = deriveManualTicketIncome(
      [
        { name: 'Standard', priceInclVat: 3125, actualCount: 10 },
        { name: 'Speaker', priceInclVat: 0, actualCount: 5 },
        { name: 'Late Bird', priceInclVat: 3750, actualCount: null },
        { name: 'Workshop', priceInclVat: 5500 },
      ],
      0.25,
    )
    // 10 x 3125/1.25 = 25,000; comp tickets count but add no revenue.
    expect(result.revenue).toBeCloseTo(25000)
    expect(result.ticketCount).toBe(15)
    expect(result.categoryCounts).toEqual({ Standard: 10, Speaker: 5 })
    expect(result.source).toBe('manual')
  })

  it('returns zeros when no counts are entered', () => {
    const result = deriveManualTicketIncome(
      [{ name: 'Standard', priceInclVat: 3125 }],
      0.25,
    )
    expect(result.revenue).toBe(0)
    expect(result.ticketCount).toBe(0)
  })
})
