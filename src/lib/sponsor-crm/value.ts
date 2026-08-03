import type { SponsorForConferenceExpanded } from './types'

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
export function calculateSponsorValue(sponsor: SponsorForConferenceExpanded): {
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
