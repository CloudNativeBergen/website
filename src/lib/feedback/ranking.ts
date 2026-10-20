/**
 * THE ADMIN RANKING (speaker feedback spec §10.1). Pure, so the page sorts
 * in the browser and the rule is tested on its own.
 *
 * By default sessions rank by the share of "Loved it" in their combined
 * totals (§4.3). A session with fewer than {@link MIN_RANKED_RESPONSES}
 * combined responses shows "too few" and sorts after the rest. The minimum
 * is fixed.
 */
import type { FeedbackTotals } from './totals'

export const MIN_RANKED_RESPONSES = 10

export type FeedbackSort = 'lovedIt' | 'responses' | 'comments'

export const hasTooFew = (totals: FeedbackTotals) =>
  totals.total < MIN_RANKED_RESPONSES

interface Rankable {
  title: string
  totals: FeedbackTotals
  comments: readonly unknown[]
}

/** The exact share, never the rounded percent, so 199/200 beats 99/100. */
const share = (t: FeedbackTotals) => (t.total ? t.combined.green / t.total : 0)

const byTitle = (a: Rankable, b: Rankable) => a.title.localeCompare(b.title)

const COMPARE: Record<FeedbackSort, (a: Rankable, b: Rankable) => number> = {
  lovedIt: (a, b) =>
    Number(hasTooFew(a.totals)) - Number(hasTooFew(b.totals)) ||
    (hasTooFew(a.totals) ? 0 : share(b.totals) - share(a.totals)) ||
    b.totals.total - a.totals.total ||
    byTitle(a, b),
  responses: (a, b) => b.totals.total - a.totals.total || byTitle(a, b),
  comments: (a, b) => b.comments.length - a.comments.length || byTitle(a, b),
}

/** A sorted copy of `sessions`, most first. */
export function rankSessions<T extends Rankable>(
  sessions: readonly T[],
  sort: FeedbackSort,
): T[] {
  return [...sessions].sort(COMPARE[sort])
}

/**
 * `sessions` in the order the page already shows (`shown`, talk ids), so a
 * refetch after Hide or Remove never moves the row the organizer is working
 * in. Rows that went are dropped; rows new to the page follow, ranked by
 * `sort` among themselves. Only a change of sort re-ranks everything.
 */
export function keepOrder<T extends Rankable & { talkId: string }>(
  shown: readonly string[],
  sessions: readonly T[],
  sort: FeedbackSort,
): T[] {
  const byId = new Map(sessions.map((s) => [s.talkId, s]))
  const kept = shown.flatMap((id) => byId.get(id) ?? [])
  const known = new Set(shown)
  return [
    ...kept,
    ...rankSessions(
      sessions.filter((s) => !known.has(s.talkId)),
      sort,
    ),
  ]
}
