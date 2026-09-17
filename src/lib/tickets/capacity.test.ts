/**
 * @vitest-environment node
 *
 * `ticketCapacity` is the SELLABLE total, and a conference may never have set
 * one. `/admin/tickets` used to paper over that with `ticketCapacity || 250`,
 * which both invented a venue size and hid the fact that
 * `calculatePerformance` divided by the capacity with no zero guard. Removing
 * the fallback makes 0 reachable, so these tests drive it.
 */
import { describe, it, expect } from 'vitest'
import { TicketSalesProcessor } from './processor'
import { createDefaultAnalysis } from './utils'
import type { Conference } from '@/lib/conference/types'
import type { ProcessTicketSalesInput, SalesTargetConfig } from './types'

const config: SalesTargetConfig = {
  enabled: true,
  salesStartDate: '2026-01-01',
  targetCurve: 'linear',
  milestones: [],
}

const conference = { sponsors: [] } as unknown as Conference

function input(capacity: number): ProcessTicketSalesInput {
  return {
    tickets: [
      {
        order_id: 1,
        order_date: '2026-02-01T10:00:00Z',
        category: 'Regular',
        sum: '2500',
      },
      {
        order_id: 2,
        order_date: '2026-02-02T10:00:00Z',
        category: 'Regular',
        sum: '2500',
      },
    ],
    config,
    capacity,
    conference,
    conferenceDate: '2026-06-15',
    speakerCount: 3,
  }
}

const numbersIn = (value: unknown): number[] => {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(numbersIn)
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(numbersIn)
  return []
}

describe('capacity percentage', () => {
  it('is sellable-ticket progress when a capacity is set', () => {
    const result = new TicketSalesProcessor(input(200)).process()

    // 2 of 200 sellable tickets. Comps are NOT added in: the field's own
    // definition excludes sponsor and speaker tickets.
    expect(result.statistics.totalPaidTickets).toBe(2)
    expect(result.performance.currentPercentage).toBe(1)
    expect(result.capacity).toBe(200)
  })

  it('reports 0% — never NaN or Infinity — when no capacity is set', () => {
    const result = new TicketSalesProcessor(input(0)).process()

    expect(result.performance.currentPercentage).toBe(0)
    expect(result.capacity).toBe(0)

    // Nothing anywhere in the result reaches the UI as NaN or Infinity.
    const values = numbersIn(result)
    expect(values.length).toBeGreaterThan(0)
    expect(values.every(Number.isFinite)).toBe(true)
  })

  it('divides by nothing in the no-analysis fallback either', () => {
    const result = createDefaultAnalysis([], 0)

    expect(result.capacity).toBe(0)
    expect(result.performance.currentPercentage).toBe(0)
    expect(numbersIn(result).every(Number.isFinite)).toBe(true)
  })
})
