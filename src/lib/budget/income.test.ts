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
    currency = 'NOK',
    tierCurrency = 'NOK',
  ) =>
    ({
      status,
      invoiceStatus,
      contractValue,
      contractCurrency: currency,
      tier: tierAmount
        ? { price: [{ amount: tierAmount, currency: tierCurrency }] }
        : undefined,
    }) as Parameters<typeof deriveSponsorIncome>[0][number]

  it('sums closed-won contract values as signed revenue (single currency)', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', 25000),
      sponsor('closed-won', 50000, 'paid'),
      sponsor('closed-lost', 25000),
      sponsor('negotiating', 40000),
      sponsor('prospect', 10000),
    ])
    expect(result.byCurrency).toEqual([
      {
        currency: 'NOK',
        signedRevenue: 75000,
        paidRevenue: 50000,
        openPipelineRevenue: 50000,
      },
    ])
    expect(result.signedCount).toBe(2)
    expect(result.totalSponsors).toBe(5)
  })

  it('groups mixed-currency deals per currency, never summing across them', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', 25000),
      sponsor('closed-won', 10000, 'paid', undefined, 'USD'),
      sponsor('negotiating', 5000, 'not-sent', undefined, 'EUR'),
    ])
    // NOK first, then alphabetical — deterministic for rendering.
    expect(result.byCurrency).toEqual([
      {
        currency: 'NOK',
        signedRevenue: 25000,
        paidRevenue: 0,
        openPipelineRevenue: 0,
      },
      {
        currency: 'EUR',
        signedRevenue: 0,
        paidRevenue: 0,
        openPipelineRevenue: 5000,
      },
      {
        currency: 'USD',
        signedRevenue: 10000,
        paidRevenue: 10000,
        openPipelineRevenue: 0,
      },
    ])
    expect(result.signedCount).toBe(2)
  })

  it('falls back to the tier price when a deal has no contract value', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', undefined, 'not-sent', 25000),
    ])
    expect(result.byCurrency).toEqual([
      {
        currency: 'NOK',
        signedRevenue: 25000,
        paidRevenue: 0,
        openPipelineRevenue: 0,
      },
    ])
  })

  it('treats a stored 0 like calculateSponsorValue: falls back to tier price', () => {
    const result = deriveSponsorIncome([
      sponsor('closed-won', 0, 'not-sent', 25000),
    ])
    expect(result.byCurrency[0]?.signedRevenue).toBe(25000)
  })

  it("denominates a tier-price fallback in the TIER's currency", () => {
    // Deal currency says NOK, but the value comes from a USD-priced tier —
    // labeling it NOK would misreport (calculateSponsorValue semantics).
    const result = deriveSponsorIncome([
      sponsor('closed-won', undefined, 'not-sent', 5000, 'NOK', 'USD'),
    ])
    expect(result.byCurrency).toEqual([
      {
        currency: 'USD',
        signedRevenue: 5000,
        paidRevenue: 0,
        openPipelineRevenue: 0,
      },
    ])
  })

  it('handles an empty pipeline', () => {
    const result = deriveSponsorIncome([])
    expect(result.byCurrency).toEqual([])
    expect(result.signedCount).toBe(0)
    expect(result.totalSponsors).toBe(0)
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
