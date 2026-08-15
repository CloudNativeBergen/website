import type { DiscountUsageStats, EventDiscountWithUsage } from './types'
import type { EventTicket } from '@/lib/tickets/types'
import { parseTicketAmount } from '@/lib/tickets/utils'

/**
 * Derive per-code redemption counts by scanning THIS event's tickets.
 *
 * Only codes that appear on a ticket get a key, so an event with live codes and
 * no redemptions returns `{}`. That emptiness is a RESULT, not a failure — the
 * caller must not read `{}` as "we could not look" (see `DiscountUsageStatus`
 * in `./types`; this is the bug #855/#848 named in the conference-resolution
 * layer, reappearing here).
 */
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
          totalPaid: 0,
        }
      }

      stats[normalizedCode].usageCount++
      stats[normalizedCode].ticketIds.push(ticket.id)
      // Amount PAID, not amount discounted — see `DiscountUsage.totalPaid`.
      stats[normalizedCode].totalPaid += parseTicketAmount(ticket.sum)
    }

    return stats
  }, {} as DiscountUsageStats)
}

/**
 * Where a discount's redemption number comes from, and how much to trust it.
 *
 * TWO counters exist and they are not interchangeable:
 *
 *  - `actualUsage.usageCount` — OURS, reconstructed by scanning the event's
 *    current tickets. It carries the ticket ids, so it can be drilled into,
 *    and it reflects the tickets that exist right now.
 *  - `discount.times` — THE PROVIDER'S OWN redemption counter, returned
 *    alongside the code by `listDiscounts`. It is a first-party number we do
 *    not compute, and it counts redemptions the vendor recorded, which may
 *    include tickets since refunded or deleted.
 *
 * When the ticket read fails, the provider counter is all we have — and it was
 * previously labelled "(estimated)" in the UI, which told the organizer to
 * distrust the MORE authoritative of the two. Nothing estimates it. The honest
 * distinction is SOURCE, not precision, so this returns which one was used and
 * the UI names it.
 */
export function resolveRedemptionCount(discount: EventDiscountWithUsage): {
  count: number
  /** True when the number is the provider's counter because ours is unknown. */
  fromProvider: boolean
} {
  if (discount.actualUsage) {
    return { count: discount.actualUsage.usageCount, fromProvider: false }
  }
  return { count: discount.times || 0, fromProvider: true }
}
