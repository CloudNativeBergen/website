import 'server-only'
import { perOrgSecretsStore } from '@/lib/secrets/store'
import {
  conferenceOrgId,
  isFeatureExplicitlyDeniedForOrg,
  resolveRegistryEntitlement,
  type ConferenceTenant,
} from './platform-default'
import { isPlatformOrganization } from './platform'

/**
 * THE single gate for the organizer TICKETING surfaces (`/admin/tickets` and
 * its sub-pages).
 *
 * WHY IT IS GATED. Ticketing credentials are org-scoped since #820: a per-org
 * secret is the tenant's own provider account, and the platform env credentials
 * (`CHECKIN_*` / `TITO_*`) are handed to the PLATFORM ORG ONLY, because they are
 * one vendor ACCOUNT whose event ids no Sanity guard can see. A brand-new tenant
 * therefore resolves to NO credentials, and every ticketing page rendered a red
 * "Checkin.no Configuration Error" — an error frame for "this was never yours to
 * configure". This gate lets the nav hide the section and lets the pages say so
 * honestly instead.
 *
 * WHAT COUNTS AS ENABLED — THREE STATES, NOT TWO, resolved in this order:
 *
 *  1. An explicit operator DENY (an active `featureOverrides` entry with
 *     `enabled: false`) → DISABLED, and disabled EVERYWHERE: the nav, the ⌘K
 *     destination and the pages themselves, even for an org whose own
 *     credentials resolve, even for the platform org. See "a deny is a kill
 *     switch" below.
 *  2. An explicit GRANT (or a plan that reaches `minPlan`), OR the platform org
 *     (it owns the env account), OR any org that has its OWN ticketing
 *     credentials in the per-org secret store → ENABLED. That last clause
 *     deliberately MIRRORS `resolveTicketingCredentials`: an org the secret seam
 *     can serve has a working ticketing integration, so hiding the surface from
 *     it would hide something that works. The gate must never be stricter than
 *     the credential resolver it fronts.
 *  3. Otherwise DISABLED — including every unresolvable org (fail closed).
 *
 * ── A DENY *IS* A KILL SWITCH; AN ABSENT GRANT IS NOT ───────────────────────
 *
 * #828 shipped the second half of that sentence and left the first half
 * undone: because the ticket pages resolved the PROVIDER first, an
 * `enabled: false` override hid the nav entry but a deep link still rendered a
 * credentialed org's real sales data. That gap is closed (owner decision,
 * 2026-08-06) — `resolveTicketingAdminAccess` now asks about an explicit deny
 * BEFORE it resolves the provider.
 *
 * This REFINES #828's rule rather than reversing it, and the distinction is the
 * whole point: the ABSENCE of a grant must never hide a surface that works —
 * that is what provider-first protects, and rule 2 above still enforces it. An
 * EXPLICIT DENY is not an absence; it is an operator's deliberate decision, and
 * a decision that only half-applies is worse than either answer. So ordering
 * matters and is load-bearing: deny beats credentials, credentials beat the
 * absence of a decision. Swap those and you re-create the exact dead end #828
 * removed.
 *
 * ── HOW FAR THE DENY REACHES (owner decision on #836) ───────────────────────
 *
 * EVERY ORGANIZER-VISIBLE OUTPUT, not just the UI #834 gated:
 *
 *  - the organizer nav, ⌘K, all five ticket pages, the dashboard tile and the
 *    budget page (through `resolveTicketingAdminAccess`);
 *  - the WHOLE `tickets.admin.*` tRPC sub-router, via the
 *    `requireFeatureNotDenied('ticketing')` middleware — so a direct API call
 *    from an organizer of a denied org is refused FORBIDDEN, and
 *    `createDiscountCode` / `deleteDiscountCode` no longer write to that
 *    tenant's own provider account. This matters because the platform is
 *    deliberately agent-facing (`konfctl`, a planned MCP server): "hidden in the
 *    UI" is not "switched off";
 *  - the ticket section of the weekly Slack summary and the admin status page
 *    (`buildTicketSection`), so a denied org stops receiving live ticket counts
 *    on a cron with no organizer present.
 *
 * WHAT IT STILL DOES NOT REACH, deliberately: the ATTENDEE-facing ticket sale
 * (`src/lib/tickets/public.ts` and the public ticket page — a deny must never
 * break a sale mid-conference), workshop eligibility, and the admin status
 * PROBES. Nor speaker-ticket issuance, which keeps writing a 100%-off discount
 * into a denied org's vendor account: borderline, low-harm, and left alone
 * knowingly rather than by omission.
 *
 * NOT A SECURITY BOUNDARY, still, however far it reaches. Credential isolation
 * is enforced in `resolveTicketingCredentials` and the tRPC tenancy guards; a
 * deny is an operator's off switch, not a way to revoke access to a vendor
 * account we never held.
 *
 * THE PLAN TIER. The `ticketing` registry entry is `readiness: 'ga'` with
 * `minPlan: 'pro'` — the entry paid tier — because a tenant brings its own
 * provider account (see `./registry`). Rule 2's other clauses stand alongside
 * it: the platform org keeps ticketing on whatever plan its own document
 * carries, and a community org with its own credentials keeps the surface that
 * already works for it.
 *
 * CONTRAST WITH `./badges.ts`, whose gate is the MIRROR of this one: badges'
 * capability exists for exactly one org, so there a grant cannot reach past the
 * capability. Ticketing is never stricter than its credentials; badges are never
 * looser than theirs — except that an explicit deny overrides BOTH, because an
 * operator's decision is not a capability question. Both rules say the same
 * thing — absent a decision, the gate tracks what the surface can actually do.
 */

/** The registry id this module gates. */
const TICKETING_FEATURE = 'ticketing' as const

/**
 * Whether the organization has ITS OWN ticketing credentials in the per-org
 * secret store — the same store `resolveTicketingCredentials` consults first,
 * and provider-agnostic (a Tito or a Checkin bag both count).
 */
async function hasOwnTicketingCredentials(orgId: string): Promise<boolean> {
  try {
    return (await perOrgSecretsStore.get(orgId, 'ticketing')) !== null
  } catch (error) {
    // The store contract says a miss is `null` and never a throw; treat a
    // violation as "no credentials" rather than 500-ing the admin nav.
    console.error(
      `[features] per-org ticketing secret lookup failed for ${orgId}; treating "ticketing" as DISABLED`,
      error,
    )
    return false
  }
}

/**
 * Whether the organization may use the ticketing surfaces. See the module doc
 * for the exact order; a nullish org id is DISABLED (fail closed).
 */
export async function isTicketingEnabledForOrg(
  orgId: string | null | undefined,
): Promise<boolean> {
  const decision = await resolveRegistryEntitlement(orgId, TICKETING_FEATURE)
  if (decision !== 'unset') return decision === 'granted'
  if (!orgId) return false
  if (await isPlatformOrganization(orgId)) return true
  return hasOwnTicketingCredentials(orgId)
}

/**
 * Whether an OPERATOR has explicitly switched ticketing OFF for this org — the
 * kill switch of rule 1, and the one question a caller must ask BEFORE it
 * resolves the provider.
 *
 * This is deliberately narrower than `!isTicketingEnabledForOrg`: it is true
 * only for an active `enabled: false` override on a resolvable organization.
 * A nullish org, a missing document and a rejected read are NOT denies (see
 * `isFeatureExplicitlyDeniedForOrg`) — treating them as such would let one flaky
 * Sanity read blank a working ticketing page.
 */
export async function isTicketingDeniedForOrg(
  orgId: string | null | undefined,
): Promise<boolean> {
  return isFeatureExplicitlyDeniedForOrg(orgId, TICKETING_FEATURE)
}

/**
 * Whether ticketing is enabled for the tenant that OWNS this conference — the
 * same tenant key `resolveTicketingCredentials` resolves credentials against.
 */
export async function isTicketingEnabledForConference(
  conference: ConferenceTenant | null | undefined,
): Promise<boolean> {
  return isTicketingEnabledForOrg(conferenceOrgId(conference))
}

/**
 * {@link isTicketingDeniedForOrg} keyed on the conference's OWNER — for the
 * ungated background surfaces that hold a conference rather than an org id (the
 * weekly Slack summary, `src/lib/status/summary.ts`). Same narrowness: only an
 * operator's active `enabled: false` counts.
 */
export async function isTicketingDeniedForConference(
  conference: ConferenceTenant | null | undefined,
): Promise<boolean> {
  return isTicketingDeniedForOrg(conferenceOrgId(conference))
}
