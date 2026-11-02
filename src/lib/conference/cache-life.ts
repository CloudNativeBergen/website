/**
 * How long a cached conference read may go without re-reading Sanity.
 *
 * `revalidate` is the knob that costs Sanity REQUESTS: the cached function only
 * re-runs — and therefore only bills a request — once an entry is older than
 * this. It was `cacheLife('hours')` (revalidate 3600), i.e. up to 24 reads per
 * entry per region per day.
 *
 * `expire` is DELIBERATELY LEFT AT THE `'hours'` VALUE (86400). That keeps the
 * HARD staleness ceiling exactly where it is today — an entry is still
 * discarded, and the next request still blocks on a fresh read, after 24h. Only
 * the background-refresh interval moves, 1h -> 6h. This matters because the
 * premise that "every conference mutation revalidates `conferenceTag`" does not
 * hold: `src/server/routers/speaker.ts` and `src/server/routers/proposal.ts`
 * write speaker and talk documents that this read dereferences and revalidate
 * nothing, and there is no Sanity webhook, so an edit made directly in the
 * hosted Studio is only ever picked up by natural expiry. Under those
 * conditions `cacheLife('days')` (revalidate 86400, expire 604800) would turn
 * today's <=1h annoyance into a 7-day one. See the PR body for the exact list
 * of unrevalidated paths that must be closed before this can go to days.
 */
export const CONFERENCE_CACHE_LIFE = {
  stale: 60 * 5,
  revalidate: 60 * 60 * 6,
  expire: 60 * 60 * 24,
} as const
