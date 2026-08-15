import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { parseTicketAmount } from '@/lib/tickets/amount'
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

/** Per-currency sponsor income totals (all amounts ex VAT). */
export interface SponsorIncomeCurrencyTotals {
  /** ISO currency code (e.g. 'NOK', 'USD'). */
  currency: string
  /** Sum of closed-won deal values in this currency. */
  signedRevenue: number
  /** Subset of signed revenue whose invoice is paid. */
  paidRevenue: number
  /** Sum of open deals (prospect/contacted/negotiating) in this currency. */
  openPipelineRevenue: number
}

export interface SponsorIncomeActuals {
  /**
   * Totals GROUPED BY CURRENCY (NOK first, then alphabetical). Amounts in
   * different currencies are never summed together: the sponsor CRM board
   * converts to NOK client-side with live exchange rates for its informal
   * column totals, but a budget readout must not bake a fluctuating rate
   * into "actual income" — the UI renders each currency separately with a
   * mixed-currencies note instead. A single-currency pipeline (the normal
   * case) has exactly one entry; an empty pipeline has none.
   */
  byCurrency: SponsorIncomeCurrencyTotals[]
  signedCount: number
  totalSponsors: number
}

const OPEN_STATUSES = new Set(['prospect', 'contacted', 'negotiating'])

/**
 * Derive actual sponsor income from CRM deals. "Signed" follows the
 * pipeline convention: `status === 'closed-won'`, amount = `contractValue`
 * (ex VAT). Deals without a TRUTHY contract value fall back to their tier's
 * first listed price - the exact semantics of `calculateSponsorValue`
 * (src/components/admin/sponsor-crm/utils.ts), so the budget page and the
 * sponsor dashboard report the same per-deal value AND currency (a stored 0
 * falls back to the tier price there too, and the fallback carries the
 * TIER's currency, not the deal's).
 */
export function deriveSponsorIncome(
  sponsors: Pick<
    SponsorForConferenceExpanded,
    'status' | 'invoiceStatus' | 'contractValue' | 'contractCurrency' | 'tier'
  >[],
): SponsorIncomeActuals {
  const buckets = new Map<string, SponsorIncomeCurrencyTotals>()
  const bucket = (currency: string): SponsorIncomeCurrencyTotals => {
    let totals = buckets.get(currency)
    if (!totals) {
      totals = {
        currency,
        signedRevenue: 0,
        paidRevenue: 0,
        openPipelineRevenue: 0,
      }
      buckets.set(currency, totals)
    }
    return totals
  }
  let signedCount = 0

  for (const sponsor of sponsors) {
    // Value + currency resolve together (calculateSponsorValue precedence):
    // a tier-price fallback is denominated in the TIER price's currency.
    let value = 0
    let currency = 'NOK'
    if (sponsor.contractValue) {
      value = sponsor.contractValue
      currency = sponsor.contractCurrency || 'NOK'
    } else if (sponsor.tier?.price?.[0]?.amount) {
      value = sponsor.tier.price[0].amount
      currency = sponsor.tier.price[0].currency || 'NOK'
    }

    if (sponsor.status === 'closed-won') {
      signedCount++
      if (value > 0) {
        const totals = bucket(currency)
        totals.signedRevenue += value
        if (sponsor.invoiceStatus === 'paid') {
          totals.paidRevenue += value
        }
      }
    } else if (OPEN_STATUSES.has(sponsor.status) && value > 0) {
      bucket(currency).openPipelineRevenue += value
    }
  }

  const byCurrency = [...buckets.values()].sort((a, b) =>
    a.currency === 'NOK'
      ? -1
      : b.currency === 'NOK'
        ? 1
        : a.currency.localeCompare(b.currency),
  )

  return {
    byCurrency,
    signedCount,
    totalSponsors: sponsors.length,
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
      // parseTicketAmount is the one place a provider money string becomes a
      // number: unparseable is 0 (and reported), never NaN, so the local
      // Number.isFinite guard this replaced is now redundant (#898).
      revenue += parseTicketAmount(ticket.sum)
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
