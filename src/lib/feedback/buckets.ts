/**
 * RESPONSES OVER TIME (speaker feedback spec §10.2): a talk's responses in
 * 10-minute buckets across its Feedback Window, so an organizer can spot a
 * scripted burst and remove it by range. Pure and client-safe.
 */
import type { FeedbackColour } from './colour'
import type { ColourCounts } from './totals'
import type { FeedbackWindow } from './window'

export const BUCKET_MINUTES = 10
const BUCKET_MS = BUCKET_MINUTES * 60 * 1000

export interface ChartResponse {
  id: string
  colour: FeedbackColour
  submittedAt: string
}

export interface ResponseBucket {
  /** ISO instants, on a 10-minute boundary. */
  start: string
  end: string
  /** The responses submitted in `[start, end)`, oldest first. */
  ids: string[]
  counts: ColourCounts
}

/** A range of buckets: where it started and where it reaches now. */
export interface BucketRange {
  anchor: number
  focus: number
}

const floor = (t: number) => Math.floor(t / BUCKET_MS) * BUCKET_MS

/**
 * The buckets from the window's opening to its close, or to `now` while it
 * is still open, stretched to hold any response outside it (a session moved
 * after answers came in). A talk with no slot spans its responses. No
 * responses, no buckets.
 */
export function responseBuckets({
  responses,
  window,
  now,
}: {
  responses: readonly ChartResponse[]
  window: Pick<FeedbackWindow, 'opensAt' | 'closesAt'>
  now: Date
}): ResponseBucket[] {
  const times = responses.map((r) => Date.parse(r.submittedAt))
  if (times.length === 0) return []
  let first = Math.min(...times)
  // The last bucket holds `last`, so `last` is inside `[.., end)`.
  let last = Math.max(...times)
  if (window.opensAt && window.closesAt) {
    first = Math.min(first, Date.parse(window.opensAt))
    // The close is the end of the last bucket, not a moment in one.
    const through = Math.min(now.getTime(), Date.parse(window.closesAt) - 1)
    last = Math.max(last, through)
  }
  const start = floor(first)
  const count = Math.floor((floor(last) - start) / BUCKET_MS) + 1
  const buckets: ResponseBucket[] = Array.from({ length: count }, (_, i) => ({
    start: new Date(start + i * BUCKET_MS).toISOString(),
    end: new Date(start + (i + 1) * BUCKET_MS).toISOString(),
    ids: [],
    counts: { green: 0, yellow: 0, red: 0 },
  }))
  const order = responses
    .map((r, i) => ({ r, t: times[i] }))
    .sort((a, b) => a.t - b.t)
  for (const { r, t } of order) {
    const bucket = buckets[Math.floor((t - start) / BUCKET_MS)]
    bucket.ids.push(r.id)
    bucket.counts[r.colour]++
  }
  return buckets
}

/** The first and last bucket of a range, in time order. */
export const rangeBounds = ({ anchor, focus }: BucketRange) =>
  [Math.min(anchor, focus), Math.max(anchor, focus)] as const

/** Every response id in the range's buckets, oldest first. */
export function selectionIds(
  buckets: readonly ResponseBucket[],
  range: BucketRange,
): string[] {
  const [from, to] = rangeBounds(range)
  return buckets.slice(from, to + 1).flatMap((b) => b.ids)
}
