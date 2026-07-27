/**
 * Conference budget domain model.
 *
 * Faithful TypeScript port of the CloudNativeBergen/budget Python generator
 * (budget.py / calc_sections.py), which is production-used for Cloud Native
 * Days Norway. The model computes scenario projections from a dynamic ticket
 * mix, sponsor tiers + a la carte add-ons, per-person variable costs and
 * fixed costs with optional-cost flags.
 *
 * Conventions carried over from the source model:
 * - Ticket prices are entered INCLUSIVE of VAT (the consumer-facing price);
 *   revenue is reported EXCLUSIVE of VAT (price / (1 + vatRate)) - what the
 *   org keeps.
 * - Sponsor tier/add-on prices are entered EXCLUSIVE of VAT, matching the
 *   sponsor CRM convention (sponsorTier.price is "without vat"). The source
 *   model stored these incl VAT and divided; the math is identical.
 * - Costs are entered (and reported) INCLUSIVE of VAT - what the org pays.
 * - The ticketing platform fee is charged on GROSS ticket revenue
 *   (i.e. revenue excl VAT x (1 + vatRate) x feeRate).
 * - Dinner participation decays as the event grows:
 *   rate = max(floor, base - day2Attendees / decay).
 */

export const VARIABLE_COST_BASES = ['conference', 'dinner', 'workshop'] as const

/**
 * Attribution basis for a per-person variable cost: conference-day
 * attendees, estimated dinner attendees, or workshop-day people
 * (attendees + crew).
 */
export type VariableCostBasis = (typeof VARIABLE_COST_BASES)[number]

/**
 * Single source for basis display labels (used by the Sanity schema and the
 * admin editors - do not fork copies).
 */
export const VARIABLE_COST_BASIS_LABELS: Record<VariableCostBasis, string> = {
  conference: 'Conference-day attendees',
  dinner: 'Dinner attendees (estimated)',
  workshop: 'Workshop-day people (attendees + crew)',
}

export const EXPENSE_CATEGORIES = [
  'venue',
  'production',
  'catering',
  'speakers',
  'marketing',
  'admin',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/**
 * Single source for category display labels (used by the Sanity schema, the
 * admin page and the editors - do not fork copies).
 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  venue: 'Venue',
  production: 'Production',
  catering: 'Catering',
  speakers: 'Speakers',
  marketing: 'Marketing',
  admin: 'Admin & services',
  other: 'Other',
}

export interface BudgetTicketType {
  /** Stable key used by scenarios to reference this ticket type. */
  key: string
  name: string
  /** Ticket price in NOK, inclusive of VAT (0 for complimentary tickets). */
  priceInclVat: number
  /** Attends the main conference day (Day 2). */
  attendsConference: boolean
  /** Attends the workshop day (Day 1) as a workshop participant. */
  attendsWorkshop: boolean
  /** Present on the workshop day as crew (setup/support), not a WS attendee. */
  workshopCrew: boolean
  /**
   * Quantity is auto-derived from sponsor tier counts x included tickets
   * (the "Sponsor Included" row in the source model). EXACTLY ONE ticket
   * type should set this; its scenario quantity input is ignored. The
   * invariant is enforced on every write path (tRPC Zod refinement, Sanity
   * schema validation), and the model itself is defensive: the FIRST
   * flagged row is the single sink for the derived quantity, extra flagged
   * rows get 0, and misconfiguration (zero or multiple flags) surfaces as
   * an explicit {@link ScenarioWarning} on the computation result.
   */
  sponsorIncluded?: boolean
}

export interface BudgetSponsorTier {
  key: string
  name: string
  /** Tier price in NOK, exclusive of VAT (sponsor CRM convention). */
  priceExVat: number
  /** Complimentary conference tickets included with the tier. */
  includedTickets: number
}

export interface BudgetSponsorAddon {
  key: string
  name: string
  /** Add-on price in NOK, exclusive of VAT (sponsor CRM convention). */
  priceExVat: number
}

export interface BudgetVariableCost {
  key: string
  name: string
  category: ExpenseCategory
  /** Cost per person in NOK, inclusive of VAT. */
  amountPerPerson: number
  basis: VariableCostBasis
}

export interface BudgetFixedCost {
  key: string
  name: string
  category: ExpenseCategory
  /** Cost in NOK, inclusive of VAT. */
  amount: number
  /** Optional costs can be cut in tight scenarios. */
  optional: boolean
}

export interface BudgetScenario {
  key: string
  name: string
  description?: string
  /** Ticket quantities by ticket-type key (sponsor-included types ignored). */
  ticketCounts: Record<string, number>
  /** Projected sponsor count by tier key. */
  tierCounts: Record<string, number>
  /** Projected add-ons sold by add-on key. */
  addonCounts: Record<string, number>
  /** Keys of OPTIONAL fixed costs cut in this scenario. */
  cutCostKeys: string[]
}

export interface DinnerParticipationModel {
  /** Minimum participation rate (source model: 0.4). */
  floor: number
  /** Participation rate at zero attendees (source model: 0.9). */
  base: number
  /** Attendee count over which participation decays by 1.0 (source: 1000). */
  decay: number
}

export interface BudgetModel {
  /** VAT rate applied to ticket/sponsor prices (Norway: 0.25). */
  vatRate: number
  /** Ticketing platform fee rate on gross ticket revenue (Checkin: 0.045). */
  ticketingFeeRate: number
  dinnerParticipation: DinnerParticipationModel
  ticketTypes: BudgetTicketType[]
  sponsorTiers: BudgetSponsorTier[]
  sponsorAddons: BudgetSponsorAddon[]
  variableCosts: BudgetVariableCost[]
  fixedCosts: BudgetFixedCost[]
  scenarios: BudgetScenario[]
}

export const DEFAULT_VAT_RATE = 0.25
export const DEFAULT_TICKETING_FEE_RATE = 0.045
export const DEFAULT_DINNER_PARTICIPATION: DinnerParticipationModel = {
  floor: 0.4,
  base: 0.9,
  decay: 1000,
}

export interface ScenarioHeadcounts {
  /** Conference-day (Day 2) attendees. */
  conference: number
  /** Workshop-day (Day 1) workshop attendees. */
  workshop: number
  /** Workshop-day crew (speakers/organizers/volunteers present Day 1). */
  crew: number
  /** Estimated dinner attendees (participation-decay model). */
  dinner: number
  /** Total tickets across all types. */
  totalTickets: number
  /** Auto-derived sponsor-included complimentary tickets. */
  sponsorIncludedTickets: number
}

export interface ScenarioExpenseLine {
  key: string
  name: string
  category: ExpenseCategory
  kind: 'variable' | 'fixed'
  /** Amount in NOK incl VAT. 0 for fixed costs cut in this scenario. */
  amount: number
  /** True when this optional fixed cost is cut in the scenario. */
  cut: boolean
}

/**
 * Model-level misconfiguration surfaced by {@link computeScenario} instead of
 * silently mis-counting. `message` is the single display source; `code` (and
 * the structured fields) are for tests and programmatic handling.
 */
export type ScenarioWarning =
  | {
      code: 'multiple-sponsor-included'
      /** Row that receives the derived quantity (the first flagged row). */
      usedTicketTypeName: string
      /** Extra flagged rows, which receive a quantity of 0. */
      ignoredTicketTypeNames: string[]
      message: string
    }
  | {
      code: 'no-sponsor-included'
      /** Derived sponsor tickets that no row receives. */
      excludedTickets: number
      message: string
    }

export interface ScenarioResult {
  scenarioKey: string
  headcounts: ScenarioHeadcounts
  /** Misconfiguration warnings (e.g. sponsor-included flag issues). */
  warnings: ScenarioWarning[]
  /** All revenue excl VAT, NOK. */
  ticketRevenue: number
  sponsorTierRevenue: number
  sponsorAddonRevenue: number
  sponsorRevenue: number
  totalIncome: number
  /** Fee on gross ticket revenue (part of variable expenses). */
  ticketingFee: number
  expenseLines: ScenarioExpenseLine[]
  totalVariableExpenses: number
  totalFixedExpenses: number
  totalExpenses: number
  netResult: number
  /** Net result as a percentage of total income (0 when income is 0). */
  marginPct: number
}

/** Revenue excl VAT for a price entered incl VAT. */
export function exVat(priceInclVat: number, vatRate: number): number {
  return priceInclVat / (1 + vatRate)
}

/**
 * Dinner participation rate for a given conference-day headcount:
 * max(floor, base - attendees / decay). Source model: matches the 2025
 * actual of ~50% participation at ~400 attendees.
 */
export function dinnerParticipationRate(
  conferenceAttendees: number,
  model: DinnerParticipationModel,
): number {
  return Math.max(model.floor, model.base - conferenceAttendees / model.decay)
}

/** Sponsor-included complimentary tickets: sum(tierCount x includedTickets). */
export function sponsorIncludedTickets(
  tiers: BudgetSponsorTier[],
  tierCounts: Record<string, number>,
): number {
  return tiers.reduce(
    (sum, tier) => sum + (tierCounts[tier.key] ?? 0) * tier.includedTickets,
    0,
  )
}

function resolveTicketQuantities(
  model: BudgetModel,
  scenario: BudgetScenario,
): {
  quantities: Map<string, number>
  sponsorIncluded: number
  warnings: ScenarioWarning[]
} {
  const included = sponsorIncludedTickets(
    model.sponsorTiers,
    scenario.tierCounts,
  )

  // EXACTLY ONE row should be flagged sponsor-included (enforced on writes).
  // Be defensive against documents that bypassed validation: the FIRST
  // flagged row is the single sink for the derived quantity — applying it to
  // every flagged row would multiply headcounts/costs, and extra rows would
  // double-count. Both misconfigurations surface as warnings.
  const flagged = model.ticketTypes.filter((t) => t.sponsorIncluded)
  const sink = flagged[0]
  const warnings: ScenarioWarning[] = []
  if (flagged.length > 1) {
    const ignored = flagged.slice(1).map((t) => t.name)
    warnings.push({
      code: 'multiple-sponsor-included',
      usedTicketTypeName: sink.name,
      ignoredTicketTypeNames: ignored,
      message:
        `Multiple ticket types are marked sponsor-included; only the first ` +
        `("${sink.name}") receives the derived quantity — ${ignored
          .map((name) => `"${name}"`)
          .join(', ')} counts as 0. Keep exactly one sponsor-included row.`,
    })
  } else if (flagged.length === 0 && included > 0) {
    warnings.push({
      code: 'no-sponsor-included',
      excludedTickets: included,
      message:
        `No ticket type is marked sponsor-included, so ${included} derived ` +
        `sponsor ticket${included === 1 ? '' : 's'} are excluded from ` +
        `headcounts and per-person costs. Mark exactly one ticket type as ` +
        `sponsor-included.`,
    })
  }

  const quantities = new Map<string, number>()
  for (const ticket of model.ticketTypes) {
    quantities.set(
      ticket.key,
      ticket.sponsorIncluded
        ? ticket === sink
          ? included
          : 0
        : (scenario.ticketCounts[ticket.key] ?? 0),
    )
  }
  return { quantities, sponsorIncluded: included, warnings }
}

/**
 * Compute the full projection for one scenario. Pure function - the
 * TypeScript equivalent of calc_scenario() in the source model, validated
 * against its expected_values.json snapshot.
 */
export function computeScenario(
  model: BudgetModel,
  scenario: BudgetScenario,
): ScenarioResult {
  const { quantities, sponsorIncluded, warnings } = resolveTicketQuantities(
    model,
    scenario,
  )

  let conference = 0
  let workshop = 0
  let crew = 0
  let totalTickets = 0
  let ticketRevenue = 0
  for (const ticket of model.ticketTypes) {
    const qty = quantities.get(ticket.key) ?? 0
    totalTickets += qty
    if (ticket.attendsConference) conference += qty
    if (ticket.attendsWorkshop) workshop += qty
    if (ticket.workshopCrew) crew += qty
    ticketRevenue += exVat(ticket.priceInclVat, model.vatRate) * qty
  }

  // Math.round is deliberate: it matches the Excel ROUND() (half-up) used by
  // the reference workbook. (Python's round() is half-to-even and would
  // differ on an exact .5 - the workbook, not the helper script, is
  // authoritative.)
  const dinner = Math.round(
    conference * dinnerParticipationRate(conference, model.dinnerParticipation),
  )

  const sponsorTierRevenue = model.sponsorTiers.reduce(
    (sum, tier) => sum + tier.priceExVat * (scenario.tierCounts[tier.key] ?? 0),
    0,
  )
  const sponsorAddonRevenue = model.sponsorAddons.reduce(
    (sum, addon) =>
      sum + addon.priceExVat * (scenario.addonCounts[addon.key] ?? 0),
    0,
  )
  const sponsorRevenue = sponsorTierRevenue + sponsorAddonRevenue
  const totalIncome = ticketRevenue + sponsorRevenue

  const basisHeadcount: Record<VariableCostBasis, number> = {
    conference,
    dinner,
    workshop: workshop + crew,
  }

  const expenseLines: ScenarioExpenseLine[] = []
  let totalVariableExpenses = 0
  for (const cost of model.variableCosts) {
    const amount = cost.amountPerPerson * basisHeadcount[cost.basis]
    totalVariableExpenses += amount
    expenseLines.push({
      key: cost.key,
      name: cost.name,
      category: cost.category,
      kind: 'variable',
      amount,
      cut: false,
    })
  }

  // Ticketing platform fee is charged on gross (incl VAT) ticket revenue.
  const ticketingFee =
    ticketRevenue * (1 + model.vatRate) * model.ticketingFeeRate
  totalVariableExpenses += ticketingFee

  const cutKeys = new Set(scenario.cutCostKeys)
  let totalFixedExpenses = 0
  for (const cost of model.fixedCosts) {
    const cut = cost.optional && cutKeys.has(cost.key)
    const amount = cut ? 0 : cost.amount
    totalFixedExpenses += amount
    expenseLines.push({
      key: cost.key,
      name: cost.name,
      category: cost.category,
      kind: 'fixed',
      amount,
      cut,
    })
  }

  const totalExpenses = totalVariableExpenses + totalFixedExpenses
  const netResult = totalIncome - totalExpenses

  return {
    scenarioKey: scenario.key,
    warnings,
    headcounts: {
      conference,
      workshop,
      crew,
      dinner,
      totalTickets,
      sponsorIncludedTickets: sponsorIncluded,
    },
    ticketRevenue,
    sponsorTierRevenue,
    sponsorAddonRevenue,
    sponsorRevenue,
    totalIncome,
    ticketingFee,
    expenseLines,
    totalVariableExpenses,
    totalFixedExpenses,
    totalExpenses,
    netResult,
    marginPct: totalIncome > 0 ? (netResult / totalIncome) * 100 : 0,
  }
}

/** Compute all scenarios of a model. */
export function computeScenarios(model: BudgetModel): ScenarioResult[] {
  return model.scenarios.map((scenario) => computeScenario(model, scenario))
}
