import 'server-only'
import { randomUUID } from 'node:crypto'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { scopedFetch } from '@/lib/sanity/scoped'
import { WORKSHOP_EARLY_ACCESS_PATH } from '../sign-in-paths'

/**
 * THE EARLY-ACCESS LINK OF A SPONSOR (#1346, spec §4): one token on the
 * `sponsorForConference`, separate from `registrationToken`.
 *
 * ONLY THE PUBLISHED DOCUMENT COUNTS, and its unpublished copies (a Studio
 * draft, a copy in a content release) are kept in step: create writes the
 * token to every copy that exists and revoke removes it from every one, so
 * publishing a copy can neither drop a live link nor bring a revoked one back.
 *
 * NOT CLOSED: a copy that Studio makes between a create's read of the copies
 * and the write that follows it does not get the token: publishing it drops
 * the link. A copy whose `conference` was changed in Studio is not seen.
 */

/** The field on `sponsorForConference` that holds the link's token. */
export const EARLY_ACCESS_TOKEN_FIELD = 'workshopEarlyAccessToken'

/**
 * Release copies are visible only to a `raw` read from this API version on,
 * and are written at it (as `src/lib/speaker/erasure-assets.ts` does).
 */
const RELEASES_API_VERSION = COUNT_API_VERSION

/** How often a create starts over, and how many rounds a revoke clears copies. */
const ATTEMPTS = 3

export type CreateEarlyAccessLink =
  | { token: string }
  /** No such sponsor in this conference, or its deal is not won. */
  | { refused: 'not-found' | 'not-won' }

interface Version {
  _id: string
  _rev: string
  token: string | null
}

/**
 * The sponsor's document in every form it is stored in: published, its Studio
 * draft and its copy in each content release (`versions.<release>.<id>`).
 * Within the conference: a copy that names another conference is not one of
 * this conference's sponsor.
 */
async function readVersions(
  conferenceId: string,
  sponsorForConferenceId: string,
) {
  const query = `*[_type == "sponsorForConference" && conference._ref == $conferenceId && (_id == $id || _id == $draftId || (_id in path("versions.**") && _id == "versions." + string::split(_id, ".")[1] + "." + $id))]{ _id, _rev, "token": workshopEarlyAccessToken }`
  return (
    (await clientReadUncached
      .withConfig({ apiVersion: RELEASES_API_VERSION })
      .fetch<Version[]>(
        query,
        {
          conferenceId,
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
 * IT ANSWERS ONLY A TOKEN THE PUBLISHED DOCUMENT STILL HOLDS. After the token
 * is stored, every version is read once more. A published document that no
 * longer holds it (a revoke landed, or a copy without it was published) starts
 * the create over. Copies that are behind are written in a transaction that
 * goes through only while the published document is that same revision, so no
 * copy is left holding a token that was revoked. A create that keeps losing
 * throws: it never answers an address that is already dead.
 */
export async function createEarlyAccessLink(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<CreateEarlyAccessLink> {
  let failure: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const sponsor = await scopedFetch<{
      status: string | null
      token: string | null
    } | null>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "sponsorForConference" && _id == $id][0]{ status, "token": workshopEarlyAccessToken }`,
      { id: sponsorForConferenceId },
      { cache: 'no-store' },
    )
    if (!sponsor) return { refused: 'not-found' }
    let token = sponsor.token
    if (!token) {
      if (sponsor.status !== 'closed-won') return { refused: 'not-won' }
      const committed = await clientWrite
        .patch(sponsorForConferenceId)
        .setIfMissing({ [EARLY_ACCESS_TOKEN_FIELD]: randomUUID() })
        .commit<{ [EARLY_ACCESS_TOKEN_FIELD]: string }>()
      token = committed[EARLY_ACCESS_TOKEN_FIELD]
    }

    const versions = await readVersions(conferenceId, sponsorForConferenceId)
    const published = versions.find(
      (version) => version._id === sponsorForConferenceId,
    )
    if (published?.token !== token) continue
    const behind = versions.filter(
      (version) => version !== published && version.token !== token,
    )
    if (behind.length === 0) return { token }
    const transaction = releaseWriter()
      .transaction()
      // Changes nothing. It makes the transaction refuse when the published
      // document is no longer the revision that was just read holding `token`.
      .patch(sponsorForConferenceId, {
        ifRevisionID: published._rev,
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
      failure = error
    }
  }
  throw new Error(
    'Could not create the early-access link: the sponsor kept changing while it was written.',
    { cause: failure },
  )
}

const isReleaseCopy = (id: string) => id.startsWith('versions.')

/**
 * Remove the sponsor's link. The link and every cookie set from it stop being
 * live; a later create stores a new token.
 *
 *  1. THE PUBLISHED DOCUMENT AND ITS DRAFT, in a transaction of their own.
 *     Nothing about a release copy can keep the link live.
 *  2. THE COPIES, until none holds a token the published document does not
 *     hold: every version is read again after each write, so a copy made
 *     while the revoke ran is found. Each is cleared on its own, and only as
 *     the revision that was read: a copy a later create has since written is
 *     left alone.
 *
 * Answers the copies that still hold the revoked token after {@link ATTEMPTS}
 * rounds. Publishing one of those would bring the link back.
 *
 * Acts within `conferenceId` only.
 */
export async function revokeEarlyAccessLink(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<{ notCleared: string[] }> {
  const read = () => readVersions(conferenceId, sponsorForConferenceId)
  const linked = await read()
  if (!linked.some((version) => version.token)) return { notCleared: [] }

  const own = linked.filter(
    (version) => version.token && !isReleaseCopy(version._id),
  )
  if (own.length > 0) {
    const transaction = clientWrite.transaction()
    for (const version of own) {
      transaction.patch(version._id, { unset: [EARLY_ACCESS_TOKEN_FIELD] })
    }
    await transaction.commit()
  }

  for (let round = 1; ; round++) {
    const versions = await read()
    const live =
      versions.find((version) => version._id === sponsorForConferenceId)
        ?.token ?? null
    const stale = versions.filter(
      (version) =>
        version._id !== sponsorForConferenceId &&
        version.token &&
        version.token !== live,
    )
    if (stale.length === 0 || round > ATTEMPTS) {
      return { notCleared: stale.map((version) => version._id) }
    }
    for (const copy of stale) {
      try {
        await releaseWriter()
          .transaction()
          .patch(copy._id, {
            ifRevisionID: copy._rev,
            unset: [EARLY_ACCESS_TOKEN_FIELD],
          })
          .commit()
      } catch {
        // Read again in the next round: it changed, or it cannot be written.
      }
    }
  }
}

/**
 * The token the sponsor's PUBLISHED document stores, or `null`: for building
 * the address of a link that exists. Never creates one.
 */
export async function readEarlyAccessToken(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<string | null> {
  const token = await scopedFetch<string | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && _id == $id][0].workshopEarlyAccessToken`,
    { id: sponsorForConferenceId },
    { cache: 'no-store' },
  )
  return token || null
}

/**
 * The address of a link: on the portal's working host, with the token in the
 * path. `portalUrl` is what `workshopPortalUrl` answered, never the host an
 * organizer happens to be on: the cookie is bound to the host that sets it.
 */
export function earlyAccessUrl(portalUrl: string, token: string): string {
  return new URL(
    `${WORKSHOP_EARLY_ACCESS_PATH}/${encodeURIComponent(token)}`,
    portalUrl,
  ).toString()
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
