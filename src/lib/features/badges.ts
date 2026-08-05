import 'server-only'
import {
  conferenceOrgId,
  resolveRegistryEntitlement,
  type ConferenceTenant,
} from './platform-default'
import { isPlatformOrganization } from './platform'

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
 * ── THE GATE TRACKS THE CAPABILITY, IN BOTH DIRECTIONS ──────────────────────
 *
 * This is the MIRROR of the ticketing gate, and the asymmetry is deliberate.
 * Ticketing resolves the provider before it falls back on the absence of a
 * decision, so the gate is never STRICTER than the credentials — it must not
 * hide a surface that works. Badges have the opposite hazard: the capability is
 * a single global key pair that exists for exactly one org, so a gate that is
 * LOOSER than issuance would hand an organizer the full management UI for
 * something structurally broken — every Issue, every Rebake, every bulk run
 * failing with the tripwire's message. That is the dead end this whole change
 * exists to remove, re-created by an operator's own grant.
 *
 * So a `badges` override can REVOKE (a deny beats the platform default, like
 * every other feature) but cannot GRANT: the final word is
 * `isPlatformOrganization`, the same comparison `issueBadgeForSpeaker` makes. An
 * `enabled: true` override on a non-platform org is therefore inert TODAY, by
 * design — it is not a way to opt into a broken surface.
 *
 * A DENY IS A HARD KILL SWITCH HERE ALREADY, and that is the rule both modules
 * now state the same way (owner decision, 2026-08-06): the deny is checked
 * FIRST and the page 404s, so there is no deep link that outlives it. What
 * capability-tracking protects is the ABSENCE of a decision — never hide a
 * working surface (ticketing), never open a broken one (badges). An explicit
 * operator deny is not an absence, so it wins in both modules regardless of
 * what the capability says.
 *
 * NO PLAN TIER, DELIBERATELY. `ticketing` moved to `minPlan: 'pro'` once the
 * capability became per-tenant (the customer's own provider account); badges
 * cannot follow until platform#46 makes signing per-tenant, so the registry
 * entry carries no `minPlan` at all. Selling it first would sell something that
 * cannot work.
 *
 * WHEN platform#46 SHIPS per-tenant signing keys, this is the ONE line to
 * change: replace `isPlatformOrganization` with "the org has resolvable signing
 * keys" — the same relaxation the issuance tripwire's own comment promises — and
 * the override becomes meaningful again for orgs that have them. Keep the two
 * moving together; that is the invariant this module exists to hold.
 *
 * Caching and fail-closed posture: see `./platform-default`.
 */

/** The registry id this module gates. */
const BADGES_FEATURE = 'badges' as const

/**
 * Whether the organization may manage speaker badges: an explicit deny wins,
 * and otherwise the org must be the one that can actually ISSUE. A nullish or
 * unresolvable org id is DISABLED (fail closed).
 */
export async function isBadgesEnabledForOrg(
  orgId: string | null | undefined,
): Promise<boolean> {
  // Overrides still REVOKE — an operator must be able to take the surface away
  // from the platform org — and an unresolvable org resolves to `denied` here,
  // which keeps the fail-closed posture without a second null check.
  if ((await resolveRegistryEntitlement(orgId, BADGES_FEATURE)) === 'denied') {
    return false
  }

  // The capability itself. An `enabled: true` override does NOT reach past this:
  // see the module doc — granting a page whose every action fails would recreate
  // the dead end. ID comparison against the ONE uncached resolver, never the
  // cached document's `slug`.
  return isPlatformOrganization(orgId)
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
