import 'server-only'
import {
  conferenceProviderType,
  type ConferenceTicketingBinding,
} from '@/lib/tickets/provider'
import {
  conferenceOrgId,
  resolveRegistryVerdict,
  type ConferenceTenant,
} from './platform-default'
import { canReadTicketsForOrg, isTicketingEnabledForOrg } from './ticketing'

/**
 * THE single gate for the workshop feature (#689, #1295) — the portal, the
 * organizer workshop surfaces, and (most importantly) the workshop instructions
 * email the ticket-sold webhook sends automatically.
 *
 * WHAT IT IS. A plain registry feature: `readiness: 'ga'`, `minPlan: 'pro'`
 * (see `./registry`), with ONE condition the registry cannot express. The
 * portal admits an attendee by looking their ticket up with the organization's
 * ticketing integration, so workshops are only ON when the org's ticketing is
 * enabled AND can read tickets for the vendor THIS CONFERENCE selected (see
 * `canReadTicketsForOrg`: the portal's own credential resolver and provider
 * are asked, per vendor). A paid plan whose ticketing cannot read tickets is
 * sold a portal that would refuse every attendee and a webhook that would mail
 * them into it, so it resolves OFF.
 *
 * So the decision is PER CONFERENCE, not per organization: two conferences of
 * one org on different vendors can differ, and every surface asks with the
 * conference in hand (`isWorkshopsEnabledForConference`) so they agree.
 *
 * There is NO platform-org rule here (#1295). The redirect URI of an attendee
 * sign-in is chosen per request, for the host the attendee is on
 * (`@/lib/workshop/sign-in`), so nothing about workshops belongs to one
 * deployment and the platform org qualifies by plan like any other tenant.
 * THIS GATE AND THAT ONE ARE SEPARATE QUESTIONS: this says a tenant has
 * workshops, the other says one of its hosts can sign in. A tenant this gate
 * turns on, on a host that cannot sign in, gets the unavailable view
 * (`WorkshopUnavailable`, #1298) or is sent to its first domain's portal when
 * that one can.
 *
 * What the platform org still holds by identity is TICKETING — the platform
 * env account — which is why it satisfies the second half of the rule with no
 * per-org secret, as long as that account's variables are set.
 *
 * RESOLUTION ORDER — fail-CLOSED at every step:
 *
 *  1. No resolvable org (unknown domain, missing org document, or a REJECTED
 *     org read) → DISABLED.
 *  2. An ACTIVE `featureOverrides` entry for `workshops` wins, in BOTH
 *     directions — `enabled: true` grants it whatever the plan and ticketing
 *     state, `enabled: false` revokes it from an org the plan would grant.
 *  3. Otherwise: the plan satisfies `pro` AND `isTicketingEnabledForOrg` AND
 *     `canReadTicketsForOrg` for the conference's vendor (`./ticketing`). A
 *     ticketing deny switches workshops off too — the portal has nothing to
 *     decide from.
 *  4. Anything else → DISABLED.
 *
 * ONE DOCUMENT of the organization: the plan and the overrides come from
 * `getOrganizationById`, cached and tagged `organizationTag(orgId)` (this gate
 * and the ticketing gate it consults each read it once, through that cache), so
 * a plan or override change takes effect by INVALIDATION. The vendor comes off
 * the conference the caller already holds, and the credentials from the secret
 * stores. Platform standing (for the ticketing half) is a pure
 * `PLATFORM_ORG_ID` comparison — no Sanity read.
 * Override expiry is evaluated per call against a fresh `now`.
 */

/** The registry id this module gates. */
const WORKSHOPS_FEATURE = 'workshops' as const

/**
 * What the gate reads off a conference: its OWNER and the ticketing vendor it
 * SELECTED (absent ⇒ Checkin, as everywhere). Pass the same conference the
 * portal's ticket lookup gets, so the two cannot be decided for different
 * vendors.
 */
export type WorkshopConference = ConferenceTenant &
  Pick<ConferenceTicketingBinding, 'ticketingProvider'>

/**
 * The gate's answer with "could not find out" kept apart from "no": `null` when
 * rule 3 was reached and the ticketing credential lookup was REFUSED. Every
 * gate collapses that to OFF; only the legal disclosure reads it
 * (`@/lib/legal/subprocessors.resolve`, which resolves an unknown by
 * disclosing). A missing conference or owner is OFF. Not a gate.
 */
export async function resolveWorkshopsForConference(
  conference: WorkshopConference | null | undefined,
): Promise<boolean | null> {
  const orgId = conferenceOrgId(conference)
  const verdict = await resolveRegistryVerdict(orgId, WORKSHOPS_FEATURE)
  // Rule 2: the operator's word is final.
  if (verdict === 'granted-by-override') return true
  // `'denied'` is an operator's deny or an unresolvable org; `'unset'` is a
  // plan below `pro` with no override. Both are OFF.
  if (verdict !== 'granted-by-plan' || !conference) return false
  // Rule 3: a plan grant is only worth anything with ticketing that works.
  if (!(await isTicketingEnabledForOrg(orgId))) return false
  return canReadTicketsForOrg(orgId, conferenceProviderType(conference))
}

/**
 * Whether workshops are enabled for this conference. See the module doc for the
 * exact resolution order. Fail closed: a missing conference, a conference with
 * no owner and a refused credential lookup are all DISABLED.
 *
 * KEYED ON THE CONFERENCE, never on a bare org id: the decision needs the
 * conference's owner (not whatever host the request happens to carry) and its
 * selected ticketing vendor.
 */
export async function isWorkshopsEnabledForConference(
  conference: WorkshopConference | null | undefined,
): Promise<boolean> {
  return (await resolveWorkshopsForConference(conference)) === true
}
