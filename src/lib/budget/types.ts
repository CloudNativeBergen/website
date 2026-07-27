import type { ExpenseCategory, VariableCostBasis } from './model'

/**
 * Sanity document shapes for the `conferenceBudget` document type.
 * All arrays are keyed (`_key`); scenario line items cross-reference
 * assumption rows by that `_key`.
 */

export interface BudgetTicketTypeItem {
  _key: string
  name: string
  /** NOK incl VAT (consumer-facing price). */
  priceInclVat: number
  attendsConference?: boolean
  attendsWorkshop?: boolean
  workshopCrew?: boolean
  sponsorIncluded?: boolean
  /** Manually-entered sold count (fallback when no ticketing provider). */
  actualCount?: number | null
}

export interface BudgetSponsorTierItem {
  _key: string
  name: string
  /** NOK ex VAT (sponsor CRM convention). */
  priceExVat: number
  includedTickets?: number
}

export interface BudgetSponsorAddonItem {
  _key: string
  name: string
  /** NOK ex VAT (sponsor CRM convention). */
  priceExVat: number
}

export interface BudgetVariableCostItem {
  _key: string
  name: string
  category: ExpenseCategory
  /** NOK incl VAT, per person. */
  amountPerPerson: number
  basis: VariableCostBasis
  /** Manually-entered actual total for this line (NOK incl VAT). */
  actualAmount?: number | null
}

export interface BudgetFixedCostItem {
  _key: string
  name: string
  category: ExpenseCategory
  /** NOK incl VAT. */
  amount: number
  optional?: boolean
  /** Manually-entered actual total for this line (NOK incl VAT). */
  actualAmount?: number | null
}

export interface BudgetScenarioCountItem {
  _key: string
  /** `_key` of the referenced ticket-type row. */
  ticketType: string
  quantity: number
}

export interface BudgetScenarioTierCountItem {
  _key: string
  /** `_key` of the referenced sponsor-tier assumption row. */
  tier: string
  count: number
}

export interface BudgetScenarioAddonCountItem {
  _key: string
  /** `_key` of the referenced sponsor add-on assumption row. */
  addon: string
  count: number
}

export interface BudgetScenarioItem {
  _key: string
  name: string
  description?: string
  ticketCounts?: BudgetScenarioCountItem[]
  tierCounts?: BudgetScenarioTierCountItem[]
  addonCounts?: BudgetScenarioAddonCountItem[]
  /** `_key`s of fixed costs cut in this scenario. */
  cutCosts?: string[]
}

export interface ConferenceBudgetDocument {
  _id: string
  _type: 'conferenceBudget'
  conference: { _ref: string }
  vatRate: number
  ticketingFeeRate: number
  dinnerParticipation?: {
    floor?: number
    base?: number
    decay?: number
  }
  ticketTypes?: BudgetTicketTypeItem[]
  sponsorTierAssumptions?: BudgetSponsorTierItem[]
  sponsorAddonAssumptions?: BudgetSponsorAddonItem[]
  variableCosts?: BudgetVariableCostItem[]
  fixedCosts?: BudgetFixedCostItem[]
  scenarios?: BudgetScenarioItem[]
}
