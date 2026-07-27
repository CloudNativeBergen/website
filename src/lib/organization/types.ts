/**
 * TypeScript shapes for the multi-tenant `organization` document (CaaS tier 1,
 * #613) — mirrors `sanity/schemaTypes/organization.ts`.
 *
 * PLAN & OVERRIDES (feature entitlements foundation): `plan` is the org's
 * commercial tier; ABSENT resolves to `'community'` so every legacy org keeps
 * its current behaviour without a migration. `featureOverrides` are explicit
 * per-feature grants/denials that always win over the plan — see
 * `src/lib/features/entitlements.ts` for the resolution semantics.
 */

export const ORGANIZATION_PLANS = ['community', 'pro', 'enterprise'] as const

export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number]

export function isOrganizationPlan(value: unknown): value is OrganizationPlan {
  return (
    typeof value === 'string' &&
    (ORGANIZATION_PLANS as readonly string[]).includes(value)
  )
}

/**
 * One explicit entitlement override on an organization. `feature` is stored as
 * a plain string (the Sanity document cannot enforce the registry's closed
 * union); the resolver ignores entries whose `feature` is not a known
 * `FeatureId`, so a stale override for a removed feature is inert rather than
 * breaking resolution.
 */
export interface OrganizationFeatureOverride {
  _key?: string
  feature: string
  enabled: boolean
  /** Free-text audit note ("granted for pilot", "beta cohort 2", …). */
  note?: string
  /** ISO datetime after which the override is ignored (both directions). */
  expiresAt?: string
}

/** The organization document as projected by the org queries (`slug` flattened). */
export interface Organization {
  _id: string
  name: string
  slug: string
  contactEmail?: string
  plan?: OrganizationPlan
  featureOverrides?: OrganizationFeatureOverride[]
}
