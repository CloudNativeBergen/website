import 'server-only'
import { getOrganizationById } from '@/lib/organization/sanity'
import { resolveCurrentOrgId } from '@/lib/authz/organizer'
import { computeEntitlements, hasActiveOverride } from './entitlements'
import { isPlatformOrganization } from './platform'

/**
 * THE single gate for the workshop feature (#689) — the portal, the organizer
 * workshop surfaces, and (most importantly) the workshop instructions email the
 * ticket-sold webhook sends automatically.
 *
 * WHY IT IS GATED. Workshops authenticate ticket-holding ATTENDEES through
 * WorkOS AuthKit, configured with ONE global `WORKOS_CLIENT_ID` and ONE global
 * `redirect_uri` on the platform host. On any other tenant domain the sign-in
 * round-trip seals its `wos-session` cookie on the platform host, which the
 * tenant's own host can never read — the attendee bounces back to a sign-in
 * button forever. The webhook then emails every workshop ticket buyer a link
 * straight into that loop. Emailing a link that cannot work is worse than
 * silence, so the feature is `readiness: 'internal'` (override-only, never
 * offered in upsell surfaces) and OFF for everyone it does not work for.
 *
 * RESOLUTION ORDER — fail-CLOSED at every step:
 *
 *  1. No resolvable org (unknown domain, missing org document, or a REJECTED
 *     org read) → DISABLED. An unresolvable tenant must never degrade into
 *     "serve it anyway"; this mirrors the org-scoped authz waist's posture.
 *  2. An ACTIVE `featureOverrides` entry for `workshops` wins, in BOTH
 *     directions — `enabled: true` grants it to a pilot org, `enabled: false`
 *     revokes it even from the platform org (rule 3). NOTE: a grant asserts
 *     that the org is served ON the WorkOS host — the AuthKit round-trip is
 *     still host-bound (see `isWorkOSAuthHost` in `src/proxy.ts`), so granting
 *     it to an org on its own domain re-opens the very link this gate closes.
 *     Until attendee auth is tenant-aware, the override is for pilots on the
 *     platform deployment.
 *  3. The org whose id is `PLATFORM_ORG_ID` keeps workshops by default. The
 *     single WorkOS client and its redirect URI belong to the platform
 *     deployment, so the platform org is the one tenant the feature is known to
 *     work for — this is what keeps today's behaviour byte-identical without a
 *     data migration.
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
 *
 * LONGER TERM (out of scope, see #689): if workshops become sellable, WorkOS
 * has no `redirectProxyUrl` equivalent and should be replaced by a signed
 * magic-link issued from the ticket-sold webhook (which already holds the
 * payment-verified email) rather than hand-rolling a central-origin bounce.
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
  if (!orgId) return false

  // A REJECTED read (transient Sanity failure) must resolve to DISABLED like
  // any other unresolvable org — never propagate, or one flaky read would 500
  // the whole admin dashboard through the nav's entitlement lookup and turn a
  // deliberately suppressed webhook delivery into a retried 500.
  let org
  try {
    org = await getOrganizationById(orgId)
  } catch (error) {
    console.error(
      `[workshops] organization read failed for ${orgId}; treating workshops as DISABLED`,
      error,
    )
    return false
  }
  if (!org) return false

  const now = new Date()
  if (
    computeEntitlements(org.plan, org.featureOverrides, now).has(
      WORKSHOPS_FEATURE,
    )
  ) {
    return true
  }

  // Not entitled by plan/override. An ACTIVE override at this point can only be
  // an explicit `enabled: false`, which must beat the platform default below.
  if (hasActiveOverride(org.featureOverrides, WORKSHOPS_FEATURE, now)) {
    return false
  }

  // ID comparison against the ONE uncached resolver, never `org.slug` off the
  // cached read above — see `./platform`. This is a grant, and this deployment
  // has an org that is both the platform org and a tenant, so a slug edit that
  // revokes it must revoke it NOW rather than whenever the cached document
  // happens to expire.
  return isPlatformOrganization(orgId)
}

/** The minimum conference shape this gate reads — its owning tenant. */
interface ConferenceTenant {
  organization?: { _ref: string; _type?: 'reference' }
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
  return isWorkshopsEnabledForOrg(conference?.organization?._ref)
}

/**
 * Whether workshops are enabled for the CURRENT request's domain-resolved org.
 * For surfaces that have no conference in hand; an unresolvable org is DISABLED.
 */
export async function isWorkshopsEnabledForCurrentOrg(): Promise<boolean> {
  return isWorkshopsEnabledForOrg(await resolveCurrentOrgId())
}
