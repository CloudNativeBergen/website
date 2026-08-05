import 'server-only'
import { perOrgSecretsStore } from '@/lib/secrets/store'
import {
  conferenceOrgId,
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
 * WHAT COUNTS AS ENABLED (in order):
 *
 *  1. The registry decision (plan + `featureOverrides`) when it is not unset —
 *     an operator grant enables it, an explicit deny revokes it even from the
 *     platform org. See `./platform-default`.
 *  2. Otherwise: the platform org (it owns the env account), OR any org that has
 *     its OWN ticketing credentials in the per-org secret store. Rule 2's second
 *     half deliberately MIRRORS `resolveTicketingCredentials`: an org the secret
 *     seam can serve has a working ticketing integration, so hiding the surface
 *     from it would hide something that works. The gate must never be stricter
 *     than the credential resolver it fronts.
 *  3. Otherwise DISABLED — including every unresolvable org (fail closed).
 *
 * NOT A SECURITY BOUNDARY, AND A DENY IS NOT A KILL SWITCH. Credential
 * isolation is enforced in `resolveTicketingCredentials` and the tRPC tenancy
 * guards; this decides what an organizer is SHOWN. One consequence is worth
 * stating outright, because it looks like a bug and is not: because the ticket
 * pages resolve the PROVIDER first (`resolveTicketingAdminAccess`), an explicit
 * `enabled: false` override on an org that HAS working credentials hides the nav
 * entry and the ⌘K destination but does not blank a deep link — that conference
 * still renders its real sales data. That is the deliberate price of "never hide
 * a surface that works", and it is safe precisely because this is presentation:
 * revoking actual ACCESS means removing the org's credentials (or its binding),
 * which the seam above already governs. If a nav-level deny should ever become a
 * hard kill switch, that is a design change to make on purpose, not a comment to
 * quietly reinterpret here.
 *
 * The `ticketing` registry entry is `readiness: 'internal'` with NO `minPlan` —
 * which plan tier eventually sells ticketing is an open owner decision, so
 * nothing but an explicit grant (or owning credentials) turns it on.
 *
 * CONTRAST WITH `./badges.ts`, whose gate is the MIRROR of this one: badges'
 * capability exists for exactly one org, so there a grant cannot reach past the
 * capability. Ticketing is never stricter than its credentials; badges are never
 * looser than theirs. Both rules say the same thing — the gate tracks what the
 * surface can actually do.
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
 * Whether ticketing is enabled for the tenant that OWNS this conference — the
 * same tenant key `resolveTicketingCredentials` resolves credentials against.
 */
export async function isTicketingEnabledForConference(
  conference: ConferenceTenant | null | undefined,
): Promise<boolean> {
  return isTicketingEnabledForOrg(conferenceOrgId(conference))
}
