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

/** How often a create starts over when another write got in between. */
const CREATE_ATTEMPTS = 3

/** How many times a revoke reads every version again and clears what it finds. */
const REVOKE_ROUNDS = 3

/**
 * The shape of a token this module issues (`randomUUID`). A value of any
 * other shape is no token: nothing is read for it.
 */
const TOKEN_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const isEarlyAccessToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN_SHAPE.test(value)

export type CreateEarlyAccessLink =
  | {
      token: string
      /**
       * Unpublished copies that could not be given the token. The link works;
       * publishing one of these would remove it.
       */
      notWritten: string[]
    }
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
 * WRITTEN ONLY IF NONE IS STORED, and only to the revision that was checked.
 * Two organizers creating at once: the second write is refused (the revision
 * moved), its create starts over, finds the first one's token and answers
 * it. `setIfMissing`, as `generateRegistrationToken` uses, stays as the
 * operation: it could not overwrite a stored token even without the check.
 *
 * ONLY A SPONSOR WITH A WON DEAL IS GIVEN ONE. A link that exists is answered
 * whatever the deal says now: only revoking ends it.
 *
 * IT ANSWERS ONLY A TOKEN THE PUBLISHED DOCUMENT STILL HOLDS. After the token
 * is stored, every version is read once more. A published document that no
 * longer holds it (a revoke landed, or a copy without it was published) starts
 * the create over. Copies that are behind are written in a transaction that
 * goes through only while the published document is that same revision, so no
 * copy is left holding a token that was revoked.
 *
 * WHEN THE COPIES CANNOT BE WRITTEN and the published document holds the
 * token, the link is live: the token is answered, with the copies that did not
 * get it. A create whose token is gone after every attempt throws: it never
 * answers an address that is already dead.
 */
export async function createEarlyAccessLink(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<CreateEarlyAccessLink> {
  let failure: unknown
  for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
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
    let token = sponsor.token
    if (!token) {
      if (sponsor.status !== 'closed-won') return { refused: 'not-won' }
      // WRITTEN ONLY TO THE REVISION THAT PASSED THE CHECKS ABOVE: this
      // conference's sponsor, with a won deal. A CRM update or a Studio edit
      // in between refuses the write, and the checks run again.
      try {
        const committed = await clientWrite
          .patch(sponsorForConferenceId)
          .ifRevisionId(sponsor._rev)
          .setIfMissing({ [EARLY_ACCESS_TOKEN_FIELD]: randomUUID() })
          .commit<{ [EARLY_ACCESS_TOKEN_FIELD]: string }>()
        token = committed[EARLY_ACCESS_TOKEN_FIELD]
      } catch (error) {
        if (!isRevisionConflict(error)) throw error
        failure = error
        continue
      }
    }

    const versions = await readVersions(conferenceId, sponsorForConferenceId)
    const published = versions.find(
      (version) => version._id === sponsorForConferenceId,
    )
    if (published?.token !== token) continue
    const behind = versions.filter(
      (version) => version !== published && version.token !== token,
    )
    if (behind.length === 0) return { token, notWritten: [] }
    const transaction = releaseWriter()
      .transaction()
      // Changes nothing. It makes the transaction refuse when the published
      // document is no longer the revision that was just read holding `token`.
      .patch(sponsorForConferenceId, {
        ifRevisionID: published._rev,
        setIfMissing: { [EARLY_ACCESS_TOKEN_FIELD]: token },
      })
    for (const copy of behind) {
      // Each copy too only as the revision that was read, within this
      // conference: one edited in between (moved to another conference in
      // Studio, say) refuses the write, and the versions are read again.
      transaction.patch(copy._id, {
        ifRevisionID: copy._rev,
        set: { [EARLY_ACCESS_TOKEN_FIELD]: token },
      })
    }
    try {
      await transaction.commit()
      return { token, notWritten: [] }
    } catch (error) {
      failure = error
    }
  }
  // No attempt went through. What is stored NOW decides, from ONE read of
  // every version: the token answered is the one the published document
  // holds in the same snapshot the copies are judged by.
  const versions = await readVersions(conferenceId, sponsorForConferenceId)
  const token = versions.find(
    (version) => version._id === sponsorForConferenceId,
  )?.token
  if (token) {
    return {
      token,
      notWritten: versions
        .filter(
          (version) =>
            version._id !== sponsorForConferenceId && version.token !== token,
        )
        .map((version) => version._id),
    }
  }
  throw new Error(
    'Could not create the early-access link: the sponsor kept changing while it was written.',
    { cause: failure },
  )
}

const isReleaseCopy = (id: string) => id.startsWith('versions.')

/** Sanity's answer to a write whose `ifRevisionID` no longer matches. */
const isRevisionConflict = (error: unknown) =>
  (error as { statusCode?: unknown } | null)?.statusCode === 409

/** A Studio draft or a copy in a content release: not what is live. */
const isUnpublished = (id: string) =>
  id.startsWith('drafts.') || isReleaseCopy(id)

/**
 * Every document of the conference that holds one of `tokens`, in any stored
 * form and UNDER ANY ID: the sponsor's own versions, and any other document a
 * token was copied to (a sponsor duplicated in Studio, a script).
 */
async function readHolders(conferenceId: string, tokens: string[]) {
  const query = `*[_type == "sponsorForConference" && conference._ref == $conferenceId && workshopEarlyAccessToken in $tokens]{ _id, _rev, "token": workshopEarlyAccessToken }`
  return (
    (await clientReadUncached
      .withConfig({ apiVersion: RELEASES_API_VERSION })
      .fetch<Version[]>(
        query,
        { conferenceId, tokens },
        { cache: 'no-store', perspective: 'raw' },
      )) ?? []
  )
}

/**
 * Remove the sponsor's link. The link and every cookie set from it stop being
 * live; a later create stores a new token.
 *
 * WHAT IS REVOKED IS THE TOKEN, wherever the conference holds it: the tokens
 * on the sponsor's own versions are read first, and then every document of
 * the conference that holds one of them is cleared, under any id. A token
 * that was copied to another document does not survive the revoke there.
 *
 * THE SPONSOR'S OWN PUBLISHED DOCUMENT IS CLEARED LAST, and only once no
 * other published document of the conference holds a token being revoked.
 * It is where the next revoke reads what to revoke: cleared earlier, a
 * revoke that could not finish would leave nothing to find, and "revoke
 * again" would report a link revoked that is still live through the other
 * document.
 *
 *  1. EVERYTHING THAT IS NOT A RELEASE COPY, in ONE transaction: all of it
 *     is cleared or none is, so the sponsor is never cleared without the
 *     other published holders that were read. Nothing about a release copy
 *     can keep the link live. Each document is cleared only as the revision
 *     that was read: when another revoke and a create got in between, what
 *     is stored is a NEW link, and this write is refused. So is it when a
 *     draft is gone by then. Either way step 2 reads again and decides.
 *  2. EVERY DOCUMENT THAT STILL HOLDS A REVOKED TOKEN: all of them are read
 *     again once per round, for at most {@link REVOKE_ROUNDS} rounds, until
 *     none does. A copy made while the revoke ran is found, and so is a copy
 *     that was PUBLISHED while it ran, which would otherwise bring the link
 *     back. Each is cleared on its own, and only as the revision that was
 *     read; the sponsor's own published document only in a round whose read
 *     shows no other published holder. A token stored by a later create is
 *     not a revoked one, and is left alone.
 *
 * Answers the unpublished copies that still hold a revoked token after
 * {@link REVOKE_ROUNDS} rounds: publishing one of those would bring the link
 * back. THROWS when a published document still holds one: then the link is
 * live, and nothing may report it revoked.
 *
 * `leftCopies`: the ids an earlier revoke answered. A copy OF ANOTHER
 * DOCUMENT cannot be found from the sponsor once the sponsor holds no token,
 * so the next revoke is handed them ({@link clearDeadCopies}).
 *
 * Acts within `conferenceId` only.
 */
export async function revokeEarlyAccessLink(
  conferenceId: string,
  sponsorForConferenceId: string,
  { leftCopies = [] }: { leftCopies?: readonly string[] } = {},
): Promise<{ notCleared: string[] }> {
  const revoked = [
    ...new Set(
      (await readVersions(conferenceId, sponsorForConferenceId)).flatMap(
        (version) => (version.token ? [version.token] : []),
      ),
    ),
  ]
  const notCleared =
    revoked.length > 0
      ? await clearRevoked(conferenceId, sponsorForConferenceId, revoked)
      : []
  const stillLeft = await clearDeadCopies(
    conferenceId,
    leftCopies.filter((id) => !notCleared.includes(id)),
  )
  return { notCleared: [...notCleared, ...stillLeft] }
}

async function clearRevoked(
  conferenceId: string,
  sponsorForConferenceId: string,
  revoked: string[],
): Promise<string[]> {
  const read = () => readHolders(conferenceId, revoked)

  const first = (await read()).filter((holder) => !isReleaseCopy(holder._id))
  if (first.length > 0) {
    const transaction = clientWrite.transaction()
    for (const holder of first) {
      transaction.patch(holder._id, {
        ifRevisionID: holder._rev,
        unset: [EARLY_ACCESS_TOKEN_FIELD],
      })
    }
    try {
      await transaction.commit()
    } catch {
      // Something changed since the read. The rounds below read again.
    }
  }

  for (let round = 1; ; round++) {
    const stale = await read()
    if (stale.length === 0) return []
    if (round > REVOKE_ROUNDS) {
      if (stale.some((holder) => !isUnpublished(holder._id))) {
        throw new Error(
          'Could not revoke the early-access link: a sponsor of this conference still holds it. Revoke again.',
        )
      }
      return stale.map((holder) => holder._id)
    }
    // While another published document holds a revoked token, the sponsor's
    // own published document keeps its own: see the note above.
    const heldElsewhere = stale.some(
      (holder) =>
        holder._id !== sponsorForConferenceId && !isUnpublished(holder._id),
    )
    for (const holder of stale) {
      if (heldElsewhere && holder._id === sponsorForConferenceId) continue
      await clearOne(holder)
    }
  }
}

/** Clear the token from one document, only as the revision that was read. */
async function clearOne(holder: Version): Promise<void> {
  try {
    await releaseWriter()
      .transaction()
      .patch(holder._id, {
        ifRevisionID: holder._rev,
        unset: [EARLY_ACCESS_TOKEN_FIELD],
      })
      .commit()
  } catch {
    // It changed, or it cannot be written: the caller reads again.
  }
}

/**
 * Clear a DEAD token from the unpublished copies an earlier revoke named, and
 * answer the ones that still hold one.
 *
 * THE IDS COME FROM THE CALLER, so nothing is taken from them but where to
 * look. A token is cleared only from a document that is an unpublished copy
 * (a draft or a release copy), of this conference, whose token NO PUBLISHED
 * document of the conference holds. A published document, another
 * conference's copy and a copy in step with a link that is live are left as
 * they are, whatever was asked.
 */
async function clearDeadCopies(
  conferenceId: string,
  ids: readonly string[],
): Promise<string[]> {
  const unpublished = ids.filter(isUnpublished)
  if (unpublished.length === 0) return []
  const reader = clientReadUncached.withConfig({
    apiVersion: RELEASES_API_VERSION,
  })
  const readDead = async () => {
    const copies =
      (await reader.fetch<Version[]>(
        `*[_type == "sponsorForConference" && conference._ref == $conferenceId && _id in $ids && defined(workshopEarlyAccessToken)]{ _id, _rev, "token": workshopEarlyAccessToken }`,
        { conferenceId, ids: unpublished },
        { cache: 'no-store', perspective: 'raw' },
      )) ?? []
    if (copies.length === 0) return []
    const live = new Set(
      (await reader.fetch<string[]>(
        `*[_type == "sponsorForConference" && conference._ref == $conferenceId && workshopEarlyAccessToken in $tokens && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].workshopEarlyAccessToken`,
        { conferenceId, tokens: copies.map((copy) => copy.token) },
        { cache: 'no-store', perspective: 'raw' },
      )) ?? [],
    )
    return copies.filter((copy) => copy.token && !live.has(copy.token))
  }
  for (const copy of await readDead()) await clearOne(copy)
  return (await readDead()).map((copy) => copy._id)
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
  if (!isEarlyAccessToken(token)) return null
  return scopedFetch<{ _id: string } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && workshopEarlyAccessToken == $linkToken && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{ _id }`,
    { linkToken: token },
    { cache: 'no-store' },
  )
}
