import 'server-only'
import { getOrganizationById } from '@/lib/organization/sanity'
import type {
  OrganizationFeatureOverride,
  OrganizationPlan,
} from '@/lib/organization/types'
import {
  FEATURE_LIST,
  effectivePlan,
  planSatisfies,
  isFeatureId,
  type FeatureDefinition,
  type FeatureId,
} from './registry'

/**
 * Entitlement RESOLUTION — turns an organization's `plan` + `featureOverrides`
 * into the set of enabled {@link FeatureId}s, per the semantics documented in
 * `./registry.ts`:
 *
 * 1. `ga` features whose `minPlan` the plan satisfies start ENABLED; `beta` and
 *    `internal` features start DISABLED regardless of plan.
 * 2. Overrides are then applied IN ARRAY ORDER and always win — `enabled: true`
 *    grants, `enabled: false` revokes — so a later override for the same
 *    feature supersedes an earlier one.
 * 3. An override is IGNORED when its `feature` is not a known id (stale entry
 *    for a removed feature), or when `expiresAt` is set and not strictly in the
 *    future of `now` — including an unparsable `expiresAt`, which fails closed
 *    to "expired" rather than granting forever.
 *
 * The pure {@link computeEntitlements} carries all of that logic;
 * {@link getEntitlementsForOrganization} feeds it the org document via the
 * CACHED, `organizationTag`-tagged read (`getOrganizationById`) and a fresh
 * `now`, so expiry is evaluated per call while the document read itself is
 * cached until a plan/override mutation revalidates the tag.
 */

/** Whether an override is active at `now` (see the module doc, rule 3). */
function isOverrideActive(
  override: OrganizationFeatureOverride,
  now: Date,
): boolean {
  if (!override.expiresAt) return true
  const expiry = Date.parse(override.expiresAt)
  if (Number.isNaN(expiry)) return false
  return expiry > now.getTime()
}

/**
 * Whether the org carries an ACTIVE (present, known id, unexpired) override for
 * `feature` — REGARDLESS of its direction. Callers that layer an implicit
 * default grant on top of the registry (see `./workshops.ts`) need this to keep
 * the "overrides always win, in both directions" invariant: an explicit
 * `enabled: false` must be able to revoke a default the plan never granted, and
 * `computeEntitlements`' Set cannot express "explicitly denied" vs "not
 * granted".
 */
export function hasActiveOverride(
  overrides: readonly OrganizationFeatureOverride[] | null | undefined,
  feature: FeatureId,
  now: Date,
): boolean {
  return (overrides ?? []).some(
    (override) =>
      override.feature === feature && isOverrideActive(override, now),
  )
}

/**
 * PURE entitlement computation. See the module doc for the exact semantics;
 * `plan` may be the raw stored value (absent → community).
 */
export function computeEntitlements(
  plan: OrganizationPlan | string | null | undefined,
  overrides: readonly OrganizationFeatureOverride[] | null | undefined,
  now: Date,
): Set<FeatureId> {
  const resolvedPlan = effectivePlan(plan)
  const enabled = new Set<FeatureId>()

  for (const feature of FEATURE_LIST) {
    if (
      feature.readiness === 'ga' &&
      planSatisfies(resolvedPlan, feature.minPlan)
    ) {
      enabled.add(feature.id)
    }
  }

  for (const override of overrides ?? []) {
    if (!isFeatureId(override.feature)) continue
    if (!isOverrideActive(override, now)) continue
    if (override.enabled) enabled.add(override.feature)
    else enabled.delete(override.feature)
  }

  return enabled
}

/** An entitled feature plus HOW it is entitled (for read-only admin surfaces). */
export interface EntitledFeature {
  feature: FeatureDefinition
  /**
   * True when the feature is enabled only because of an explicit override
   * (i.e. the plan alone would not grant it).
   */
  viaOverride: boolean
}

/**
 * The entitled features as presentational rows (registry order), each flagged
 * with whether an override — rather than the plan — is what grants it.
 */
export function listEntitledFeatures(
  plan: OrganizationPlan | string | null | undefined,
  overrides: readonly OrganizationFeatureOverride[] | null | undefined,
  now: Date,
): EntitledFeature[] {
  const enabled = computeEntitlements(plan, overrides, now)
  const byPlan = computeEntitlements(plan, [], now)
  return FEATURE_LIST.filter((feature) => enabled.has(feature.id)).map(
    (feature) => ({ feature, viaOverride: !byPlan.has(feature.id) }),
  )
}

/**
 * The enabled feature set for an organization. The underlying document read is
 * cached and tagged `organizationTag(orgId)` (see `getOrganizationById`), so a
 * plan/override mutation that revalidates that tag immediately busts this
 * resolution. An unknown org resolves to the community baseline (no doc, no
 * overrides) rather than throwing — callers gating access treat a missing
 * feature as FORBIDDEN anyway.
 */
export async function getEntitlementsForOrganization(
  orgId: string,
): Promise<Set<FeatureId>> {
  const org = await getOrganizationById(orgId)
  return computeEntitlements(org?.plan, org?.featureOverrides, new Date())
}
