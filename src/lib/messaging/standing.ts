import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * Does `speakerId` have STANDING in `conferenceId` — a proposal (talk) in that
 * conference OR organizer status of the conference's OWNING ORGANIZATION? This
 * gates who an organizer may name as the subject of a new general thread and
 * MUST match the population the admin speaker picker offers (confirmed/accepted
 * speakers ∪ the org's organizers).
 *
 * WHY ORG-SCOPED (E9, go-live gate): the organizer arm was previously matched
 * against `*[_type == "conference"].organizers[]._ref` — an organizer of ANY
 * edition anywhere. That was justified only while `isOrganizer` was GLOBAL and
 * `canAccessConversation` short-circuited on it, so a cross-edition organizer
 * "already" had access. Under the org-scoped authz boundary (#614) that premise
 * is gone: a cross-TENANT organizer must NOT be grantable standing in another
 * org's conference. Scoping the organizer arm to the conference's organization
 * closes that leak while STILL matching same-org, cross-edition organizers
 * (which the picker legitimately offers) and talk-holding speakers.
 *
 * LEGACY BRIDGE: a conference with no resolvable organization (pre-044 backfill)
 * falls back to the global organizer scope with a warn — the same migration
 * bridge used by the authz layer and the recipient-selection helpers. Remove it
 * under the same condition as those bridges.
 *
 * This predicate lives in its own module so the E9 fix can be reviewed and
 * merged independently of the parallel messaging-authz work that owns the
 * message router's gates.
 */
export async function speakerHasStandingInConference(
  speakerId: string,
  conferenceId: string,
): Promise<boolean> {
  const orgId = await clientReadUncached.fetch<string | null>(
    `*[_type == "conference" && _id == $conferenceId][0].organization._ref`,
    { conferenceId },
    { cache: 'no-store' },
  )

  if (!orgId) {
    console.warn(
      `[authz-bridge] speakerHasStandingInConference: conference ${conferenceId} has no resolvable organization; using the GLOBAL organizer scope (standing-check legacy bridge)`,
    )
  }

  const organizerScope = orgId
    ? `*[_type == "conference" && organization._ref == $orgId].organizers[]._ref`
    : `*[_type == "conference"].organizers[]._ref`

  const id = await clientReadUncached.fetch<string | null>(
    `*[_type == "speaker" && _id == $speakerId && (_id in ${organizerScope} || count(*[_type == "talk" && conference._ref == $conferenceId && ^._id in speakers[]._ref]) > 0)][0]._id`,
    orgId ? { speakerId, conferenceId, orgId } : { speakerId, conferenceId },
    { cache: 'no-store' },
  )
  return Boolean(id)
}
