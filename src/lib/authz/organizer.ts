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
 * NO BRIDGES REMAIN. Both migration bridges to the deprecated GLOBAL
 * `speaker.isOrganizer` flag are gone, so this decision reads `organizerOrgIds`
 * and nothing else:
 *
 *   - org UNRESOLVABLE (`orgId === null`) DENIES. The 044 backfill has run, so
 *     every live conference has an `organization`; an unresolvable org id means an
 *     unknown domain or a transient resolution failure, not pre-backfill data.
 *   - a LEGACY TOKEN (minted before #635, so `organizerOrgIds` is absent
 *     entirely) DENIES. Bridging it via the global flag granted organizer rights
 *     on ANY host, because that flag is true for an organizer of ANY org — a
 *     cross-tenant grant. Anyone still holding such a token is an ordinary
 *     non-organizer until they sign in again (or the `trigger === 'update'`
 *     session refresh re-mints a modern token). See docs/AUTH.md.
 *
 * A `console.warn('[authz-deny] …')` records the unresolvable-org denial of a
 * caller who organizes at least one org, so that failure mode stays observable
 * without spamming on ordinary non-organizer traffic. (It was `[authz-bridge]`
 * while the bridges existed; the tag is now `[authz-deny]` because nothing here
 * bridges — the remaining `[authz-bridge]` logs belong to the RECIPIENT-selection
 * fallbacks in `src/lib/notification/sanity.ts` and `src/lib/messaging/standing.ts`,
 * which select who to notify rather than grant access.)
 */

/** The minimum shape these checks read off a speaker/session token. */
type OrganizerSpeaker = Pick<Speaker, '_id' | 'organizerOrgIds'>

/**
 * PURE, synchronous org-scoped organizer check. Given a speaker and the already-
 * resolved request org id, decide organizer access: membership of `orgId` in the
 * token's `organizerOrgIds`, and nothing else. Fails closed on an unresolvable
 * org and on a legacy token that carries no `organizerOrgIds` at all. Extracted
 * so the decision is unit-testable without a request context.
 */
export function isOrganizerForOrg(
  speaker: OrganizerSpeaker | null | undefined,
  orgId: string | null,
): boolean {
  if (!speaker?._id) return false

  const organizerOrgIds = Array.isArray(speaker.organizerOrgIds)
    ? speaker.organizerOrgIds
    : []

  if (!orgId) {
    // FAIL CLOSED. Post-044-backfill an unresolvable org is an unknown domain or
    // a transient failure, so deny. Warn only when a real organizer (of at least
    // one org) is denied, so the denial is observable without spamming on
    // ordinary non-organizer traffic.
    if (organizerOrgIds.length > 0) {
      console.warn(
        `[authz-deny] organizer org unresolvable; DENYING (fail-closed, post-044-backfill) for speaker ${speaker._id}`,
      )
    }
    return false
  }

  return organizerOrgIds.includes(orgId)
}

/**
 * Resolve the CURRENT request's organization id from the domain conference, or
 * `null` when it cannot be resolved (unknown domain / transient failure). Thin wrapper
 * over {@link getOrganizationRefForCurrentConference} named to mirror
 * `resolveConferenceId`; the underlying conference read is request-cached.
 */
export async function resolveCurrentOrgId(): Promise<string | null> {
  return getOrganizationRefForCurrentConference()
}

/**
 * Async org-scoped organizer check for the CURRENT request: resolves the request
 * org from the domain conference, then applies {@link isOrganizerForOrg}. This is
 * the SHARED gate used by every handler/layout/route that previously read the
 * deprecated global `session.speaker.isOrganizer`. Pass the speaker to check —
 * usually `session?.speaker`, or `session.realAdmin` for impersonation gates.
 */
export async function isOrganizerForCurrentOrg(
  speaker: OrganizerSpeaker | null | undefined,
): Promise<boolean> {
  if (!speaker?._id) return false
  const orgId = await resolveCurrentOrgId()
  return isOrganizerForOrg(speaker, orgId)
}
