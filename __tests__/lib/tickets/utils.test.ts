/**
 * @vitest-environment jsdom
 */
import {
  calculateTicketStatistics,
  calculateFreeTicketClaimRate,
  calculateCapacityPercentage,
  calculateCategoryStats,
  calculateFreeTicketAllocation,
} from '@/lib/tickets/utils'
import type { EventTicket } from '@/lib/tickets/types'

const createMockTicket = (
  overrides: Partial<EventTicket> = {},
): EventTicket => ({
  id: 1,
  order_id: 1,
  order_date: '2024-01-01T10:00:00Z',
  category: 'Regular',
  customer_name: 'Test User',
  sum: '100',
  sum_left: '0',
  fields: [],
  crm: {
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
  },
  ...overrides,
})

describe('Ticket Utils', () => {
  describe('calculateTicketStatistics', () => {
    it('should calculate basic statistics for paid tickets', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '100' }),
        createMockTicket({ order_id: 2, sum: '150' }),
        createMockTicket({ order_id: 3, sum: '200' }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(3)
      expect(result.totalRevenue).toBe(450)
      expect(result.totalOrders).toBe(3)
      expect(result.averageTicketPrice).toBe(150)
    })

    it('should filter out free tickets (sum === "0")', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '100' }),
        createMockTicket({ order_id: 2, sum: '0' }),
        createMockTicket({ order_id: 3, sum: '200' }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(2)
      expect(result.totalRevenue).toBe(300)
      expect(result.totalOrders).toBe(2)
      expect(result.averageTicketPrice).toBe(150)
    })

    it('should handle multiple tickets in same order', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '100' }),
        createMockTicket({ order_id: 1, sum: '100' }),
        createMockTicket({ order_id: 2, sum: '150' }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(3)
      expect(result.totalRevenue).toBe(350)
      expect(result.totalOrders).toBe(2) // Only 2 unique orders
    })

    it('should handle empty array', () => {
      const result = calculateTicketStatistics([])

      expect(result.totalPaidTickets).toBe(0)
      expect(result.totalRevenue).toBe(0)
      expect(result.totalOrders).toBe(0)
      expect(result.averageTicketPrice).toBe(0)
    })

    it('should handle invalid sum values (NaN protection)', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: 'invalid' }),
        createMockTicket({ order_id: 2, sum: '100' }),
        createMockTicket({ order_id: 3, sum: '' }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(1)
      expect(result.totalRevenue).toBe(100)
      expect(result.totalOrders).toBe(1)
      expect(result.averageTicketPrice).toBe(100)
    })

    it('should handle negative values', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '-50' }),
        createMockTicket({ order_id: 2, sum: '100' }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(1)
      expect(result.totalRevenue).toBe(100)
    })

    it('should handle decimal values', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '99.99' }),
        createMockTicket({ order_id: 2, sum: '150.50' }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(2)
      expect(result.totalRevenue).toBeCloseTo(250.49, 2)
      expect(result.averageTicketPrice).toBeCloseTo(125.245, 2)
    })
  })

  describe('calculateFreeTicketClaimRate', () => {
    it('should calculate claim rate correctly', () => {
      expect(calculateFreeTicketClaimRate(50, 100)).toBe(50)
      expect(calculateFreeTicketClaimRate(75, 100)).toBe(75)
      expect(calculateFreeTicketClaimRate(100, 100)).toBe(100)
    })

    it('should handle zero allocation', () => {
      expect(calculateFreeTicketClaimRate(0, 0)).toBe(0)
      expect(calculateFreeTicketClaimRate(5, 0)).toBe(0)
    })

    it('should handle no claims', () => {
      expect(calculateFreeTicketClaimRate(0, 100)).toBe(0)
    })

    it('should handle over-allocation (more claimed than allocated)', () => {
      expect(calculateFreeTicketClaimRate(150, 100)).toBe(150)
    })

    it('should handle decimal results', () => {
      expect(calculateFreeTicketClaimRate(33, 100)).toBe(33)
      expect(calculateFreeTicketClaimRate(1, 3)).toBeCloseTo(33.333, 2)
    })
  })

  describe('calculateCapacityPercentage', () => {
    it('should calculate capacity percentage correctly', () => {
      expect(calculateCapacityPercentage(50, 100)).toBe(50)
      expect(calculateCapacityPercentage(75, 100)).toBe(75)
      expect(calculateCapacityPercentage(100, 100)).toBe(100)
    })

    it('should handle zero capacity', () => {
      expect(calculateCapacityPercentage(0, 0)).toBe(0)
      expect(calculateCapacityPercentage(50, 0)).toBe(0)
    })

    it('should handle no tickets sold', () => {
      expect(calculateCapacityPercentage(0, 100)).toBe(0)
    })

    it('should handle over-capacity', () => {
      expect(calculateCapacityPercentage(150, 100)).toBe(150)
    })

    it('should handle decimal results', () => {
      expect(calculateCapacityPercentage(33, 100)).toBe(33)
      expect(calculateCapacityPercentage(1, 3)).toBeCloseTo(33.333, 2)
    })

    it('should handle large numbers', () => {
      expect(calculateCapacityPercentage(500, 1000)).toBe(50)
      expect(calculateCapacityPercentage(999, 1000)).toBe(99.9)
    })
  })

  describe('calculateCategoryStats', () => {
    it('should calculate statistics for each category', () => {
      const tickets = [
        createMockTicket({ order_id: 1, category: 'Early Bird', sum: '100' }),
        createMockTicket({ order_id: 2, category: 'Early Bird', sum: '100' }),
        createMockTicket({ order_id: 3, category: 'Regular', sum: '150' }),
        createMockTicket({ order_id: 4, category: 'Regular', sum: '150' }),
        createMockTicket({ order_id: 5, category: 'Regular', sum: '150' }),
      ]

      const result = calculateCategoryStats(tickets, 5)

      expect(result).toHaveLength(2)
      expect(result[0].category).toBe('Regular')
      expect(result[0].count).toBe(3)
      expect(result[0].percentage).toBe(60)
      expect(result[1].category).toBe('Early Bird')
      expect(result[1].count).toBe(2)
      expect(result[1].percentage).toBe(40)
    })

    it('should calculate revenue correctly for categories', () => {
      const tickets = [
        createMockTicket({ order_id: 1, category: 'VIP', sum: '500' }),
        createMockTicket({ order_id: 2, category: 'VIP', sum: '500' }),
        createMockTicket({ order_id: 3, category: 'Regular', sum: '100' }),
      ]

      const result = calculateCategoryStats(tickets, 3)

      const vipCategory = result.find((c) => c.category === 'VIP')
      const regularCategory = result.find((c) => c.category === 'Regular')

      expect(vipCategory?.revenue).toBe(1000)
      expect(regularCategory?.revenue).toBe(100)
    })

    it('should count unique orders per category', () => {
      const tickets = [
        createMockTicket({ order_id: 1, category: 'Regular', sum: '100' }),
        createMockTicket({ order_id: 1, category: 'Regular', sum: '100' }),
        createMockTicket({ order_id: 2, category: 'Regular', sum: '150' }),
      ]

      const result = calculateCategoryStats(tickets, 3)

      expect(result[0].orders).toBe(2) // Only 2 unique orders
      expect(result[0].count).toBe(3) // But 3 tickets
    })

    it('should handle empty array', () => {
      const result = calculateCategoryStats([], 0)
      expect(result).toHaveLength(0)
    })

    it('should sort by count descending', () => {
      const tickets = [
        createMockTicket({ order_id: 1, category: 'A', sum: '100' }),
        createMockTicket({ order_id: 2, category: 'B', sum: '100' }),
        createMockTicket({ order_id: 3, category: 'B', sum: '100' }),
        createMockTicket({ order_id: 4, category: 'C', sum: '100' }),
        createMockTicket({ order_id: 5, category: 'C', sum: '100' }),
        createMockTicket({ order_id: 6, category: 'C', sum: '100' }),
      ]

      const result = calculateCategoryStats(tickets, 6)

      expect(result[0].category).toBe('C')
      expect(result[0].count).toBe(3)
      expect(result[1].category).toBe('B')
      expect(result[1].count).toBe(2)
      expect(result[2].category).toBe('A')
      expect(result[2].count).toBe(1)
    })

    it('should handle multiple tickets in same order correctly for revenue', () => {
      const tickets = [
        createMockTicket({ order_id: 1, category: 'Regular', sum: '300' }),
        createMockTicket({ order_id: 1, category: 'Regular', sum: '300' }),
        createMockTicket({ order_id: 1, category: 'Regular', sum: '300' }),
      ]

      const result = calculateCategoryStats(tickets, 3)

      // Revenue should be split evenly across the 3 tickets in the same order
      expect(result[0].revenue).toBe(300)
    })

    it('should handle zero total for percentage calculation', () => {
      const tickets = [
        createMockTicket({ order_id: 1, category: 'Regular', sum: '100' }),
      ]

      const result = calculateCategoryStats(tickets, 0)

      expect(result[0].percentage).toBe(0)
    })
  })

  describe('calculateFreeTicketAllocation', () => {
    it('should calculate total allocation correctly', () => {
      const conference = {
        _id: 'conf-1',
        sponsors: [
          { tier: { title: 'Pod' } },
          { tier: { title: 'Service' } },
          { tier: { title: 'Ingress' } },
        ],
      } as any

      const tierAllocation = { Pod: 2, Service: 3, Ingress: 5 }
      const result = calculateFreeTicketAllocation(
        conference,
        tierAllocation,
        10, // speakerCount
        5, // organizerCount
        [],
      )

      expect(result.sponsorTickets).toBe(10) // 2 + 3 + 5
      expect(result.speakerTickets).toBe(10)
      expect(result.organizerTickets).toBe(5)
      expect(result.totalAllocated).toBe(25)
      expect(result.totalClaimed).toBe(0)
    })

    it('should handle conferences with no sponsors', () => {
      const conference = {
        _id: 'conf-1',
        sponsors: [],
      } as any

      const result = calculateFreeTicketAllocation(
        conference,
        {},
        5, // speakerCount
        2, // organizerCount
        [],
      )

      expect(result.sponsorTickets).toBe(0)
      expect(result.totalAllocated).toBe(7)
    })

    it('should count claimed tickets', () => {
      const conference = { _id: 'conf-1', sponsors: [] } as any
      const freeTickets = [
        createMockTicket({ sum: '0' }),
        createMockTicket({ sum: '0' }),
        createMockTicket({ sum: '0' }),
      ]

      const result = calculateFreeTicketAllocation(
        conference,
        {},
        5,
        2,
        freeTickets,
      )

      expect(result.totalClaimed).toBe(3)
    })

    it('should handle unknown sponsor tiers', () => {
      const conference = {
        _id: 'conf-1',
        sponsors: [
          { tier: { title: 'Unknown Tier' } },
          { tier: { title: 'Pod' } },
        ],
      } as any

      const tierAllocation = { Pod: 2 }
      const result = calculateFreeTicketAllocation(
        conference,
        tierAllocation,
        0,
        0,
        [],
      )

      expect(result.sponsorTickets).toBe(2) // Only Pod tier has allocation
    })

    it('should handle sponsors with missing tier information', () => {
      const conference = {
        _id: 'conf-1',
        sponsors: [{ tier: undefined }, { tier: { title: 'Pod' } }],
      } as any

      const tierAllocation = { Pod: 2 }
      const result = calculateFreeTicketAllocation(
        conference,
        tierAllocation,
        0,
        0,
        [],
      )

      expect(result.sponsorTickets).toBe(2)
    })
  })

  describe('Edge cases and data consistency', () => {
    it('should handle very large numbers', () => {
      const tickets = Array.from({ length: 1000 }, (_, i) =>
        createMockTicket({ order_id: i + 1, sum: '100' }),
      )

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(1000)
      expect(result.totalRevenue).toBe(100000)
      expect(result.totalOrders).toBe(1000)
    })

    it('should produce consistent results for same input', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '100' }),
        createMockTicket({ order_id: 2, sum: '200' }),
      ]

      const result1 = calculateTicketStatistics(tickets)
      const result2 = calculateTicketStatistics(tickets)
      const result3 = calculateTicketStatistics(tickets)

      expect(result1).toEqual(result2)
      expect(result2).toEqual(result3)
    })

    it('should handle mixed valid and invalid data', () => {
      const tickets = [
        createMockTicket({ order_id: 1, sum: '100' }),
        createMockTicket({ order_id: 2, sum: 'abc' }),
        createMockTicket({ order_id: 3, sum: '' }),
        createMockTicket({ order_id: 4, sum: '200' }),
        createMockTicket({ order_id: 5, sum: null as any }),
      ]

      const result = calculateTicketStatistics(tickets)

      expect(result.totalPaidTickets).toBe(2)
      expect(result.totalRevenue).toBe(300)
      expect(isNaN(result.totalRevenue)).toBe(false)
    })
  })
})
