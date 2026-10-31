/**
 * Review aggregates kept on a talk (`talk.reviewSummary`) once its review
 * documents are deleted, 24 months after the conference ended.
 *
 * `foldedAt` marks a summary whose reviews are GONE. Only such a summary is
 * added to live reviews; a backfilled summary (no `foldedAt`) covers reviews
 * that still exist and is never counted on top of them.
 */

export interface ReviewScore {
  content: number
  relevance: number
  speaker: number
}

export interface ReviewSummary {
  count: number
  /** Average per category, on the `review.score` scale. */
  content: number
  relevance: number
  speaker: number
  /** Average of content + relevance + speaker. */
  total: number
  /** Set when the reviews this summary covers have been deleted. */
  foldedAt?: string
}

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * Summarise `reviews`, adding them to an already folded `base`. A `base`
 * without `foldedAt` is ignored: its reviews are among `reviews`.
 */
export function summarizeReviews(
  reviews: { score?: Partial<ReviewScore> | null }[],
  base?: ReviewSummary | null,
): Omit<ReviewSummary, 'foldedAt'> {
  const folded = base?.foldedAt ? base : null
  let count = folded?.count ?? 0
  const sums = {
    content: (folded?.content ?? 0) * count,
    relevance: (folded?.relevance ?? 0) * count,
    speaker: (folded?.speaker ?? 0) * count,
  }
  for (const { score } of reviews) {
    sums.content += score?.content ?? 0
    sums.relevance += score?.relevance ?? 0
    sums.speaker += score?.speaker ?? 0
    count++
  }
  const avg = (sum: number) => (count ? round(sum / count) : 0)
  return {
    count,
    content: avg(sums.content),
    relevance: avg(sums.relevance),
    speaker: avg(sums.speaker),
    total: avg(sums.content + sums.relevance + sums.speaker),
  }
}

/**
 * The review count and average total a reader should show: live reviews
 * plus a folded summary of the deleted ones.
 */
export function reviewStats(
  reviews: { score?: Partial<ReviewScore> | null }[] | null | undefined,
  summary: ReviewSummary | null | undefined,
): { count: number; averageTotal: number } {
  const merged = summarizeReviews(reviews ?? [], summary)
  return { count: merged.count, averageTotal: merged.total }
}
