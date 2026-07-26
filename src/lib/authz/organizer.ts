import 'server-only'
import type { Speaker } from '@/lib/speaker/types'
import { getOrganizationRefForCurrentConference } from '@/lib/organization/sanity'

/**
 * Org-scoped organizer authorization (CaaS T1-2, #614).
 *
 * THE MODEL. A user is an organizer OF AN ORGANIZATION iff they are in the
 * `organizers[]` of any of THAT org's conferences. This is baked into the session
 * token at login as `speaker.organizerOrgIds` (see `applySpeakerToToken` /
 * `ORGANIZER_ORG_IDS_FIELD`). Authorization for a request keys on whether the
 * REQUEST's organization is in that set. The request's org is ALWAYS derived from
 * the domain-resolved conference — never from client input.
 *
 * BRIDGE (1) — org UNRESOLVABLE — NOW FAILS CLOSED. The 044 backfill has run, so
 * every live conference has an `organization`; an unresolvable org id therefore no
 * longer means "pre-backfill data" but an unknown domain or a transient
 * resolution failure. Granting organizer access there via the deprecated global
 * `speaker.isOrganizer` was unnecessary permissiveness, so `orgId === null` now
 * DENIES. A `console.warn('[authz-bridge] …')` is still emitted when a would-be
 * organizer (global flag set) is denied, so the denial is observable.
 *
 * BRIDGE (2) — LEGACY TOKEN — KEPT (SUNSET). A JWT minted before #635 has NO
 * `organizerOrgIds` field at all; denying those would 403 every logged-in
 * organizer until their token expires (session maxAge = 30d default) or they re-
 * login. We still bridge those via the deprecated global flag. This is the LAST
 * remaining bridge and is dated for removal — see the `TODO(sunset …)` below.
 *
 * REMOVAL CONDITION. Delete bridge (2) — and with it Fix A's `trigger: 'update'`
 * session refresh becomes the mechanism by which any straggler re-mints a modern
 * token — once every pre-#635 token has expired (30d after #635). At that point a
 * present-but-absent `organizerOrgIds` should return `false`. See docs/AUTH.md.
 */

/** The minimum shape these checks read off a speaker/session token. */
type OrganizerSpeaker = Pick<Speaker, '_id' | 'isOrganizer' | 'organizerOrgIds'>

/**
 * PURE, synchronous org-scoped organizer check. Given a speaker and the already-
 * resolved request org id, decide organizer access. Order matters: a legacy TOKEN
 * (no `organizerOrgIds` field) defers wholesale to the deprecated global flag
 * (bridge (2), sunset) BEFORE org resolution is considered; a MODERN token with an
 * unresolvable `orgId === null` now FAILS CLOSED post-044-backfill (bridge (1)
 * removed). Extracted so the decision is unit-testable without a request context.
 */
export function isOrganizerForOrg(
  speaker: OrganizerSpeaker | null | undefined,
  orgId: string | null,
): boolean {
  if (!speaker?._id) return false

  // BRIDGE (2) — LEGACY-TOKEN (SUNSET): checked FIRST because a pre-#635 JWT
  // carries NO org-scoped info at all (organizerOrgIds absent), so neither the
  // membership check nor bridge (1)'s fail-closed posture can meaningfully apply
  // to it — we defer wholesale to the deprecated global flag REGARDLESS of whether
  // the request org resolved. Denying these would 403 every logged-in organizer
  // until their token expires or they re-login. A PRESENT but empty array is a
  // MODERN token ("organizer of no org") and does NOT take this path — it falls
  // through to the org-scoped logic below.
  // TODO(sunset 2026-08-26): remove this block — 30d after #635, by when all
  // pre-#635 tokens (session maxAge = 30d default) have expired. Removing it,
  // together with Fix A's `trigger: 'update'` refresh, completes the bridge
  // removal condition (see the module docs and docs/AUTH.md).
  if (speaker.organizerOrgIds === undefined) {
    if (speaker.isOrganizer === true) {
      console.warn(
        `[authz-bridge] legacy token without organizerOrgIds; granting via deprecated global isOrganizer for speaker ${speaker._id}`,
      )
      return true
    }
    return false
  }

  // From here the token is MODERN (organizerOrgIds present).
  if (!orgId) {
    // BRIDGE (1) REMOVED — FAIL CLOSED. Post-044-backfill an unresolvable org is
    // an unknown domain / transient failure, not pre-backfill data, so a modern
    // token is denied here rather than bridged via the deprecated global flag.
    // Warn only when a would-be organizer (global flag set) is denied, so the
    // denial is observable without spamming on ordinary non-organizer traffic.
    if (speaker.isOrganizer === true) {
      console.warn(
        `[authz-bridge] organizer org unresolvable; DENYING (fail-closed, post-044-backfill) for speaker ${speaker._id}`,
      )
    }
    return false
  }

  return (
    Array.isArray(speaker.organizerOrgIds) &&
    speaker.organizerOrgIds.includes(orgId)
  )
}

/**
 * Resolve the CURRENT request's organization id from the domain conference, or
 * `null` when it cannot be resolved (pre-backfill / unknown domain). Thin wrapper
 * over {@link getOrganizationRefForCurrentConference} named to mirror
 * `resolveConferenceId`; the underlying conference read is request-cached.
 */
export async function resolveCurrentOrgId(): Promise<string | null> {
  return getOrganizationRefForCurrentConference()
}

/**
 * Async org-scoped organizer check for the CURRENT request: resolves the request
 * org from the domain conference, then applies {@link isOrganizerForOrg} (with the
 * legacy bridge). This is the SHARED gate used by every handler/layout/route that
 * previously read `session.speaker.isOrganizer`. Pass the speaker to check —
 * usually `session?.speaker`, or `session.realAdmin` for impersonation gates.
 */
export async function isOrganizerForCurrentOrg(
  speaker: OrganizerSpeaker | null | undefined,
): Promise<boolean> {
  if (!speaker?._id) return false
  const orgId = await resolveCurrentOrgId()
  return isOrganizerForOrg(speaker, orgId)
}
