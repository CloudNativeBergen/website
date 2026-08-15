/**
 * @vitest-environment node
 *
 * ONE NaN policy, proved at the surfaces that render money (#898).
 *
 * `amount.test.ts` pins the helper. This file pins the CALL SITES: every one of
 * them now behaves the same way when a provider sends an amount that does not
 * parse — the row contributes 0, the aggregate stays finite, and nothing turns
 * into NaN. Each assertion is on a VALUE, and the malformed row is placed
 * alongside good rows so a test cannot pass by the whole computation being
 * empty.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TicketSalesProcessor } from '@/lib/tickets/processor'
import { groupTicketsByOrder, isPaymentOverdue } from '@/lib/tickets/api'
import { formatTicketPrice, getLowestTicketPrice } from '@/lib/tickets/public'
import { calculateTicketStatistics } from '@/lib/tickets/utils'
import { deriveTicketIncome } from '@/lib/budget/income'
import { resetAmountIssueReporting } from '@/lib/tickets/amount'
import type {
  EventTicket,
  CheckinPayOrder,
  ProcessTicketSalesInput,
} from '@/lib/tickets/types'
import type { PublicTicketType } from '@/lib/tickets/public'
import { createMockConference } from '../../testdata/conference'

const BROKEN = 'not-a-number'

const ticket = (overrides: Partial<EventTicket> = {}): EventTicket => ({
  id: 1,
  order_id: 1,
  order_date: '2026-02-01T10:00:00Z',
  category: 'Regular',
  customer_name: 'Test User',
  sum: '2500.00',
  sum_left: '0',
  fields: [],
  crm: { first_name: 'Test', last_name: 'User', email: 'test@example.com' },
  ...overrides,
})

const processorInput = (
  tickets: ProcessTicketSalesInput['tickets'],
): ProcessTicketSalesInput => ({
  tickets,
  config: {
    enabled: true,
    salesStartDate: '2026-01-01',
    targetCurve: 'linear',
    milestones: [],
  },
  capacity: 150,
  conference: createMockConference(),
  conferenceDate: '2026-06-15',
  speakerCount: 0,
})

const publicTicket = (
  price: string,
  vat = '25',
  overrides: Partial<PublicTicketType> = {},
): PublicTicketType =>
  ({
    id: 1,
    name: 'Regular',
    description: null,
    position: 1,
    available: 10,
    requiresInvitation: false,
    begins: null,
    ends: null,
    price: [{ price, vat, description: null, key: null }],
    ...overrides,
  }) as unknown as PublicTicketType

beforeEach(() => {
  resetAmountIssueReporting()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a malformed amount never poisons an aggregate', () => {
  it('processor: one broken sum costs its own row, not the whole revenue total', () => {
    const result = new TicketSalesProcessor(
      processorInput([
        {
          order_id: 1,
          order_date: '2026-02-01T10:00:00Z',
          category: 'Regular',
          sum: '2500.00',
        },
        {
          order_id: 2,
          order_date: '2026-02-02T10:00:00Z',
          category: 'Regular',
          sum: BROKEN,
        },
        {
          order_id: 3,
          order_date: '2026-02-03T10:00:00Z',
          category: 'Regular',
          sum: '1500.00',
        },
      ]),
    ).process()

    expect(result.statistics.totalRevenue).toBe(4000)
    expect(Number.isNaN(result.statistics.totalRevenue)).toBe(false)
    // The ticket itself is still counted — only its money is missing.
    expect(result.statistics.totalPaidTickets).toBe(3)
  })

  it('statistics: average price stays a number', () => {
    const stats = calculateTicketStatistics([
      ticket({ id: 1, order_id: 1, sum: '2000.00' }),
      ticket({ id: 2, order_id: 2, sum: BROKEN }),
    ])
    expect(stats.totalRevenue).toBe(2000)
    expect(Number.isFinite(stats.averageTicketPrice)).toBe(true)
  })

  it('budget: live ticket income skips the broken order and keeps the rest', () => {
    const income = deriveTicketIncome([
      { order_id: 1, category: 'Regular', sum: '5000' },
      { order_id: 2, category: 'Comp', sum: BROKEN },
      { order_id: 3, category: 'Regular', sum: '2500' },
    ])
    expect(income.revenue).toBe(7500)
    expect(income.ticketCount).toBe(3)
  })

  it('orders table: a broken order shows 0, not NaN', () => {
    const [order] = groupTicketsByOrder([
      ticket({ id: 1, order_id: 7, sum: BROKEN, sum_left: BROKEN }),
    ])
    expect(order.totalAmount).toBe(0)
    expect(order.amountLeft).toBe(0)
  })
})

describe('the same policy on the payment and pricing surfaces', () => {
  const payOrder = (overrides: Partial<CheckinPayOrder>): CheckinPayOrder =>
    ({
      id: 1,
      orderId: 1,
      paid: false,
      dueAt: '2020-01-01T00:00:00Z',
      sum: '1000.00',
      sumLeft: '1000.00',
      sumVat: '250.00',
      ...overrides,
    }) as unknown as CheckinPayOrder

  it('a real outstanding balance past its due date is overdue', () => {
    expect(isPaymentOverdue(payOrder({}))).toBe(true)
  })

  it('an unparseable balance is treated as nothing outstanding, not as overdue', () => {
    expect(isPaymentOverdue(payOrder({ sumLeft: BROKEN }))).toBe(false)
  })

  it('formatTicketPrice renders 0 for a price that does not parse, never "NaN"', () => {
    expect(formatTicketPrice('2000', '25')).not.toContain('NaN')
    expect(formatTicketPrice(BROKEN, '25')).toBe('0')
    // A broken VAT falls back to the ex-VAT figure rather than NaN.
    expect(formatTicketPrice('2000', BROKEN, { includeVat: true })).toBe(
      formatTicketPrice('2000', '0', { includeVat: true }),
    )
  })

  it('getLowestTicketPrice ignores an unparseable price and still finds the real lowest', () => {
    const lowest = getLowestTicketPrice([
      publicTicket(BROKEN),
      publicTicket('1500'),
      publicTicket('3000'),
    ])
    expect(lowest?.amount).toBe(1500)
    expect(Number.isFinite(lowest?.amountInclVat ?? NaN)).toBe(true)
  })

  it('an unparseable VAT leaves the incl-VAT price equal to the ex-VAT one', () => {
    const lowest = getLowestTicketPrice([publicTicket('1500', BROKEN)])
    expect(lowest?.amount).toBe(1500)
    expect(lowest?.amountInclVat).toBe(1500)
  })
})

describe('the failure is reported rather than absorbed silently', () => {
  it('warns once for the malformed sum a revenue total would otherwise hide', () => {
    const warn = vi.spyOn(console, 'warn')
    deriveTicketIncome([
      { order_id: 1, category: 'Regular', sum: '5000' },
      { order_id: 2, category: 'Comp', sum: BROKEN },
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('unparseable amount')
  })

  it('says nothing about a legitimately absent amount', () => {
    const warn = vi.spyOn(console, 'warn')
    groupTicketsByOrder([ticket({ sum: '', sum_left: '' })])
    expect(warn).not.toHaveBeenCalled()
  })
})
