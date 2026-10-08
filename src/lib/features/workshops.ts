import 'server-only'
import { resolveCurrentOrgId } from '@/lib/authz/organizer'
import {
  conferenceOrgId,
  resolveRegistryVerdict,
  type ConferenceTenant,
} from './platform-default'
import {
  hasTicketingCredentialsForOrg,
  isTicketingEnabledForOrg,
} from './ticketing'

/**
 * THE single gate for the workshop feature (#689, #1295) — the portal, the
 * organizer workshop surfaces, and (most importantly) the workshop instructions
 * email the ticket-sold webhook sends automatically.
 *
 * WHAT IT IS. A plain registry feature: `readiness: 'ga'`, `minPlan: 'pro'`
 * (see `./registry`), with ONE condition the registry cannot express. The
 * portal admits an attendee by looking their ticket up with the organization's
 * ticketing integration, so workshops are only ON when the org's ticketing is
 * enabled AND holds read-capable credentials (an API key — see
 * `hasTicketingCredentialsForOrg` for what that does and does not prove). A
 * paid plan whose ticketing cannot read tickets is sold a portal that would
 * refuse every attendee and a webhook that would mail them into it, so it
 * resolves OFF.
 *
 * There is NO platform-org rule here (#1295). The implicit grant to
 * `PLATFORM_ORG_ID` existed because attendee sign-in ran through one WorkOS
 * client bound to one redirect host. #1296 removed that binding: the redirect
 * URI is chosen per request, for any ownership-verified host
 * (`@/lib/workshop/sign-in`). So the platform org qualifies by plan like any
 * other tenant. THIS GATE AND THAT ONE ARE SEPARATE QUESTIONS: this says a
 * tenant has workshops, the other says one of its hosts can sign in. A tenant
 * this gate turns on, whose host is not verified, has a portal that answers
 * 404 (#1298 owns that case).
 *
 * What the platform org still holds by identity is TICKETING — the platform
 * env account — which is why it satisfies the second half of the rule with no
 * per-org secret.
 *
 * RESOLUTION ORDER — fail-CLOSED at every step:
 *
 *  1. No resolvable org (unknown domain, missing org document, or a REJECTED
 *     org read) → DISABLED.
 *  2. An ACTIVE `featureOverrides` entry for `workshops` wins, in BOTH
 *     directions — `enabled: true` grants it whatever the plan and ticketing
 *     state, `enabled: false` revokes it from an org the plan would grant.
 *  3. Otherwise: the plan satisfies `pro` AND `isTicketingEnabledForOrg` AND
 *     `hasTicketingCredentialsForOrg` (`./ticketing`). A ticketing deny switches
 *     workshops off too — the portal has nothing to decide from.
 *  4. Anything else → DISABLED.
 *
 * ONE DOCUMENT: every input but the per-org secret comes from
 * `getOrganizationById`, cached and tagged `organizationTag(orgId)` (this gate
 * and the ticketing gate it consults each read it once, through that cache), so
 * a plan or override change takes effect by INVALIDATION. Platform standing (for the
 * ticketing half) is a pure `PLATFORM_ORG_ID` comparison — no Sanity read.
 * Override expiry is evaluated per call against a fresh `now`.
 */

/** The registry id this module gates. */
const WORKSHOPS_FEATURE = 'workshops' as const

/**
 * Whether the organization may use workshops. See the module doc for the exact
 * resolution order; a nullish org id is DISABLED (fail closed).
 */
export async function isWorkshopsEnabledForOrg(
  orgId: string | null | undefined,
): Promise<boolean> {
  const verdict = await resolveRegistryVerdict(orgId, WORKSHOPS_FEATURE)
  // Rule 2: the operator's word is final.
  if (verdict === 'granted-by-override') return true
  // `'denied'` is an operator's deny or an unresolvable org; `'unset'` is a
  // plan below `pro` with no override. Both are OFF.
  if (verdict !== 'granted-by-plan') return false
  // Rule 3: a plan grant is only worth anything with ticketing that works.
  if (!(await isTicketingEnabledForOrg(orgId))) return false
  return hasTicketingCredentialsForOrg(orgId)
}

/**
 * Whether workshops are enabled for the tenant that OWNS this conference. Use
 * this wherever a conference is already in hand (the workshop portal layout,
 * the ticket-sold webhook) so the decision keys on the conference's real owner
 * rather than on whatever host the request happens to carry.
 */
export async function isWorkshopsEnabledForConference(
  conference: ConferenceTenant | null | undefined,
): Promise<boolean> {
  return isWorkshopsEnabledForOrg(conferenceOrgId(conference))
}

/**
 * Whether workshops are enabled for the CURRENT request's domain-resolved org.
 * For surfaces that have no conference in hand; an unresolvable org is DISABLED.
 */
export async function isWorkshopsEnabledForCurrentOrg(): Promise<boolean> {
  return isWorkshopsEnabledForOrg(await resolveCurrentOrgId())
}
