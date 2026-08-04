import {
  isOrganizationPlan,
  type OrganizationPlan,
} from '@/lib/organization/types'

/**
 * The CLOSED, typed feature registry — the single source of truth for which
 * per-organization features exist and how each one becomes available.
 *
 * Like the homepage section registry (`src/lib/homepage/sections.ts`) this is
 * deliberately a fixed union: every feature here maps to vetted house
 * functionality, and an open/stringly registry would let a typo silently gate
 * (or un-gate) an endpoint. Add a feature by extending {@link FEATURE_IDS} and
 * {@link FEATURES}; the types force the two to stay in sync.
 *
 * AVAILABILITY SEMANTICS (resolved by `computeEntitlements` in
 * `./entitlements.ts`):
 *
 * - `readiness: 'ga'` — generally available: enabled for every org whose plan
 *   satisfies `minPlan` (an ABSENT `minPlan` means every plan, including
 *   community). The plan ladder is community < pro < enterprise.
 * - `readiness: 'beta'` — enabled ONLY via an explicit `featureOverrides`
 *   grant on the organization, regardless of plan. Beta features MAY be
 *   advertised as opt-in in upsell/marketing surfaces; `minPlan` (when set)
 *   documents the plan the feature is expected to require once it reaches GA.
 * - `readiness: 'internal'` — same override-only gating as beta, but NEVER
 *   surfaced in upsell UI: it exists for platform/pilot rollouts and appears
 *   only where the org is already entitled.
 * - OVERRIDES ALWAYS WIN, in both directions: an `enabled: true` override
 *   grants a feature the plan would deny, and an `enabled: false` override
 *   revokes a feature the plan would grant. An override whose `expiresAt` is
 *   in the past is ignored entirely.
 *
 * The set is intentionally SMALL and truthful. `graphql-api`,
 * `dedicated-email` and `slack-mirror` are still foundation-only (not enforced
 * anywhere). `workshops` IS enforced — see `./workshops.ts` for the single
 * resolver every workshop surface and the ticket-sold email go through.
 * Enforcement is wired per-feature via that pattern or the `requireFeature`
 * tRPC middleware.
 */

export const FEATURE_IDS = [
  'graphql-api',
  'dedicated-email',
  'slack-mirror',
  'workshops',
] as const

export type FeatureId = (typeof FEATURE_IDS)[number]

export type FeatureReadiness = 'ga' | 'beta' | 'internal'

export interface FeatureDefinition {
  id: FeatureId
  /** Short human title (entitlement lists, platform override editor). */
  title: string
  /** One-line description of what the feature unlocks. */
  description: string
  readiness: FeatureReadiness
  /**
   * Minimum plan for `ga` availability. Absent = every plan. For `beta` /
   * `internal` features this is informational only (the expected GA tier) —
   * availability still requires an explicit override.
   */
  minPlan?: OrganizationPlan
}

export const FEATURES: Record<FeatureId, FeatureDefinition> = {
  'graphql-api': {
    id: 'graphql-api',
    title: 'GraphQL API',
    description:
      'Programmatic read access to conference content over a public GraphQL endpoint.',
    readiness: 'internal',
  },
  'dedicated-email': {
    id: 'dedicated-email',
    title: 'Dedicated email sending',
    description:
      "Outbound email from the organization's own verified sender domain instead of the shared platform sender.",
    readiness: 'ga',
    minPlan: 'pro',
  },
  'slack-mirror': {
    id: 'slack-mirror',
    title: 'Slack mirroring',
    description:
      "Mirror speaker and sponsor conversations into the organization's Slack workspace.",
    readiness: 'internal',
  },
  workshops: {
    id: 'workshops',
    title: 'Workshop portal',
    description:
      'Attendee workshop sign-up portal, organizer workshop management, and the automatic workshop instructions email sent on every workshop ticket sale.',
    readiness: 'internal',
  },
}

/** Registry entries in declaration order (stable for lists and editors). */
export const FEATURE_LIST: readonly FeatureDefinition[] = FEATURE_IDS.map(
  (id) => FEATURES[id],
)

export function isFeatureId(value: unknown): value is FeatureId {
  return (
    typeof value === 'string' &&
    (FEATURE_IDS as readonly string[]).includes(value)
  )
}

/**
 * Resolve an org's stored plan to an effective plan (absent/invalid →
 * community). Lives in this CLIENT-SAFE module (not the server-only
 * entitlements resolver) because admin UI (the platform org manager) must apply
 * the same normalization before badge lookups as the resolver does.
 */
export function effectivePlan(
  plan: OrganizationPlan | string | null | undefined,
): OrganizationPlan {
  return isOrganizationPlan(plan) ? plan : 'community'
}

/** The plan ladder: community < pro < enterprise. */
const PLAN_RANK: Record<OrganizationPlan, number> = {
  community: 0,
  pro: 1,
  enterprise: 2,
}

/**
 * Whether `plan` satisfies a feature's `minPlan`. An absent `minPlan` is
 * satisfied by every plan.
 */
export function planSatisfies(
  plan: OrganizationPlan,
  minPlan: OrganizationPlan | undefined,
): boolean {
  if (!minPlan) return true
  return PLAN_RANK[plan] >= PLAN_RANK[minPlan]
}
