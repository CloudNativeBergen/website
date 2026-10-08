import 'server-only'
import { resolveCurrentOrgId } from '@/lib/authz/organizer'
import {
  conferenceOrgId,
  isPlatformDefaultFeatureEnabledForOrg,
  type ConferenceTenant,
} from './platform-default'

/**
 * THE single gate for the workshop feature (#689) — the portal, the organizer
 * workshop surfaces, and (most importantly) the workshop instructions email the
 * ticket-sold webhook sends automatically.
 *
 * WHY IT IS GATED. Workshops authenticate ticket-holding ATTENDEES through
 * WorkOS AuthKit, in ONE environment shared by every tenant. Until #1296 that
 * environment was bound to one `redirect_uri` on the platform host, so on any
 * other tenant domain the sign-in could never complete and the webhook emailed
 * buyers a link into a loop — which is why the feature is `readiness:
 * 'internal'` (override-only, never offered in upsell surfaces).
 *
 * SIGN-IN IS NO LONGER HOST-BOUND (#1296): the redirect URI is chosen per
 * request, for any host on the verified-redirect allowlist
 * (`@/lib/workshop/sign-in`). WHICH tenants get the feature is still decided
 * here and still the platform-default rule below; #1295 replaces it with a
 * plan gate. The two are separate questions: this gate says a tenant has
 * workshops, the allowlist says one of its hosts can sign in.
 *
 * RESOLUTION ORDER — the shared PLATFORM-DEFAULT shape (`./platform-default.ts`,
 * which also carries the caching and fail-closed notes), fail-CLOSED at every
 * step:
 *
 *  1. No resolvable org (unknown domain, missing org document, or a REJECTED
 *     org read) → DISABLED. An unresolvable tenant must never degrade into
 *     "serve it anyway"; this mirrors the org-scoped authz waist's posture.
 *  2. An ACTIVE `featureOverrides` entry for `workshops` wins, in BOTH
 *     directions — `enabled: true` grants it to a pilot org, `enabled: false`
 *     revokes it even from the platform org (rule 3). NOTE: a grant does not
 *     make a host able to sign in. The portal still answers 404 on a host that
 *     is not ownership-verified (`resolveWorkshopSignInHost`), and the webhook
 *     does not yet check that before it emails the link (#1298).
 *  3. The org whose id is `PLATFORM_ORG_ID` keeps workshops by default — the
 *     one tenant the feature was built for, kept until #1295 lands so nothing
 *     changes without a data migration.
 *  4. Anything else → DISABLED.
 *
 * ONE READ ONLY (RunKonf/platform#36, #43):
 *
 *  - `plan` and `featureOverrides` come from `getOrganizationById`, cached and
 *    tagged `organizationTag(orgId)`. The platform manager revalidates that tag
 *    when it flips an override, and an external writer can now do the same
 *    through `POST /api/provisioning/cache/invalidate`, so a change takes
 *    effect immediately by INVALIDATION.
 *  - Rule 3's platform-org identity comes from `isPlatformOrganization`, a pure
 *    id comparison against the configured `PLATFORM_ORG_ID` — no Sanity read and
 *    no cache, so no staleness window and nothing to invalidate. (Before #43 it
 *    resolved a customer-writable slug uncached; binding to the immutable id
 *    removed both the read and the mutable-field hazard.)
 *
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
  return isPlatformDefaultFeatureEnabledForOrg(orgId, WORKSHOPS_FEATURE)
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
