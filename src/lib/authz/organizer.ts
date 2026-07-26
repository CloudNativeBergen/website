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
 * THE LEGACY BRIDGE. Production still carries pre-044-backfill data (conferences
 * without an `organization`) and requests can hit domains that don't resolve to a
 * conference. When the request's org cannot be resolved we FAIL OPEN TO THE
 * LEGACY GLOBAL CHECK: the deprecated `speaker.isOrganizer` boolean (organizer of
 * ANY conference). This is a DELIBERATE, TEMPORARY migration bridge so the org
 * tier can roll out without locking legitimate organizers out. Every bridged
 * grant emits a `console.warn('[authz-bridge] …')` so the gap is observable.
 *
 * REMOVAL CONDITION. Delete the bridge (make an unresolvable org deny) once every
 * live conference has an `organization` AND every issued session token carries
 * `organizerOrgIds` (i.e. after all pre-#614 tokens have expired / all users have
 * re-logged-in). At that point `orgId === null` should return `false`.
 */

/** The minimum shape these checks read off a speaker/session token. */
type OrganizerSpeaker = Pick<Speaker, '_id' | 'isOrganizer' | 'organizerOrgIds'>

/**
 * PURE, synchronous org-scoped organizer check. Given a speaker and the already-
 * resolved request org id, decide organizer access. `orgId === null` engages the
 * LEGACY BRIDGE (see module docs): fall back to the global `isOrganizer` flag and
 * warn when that grants. Extracted so the decision is unit-testable without a
 * request context.
 */
export function isOrganizerForOrg(
  speaker: OrganizerSpeaker | null | undefined,
  orgId: string | null,
): boolean {
  if (!speaker?._id) return false

  if (!orgId) {
    // LEGACY BRIDGE: org unresolvable → defer to the deprecated global flag.
    if (speaker.isOrganizer === true) {
      console.warn(
        `[authz-bridge] organizer org unresolvable; granting via deprecated global isOrganizer for speaker ${speaker._id}`,
      )
      return true
    }
    return false
  }

  // LEGACY-TOKEN BRIDGE: a pre-#614 JWT has NO organizerOrgIds field at all
  // (undefined). Denying those would 403 every logged-in organizer at deploy
  // time until re-login — bridge via the deprecated flag instead. A PRESENT
  // but empty array is the real signal "organizer of no org" and is denied.
  if (speaker.organizerOrgIds === undefined) {
    if (speaker.isOrganizer === true) {
      console.warn(
        `[authz-bridge] legacy token without organizerOrgIds; granting via deprecated global isOrganizer for speaker ${speaker._id}`,
      )
      return true
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
