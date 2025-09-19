/**
 * Discount usage calculation and analysis utilities
 */

import type { DiscountUsageStats } from './types'
import type { EventTicket } from '@/lib/tickets/types'

export function calculateDiscountUsage(
  tickets: EventTicket[],
): DiscountUsageStats {
  return tickets.reduce((stats, ticket) => {
    const discountCode = ticket.coupon || ticket.discount

    if (discountCode) {
      const normalizedCode = discountCode.toUpperCase()

      if (!stats[normalizedCode]) {
        stats[normalizedCode] = {
          usageCount: 0,
          ticketIds: [],
          totalValue: 0,
        }
      }

      stats[normalizedCode].usageCount++
      stats[normalizedCode].ticketIds.push(ticket.id)
      stats[normalizedCode].totalValue += parseFloat(ticket.sum) || 0
    }

    return stats
  }, {} as DiscountUsageStats)
}
