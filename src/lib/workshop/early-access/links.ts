import 'server-only'
import { createHash } from 'node:crypto'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { earlyAccessLinksTag } from '@/lib/cache/tags'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'

/**
 * THE LIVE EARLY-ACCESS LINKS OF A CONFERENCE, CACHED (#1346, spec §7): one
 * read per conference serves the portal page and the route that opens a link.
 *
 * It is keyed by the conference and by nothing a visitor sends, so a made-up
 * token costs no read. It decides what is SHOWN and what the route answers;
 * the authority for a sign-up is the live `findEarlyAccessSponsor`.
 *
 * IT STAYS ON THE SERVER. Nothing here is sent to a browser but the sponsor
 * name of the visitor's own link.
 */

/**
 * How long the links may go without re-reading Sanity. Freshness does not
 * rest on this: every write that creates or revokes a link, and every path
 * that removes a sponsor from a conference, expires the tag. The life is the
 * backstop for a change made around those paths (an edit in Sanity Studio, a
 * sponsor renamed), and the ceiling on reads: one an hour per conference.
 */
export const EARLY_ACCESS_LINKS_LIFE = {
  stale: 60,
  revalidate: 60 * 60,
  expire: 60 * 60 * 2,
} as const

export interface EarlyAccessLinkEntry {
  /** SHA-256 of the link's token, hex. The token itself is not kept. */
  tokenHash: string
  sponsorName: string | null
}

const hashOf = (token: string) =>
  createHash('sha256').update(token).digest('hex')

/**
 * Every live link of `conferenceId`: the sponsors whose PUBLISHED document
 * stores a token. Drafts and release copies are left out by the query: the
 * server's clients see drafts, and a copy can hold a token that was revoked.
 *
 * FILLED FROM SANITY'S ORIGIN, not its CDN: expiring the tag does not reach
 * the CDN, and a refill through it could pin the old answer.
 */
export async function conferenceEarlyAccessLinks(
  conferenceId: string,
): Promise<EarlyAccessLinkEntry[]> {
  'use cache: remote'
  cacheLife(EARLY_ACCESS_LINKS_LIFE)
  cacheTag(earlyAccessLinksTag(conferenceId))
  const rows = await scopedFetch<
    { token: string | null; sponsorName: string | null }[] | null
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && defined(workshopEarlyAccessToken) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{ "token": workshopEarlyAccessToken, "sponsorName": sponsor->name }`,
  )
  return (rows ?? []).flatMap(({ token, sponsorName }) =>
    typeof token === 'string' && token
      ? [{ tokenHash: hashOf(token), sponsorName: sponsorName ?? null }]
      : [],
  )
}

/**
 * The live link `token` is, in this conference, as the cached read knows it,
 * or `null`. A request that carries no token reads nothing.
 */
export async function resolveEarlyAccess(
  conferenceId: string,
  token: string | null | undefined,
): Promise<{ sponsorName: string | null } | null> {
  if (!token) return null
  const tokenHash = hashOf(token)
  const link = (await conferenceEarlyAccessLinks(conferenceId)).find(
    (entry) => entry.tokenHash === tokenHash,
  )
  return link ? { sponsorName: link.sponsorName } : null
}

/**
 * Expire the conference's links AT ONCE: `{ expire: 0 }`, not a profile, which
 * keeps serving the old answer while the new one loads. Call it AFTER the
 * write has committed.
 *
 * NEVER FAILS THE WRITE IT FOLLOWS: `revalidateTag` throws outside a request
 * scope, and the write is already stored.
 */
export function expireEarlyAccessLinks(conferenceId: string): void {
  try {
    revalidateTag(earlyAccessLinksTag(conferenceId), { expire: 0 })
  } catch (error) {
    console.error(
      `[workshop] could not expire the early-access links of ${conferenceId}`,
      error,
    )
  }
}
