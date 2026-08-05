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
 * The set is intentionally SMALL and truthful. `graphql-api` and
 * `dedicated-email` are still foundation-only (not enforced anywhere).
 * `workshops`, `slack-mirror`, `ticketing` and `badges` ARE enforced — see
 * `./workshops.ts`, `./slack.ts`, `./ticketing.ts` and `./badges.ts` for the
 * single resolver each of their surfaces goes through (`slack-mirror` gates the
 * PLATFORM's shared Slack bot token, consumed at the one chokepoint
 * `resolveConferenceSlackToken`). Enforcement is wired per-feature via that
 * pattern or the `requireFeature` tRPC middleware.
 *
 * `workshops`, `ticketing` and `badges` share the PLATFORM-DEFAULT shape
 * (`./platform-default.ts`): an implicit grant to the organization configured as
 * `PLATFORM_ORG_ID`, because each started as a single global credential the
 * platform deployment owns (one WorkOS client, one provider account, one badge
 * signing key pair).
 *
 * A TIER IS ATTACHED ONLY WHEN THE CAPABILITY IS PER-TENANT. `ticketing` now
 * carries `readiness: 'ga'` + `minPlan: 'pro'` — the entry PAID tier — because a
 * tenant supplies its own provider account, so the feature genuinely works for a
 * customer who buys it. `workshops` and `badges` stay `internal` with NO
 * `minPlan`: their single global credential still cannot serve a second tenant,
 * and encoding a tier there would sell a surface that cannot work.
 */

export const FEATURE_IDS = [
  'graphql-api',
  'dedicated-email',
  'slack-mirror',
  'workshops',
  'ticketing',
  'badges',
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
  ticketing: {
    id: 'ticketing',
    title: 'Ticketing integration',
    description:
      'Organizer ticket sales, orders, ticket types, discount codes and company breakdown, read live from the conference’s ticketing provider (Checkin.no or Tito).',
    // SOLD AT THE ENTRY PAID TIER (owner decision, 2026-08-06). A tenant brings
    // its OWN Checkin.no or Tito account — the integration reads that account
    // through the tenant's own per-org credentials, so it costs the platform
    // nothing per tenant. There is no per-tenant cost to recover and no scarce
    // platform resource to ration, so it belongs in the cheapest paid plan
    // rather than behind the top of the ladder. The ladder here is community
    // (the free/comped tier) < pro < enterprise, so the entry PAID tier is
    // `pro`. Contrast `badges` below, which stays internal because the
    // capability itself does not exist per-tenant yet.
    readiness: 'ga',
    minPlan: 'pro',
  },
  badges: {
    id: 'badges',
    title: 'Speaker badges',
    // The override editor renders this description, so it says out loud that a
    // GRANT here does nothing: issuance signs with one global key pair and
    // refuses every non-platform org, so `./badges.ts` will not open a surface
    // whose every action fails. Revoking still works.
    description:
      'Issuing and emailing OpenBadges v3.0 credentials to speakers and organizers. Platform organization only until per-tenant signing keys exist (platform#46) — an override can revoke this, but cannot grant it.',
    // DELIBERATELY NO `minPlan` (owner decision, 2026-08-06). Unlike ticketing,
    // badges have no per-tenant capability to sell yet: issuance signs with one
    // global key pair, so per-tenant signing keys (RunKonf/platform#46) must
    // land before any plan can promise this. Attaching a tier now would sell
    // something that cannot work.
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
