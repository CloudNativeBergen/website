import { parseTicketAmount } from './amount'
import type { EventTicket } from './types'
import { ticketEntitlementOf, type TierWithEntitlement } from './entitlement'

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

    const existingAmount = parseTicketAmount(existing.sum)
    const currentAmount = parseTicketAmount(ticket.sum)

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

/**
 * THE revenue rule: add up every ticket's own amount. One implementation, so
 * the admin Revenue card, the sales chart, the category column and the budget
 * actuals cannot drift apart again.
 *
 * It is safe to sum per ticket because the ADAPTER says so: each provider
 * declares `amountBasis` and normalizes to `'per-ticket'` before any of this
 * code sees a row (see `lib/tickets/provider/types.ts`). This function makes no
 * assumption of its own — the assumption lives at the boundary, where it is one
 * line to flip.
 *
 * Until this fix three policies ran at once: per-ORDER dedup here and in the
 * processor (which UNDER-reported a multi-seat order by every seat but one —
 * 352 188 shown against Checkin's own 385 750), and a per-category divisor that
 * gave each category in a mixed order the whole order.
 */
export function sumTicketRevenue(tickets: { sum: string }[]): number {
  return tickets.reduce((total, t) => total + parseTicketAmount(t.sum), 0)
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
  /**
   * The tier's own per-sponsor entitlement.
   *
   * Carried here so the breakdown table can show "tickets per sponsor" without
   * a second lookup — it used to re-derive that column from the title-keyed
   * allocation map, which is exactly the thing that drifted.
   */
  ticketsPerSponsor: number
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
      // Each ticket contributes its OWN amount to its OWN category, so the
      // revenue column sums to the headline revenue. The divisor this replaced
      // counted only the tickets of THIS category in the order, so a
      // conference pass plus a workshop add-on on one order recovered the full
      // order total in BOTH rows.
      const revenue = sumTicketRevenue(categoryTickets)

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

/**
 * Groups sponsors by tier title and totals the complimentary tickets each tier
 * accounts for.
 *
 * The per-sponsor number comes from the TIER DOCUMENT
 * (`sponsorTier.ticketEntitlement`), not from a title-keyed allocation map. The
 * map this replaced had drifted out of sync with the renamed tiers and returned
 * 0 for every sponsor; grouping is still by title because that is what the
 * breakdown table displays, but titles no longer decide the arithmetic.
 */
export function calculateSponsorTickets(conference: {
  sponsors?: Array<{
    tier?: ({ title?: string } & TierWithEntitlement) | null
  }>
}): Record<string, SponsorTicketData> {
  const sponsorTicketsByTier: Record<string, SponsorTicketData> = {}

  if (!conference.sponsors?.length) return sponsorTicketsByTier

  conference.sponsors.forEach((sponsorData) => {
    const tierTitle = sponsorData.tier?.title || 'Unknown'
    const ticketsForTier = ticketEntitlementOf(sponsorData.tier)

    if (!sponsorTicketsByTier[tierTitle]) {
      sponsorTicketsByTier[tierTitle] = {
        sponsors: 0,
        tickets: 0,
        ticketsPerSponsor: ticketsForTier,
      }
    }
    sponsorTicketsByTier[tierTitle].sponsors += 1
    sponsorTicketsByTier[tierTitle].tickets += ticketsForTier
  })

  return sponsorTicketsByTier
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
  const paidTickets = tickets.filter((t) => parseTicketAmount(t.sum) > 0)
  const totalPaidTickets = paidTickets.length
  const totalRevenue = sumTicketRevenue(paidTickets)
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
  return totalAllocated > 0 ? (totalClaimed / totalAllocated) * 100 : 0
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
    },
  }
}
