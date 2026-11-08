/**
 * Parity for #2153: `EventTicket` / `PublicTicketType` moved from Checkin's
 * decimal strings and numeric ids to Konf `Money` (minor units + currency) and
 * string ids. Every revenue surface must DISPLAY the same numbers as before.
 *
 * The expected values below were RECORDED by running this same scenario
 * against origin/main (9f6b1632, pre-refactor: the raw rows fed straight in as
 * `EventTicket`s, ticket-type prices as strings) — they are the "before". The
 * test feeds the same raw Checkin/Tito payloads through the new provider
 * mapping and asserts every surface still produces them.
 */
import { describe, expect, it } from 'vitest'
import {
  fromCheckinTicketRow,
  type CheckinEventTicketRow,
} from './provider/checkin'
import { toMoney, toPerTicketAmounts } from './provider/types'
import type { PublicTicketType } from './provider/types'
import { moneyToMajor } from './amount'
import type { EventTicket } from './types'
import { calculateCategoryStats, calculateTicketStatistics } from './utils'
import { TicketSalesProcessor } from './processor'
import { adaptForChart } from './chart-adapter'
import { reconcileOrderAmounts } from './reconcile'
import { groupTicketsByOrder } from './api'
import { formatTicketPrice, getLowestTicketPrice } from './public'
import { deriveTicketIncome } from '@/lib/budget/income'
import { calculateDiscountUsage } from '@/lib/discounts/usage'
import { formatCurrency } from '@/lib/format'
import { createMockConference } from '../../../__tests__/testdata/conference'

const crm = (email: string) => ({ first_name: 'A', last_name: 'B', email })

// Raw `eventTickets` rows as Checkin sends them. Checkin is `'per-order'`: the
// ORDER total repeats on every row of that order.
const RAW: (CheckinEventTicketRow & { order_date: string })[] = [
  // 3-seat order whose total does not divide evenly (3000.01 / 3).
  ...[1, 2, 3].map((id) => ({
    id,
    order_id: 100,
    order_date: '2026-02-01T10:00:00Z',
    category: 'Conference',
    customer_name: null,
    sum: '3000.01',
    sum_left: '1000.00',
    fields: [],
    crm: crm(`a${id}@example.com`),
  })),
  {
    id: 4,
    order_id: 101,
    order_date: '2026-02-03T10:00:00Z',
    category: 'Workshop',
    customer_name: null,
    sum: '1249.50',
    sum_left: '0.00',
    coupon: 'early',
    fields: [],
    crm: crm('b@example.com'),
  },
  // A refund row: negative amount.
  {
    id: 5,
    order_id: 102,
    order_date: '2026-02-04T10:00:00Z',
    category: 'Conference',
    customer_name: null,
    sum: '-499.99',
    sum_left: '0',
    fields: [],
    crm: crm('c@example.com'),
  },
  // 100%-off grant.
  {
    id: 6,
    order_id: 103,
    order_date: '2026-02-05T10:00:00Z',
    category: 'Speaker ticket',
    customer_name: null,
    sum: '0',
    sum_left: '0',
    coupon: 'SPEAKER',
    fields: [],
    crm: crm('d@example.com'),
  },
  {
    id: 7,
    order_id: 104,
    order_date: '2026-02-06T10:00:00Z',
    category: 'Workshop',
    customer_name: null,
    sum: '999.99',
    sum_left: '999.99',
    coupon: 'EARLY',
    fields: [],
    crm: crm('e@example.com'),
  },
]

/** The new path: provider mapping, then the adapter's declared basis. */
const TICKETS: EventTicket[] = toPerTicketAmounts(
  RAW.map((r) => ({ ...fromCheckinTicketRow(r), order_date: r.order_date })),
  'per-order',
)

/** Raw ticket types: Checkin (net + VAT rate, NOK) and Tito (gross, EUR). */
const RAW_TYPES: {
  id: number
  name: string
  price: string
  vat: string
  currency: string
}[] = [
  { id: 1, name: 'Early Bird', price: '1599.20', vat: '25', currency: 'NOK' },
  { id: 2, name: 'Standard', price: '2399.99', vat: '25', currency: 'NOK' },
  { id: 3, name: 'Student', price: '499.50', vat: '12', currency: 'NOK' },
  { id: 4, name: 'Tito gross', price: '350.75', vat: '0', currency: 'EUR' },
  { id: 5, name: 'Free', price: '0', vat: '25', currency: 'NOK' },
]

const TYPES: PublicTicketType[] = RAW_TYPES.map((t, i) => ({
  id: String(t.id),
  name: t.name,
  type: 'ticket',
  description: null,
  price: [
    {
      price: toMoney(t.price, t.currency),
      vat: t.vat,
      description: null,
      key: null,
    },
  ],
  available: 10,
  requiresInvitation: false,
  visibleStartsAt: null,
  visibleEndsAt: null,
  position: i,
}))

const cents = (n: number) => n.toFixed(2)

describe('money parity on every revenue surface (#2153)', () => {
  it('summary: statistics and per-category revenue', () => {
    const stats = calculateTicketStatistics(TICKETS)
    expect(cents(stats.totalRevenue)).toBe('4749.51')
    expect(cents(stats.averageTicketPrice)).toBe('678.50')
    expect(stats.totalOrders).toBe(5)
    expect(formatCurrency(stats.totalRevenue)).toBe(formatCurrency(4749.51))
    const byCategory = Object.fromEntries(
      calculateCategoryStats(TICKETS, TICKETS.length).map((c) => [
        c.category,
        cents(c.revenue),
      ]),
    )
    expect(byCategory).toEqual({
      Conference: '2500.02',
      Workshop: '2249.49',
      'Speaker ticket': '0.00',
    })
  })

  it('chart adapter: processor revenue and chart series', () => {
    const analysis = new TicketSalesProcessor({
      tickets: TICKETS.map((t) => ({
        order_id: t.order_id,
        order_date: t.order_date,
        category: t.category,
        sum: t.sum,
      })),
      config: {
        enabled: true,
        salesStartDate: '2026-01-01',
        targetCurve: 'linear',
        milestones: [],
      },
      capacity: 100,
      conference: createMockConference(),
      conferenceDate: '2026-06-15',
      speakerCount: 0,
    }).process()
    expect(cents(analysis.statistics.totalRevenue)).toBe('4749.51')
    expect(
      cents(analysis.progression[analysis.progression.length - 1].revenue),
    ).toBe('4749.51')
    const chart = adaptForChart(analysis)
    expect(chart.series.length).toBe(4)
  })

  it('reconcile: the 3-seat order against its provider total', () => {
    const seats = TICKETS.filter((t) => t.order_id === '100')
    const result = reconcileOrderAmounts({
      orderSum: 3000.01,
      orderSumVat: 600,
      seatSums: seats.map((t) => moneyToMajor(t.sum)),
    })
    expect(result?.verdict).toBe('per-ticket')
    expect(cents(result!.seatSum)).toBe('3000.01')
  })

  it('admin widgets: orders table, budget income, discount usage', () => {
    const orders = Object.fromEntries(
      groupTicketsByOrder(TICKETS).map((o) => [
        o.order_id,
        [cents(o.totalAmount), cents(o.amountLeft)],
      ]),
    )
    expect(orders).toEqual({
      '100': ['3000.01', '1000.00'],
      '101': ['1249.50', '0.00'],
      '102': ['-499.99', '0.00'],
      '103': ['0.00', '0.00'],
      '104': ['999.99', '999.99'],
    })
    const income = deriveTicketIncome(TICKETS)
    expect(cents(income.revenue)).toBe('5249.50')
    expect(income.ticketCount).toBe(5)
    const usage = calculateDiscountUsage(TICKETS)
    expect(cents(usage.EARLY.totalPaid)).toBe('2249.49')
    expect(usage.EARLY.usageCount).toBe(2)
  })

  it('public ticket pages: prices excl./incl. VAT and the lowest price', () => {
    expect(
      TYPES.map((t) => [
        formatTicketPrice(t.price[0].price, t.price[0].vat),
        formatTicketPrice(t.price[0].price, t.price[0].vat, {
          includeVat: true,
        }),
      ]),
    ).toEqual([
      ['1\u00a0599', '1\u00a0999'],
      ['2\u00a0400', '3\u00a0000'],
      ['500', '559'],
      ['351', '351'],
      ['0', '0'],
    ])
    const lowest = getLowestTicketPrice(TYPES)
    expect(lowest?.amount).toBe(351)
    expect(cents(lowest!.amountInclVat)).toBe('351.00')
    expect(lowest?.formatted).toBe('351')
  })
})
