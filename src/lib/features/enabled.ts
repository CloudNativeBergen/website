import 'server-only'
import { getEntitlementsForOrganization } from './entitlements'
import { conferenceOrgId, PLATFORM_DEFAULT_FEATURES } from './platform-default'
import { isBadgesEnabledForOrg } from './badges'
import { isTicketingEnabledForOrg } from './ticketing'
import {
  isWorkshopsEnabledForConference,
  type WorkshopConference,
} from './workshops'
import { FEATURE_IDS, type FeatureId } from './registry'

/**
 * The EFFECTIVE feature set of the tenant that OWNS a conference — what the
 * admin shell filters its nav and ⌘K destinations by (`visibleNavSections` /
 * `visibleDestinations`). It takes the conference, not a bare org id, because
 * `workshops` is decided per conference (its selected ticketing vendor).
 *
 * WHY THIS EXISTS. `computeEntitlements` alone is not the whole truth: the
 * platform-default features (`ticketing`, `badges`) carry implicit grants their
 * own resolvers own — the platform org, and for `ticketing` an org with its own
 * provider credentials — and `workshops` carries an extra CONDITION its
 * resolver owns (ticketing must be enabled and credentialed, #1295). The admin
 * layout used to hardcode `['workshops']`, which meant no other feature could
 * ever gate a destination. This composes the registry resolution with each
 * gate's own answer, so a destination tagged with ANY feature id is filtered by
 * the same decision the page itself re-checks server-side.
 *
 * Each gate reads the org document through the cached, `organizationTag`-tagged
 * `getOrganizationById`, so the calls below share one underlying read per
 * request rather than fanning out to Sanity.
 *
 * PRESENTATION, NOT SECURITY: hiding a destination only removes the pointer.
 * Every gated page re-checks its own gate (`notFound()` for badges and
 * workshops, an explicit unavailable state for ticketing).
 */
/** The features whose own resolver overrides the registry baseline. */
const GATED_FEATURES = [
  'workshops',
  ...PLATFORM_DEFAULT_FEATURES,
] as const satisfies readonly FeatureId[]

type GatedFeature = (typeof GATED_FEATURES)[number]

export async function resolveEnabledFeaturesForConference(
  conference: WorkshopConference | null | undefined,
): Promise<FeatureId[]> {
  const orgId = conferenceOrgId(conference)
  if (!orgId) return []

  const [entitled, workshops, ticketing, badges] = await Promise.all([
    // Resolves the plan/override baseline for the features that have no
    // resolver of their own (`graphql-api`, `dedicated-email`, `slack-mirror`).
    getEntitlementsForOrganization(orgId).catch((error: unknown) => {
      console.error(
        `[features] entitlement resolution failed for ${orgId}; treating every feature as DISABLED`,
        error,
      )
      return new Set<FeatureId>()
    }),
    isWorkshopsEnabledForConference(conference),
    isTicketingEnabledForOrg(orgId),
    isBadgesEnabledForOrg(orgId),
  ])

  const enabled = new Set(entitled)
  // Each gate is AUTHORITATIVE for its own feature, in both directions: it adds
  // the platform-default grant the registry alone cannot express, it REMOVES a
  // plan-granted `workshops` whose ticketing cannot serve it, and an explicit
  // deny it honours must not be re-added by the baseline above. The record is
  // keyed by the union, so adding a platform-default feature without wiring its
  // resolver here is a COMPILE error, not a silently missing gate.
  const gated: Record<GatedFeature, boolean> = {
    workshops,
    ticketing,
    badges,
  }
  for (const feature of GATED_FEATURES) {
    if (gated[feature]) enabled.add(feature)
    else enabled.delete(feature)
  }

  // Registry declaration order, so the list is stable for tests and snapshots.
  return FEATURE_IDS.filter((id) => enabled.has(id))
}
