/**
 * @vitest-environment node
 *
 * The two pure pieces behind the discount-usage panel:
 *
 *  - `calculateDiscountUsage` — what we can derive by scanning an event's
 *    tickets, including the fact that it derives NOTHING for a code nobody has
 *    redeemed. That emptiness is what the router must not confuse with a failed
 *    read (`tickets.discountUsage.test.ts` holds that line).
 *  - `resolveRedemptionCount` — which of the two available counters a row is
 *    showing, so the UI can name the source instead of calling the provider's
 *    own number an estimate.
 */
import { describe, it, expect } from 'vitest'
import { calculateDiscountUsage, resolveRedemptionCount } from './usage'
import type { EventDiscountWithUsage } from './types'
import type { EventTicket } from '@/lib/tickets/types'

const ticket = (
  id: number,
  overrides: Partial<EventTicket> = {},
): EventTicket => ({
  id,
  order_id: 500 + id,
  category: 'Regular',
  customer_name: null,
  sum: '1000',
  sum_left: '0',
  fields: [],
  crm: { first_name: 'A', last_name: 'B', email: `a${id}@example.com` },
  order_date: '2026-06-01',
  ...overrides,
})

const discount = (
  overrides: Partial<EventDiscountWithUsage> = {},
): EventDiscountWithUsage => ({
  trigger: 'coupon',
  type: 'percentage',
  value: '100',
  triggerValue: 'ACME2026',
  affects: 'total',
  includeBooking: false,
  affectsValue: null,
  modes: [],
  tickets: [],
  ticketsOnly: true,
  times: 0,
  timesTotal: 10,
  ...overrides,
})

describe('calculateDiscountUsage', () => {
  it('derives nothing for codes nobody redeemed — and that is an ANSWER', () => {
    // Two real tickets, neither carrying a code. The empty object is what the
    // router must publish as `resolved`, not as "unavailable".
    expect(calculateDiscountUsage([ticket(1), ticket(2)])).toEqual({})
  })

  it('groups by code case-insensitively and keeps the ticket ids', () => {
    const stats = calculateDiscountUsage([
      ticket(1, { coupon: 'acme2026' }),
      ticket(2, { coupon: 'ACME2026' }),
      ticket(3, { coupon: 'earlybird' }),
    ])

    expect(stats).toEqual({
      ACME2026: { usageCount: 2, ticketIds: [1, 2], totalPaid: 2000 },
      EARLYBIRD: { usageCount: 1, ticketIds: [3], totalPaid: 1000 },
    })
  })

  it('reads `discount` when `coupon` is absent', () => {
    const stats = calculateDiscountUsage([ticket(1, { discount: 'SPEAKER' })])
    expect(stats.SPEAKER.usageCount).toBe(1)
  })

  it('sums what the buyer PAID — which for a 100%-off code is zero', () => {
    // The field is `totalPaid`, and this is why the old name `totalValue` was
    // a lie: a sponsor code discounts the full list price and leaves 0 paid.
    // Nothing here can see the list price, so nothing here can state the
    // discounted amount.
    const stats = calculateDiscountUsage([
      ticket(1, { coupon: 'ACME2026', sum: '0' }),
      ticket(2, { coupon: 'ACME2026', sum: '0' }),
    ])

    expect(stats.ACME2026).toEqual({
      usageCount: 2,
      ticketIds: [1, 2],
      totalPaid: 0,
    })
  })

  it('keeps decimals, and treats an unparseable amount as 0 without losing the redemption', () => {
    const stats = calculateDiscountUsage([
      ticket(1, { coupon: 'HALF', sum: '1000.50' }),
      ticket(2, { coupon: 'HALF', sum: 'n/a' }),
    ])

    // The count is the point of the panel; a bad amount must not drop a row.
    expect(stats.HALF.usageCount).toBe(2)
    expect(stats.HALF.totalPaid).toBe(1000.5)
  })
})

describe('resolveRedemptionCount', () => {
  it('prefers OUR derived count when the ticket read resolved', () => {
    const d = discount({
      times: 3,
      actualUsage: { usageCount: 1, ticketIds: [7], totalPaid: 0 },
    })
    expect(resolveRedemptionCount(d)).toEqual({ count: 1, fromProvider: false })
  })

  it('reports a derived ZERO as ours, not as a fallback', () => {
    // The regression that started all this: a known zero must not be dressed up
    // as the provider's number, and must not raise the "provider count" hint.
    const d = discount({
      times: 9,
      actualUsage: { usageCount: 0, ticketIds: [], totalPaid: 0 },
    })
    expect(resolveRedemptionCount(d)).toEqual({ count: 0, fromProvider: false })
  })

  it('falls back to the provider counter — and SAYS SO — when usage is absent', () => {
    const d = discount({ times: 3, actualUsage: undefined })
    expect(resolveRedemptionCount(d)).toEqual({ count: 3, fromProvider: true })
  })

  it('still flags the source when the provider counter itself is zero', () => {
    // `count: 0, fromProvider: true` is "we do not know, and the vendor has not
    // recorded any" — visibly different in the UI from a derived zero.
    const d = discount({ times: 0, actualUsage: undefined })
    expect(resolveRedemptionCount(d)).toEqual({ count: 0, fromProvider: true })
  })
})
