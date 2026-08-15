/**
 * How many complimentary conference tickets a sponsor tier includes.
 *
 * This module replaced `SPONSOR_TIER_TICKET_ALLOCATION`, a hardcoded map keyed
 * by tier TITLE:
 *
 *     { Pod: 2, Service: 3, Ingress: 5 }
 *
 * Those were the old Kubernetes-themed tier names. They were renamed (to Gold,
 * Platinum, Community, "… Sponsorship", …) and the map never followed, so
 * `map[title] || 0` quietly returned 0 for every sponsor. Nothing errored: the
 * `|| 0` made a missing key indistinguishable from a tier that genuinely
 * includes no tickets. The visible result was that sponsor discount codes could
 * not be created for anyone, and the sponsor share of the free-ticket budget
 * read as zero.
 *
 * A title-keyed map is also unfixable in principle here: this is a multi-tenant
 * codebase, and a second conference's tier names would never have matched
 * either. The number belongs on the tier document, per tenant — so it lives on
 * `sponsorTier.ticketEntitlement` and every consumer reads it through this
 * function.
 *
 * `__tests__/lib/tickets/entitlement.test.ts` fails if a title-keyed allocation
 * map is reintroduced anywhere under `src/`.
 */

/** The shape any tier-ish object needs for its entitlement to be readable. */
export interface TierWithEntitlement {
  ticketEntitlement?: number | null
}

/**
 * The tickets included per sponsor for `tier`, normalised to a safe integer.
 *
 * Absent, `null`, negative, fractional or non-numeric all resolve to a
 * defensible number rather than throwing — this feeds capacity arithmetic and a
 * `NaN` would silently poison every downstream total. An UNSET entitlement is
 * 0: the conservative reading, since over-reporting would hand out free tickets
 * nobody agreed to. Restoring the *intended* historical numbers is a data
 * question, not a code one — see
 * `migrations/021-sponsortier-add-ticket-entitlement`.
 */
export function ticketEntitlementOf(tier?: TierWithEntitlement | null): number {
  const value = tier?.ticketEntitlement

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.floor(value)
}
