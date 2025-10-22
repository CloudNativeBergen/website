import type { EventTicket } from './types'
import type { Conference } from '@/lib/conference/types'

const parseAmount = (sum: string): number => {
  const parsed = parseFloat(sum)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Deduplicates tickets by email address, keeping only the most valuable ticket per attendee.
 * This handles cases where attendees upgrade tickets (e.g., one-day to two-day).
 * When duplicates are found, keeps the ticket with the highest value.
 * If values are equal, keeps the most recent ticket.
 *
 * @param tickets - Array of tickets to deduplicate
 * @returns Array of unique tickets (one per email address)
 */
export function deduplicateTicketsByEmail(
  tickets: EventTicket[],
): EventTicket[] {
  const emailMap = new Map<string, EventTicket>()

  tickets.forEach((ticket) => {
    const email = ticket.crm?.email?.toLowerCase()
    if (!email) {
      emailMap.set(`no-email-${ticket.id}`, ticket)
      return
    }

    const existing = emailMap.get(email)
    if (!existing) {
      emailMap.set(email, ticket)
      return
    }

    const existingAmount = parseAmount(existing.sum)
    const currentAmount = parseAmount(ticket.sum)

    if (currentAmount > existingAmount) {
      emailMap.set(email, ticket)
    } else if (
      currentAmount === existingAmount &&
      ticket.order_date > existing.order_date
    ) {
      emailMap.set(email, ticket)
    }
  })

  return Array.from(emailMap.values())
}

export interface CategoryStat {
  category: string
  count: number
  orders: number
  revenue: number
  percentage: number
}

export interface SponsorTicketData {
  sponsors: number
  tickets: number
}

export interface FreeTicketAllocation {
  totalAllocated: number
  totalClaimed: number
  sponsorTickets: number
  speakerTickets: number
  organizerTickets: number
}

/**
 * Analyzes ticket sales by category, providing breakdown statistics.
 * Used in the admin tickets page to display category-specific metrics.
 *
 * @param tickets - Array of paid tickets to analyze
 * @param totalPaidTickets - Total count of paid tickets for percentage calculations
 * @returns Array of category statistics sorted by ticket count (descending)
 */
export function calculateCategoryStats(
  tickets: EventTicket[],
  totalPaidTickets: number,
): CategoryStat[] {
  const categoryBreakdown: Record<string, number> = {}

  tickets.forEach((ticket) => {
    categoryBreakdown[ticket.category] =
      (categoryBreakdown[ticket.category] || 0) + 1
  })

  return Object.entries(categoryBreakdown)
    .map(([category, count]) => {
      const categoryTickets = tickets.filter((t) => t.category === category)
      const categoryOrders = new Set(categoryTickets.map((t) => t.order_id))
      const revenue = categoryTickets.reduce(
        (sum, ticket) =>
          sum +
          parseAmount(ticket.sum) /
          categoryTickets.filter((t) => t.order_id === ticket.order_id)
            .length,
        0,
      )

      return {
        category,
        count,
        orders: categoryOrders.size,
        revenue,
        percentage: totalPaidTickets > 0 ? (count / totalPaidTickets) * 100 : 0,
      }
    })
    .sort((a, b) => b.count - a.count)
}

export function calculateSponsorTickets(
  conference: {
    sponsors?: Array<{ tier?: { title?: string } }>
  },
  tierAllocation: Record<string, number>,
): Record<string, SponsorTicketData> {
  const sponsorTicketsByTier: Record<string, SponsorTicketData> = {}

  if (!conference.sponsors?.length) return sponsorTicketsByTier

  conference.sponsors.forEach((sponsorData) => {
    const tierTitle = sponsorData.tier?.title || 'Unknown'
    const ticketsForTier = tierAllocation[tierTitle] || 0

    if (!sponsorTicketsByTier[tierTitle]) {
      sponsorTicketsByTier[tierTitle] = { sponsors: 0, tickets: 0 }
    }
    sponsorTicketsByTier[tierTitle].sponsors += 1
    sponsorTicketsByTier[tierTitle].tickets += ticketsForTier
  })

  return sponsorTicketsByTier
}

export function calculateFreeTicketAllocation(
  conference: Conference,
  tierAllocation: Record<string, number>,
  speakerCount: number,
  organizerCount: number,
  freeTickets: EventTicket[],
): FreeTicketAllocation {
  const sponsorTickets =
    conference.sponsors?.reduce((total, sponsorData) => {
      const tierTitle = sponsorData.tier?.title || ''
      return total + (tierAllocation[tierTitle] || 0)
    }, 0) || 0

  const totalAllocated = sponsorTickets + speakerCount + organizerCount
  const totalClaimed = freeTickets.length

  return {
    totalAllocated,
    totalClaimed,
    sponsorTickets,
    speakerTickets: speakerCount,
    organizerTickets: organizerCount,
  }
}

/**
 * Calculates core ticket sales statistics from any ticket array.
 * Automatically filters to only count paid tickets (sum > 0) and handles invalid amounts safely.
 * Used as the foundation for statistics across admin UI, Slack notifications, and API responses.
 *
 * @param tickets - Array of tickets (can include free tickets, will be filtered internally)
 * @returns Core statistics: counts, revenue, orders, and average price
 */
export function calculateTicketStatistics(tickets: EventTicket[]): {
  totalPaidTickets: number
  totalRevenue: number
  totalOrders: number
  averageTicketPrice: number
} {
  const paidTickets = tickets.filter((t) => parseAmount(t.sum) > 0)
  const totalPaidTickets = paidTickets.length
  const totalRevenue = paidTickets.reduce(
    (sum, t) => sum + parseAmount(t.sum),
    0,
  )
  const totalOrders = new Set(paidTickets.map((t) => t.order_id)).size
  const averageTicketPrice =
    totalPaidTickets > 0 ? totalRevenue / totalPaidTickets : 0

  return {
    totalPaidTickets,
    totalRevenue,
    totalOrders,
    averageTicketPrice,
  }
}

/**
 * Calculates the percentage of allocated free tickets that have been claimed.
 * Used in admin UI cards and Slack notifications to track free ticket utilization.
 *
 * @param totalClaimed - Number of free tickets claimed/registered
 * @param totalAllocated - Total number of free tickets allocated (sponsors + speakers + organizers)
 * @returns Claim rate as percentage (0-100), returns 0 if no tickets allocated
 */
export function calculateFreeTicketClaimRate(
  totalClaimed: number,
  totalAllocated: number,
): number {
  return totalAllocated > 0
    ? (totalClaimed / totalAllocated) * 100
    : 0
}

/**
 * Calculates what percentage of venue capacity has been filled.
 * Used in admin dashboard to show capacity utilization.
 *
 * @param ticketsSold - Number of tickets sold
 * @param capacity - Total venue capacity
 * @returns Percentage of capacity used (0-100+), returns 0 if capacity is 0
 */
export function calculateCapacityPercentage(
  ticketsSold: number,
  capacity: number,
): number {
  return capacity > 0 ? (ticketsSold / capacity) * 100 : 0
}

export function createDefaultAnalysis(
  tickets: EventTicket[],
  capacity: number,
) {
  const basicStats = calculateTicketStatistics(tickets)

  return {
    progression: [],
    performance: {
      currentPercentage: 0,
      targetPercentage: 0,
      variance: 0,
      isOnTrack: true,
      nextMilestone: null,
    },
    capacity,
    statistics: {
      ...basicStats,
      categoryBreakdown: {},
      sponsorTickets: 0,
      speakerTickets: 0,
      totalCapacityUsed: tickets.length,
    },
  }
}
