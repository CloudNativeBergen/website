import 'server-only'
import { getOrganizationById } from '@/lib/organization/sanity'
import { computeEntitlements, hasActiveOverride } from './entitlements'
import { isPlatformOrganization } from './platform'
import type { OrganizationFeatureOverride } from '@/lib/organization/types'
import type { FeatureId } from './registry'

/**
 * The shared resolution shape behind every PLATFORM-DEFAULT feature — the
 * features that carry an implicit grant to the organization configured as
 * `PLATFORM_ORG_ID` on top of whatever the registry decides.
 *
 * WHY THE SHAPE EXISTS. `workshops` (#689), `ticketing` (#820) and `badges`
 * (RunKonf/platform#46) each began as ONE global credential the platform
 * deployment owns — one WorkOS client, one provider account, one badge signing
 * key pair — none of which works for a second tenant on its own. So the honest
 * default for all three is "the platform org, and whoever an operator
 * explicitly grants", which is exactly what `./workshops.ts` worked out first;
 * this module is that logic, factored out so the three gates cannot drift.
 *
 * The implicit grant OUTLIVES the internal readiness that motivated it:
 * `ticketing` is now `readiness: 'ga'` with `minPlan: 'pro'` (a tenant brings
 * its own provider account), and the platform org must keep it whatever plan
 * its own organization document happens to carry. That is exactly what rule 3
 * below preserves.
 *
 * RESOLUTION ORDER — fail-CLOSED at every step:
 *
 *  1. No resolvable org (unknown domain, missing org document, or a REJECTED
 *     org read) → DENIED. An unresolvable tenant must never degrade into "serve
 *     it anyway"; this mirrors the org-scoped authz waist's posture.
 *  2. An ACTIVE `featureOverrides` entry wins, in BOTH directions —
 *     `enabled: true` grants it to a pilot org, `enabled: false` revokes it even
 *     from the platform org (rule 3). An `enabled: false` is an operator's
 *     deliberate decision and is honoured EVERYWHERE, including by surfaces that
 *     would otherwise resolve their own capability first; see
 *     {@link isFeatureExplicitlyDeniedForOrg} and `../tickets/admin-access`.
 *  3. Otherwise the decision is UNSET and the caller applies its own default.
 *     {@link isPlatformDefaultFeatureEnabledForOrg} applies the shared one: the
 *     org whose id is `PLATFORM_ORG_ID` keeps the feature. `./ticketing.ts`
 *     layers one extra grant on top (an org with its OWN provider credentials).
 *
 * ONE READ ONLY: `plan` and `featureOverrides` come from `getOrganizationById`,
 * cached and tagged `organizationTag(orgId)`, so an override flip takes effect
 * by INVALIDATION. Platform standing comes from `isPlatformOrganization`, a pure
 * id comparison against the configured `PLATFORM_ORG_ID` — no Sanity read, no
 * cache, no staleness window, and never the document's customer-writable `slug`.
 * Override expiry is evaluated per call against a fresh `now`.
 */

/** The features that default to the platform organization (see the module doc). */
export const PLATFORM_DEFAULT_FEATURES = [
  'workshops',
  'ticketing',
  'badges',
] as const satisfies readonly FeatureId[]

export type PlatformDefaultFeature = (typeof PLATFORM_DEFAULT_FEATURES)[number]

/**
 * What the REGISTRY (plan + overrides) decides for a feature. `'unset'` means
 * neither granted nor explicitly denied — the caller's implicit default applies.
 */
export type RegistryDecision = 'granted' | 'denied' | 'unset'

/**
 * The registry's decision for `feature` on `orgId`. A nullish org, an unknown
 * organization document, and a rejected read all resolve to `'denied'` (fail
 * closed) rather than `'unset'` — an unresolvable tenant must not inherit a
 * default grant.
 */
export async function resolveRegistryEntitlement(
  orgId: string | null | undefined,
  feature: FeatureId,
): Promise<RegistryDecision> {
  if (!orgId) return 'denied'
  const org = await readOrganizationFor(orgId, feature)
  if (!org) return 'denied'
  return decideFromDocument(org, feature)
}

/**
 * Whether an OPERATOR has explicitly denied `feature` to this org — an active
 * `featureOverrides` entry with `enabled: false`, and nothing else.
 *
 * WHY THIS IS NOT `resolveRegistryEntitlement(...) === 'denied'`. That function
 * folds "unresolvable tenant" into `'denied'` so a grant can never leak; here
 * the answer is used as a KILL SWITCH (see `../tickets/admin-access`), and a
 * nullish org id, a missing document or a transient REJECTED read are not
 * operator decisions. Reporting them as a deny would let one flaky Sanity read
 * blank a working ticketing page — the exact hazard #828's provider-first order
 * exists to prevent. A real document that is neither entitled nor granted but
 * carries an active override can only be an explicit `enabled: false`, so
 * `'denied'` FROM A DOCUMENT is precisely the operator's own decision.
 */
export async function isFeatureExplicitlyDeniedForOrg(
  orgId: string | null | undefined,
  feature: FeatureId,
): Promise<boolean> {
  if (!orgId) return false
  const org = await readOrganizationFor(orgId, feature)
  if (!org) return false
  return decideFromDocument(org, feature) === 'denied'
}

/**
 * The org document, or `null` when it cannot be resolved. A REJECTED read
 * (transient Sanity failure) resolves to `null` like an unknown org — never
 * propagate, or one flaky read would 500 the whole admin dashboard through the
 * nav's entitlement lookup.
 */
async function readOrganizationFor(orgId: string, feature: FeatureId) {
  try {
    return await getOrganizationById(orgId)
  } catch (error) {
    console.error(
      `[features] organization read failed for ${orgId}; treating "${feature}" as DISABLED`,
      error,
    )
    return null
  }
}

/** The registry decision for a RESOLVED org document (see the module doc). */
function decideFromDocument(
  org: { plan?: string; featureOverrides?: OrganizationFeatureOverride[] },
  feature: FeatureId,
): RegistryDecision {
  const now = new Date()
  if (computeEntitlements(org.plan, org.featureOverrides, now).has(feature)) {
    return 'granted'
  }

  // Not entitled by plan/override. An ACTIVE override at this point can only be
  // an explicit `enabled: false`, which must beat any caller-side default.
  if (hasActiveOverride(org.featureOverrides, feature, now)) return 'denied'

  return 'unset'
}

/**
 * Whether a platform-default feature is enabled for `orgId`: the registry
 * decision, falling back to "is this the platform org?" when it is unset.
 */
export async function isPlatformDefaultFeatureEnabledForOrg(
  orgId: string | null | undefined,
  feature: PlatformDefaultFeature,
): Promise<boolean> {
  const decision = await resolveRegistryEntitlement(orgId, feature)
  if (decision !== 'unset') return decision === 'granted'
  // ID comparison against the ONE uncached resolver, never the cached document's
  // `slug` — see `./platform`. This is a grant, and this deployment has an org
  // that is both the platform org and a tenant, so a slug edit that revokes it
  // must revoke it NOW rather than whenever the cached document expires.
  return isPlatformOrganization(orgId)
}

/** The minimum conference shape these gates read — its owning tenant. */
export interface ConferenceTenant {
  organization?: { _ref: string; _type?: 'reference' }
}

/** The owning tenant of a conference, or `null` (fail closed). */
export function conferenceOrgId(
  conference: ConferenceTenant | null | undefined,
): string | null {
  return conference?.organization?._ref ?? null
}
