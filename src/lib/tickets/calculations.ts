import type { EventTicket } from '@/lib/tickets/checkin'
import { groupTicketsByOrder } from '@/lib/tickets/checkin'
import { getSpeakers } from '@/lib/speaker/sanity'
import type { Conference } from '@/lib/conference/types'

// Sponsor ticket allocation by tier
export const TIER_TICKET_ALLOCATION: Record<string, number> = {
  Pod: 2,
  Service: 3,
  Ingress: 5,
}

export interface TicketStatistics {
  // Paid ticket statistics (from CheckIn.no orders)
  paidTickets: number
  totalRevenue: number
  totalOrders: number
  ticketsByCategory: Record<string, number>

  // Complimentary ticket statistics
  sponsorTickets: number
  speakerTickets: number

  // Total statistics
  totalTickets: number
  totalComplimentaryTickets: number
}

/**
 * Calculate comprehensive ticket statistics for a conference
 * This function provides the same calculations used in the admin/tickets page
 */
export async function calculateTicketStatistics(
  tickets: EventTicket[],
  conference: Conference,
): Promise<TicketStatistics> {
  // Group tickets by order_id to get correct totals (same as admin page)
  const orders = groupTicketsByOrder(tickets)

  // Calculate paid ticket statistics from orders
  const paidTickets = orders.reduce((sum, order) => sum + order.totalTickets, 0)
  const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const totalOrders = orders.length

  // Calculate tickets by category from individual tickets (not orders)
  const ticketsByCategory: Record<string, number> = {}
  tickets.forEach((ticket) => {
    const category = ticket.category || 'Unknown'
    // Each ticket record represents 1 ticket
    ticketsByCategory[category] = (ticketsByCategory[category] || 0) + 1
  })

  // Calculate sponsor tickets from sponsor tier allocations
  let sponsorTickets = 0
  if (conference.sponsors && conference.sponsors.length > 0) {
    conference.sponsors.forEach((sponsorData) => {
      const tierTitle = sponsorData.tier?.title || 'Unknown'
      const ticketsForTier = TIER_TICKET_ALLOCATION[tierTitle] || 0
      sponsorTickets += ticketsForTier
    })
  }

  // Calculate speaker tickets from confirmed speakers
  let speakerTickets = 0
  try {
    const { speakers: confirmedSpeakers, err: speakersError } =
      await getSpeakers(conference._id)

    if (!speakersError) {
      speakerTickets = confirmedSpeakers.length
    } else {
      console.warn(
        'Could not fetch speakers for ticket calculation:',
        speakersError,
      )
    }
  } catch (error) {
    console.warn('Error fetching speakers for ticket calculation:', error)
  }

  const totalComplimentaryTickets = sponsorTickets + speakerTickets
  const totalTickets = paidTickets + totalComplimentaryTickets

  return {
    paidTickets,
    totalRevenue,
    totalOrders,
    ticketsByCategory,
    sponsorTickets,
    speakerTickets,
    totalTickets,
    totalComplimentaryTickets,
  }
}

/**
 * Create category statistics with additional admin information
 * Used for the admin tickets page to show revenue and order counts per category
 */
export function createCategoryStatsForAdmin(
  tickets: EventTicket[],
  orders: any[],
  ticketsByCategory: Record<string, number>,
): Array<{
  category: string
  count: number
  revenue: number
  orders: number
}> {
  const categoryRevenue: Record<string, number> = {}
  const categoryOrders: Record<string, number> = {}

  // Calculate revenue per category based on order distribution
  orders.forEach((order) => {
    const categoriesInOrder = order.categories.length
    const revenuePerCategory =
      categoriesInOrder > 0 ? order.totalAmount / categoriesInOrder : 0

    order.categories.forEach((category: string) => {
      categoryRevenue[category] =
        (categoryRevenue[category] || 0) + revenuePerCategory
      categoryOrders[category] = (categoryOrders[category] || 0) + 1
    })
  })

  return Object.entries(ticketsByCategory)
    .map(([category, count]) => ({
      category,
      count,
      revenue: categoryRevenue[category] || 0,
      orders: categoryOrders[category] || 0,
    }))
    .sort((a, b) => b.count - a.count)
}
