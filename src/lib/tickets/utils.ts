import type { EventTicket } from './types'

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
          parseFloat(ticket.sum) /
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

export function createDefaultAnalysis(
  tickets: EventTicket[],
  capacity: number,
) {
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
      totalPaidTickets: tickets.length,
      totalRevenue: tickets.reduce((sum, t) => sum + parseFloat(t.sum), 0),
      totalOrders: new Set(tickets.map((t) => t.order_id)).size,
      averageTicketPrice:
        tickets.length > 0
          ? tickets.reduce((sum, t) => sum + parseFloat(t.sum), 0) /
            tickets.length
          : 0,
      categoryBreakdown: {},
      sponsorTickets: 0,
      speakerTickets: 0,
      totalCapacityUsed: tickets.length,
    },
  }
}
