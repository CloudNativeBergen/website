import 'server-only'
import { PER_ORG_SECRETS_STORES } from '@/lib/secrets/store'
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
 *    on a cron with no organizer present;
 *  - two ticketing-adjacent procedures that live OUTSIDE `tickets.admin.*`
 *    and were missed by the first pass (#850): `conference.updateTicketingIds`,
 *    which rebinds the provider event this whole surface derives from, and
 *    `sponsor.crm.sendDiscountEmail`, which mails a client-supplied discount
 *    code to a sponsor. Neither calls the provider, which is why enumerating
 *    provider call sites did not find them — a deny has to cover the ticketing
 *    WRITES and SENDS too, not only the reads that cost a vendor round-trip.
 *
 * THIS LIST IS THE CONTRACT. It is maintained by hand across four modules and
 * two routers, so a new ticketing-adjacent procedure is only covered if someone
 * adds it here and composes the middleware; nothing enforces the correspondence.
 *
 * WHAT IT STILL DOES NOT REACH, deliberately: the ATTENDEE-facing ticket sale
 * (`src/lib/tickets/public.ts` and the public ticket page — a deny must never
 * break a sale mid-conference), workshop eligibility, and the admin status
 * PROBES. Nor speaker-ticket issuance, which keeps reaching a denied org's
 * vendor account: borderline, low-harm, and left alone knowingly rather than
 * by omission. Note that this exclusion is wider than "a side effect of
 * accepting a proposal" — `speaker.sendTicketInvitations` is a standing
 * organizer mutation that an organizer of a denied org can trigger at will,
 * which is a sharper asymmetry with the now-gated `sendDiscountEmail` than the
 * word "issuance" suggests.
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
 * Whether the organization has ITS OWN ticketing credentials in ANY per-org
 * secret store — the same stores `resolveTicketingCredentials` consults first
 * (`TENANT_<SLUG>_CHECKIN_*`, then `TENANT_SECRETS_JSON`), and
 * provider-agnostic: a Tito or a Checkin bag both count.
 *
 * BOTH stores, deliberately. The module doc's rule is that this gate must never
 * be STRICTER than the resolver it fronts; asking only the JSON store would hide
 * the whole ticketing surface from a tenant configured by discrete env vars,
 * whose integration works perfectly. The other direction is allowed and does
 * occur — a Tito conference in an org holding only `TENANT_<SLUG>_CHECKIN_*`
 * counts here but resolves to no credentials — and lands on the honest
 * "unconfigured" empty state rather than a hidden nav entry.
 */
async function hasOwnTicketingCredentials(orgId: string): Promise<boolean> {
  try {
    for (const store of PER_ORG_SECRETS_STORES) {
      if ((await store.get(orgId, 'ticketing')) !== null) return true
    }
    return false
  } catch (error) {
    // A miss is `null`; a THROW means the store could not determine the
    // tenant's env-var slug (`TenantEnvSlugUnavailableError`,
    // RunKonf/platform#57) — or that some store violated its contract. Either
    // way this gate answers a UI question ("may this org see the ticketing
    // surfaces?"), where the safe direction is to hide them rather than 500 the
    // admin nav. That is the OPPOSITE direction from the credential path, which
    // must stay loud, and both are deliberate: withholding a nav entry is
    // recoverable, sending on the wrong account is not.
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
