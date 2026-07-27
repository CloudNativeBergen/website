import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { exVat } from './model'
import type { BudgetTicketTypeItem } from './types'

/**
 * Live income derivations for the budget module (M1).
 *
 * These are read-only reductions over data the platform already holds:
 * - sponsor income from the sponsor CRM pipeline (signed = `closed-won`
 *   deals, the same convention as `aggregateSponsorPipeline` and the
 *   sponsor dashboard),
 * - ticket income from the ticketing provider's live registration feed
 *   (order-sum dedupe, the same convention as `TicketSalesProcessor`),
 * - a manual fallback (counts entered on budget ticket-type rows) for
 *   conferences without a connected ticketing provider.
 *
 * Nothing here writes or stores anything.
 */

export interface SponsorIncomeActuals {
  /** Sum of `contractValue` for closed-won deals (NOK ex VAT). */
  signedRevenue: number
  /** Subset of signed revenue whose invoice is paid. */
  paidRevenue: number
  /** Sum of `contractValue` for open deals (prospect/contacted/negotiating). */
  openPipelineRevenue: number
  signedCount: number
  totalSponsors: number
  /** Naive currency passthrough (matches `aggregateSponsorPipeline`). */
  currency: string
}

const OPEN_STATUSES = new Set(['prospect', 'contacted', 'negotiating'])

/**
 * Derive actual sponsor income from CRM deals. "Signed" follows the
 * pipeline convention: `status === 'closed-won'`, amount = `contractValue`
 * (ex VAT). Deals without a TRUTHY contract value fall back to their tier's
 * first listed price - the exact semantics of `calculateSponsorValue`
 * (src/components/admin/sponsor-crm/utils.ts), so the budget page and the
 * sponsor dashboard report the same per-deal value (a stored 0 falls back
 * to the tier price there too).
 */
export function deriveSponsorIncome(
  sponsors: Pick<
    SponsorForConferenceExpanded,
    'status' | 'invoiceStatus' | 'contractValue' | 'contractCurrency' | 'tier'
  >[],
): SponsorIncomeActuals {
  let signedRevenue = 0
  let paidRevenue = 0
  let openPipelineRevenue = 0
  let signedCount = 0

  for (const sponsor of sponsors) {
    const value = sponsor.contractValue || sponsor.tier?.price?.[0]?.amount || 0
    if (sponsor.status === 'closed-won') {
      signedCount++
      signedRevenue += value
      if (sponsor.invoiceStatus === 'paid') {
        paidRevenue += value
      }
    } else if (OPEN_STATUSES.has(sponsor.status)) {
      openPipelineRevenue += value
    }
  }

  return {
    signedRevenue,
    paidRevenue,
    openPipelineRevenue,
    signedCount,
    totalSponsors: sponsors.length,
    currency: sponsors[0]?.contractCurrency || 'NOK',
  }
}

export interface TicketIncomeActuals {
  source: 'live' | 'manual'
  /** Total tickets sold/registered. */
  ticketCount: number
  /** Distinct orders (live source only). */
  orderCount: number
  /** Revenue in NOK as reported by the provider (order sums). */
  revenue: number
  /** Ticket counts per provider category / ticket-type name. */
  categoryCounts: Record<string, number>
}

/**
 * Derive actual ticket income from the live provider registration feed.
 * `EventTicket.sum` is the ORDER total repeated on every ticket of the
 * order, so revenue is summed once per distinct `order_id` - the exact
 * convention used by `TicketSalesProcessor.calculateStatistics`.
 *
 * Revenue is reported AS THE PROVIDER REPORTS IT (no VAT normalization),
 * matching every other revenue readout in the app (dashboard widget, weekly
 * status summary). For Checkin - the default provider - amounts are ex VAT
 * (its API carries VAT separately), which is what the budget compares
 * against. Caveat: the Tito adapter surfaces tax-INCLUSIVE amounts; a Tito
 * conference's live ticket actuals will read high by the VAT share (known
 * M1 limitation, flagged in the PR).
 */
export function deriveTicketIncome(
  tickets: { order_id: number; category: string; sum: string }[],
): TicketIncomeActuals {
  const categoryCounts: Record<string, number> = {}
  const seenOrders = new Set<number>()
  let revenue = 0

  for (const ticket of tickets) {
    categoryCounts[ticket.category] = (categoryCounts[ticket.category] ?? 0) + 1
    if (!seenOrders.has(ticket.order_id)) {
      seenOrders.add(ticket.order_id)
      const orderSum = parseFloat(ticket.sum)
      if (Number.isFinite(orderSum)) {
        revenue += orderSum
      }
    }
  }

  return {
    source: 'live',
    ticketCount: tickets.length,
    orderCount: seenOrders.size,
    revenue,
    categoryCounts,
  }
}

/**
 * Manual fallback: actual ticket income from the manually-entered
 * `actualCount` on budget ticket-type rows. Revenue is reported ex VAT
 * (price / (1 + vatRate)), consistent with the budget model.
 */
export function deriveManualTicketIncome(
  ticketTypes: Pick<
    BudgetTicketTypeItem,
    'name' | 'priceInclVat' | 'actualCount'
  >[],
  vatRate: number,
): TicketIncomeActuals {
  const categoryCounts: Record<string, number> = {}
  let ticketCount = 0
  let revenue = 0

  for (const ticket of ticketTypes) {
    const count = ticket.actualCount ?? 0
    if (count <= 0) continue
    ticketCount += count
    categoryCounts[ticket.name] = (categoryCounts[ticket.name] ?? 0) + count
    revenue += exVat(ticket.priceInclVat ?? 0, vatRate) * count
  }

  return {
    source: 'manual',
    ticketCount,
    orderCount: 0,
    revenue,
    categoryCounts,
  }
}
