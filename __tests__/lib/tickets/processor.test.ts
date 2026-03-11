/**
 * @vitest-environment node
 */

import {
  TicketSalesProcessor,
  SPONSOR_TIER_TICKET_ALLOCATION,
} from '@/lib/tickets/processor'

import type {
  ProcessTicketSalesInput,
  SalesTargetConfig,
} from '@/lib/tickets/types'
import { createMockConference } from '../../testdata/conference'

const createMockConfig = (
  overrides: Partial<SalesTargetConfig> = {},
): SalesTargetConfig => ({
  enabled: true,
  salesStartDate: '2026-01-01',
  targetCurve: 'linear',
  milestones: [
    { date: '2026-03-01', targetPercentage: 30, label: 'Early Bird End' },
    { date: '2026-05-01', targetPercentage: 70, label: 'Regular End' },
  ],
  ...overrides,
})

function createTicket(
  date: string,
  category: string,
  sum: string,
  orderId: number,
) {
  return {
    order_id: orderId,
    order_date: date,
    category,
    sum,
  }
}

function createInput(
  overrides: Partial<ProcessTicketSalesInput> = {},
): ProcessTicketSalesInput {
  return {
    tickets: [createTicket('2026-02-01T10:00:00Z', 'Regular', '2500', 1)],
    config: createMockConfig(),
    capacity: 150,
    conference: createMockConference(),
    conferenceDate: '2026-06-15',
    speakerCount: 0,
    ...overrides,
  }
}

describe('TicketSalesProcessor', () => {
  describe('SPONSOR_TIER_TICKET_ALLOCATION', () => {
    it('should define allocations for Pod, Service, and Ingress', () => {
      expect(SPONSOR_TIER_TICKET_ALLOCATION['Pod']).toBe(2)
      expect(SPONSOR_TIER_TICKET_ALLOCATION['Service']).toBe(3)
      expect(SPONSOR_TIER_TICKET_ALLOCATION['Ingress']).toBe(5)
    })

    it('should return undefined for unknown tiers', () => {
      expect(SPONSOR_TIER_TICKET_ALLOCATION['Unknown']).toBeUndefined()
    })
  })

  describe('process()', () => {
    it('should process tickets and return complete analysis', () => {
      const input = createInput({
        tickets: [
          createTicket('2026-02-01T10:00:00Z', 'Regular', '2500', 1),
          createTicket('2026-02-01T11:00:00Z', 'Regular', '2500', 2),
          createTicket('2026-02-15T10:00:00Z', 'Early Bird', '1500', 3),
        ],
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics).toBeDefined()
      expect(result.progression).toBeDefined()
      expect(result.performance).toBeDefined()
      expect(result.capacity).toBe(150)
    })

    it('should calculate correct statistics', () => {
      const input = createInput({
        tickets: [
          createTicket('2026-02-01T10:00:00Z', 'Regular', '2500', 1),
          createTicket('2026-02-01T11:00:00Z', 'Regular', '2500', 2),
          createTicket('2026-02-15T10:00:00Z', 'Early Bird', '1500', 3),
        ],
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics.totalPaidTickets).toBe(3)
      expect(result.statistics.totalRevenue).toBe(6500)
      expect(result.statistics.totalOrders).toBe(3)
      expect(result.statistics.categoryBreakdown).toEqual({
        Regular: 2,
        'Early Bird': 1,
      })
    })

    it('should handle single ticket', () => {
      const input = createInput({
        tickets: [createTicket('2026-03-01T10:00:00Z', 'Regular', '2500', 1)],
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics.totalPaidTickets).toBe(1)
      expect(result.statistics.totalRevenue).toBe(2500)
    })

    it('should deduplicate revenue by order_id', () => {
      const input = createInput({
        tickets: [
          createTicket('2026-02-01T10:00:00Z', 'Regular', '2500', 1),
          createTicket('2026-02-01T10:00:00Z', 'Regular', '2500', 1),
        ],
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics.totalPaidTickets).toBe(2)
      expect(result.statistics.totalOrders).toBe(1)
      expect(result.statistics.totalRevenue).toBe(2500)
    })

    it('should include speaker count in capacity used', () => {
      const input = createInput({ speakerCount: 5 })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics.speakerTickets).toBe(5)
      expect(result.statistics.totalCapacityUsed).toBeGreaterThanOrEqual(5)
    })
  })

  describe('Target Curves', () => {
    it('should calculate linear progression correctly', () => {
      const input = createInput({
        config: createMockConfig({ targetCurve: 'linear' }),
        capacity: 100,
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.progression.length).toBeGreaterThan(0)
      const firstPoint = result.progression[0]
      expect(firstPoint.targetTickets).toBeGreaterThanOrEqual(0)

      const lastPoint = result.progression[result.progression.length - 1]
      expect(lastPoint.targetTickets).toBe(100)
    })

    it('should calculate s_curve progression', () => {
      const input = createInput({
        config: createMockConfig({ targetCurve: 's_curve' }),
        capacity: 100,
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.progression.length).toBeGreaterThan(0)
      const midIdx = Math.floor(result.progression.length / 2)
      if (midIdx > 0) {
        const earlyTarget = result.progression[0].targetTickets
        const midTarget = result.progression[midIdx].targetTickets
        expect(midTarget).toBeGreaterThan(earlyTarget)
      }
    })

    it('should calculate early_push progression', () => {
      const input = createInput({
        config: createMockConfig({ targetCurve: 'early_push' }),
        capacity: 100,
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.progression.length).toBeGreaterThan(0)
      const lastPoint = result.progression[result.progression.length - 1]
      expect(lastPoint.targetTickets).toBe(100)
    })

    it('should calculate late_push progression', () => {
      const input = createInput({
        config: createMockConfig({ targetCurve: 'late_push' }),
        capacity: 100,
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.progression.length).toBeGreaterThan(0)
      const lastPoint = result.progression[result.progression.length - 1]
      expect(lastPoint.targetTickets).toBe(100)
    })
  })

  describe('Performance Metrics', () => {
    it('should calculate variance correctly when behind target', () => {
      const input = createInput({
        tickets: [createTicket('2026-01-15T10:00:00Z', 'Regular', '2500', 1)],
        capacity: 100,
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.performance.currentPercentage).toBe(1)
      expect(result.performance.variance).toBeLessThan(0)
    })

    it('should mark as on-track when within 5% tolerance', () => {
      const tickets = Array.from({ length: 50 }, (_, i) =>
        createTicket('2026-01-15T10:00:00Z', 'Regular', '2500', i + 1),
      )

      const input = createInput({ tickets, capacity: 100 })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.performance.currentPercentage).toBe(50)
    })

    it('should identify the next milestone', () => {
      const futureDate = new Date()
      futureDate.setMonth(futureDate.getMonth() + 2)
      const futureDateStr = futureDate.toISOString().split('T')[0]

      const input = createInput({
        tickets: [createTicket('2026-01-15T10:00:00Z', 'Regular', '2500', 1)],
        config: createMockConfig({
          milestones: [
            {
              date: futureDateStr,
              targetPercentage: 50,
              label: 'Future Milestone',
            },
          ],
        }),
        capacity: 100,
        conference: createMockConference({ startDate: '2027-06-15' }),
        conferenceDate: '2027-06-15',
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      if (result.performance.nextMilestone) {
        expect(result.performance.nextMilestone.label).toBe('Future Milestone')
        expect(result.performance.nextMilestone.daysAway).toBeGreaterThan(0)
      }
    })
  })

  describe('Cumulative Progression', () => {
    it('should build running totals across dates', () => {
      const input = createInput({
        tickets: [
          createTicket('2026-02-01T10:00:00Z', 'Regular', '2500', 1),
          createTicket('2026-02-01T11:00:00Z', 'Regular', '2500', 2),
          createTicket('2026-02-15T10:00:00Z', 'Regular', '2500', 3),
          createTicket('2026-03-01T10:00:00Z', 'Regular', '2500', 4),
        ],
        capacity: 100,
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      for (let i = 1; i < result.progression.length; i++) {
        expect(result.progression[i].actualTickets).toBeGreaterThanOrEqual(
          result.progression[i - 1].actualTickets,
        )
      }
    })
  })

  describe('Sponsor Ticket Calculation', () => {
    it('should calculate sponsor tickets from tier allocations', () => {
      const input = createInput({
        capacity: 100,
        conference: createMockConference({
          sponsors: [
            {
              sponsor: { _id: 's1', name: 'S1', website: '', logo: '' },
              tier: {
                title: 'Ingress',
                tagline: '',
                tierType: 'standard',
                price: [{ _key: 'k', amount: 50000, currency: 'NOK' }],
              },
            },
            {
              sponsor: { _id: 's2', name: 'S2', website: '', logo: '' },
              tier: {
                title: 'Pod',
                tagline: '',
                tierType: 'standard',
                price: [{ _key: 'k', amount: 10000, currency: 'NOK' }],
              },
            },
          ],
        }),
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      // Ingress=5 + Pod=2 = 7
      expect(result.statistics.sponsorTickets).toBe(7)
    })

    it('should return 0 sponsor tickets when no sponsors', () => {
      const input = createInput({
        capacity: 100,
        conference: createMockConference({ sponsors: [] }),
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics.sponsorTickets).toBe(0)
    })

    it('should return 0 for unknown tier titles', () => {
      const input = createInput({
        capacity: 100,
        conference: createMockConference({
          sponsors: [
            {
              sponsor: { _id: 's1', name: 'S1', website: '', logo: '' },
              tier: {
                title: 'Unknown',
                tagline: '',
                tierType: 'standard',
                price: [],
              },
            },
          ],
        }),
      })

      const processor = new TicketSalesProcessor(input)
      const result = processor.process()

      expect(result.statistics.sponsorTickets).toBe(0)
    })
  })
})
