import {
  DEFAULT_DINNER_PARTICIPATION,
  type BudgetModel,
  type BudgetScenario,
} from './model'
import type { BudgetScenarioItem, ConferenceBudgetDocument } from './types'

/**
 * Keyed count array -> record. Duplicate references keep the FIRST entry
 * (deterministic; last-write-wins would silently swap projections around).
 * Duplicates are rejected at the write boundary (Sanity schema validation on
 * the scenario count arrays), so no logging here — this is defense in depth
 * for documents that predate or bypass that validation.
 */
function toRecord<T>(
  items: T[] | undefined,
  key: (item: T) => string,
  value: (item: T) => number,
): Record<string, number> {
  const record: Record<string, number> = {}
  for (const item of items ?? []) {
    const k = key(item)
    if (!(k in record)) {
      record[k] = value(item)
    }
  }
  return record
}

function mapScenario(item: BudgetScenarioItem): BudgetScenario {
  return {
    key: item._key,
    name: item.name,
    description: item.description,
    ticketCounts: toRecord(
      item.ticketCounts,
      (c) => c.ticketType,
      (c) => c.quantity ?? 0,
    ),
    tierCounts: toRecord(
      item.tierCounts,
      (c) => c.tier,
      (c) => c.count ?? 0,
    ),
    addonCounts: toRecord(
      item.addonCounts,
      (c) => c.addon,
      (c) => c.count ?? 0,
    ),
    cutCostKeys: item.cutCosts ?? [],
  }
}

/**
 * Map a `conferenceBudget` Sanity document to the pure computation model.
 * Row `_key`s become the model keys that scenarios reference.
 */
export function budgetDocumentToModel(
  doc: ConferenceBudgetDocument,
): BudgetModel {
  return {
    vatRate: doc.vatRate,
    ticketingFeeRate: doc.ticketingFeeRate,
    dinnerParticipation: {
      floor:
        doc.dinnerParticipation?.floor ?? DEFAULT_DINNER_PARTICIPATION.floor,
      base: doc.dinnerParticipation?.base ?? DEFAULT_DINNER_PARTICIPATION.base,
      decay:
        doc.dinnerParticipation?.decay ?? DEFAULT_DINNER_PARTICIPATION.decay,
    },
    ticketTypes: (doc.ticketTypes ?? []).map((t) => ({
      key: t._key,
      name: t.name,
      priceInclVat: t.priceInclVat ?? 0,
      attendsConference: t.attendsConference ?? false,
      attendsWorkshop: t.attendsWorkshop ?? false,
      workshopCrew: t.workshopCrew ?? false,
      sponsorIncluded: t.sponsorIncluded ?? false,
    })),
    sponsorTiers: (doc.sponsorTierAssumptions ?? []).map((t) => ({
      key: t._key,
      name: t.name,
      priceExVat: t.priceExVat ?? 0,
      includedTickets: t.includedTickets ?? 0,
    })),
    sponsorAddons: (doc.sponsorAddonAssumptions ?? []).map((a) => ({
      key: a._key,
      name: a.name,
      priceExVat: a.priceExVat ?? 0,
    })),
    variableCosts: (doc.variableCosts ?? []).map((c) => ({
      key: c._key,
      name: c.name,
      category: c.category,
      amountPerPerson: c.amountPerPerson ?? 0,
      basis: c.basis,
    })),
    fixedCosts: (doc.fixedCosts ?? []).map((c) => ({
      key: c._key,
      name: c.name,
      category: c.category,
      amount: c.amount ?? 0,
      optional: c.optional ?? false,
    })),
    scenarios: (doc.scenarios ?? []).map(mapScenario),
  }
}
