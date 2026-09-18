/**
 * @vitest-environment node
 *
 * ONE fixture, every surviving revenue path.
 *
 * Before this, three implementations answered three different numbers for the
 * same tickets — per-order dedup in `TicketSalesProcessor` and
 * `deriveTicketIncome`, per-ticket sums in `calculateTicketStatistics`, and a
 * per-category divisor in `calculateCategoryStats` — and nothing in the suite
 * noticed, because each one was asserted in isolation against its own
 * convention. This file is the thing that notices.
 *
 * The fixture is deliberately the two shapes that separate the conventions:
 *  - a MIXED-category order (one conference pass + one workshop add-on), which
 *    the old category divisor counted in full under BOTH categories, and
 *  - a MULTI-TICKET single-category order, whose extra seats per-order dedup
 *    discarded.
 */

import { TicketSalesProcessor } from '@/lib/tickets/processor'
import {
  calculateCategoryStats,
  calculateTicketStatistics,
} from '@/lib/tickets/utils'
import { groupTicketsByOrder } from '@/lib/tickets/api'
import { deriveTicketIncome } from '@/lib/budget/income'
import { toPerTicketAmounts } from '@/lib/tickets/provider/types'
import type { EventTicket, SalesTargetConfig } from '@/lib/tickets/types'
import { createMockConference } from '../../testdata/conference'

const ticket = (
  id: number,
  order_id: number,
  category: string,
  sum: string,
): EventTicket => ({
  id,
  order_id,
  order_date: '2026-02-01T10:00:00Z',
  category,
  customer_name: 'Test User',
  sum,
  sum_left: '0',
  fields: [],
  crm: { first_name: 'Test', last_name: 'User', email: `${id}@example.com` },
})

// Order 1: a conference pass plus a workshop add-on (mixed categories).
// Order 2: two conference passes (multi-ticket, single category).
const TICKETS: EventTicket[] = [
  ticket(1, 1, 'Conference', '2500'),
  ticket(2, 1, 'Workshop', '1500'),
  ticket(3, 2, 'Conference', '3000'),
  ticket(4, 2, 'Conference', '3000'),
]

const EXPECTED_REVENUE = 10_000

const config: SalesTargetConfig = {
  enabled: true,
  salesStartDate: '2026-01-01',
  targetCurve: 'linear',
  milestones: [],
}

function processorResult() {
  return new TicketSalesProcessor({
    tickets: TICKETS.map((t) => ({
      order_id: t.order_id,
      order_date: t.order_date,
      category: t.category,
      sum: t.sum,
    })),
    config,
    capacity: 150,
    conference: createMockConference(),
    conferenceDate: '2026-06-15',
    speakerCount: 0,
  }).process()
}

describe('toPerTicketAmounts (the one place the convention can be flipped)', () => {
  it('leaves a per-ticket feed alone', () => {
    expect(toPerTicketAmounts(TICKETS, 'per-ticket')).toBe(TICKETS)
  })

  it('splits a per-order feed, so the same total reaches every path', () => {
    // The same two orders, but with the ORDER total repeated on every ticket —
    // what `amountBasis: 'per-order'` declares.
    const perOrderFeed = TICKETS.map((t) => ({
      ...t,
      sum: t.order_id === 1 ? '4000' : '6000',
    }))

    const normalized = toPerTicketAmounts(perOrderFeed, 'per-order')

    expect(normalized.map((t) => t.sum)).toEqual([
      '2000',
      '2000',
      '3000',
      '3000',
    ])
    expect(calculateTicketStatistics(normalized).totalRevenue).toBe(
      EXPECTED_REVENUE,
    )
  })
})

describe('revenue reconciliation across every path', () => {
  it('calculateTicketStatistics', () => {
    expect(calculateTicketStatistics(TICKETS).totalRevenue).toBe(
      EXPECTED_REVENUE,
    )
  })

  it('TicketSalesProcessor statistics', () => {
    const result = processorResult()
    expect(result.statistics.totalRevenue).toBe(EXPECTED_REVENUE)
    expect(result.statistics.totalOrders).toBe(2)
  })

  it('TicketSalesProcessor daily progression (the chart series)', () => {
    const progression = processorResult().progression
    const latestRevenue = Math.max(...progression.map((p) => p.revenue))
    expect(latestRevenue).toBe(EXPECTED_REVENUE)
  })

  it('deriveTicketIncome (budget actuals)', () => {
    expect(deriveTicketIncome(TICKETS).revenue).toBe(EXPECTED_REVENUE)
  })

  it('groupTicketsByOrder totals (the Orders page)', () => {
    const orders = groupTicketsByOrder(TICKETS)
    expect(orders.map((o) => o.totalAmount)).toEqual([4000, 6000])
    expect(orders.reduce((total, o) => total + o.totalAmount, 0)).toBe(
      EXPECTED_REVENUE,
    )
  })

  it('the category column sums to the headline revenue', () => {
    const stats = calculateCategoryStats(TICKETS, TICKETS.length)
    expect(stats.find((c) => c.category === 'Conference')?.revenue).toBe(8500)
    expect(stats.find((c) => c.category === 'Workshop')?.revenue).toBe(1500)
    expect(stats.reduce((total, c) => total + c.revenue, 0)).toBe(
      EXPECTED_REVENUE,
    )
  })
})
