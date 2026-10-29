import type { SupportedCurrency } from '@/lib/travel-support/types'
import {
  FALLBACK_RATES,
  convertCurrency,
} from '@/lib/travel-support/exchange-rates'

/**
 * The monetary value of a deal, ex VAT, with the currency it is denominated in.
 *
 * Precedence: the negotiated `contractValue` wins; a deal without one (or with
 * a stored 0) falls back to its tier's first listed price — and, importantly,
 * to the TIER's currency, not the deal's. The sponsor board, the budget module
 * (`lib/budget/income.ts`) and the invoice worklist all read value through this
 * one function so they can never disagree about what a deal is worth.
 *
 * A deal with neither a contract value nor a priced tier resolves to 0: callers
 * that need to distinguish "worth nothing" from "nobody has set an amount"
 * should check the inputs, not the result.
 */
/** The fields value reads, so lean projections can use it too. */
export interface SponsorValueFields {
  contractValue?: number | null
  contractCurrency?: string | null
  tier?: { price?: { amount?: number; currency?: string }[] | null } | null
}

export function calculateSponsorValue(sponsor: SponsorValueFields): {
  value: number
  currency: string
} {
  let value = 0
  let currency = 'NOK'

  if (sponsor.contractValue) {
    value = sponsor.contractValue
    currency = sponsor.contractCurrency || 'NOK'
  } else if (sponsor.tier?.price?.[0]?.amount) {
    value = sponsor.tier.price[0].amount
    currency = sponsor.tier.price[0].currency || 'NOK'
  }

  return { value, currency }
}

/**
 * {@link calculateSponsorValue} in NOK, so deals in different currencies can be
 * summed, compared and sorted.
 */
// ponytail: server code has no cached live rates (the travel-support cache is
// localStorage), so it converts with FALLBACK_RATES. Pass live rates where a
// caller has them.
export function sponsorValueNOK(
  sponsor: SponsorValueFields,
  rates: Record<
    SupportedCurrency,
    Record<SupportedCurrency, number>
  > = FALLBACK_RATES,
): number {
  const { value, currency } = calculateSponsorValue(sponsor)
  return value
    ? convertCurrency(value, currency as SupportedCurrency, 'NOK', rates)
    : 0
}
