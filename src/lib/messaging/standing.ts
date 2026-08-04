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
 * FAILS CLOSED (was the #723 shape). A conference with no resolvable
 * organization used to fall back to `*[_type == "conference"].organizers[]._ref`
 * — EVERY organizer of EVERY tenant — behind a warn. That is the fail-open
 * bridge #723 named: an unresolvable tenant yielded the global set, so any
 * tenant's organizer could be named as the subject of another tenant's thread.
 * An unresolvable org now returns `false` and issues NO standing query at all,
 * matching the authz layer (`src/lib/authz/organizer.ts`), which has no bridges
 * left, and its sibling in `src/lib/notification/sanity.ts` (#728).
 *
 * This predicate lives in its own module so the E9 fix can be reviewed and
 * merged independently of the parallel messaging-authz work that owns the
 * message router's gates.
 */
export async function speakerHasStandingInConference(
  speakerId: string,
  conferenceId: string,
): Promise<boolean> {
  if (!conferenceId) return false

  const orgId = await clientReadUncached.fetch<string | null>(
    // groq-global: tenant RESOLUTION — reads the conference registry to find which org owns `conferenceId`, so it cannot itself be tenant-scoped.
    `*[_type == "conference" && _id == $conferenceId][0].organization._ref`,
    { conferenceId },
    { cache: 'no-store' },
  )

  if (!orgId) {
    console.warn(
      `[standing] speakerHasStandingInConference: conference ${conferenceId} has no resolvable organization; DENYING standing (fail closed)`,
    )
    return false
  }

  const id = await clientReadUncached.fetch<string | null>(
    // The tenant boundary lives inside the predicate and is UNCONDITIONAL: both
    // arms are scoped — the organizer arm to `organization._ref == $orgId`, the
    // proposal arm to `conference._ref == $conferenceId`.
    // groq-global: `speaker` is the deliberate cross-tenant identity type (#615) and carries no tenant key of its own.
    `*[_type == "speaker" && _id == $speakerId && (_id in *[_type == "conference" && organization._ref == $orgId].organizers[]._ref || count(*[_type == "talk" && conference._ref == $conferenceId && ^._id in speakers[]._ref]) > 0)][0]._id`,
    { speakerId, conferenceId, orgId },
    { cache: 'no-store' },
  )
  return Boolean(id)
}
