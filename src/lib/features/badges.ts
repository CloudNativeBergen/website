import 'server-only'
import {
  conferenceOrgId,
  isPlatformDefaultFeatureEnabledForOrg,
  type ConferenceTenant,
} from './platform-default'

/**
 * THE single gate for the speaker BADGE feature — the `/admin/speakers/badge`
 * management surface and the "Manage Badges" entry that points at it.
 *
 * WHY IT IS GATED. Open Badge credentials are signed with ONE GLOBAL key pair
 * shared by every tenant, and issued bytes verify PERMANENTLY on platforms we do
 * not control (Credly, 1EdTech, LinkedIn) — a badge minted for a second tenant on
 * the global keys could never be un-issued or re-signed. `issueBadgeForSpeaker`
 * therefore REFUSES any non-platform org outright (the Phase 0 tripwire,
 * RunKonf/platform#46). That refusal is correct but invisible until an organizer
 * clicks Issue, at which point the raw refusal — which names an internal issue
 * tracker — is rendered once PER SPEAKER.
 *
 * This gate moves the same decision to the front door, so a tenant that can
 * never issue a badge never reaches a page whose every action fails: the nav
 * entry and the ⌘K destination are hidden (see the `feature` tag in
 * `@/lib/admin/registry`) and the page itself 404s. The issuance tripwire STAYS
 * — it is the security boundary; this is presentation.
 *
 * The `badges` registry entry is `readiness: 'internal'` with NO `minPlan`: it
 * is not sellable at any tier until per-tenant signing keys exist
 * (platform#46), so an override is the only way to grant it, and granting it
 * without those keys would surface a page whose issuance still refuses.
 *
 * Resolution order, caching and fail-closed posture: see `./platform-default`.
 */

/** The registry id this module gates. */
const BADGES_FEATURE = 'badges' as const

/**
 * Whether the organization may manage speaker badges. A nullish org id is
 * DISABLED (fail closed).
 */
export async function isBadgesEnabledForOrg(
  orgId: string | null | undefined,
): Promise<boolean> {
  return isPlatformDefaultFeatureEnabledForOrg(orgId, BADGES_FEATURE)
}

/**
 * Whether badges are enabled for the tenant that OWNS this conference — the
 * same tenant key `issueBadgeForSpeaker` compares against the platform org, so
 * the page gate and the issuance tripwire agree by construction.
 */
export async function isBadgesEnabledForConference(
  conference: ConferenceTenant | null | undefined,
): Promise<boolean> {
  return isBadgesEnabledForOrg(conferenceOrgId(conference))
}
