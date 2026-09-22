/**
 * INVALIDATING THE `/go/<code>` LOOKUP (short-links spec §2.5).
 *
 * The cached lookup lives a day, so a write that changes where a code points
 * must say so. `revalidateTag` with `{ expire: 0 }`, NOT a cache-life profile:
 * a profile serves the OLD target while the new one is fetched, which is
 * exactly the window a repair or a deletion cannot tolerate. This deviates
 * from the `revalidateTag(tag, 'default')` used elsewhere in the repo, and
 * deliberately so — §2.5 requires the entry to be expired, not served stale.
 *
 * `updateTag` is not available here: these are tRPC mutations, not Server
 * Actions.
 */

import { revalidateTag } from 'next/cache'
import { shortLinkIndexTag, shortLinkTag } from '@/lib/cache/tags'

/**
 * Expire the `/go/<code>` entry for one document — the `socialPostVariant`
 * whose `link` was rewritten, or the outreach `marketingTask` whose
 * destination was written or which was deleted.
 *
 * Safe to call for a document that has no code: the tag simply matches
 * nothing.
 */
export function expireShortLink(documentId: string): void {
  revalidateTag(shortLinkTag(documentId), { expire: 0 })
}

/** The same, for a whole chunk of a Campaign or plan delete, per Task. */
export function expireShortLinks(documentIds: readonly string[]): void {
  for (const id of documentIds) expireShortLink(id)
}

/**
 * Expire the conference's CODE INDEX — the membership set the route uses to
 * answer an unknown code without reading Sanity.
 *
 * Called wherever a code comes into existence, is backfilled onto an older
 * document, or goes away with one. It must be called AFTER the write commits,
 * never at mint time: the mint precedes the write, so expiring then would
 * race the write and rebuild an index that still lacks the new code.
 *
 * Getting this wrong in the "forgot to call it" direction is the dangerous
 * one — a real, freshly posted short link would resolve to the home page
 * until the index aged out — which is why {@link
 * SHORT_LINK_INDEX_LIFE} is a backstop rather than the only mechanism, and
 * why every call site is enumerated in the PR.
 */
export function expireShortLinkIndex(conferenceId: string): void {
  revalidateTag(shortLinkIndexTag(conferenceId), { expire: 0 })
}
