import type { PlanFeatureRow } from './PlanFeaturesCard'

/**
 * Why a plan-listed `workshops` row is shown as INACTIVE (#1295). The gate in
 * `src/lib/features/workshops.ts` requires the org's ticketing to be enabled
 * and connected on top of the plan, because the portal admits attendees from
 * ticket data; this is the one sentence the org that has the gap gets to read.
 */
export const WORKSHOPS_INACTIVE_REASON =
  'Inactive until the ticketing integration is enabled and connected to this organization’s own account — the portal admits attendees from ticket data.'

/**
 * Make the Plan & Features rows agree with the workshop resolver. The rows come
 * from the generic plan/override list, which cannot see the ticketing condition
 * the resolver adds; a `workshops` row the resolver says is OFF stays visible
 * (the org is paying for it) but is marked inactive with the reason. The
 * resolver can only be ON for a feature the generic list already carries, so
 * there is no row to ADD here.
 */
export function applyWorkshopGate(
  rows: readonly PlanFeatureRow[],
  workshopsEnabled: boolean,
): PlanFeatureRow[] {
  return rows.map((row) =>
    row.id === 'workshops' && !workshopsEnabled
      ? { ...row, inactiveReason: WORKSHOPS_INACTIVE_REASON }
      : row,
  )
}
