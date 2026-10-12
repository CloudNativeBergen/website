import 'server-only'
import { randomUUID } from 'node:crypto'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { scopedFetch } from '@/lib/sanity/scoped'

/**
 * THE EARLY-ACCESS LINK OF A SPONSOR (#1346, spec §4): one token on the
 * `sponsorForConference`, separate from `registrationToken`.
 *
 * ONLY THE PUBLISHED DOCUMENT COUNTS, and its unpublished copies (a Studio
 * draft, a copy in a content release) are kept in step: create writes the
 * token to every copy that exists and revoke removes it from every one, so
 * publishing a copy can neither drop a live link nor bring a revoked one back.
 *
 * NOT CLOSED: a copy that Studio makes between the read of the copies and the
 * write that follows it is not seen. It holds whatever the published document
 * held when it was made.
 */

/** The field on `sponsorForConference` that holds the link's token. */
export const EARLY_ACCESS_TOKEN_FIELD = 'workshopEarlyAccessToken'

/**
 * Release copies are visible only to a `raw` read from this API version on,
 * and are written at it (as `src/lib/speaker/erasure-assets.ts` does).
 */
const RELEASES_API_VERSION = COUNT_API_VERSION

/** A create or a revoke that loses to another write starts over this often. */
const ATTEMPTS = 3

export type CreateEarlyAccessLink =
  | { token: string }
  /** No such sponsor in this conference, or its deal is not won. */
  | { refused: 'not-found' | 'not-won' }

interface Version {
  _id: string
  token: string | null
}

/**
 * The sponsor's document in every form it is stored in: published, its Studio
 * draft and its copy in each content release (`versions.<release>.<id>`).
 */
async function readVersions(sponsorForConferenceId: string) {
  // groq-global-scoped: a point read by the id of ONE sponsor and the ids
  // derived from it; the caller has proven that sponsor is the request's.
  const query = `*[_type == "sponsorForConference" && (_id == $id || _id == $draftId || (_id in path("versions.**") && _id == "versions." + string::split(_id, ".")[1] + "." + $id))]{ _id, "token": workshopEarlyAccessToken }`
  return (
    (await clientReadUncached
      .withConfig({ apiVersion: RELEASES_API_VERSION })
      .fetch<Version[]>(
        query,
        {
          id: sponsorForConferenceId,
          draftId: `drafts.${sponsorForConferenceId}`,
        },
        { cache: 'no-store', perspective: 'raw' },
      )) ?? []
  )
}

const releaseWriter = () =>
  clientWrite.withConfig({ apiVersion: RELEASES_API_VERSION })

/**
 * The sponsor's link, created when it has none.
 *
 * WRITTEN ONLY IF NONE IS STORED (`setIfMissing`, as
 * `generateRegistrationToken` does): two organizers creating at once both get
 * the token the first write stored, read back from the committed document.
 *
 * ONLY A SPONSOR WITH A WON DEAL IS GIVEN ONE. A link that exists is answered
 * whatever the deal says now: only revoking ends it.
 *
 * The copies are written in a second transaction that goes through only while
 * the published document is the revision that holds the token. A revoke in
 * between refuses it, and the create starts over: no copy is left holding a
 * token that was revoked.
 */
export async function createEarlyAccessLink(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<CreateEarlyAccessLink> {
  for (let attempt = 1; ; attempt++) {
    const sponsor = await scopedFetch<{
      _rev: string
      status: string | null
      token: string | null
    } | null>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "sponsorForConference" && _id == $id][0]{ _rev, status, "token": workshopEarlyAccessToken }`,
      { id: sponsorForConferenceId },
      { cache: 'no-store' },
    )
    if (!sponsor) return { refused: 'not-found' }
    let holder = { rev: sponsor._rev, token: sponsor.token }
    if (!holder.token) {
      if (sponsor.status !== 'closed-won') return { refused: 'not-won' }
      const committed = await clientWrite
        .patch(sponsorForConferenceId)
        .setIfMissing({ [EARLY_ACCESS_TOKEN_FIELD]: randomUUID() })
        .commit<{ _rev: string; [EARLY_ACCESS_TOKEN_FIELD]: string }>()
      holder = {
        rev: committed._rev,
        token: committed[EARLY_ACCESS_TOKEN_FIELD],
      }
    }
    const token = holder.token as string

    const behind = (await readVersions(sponsorForConferenceId)).filter(
      (version) =>
        version._id !== sponsorForConferenceId && version.token !== token,
    )
    if (behind.length === 0) return { token }
    const transaction = releaseWriter()
      .transaction()
      // Changes nothing. It makes the transaction refuse when the published
      // document is no longer the revision that holds `token`.
      .patch(sponsorForConferenceId, {
        ifRevisionID: holder.rev,
        setIfMissing: { [EARLY_ACCESS_TOKEN_FIELD]: token },
      })
    for (const copy of behind) {
      transaction.patch(copy._id, {
        set: { [EARLY_ACCESS_TOKEN_FIELD]: token },
      })
    }
    try {
      await transaction.commit()
      return { token }
    } catch (error) {
      if (attempt === ATTEMPTS) throw error
    }
  }
}

/**
 * Remove the sponsor's link: the token goes from the published document and
 * from every unpublished copy, in one transaction. The link and every cookie
 * set from it stop being live; a later create stores a new token.
 *
 * THE CALLER HAS PROVEN the sponsor belongs to the request's conference.
 */
export async function revokeEarlyAccessLink(
  sponsorForConferenceId: string,
): Promise<void> {
  const versions = await readVersions(sponsorForConferenceId)
  if (!versions.some((version) => version.token)) return
  // Every version, also one that held no token when it was read: a create
  // may be writing it right now.
  const transaction = releaseWriter().transaction()
  for (const version of versions) {
    transaction.patch(version._id, { unset: [EARLY_ACCESS_TOKEN_FIELD] })
  }
  await transaction.commit()
}

/**
 * THE LIVE LOOKUP (spec §6): the sponsor of this conference whose PUBLISHED
 * document stores `token`, read without a cache. The authority for a sign-up:
 * a revoke takes effect on the next attempt.
 *
 * The param is not named `token`: the client treats that name as its own.
 */
export async function findEarlyAccessSponsor(
  conferenceId: string,
  token: string,
): Promise<{ _id: string } | null> {
  if (!token) return null
  return scopedFetch<{ _id: string } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && workshopEarlyAccessToken == $linkToken && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{ _id }`,
    { linkToken: token },
    { cache: 'no-store' },
  )
}
