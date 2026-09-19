import { conferenceDay } from '../outcomes'
import { addDaysToDate } from '../materialize'
import type { ReportSnapshot } from './types'

/** The conference day a reading covers, never the UTC date of its timestamp. */
export function observationDay(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const day = conferenceDay(date)
  if (!day) throw new Error('Invalid Snapshot date')
  return day
}
/** Monday-based buckets follow conference days, never UTC dates. */
export function weekStart(date: string): string {
  const day = observationDay(date)
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return addDaysToDate(day, -((weekday + 6) % 7))
}

/** A reseed can create a second document for the same Campaign/day. */
export function canonicalSnapshots(rows: ReportSnapshot[]): ReportSnapshot[] {
  const readings = new Map<string, ReportSnapshot>()
  for (const row of rows) {
    const key = `${row.campaignKey ?? row.campaign._ref}:${row.date}`
    const previous = readings.get(key)
    if (
      !previous ||
      row.takenAt > previous.takenAt ||
      (row.takenAt === previous.takenAt && row._id > previous._id)
    )
      readings.set(key, row)
  }
  return [...readings.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.takenAt.localeCompare(b.takenAt),
  )
}

/**
 * The two Outcomes counted STRICTLY inside the Campaign's own dates, so that
 * moving the window's START changes what they count. `computeCampaignOutcome`
 * passes `strictWindow` to these and only these.
 */
const STRICT_WINDOW_OUTCOMES = new Set([
  'cfpSubmissions',
  'ticketsSoldInWindow',
])

/**
 * Outcomes measured over NO window at all.
 *
 * `blueskyEngagements` sums the all-time counters of the Campaign's published
 * Bluesky posts — it never consults `strictWindow` or `attributedWindow`. So a
 * window edit cannot change what the number counted, and treating one as a
 * basis change put a false "Campaign window changed" split in the timeline and,
 * when the next Bluesky read was unavailable, refused to carry the previous
 * valid count forward.
 */
const WINDOWLESS_OUTCOMES = new Set(['blueskyInteractions'])

/**
 * Whether two readings measure the same thing, so a value may carry from one
 * to the other.
 *
 * The Outcome is the obvious half. The window is the other, and it is not all
 * or nothing:
 *
 * - **Bluesky counts against neither.** Its interactions are the all-time
 *   counters of the published posts; no window is consulted at all.
 * - **`endDate` counts for every other Outcome.** `attributedWindow` runs to
 *   `endDate` plus the attribution tail, so moving the end moves the span that
 *   Visits, CTA clicks and the attributed Outcomes are measured over, exactly
 *   as it moves the strict one. An earlier version of this function
 *   returned `true` unconditionally for the non-strict Outcomes on the grounds
 *   that the attributed window "is derived from when Tasks published" — true of
 *   its START only.
 * - **`startDate` counts only for the strict Outcomes.** `attributedWindow`
 *   begins at the first published Task, so a Campaign start that moves does not
 *   change what an attributed number counted. Treating it as a basis change for
 *   everything was an integration bug with #1078: that feature re-dates windows
 *   whenever a Milestone is set, so on completely intact data every series
 *   broke at that moment and the Report read "Not measured".
 */
export function sameMeasurementBasis(
  a: ReportSnapshot,
  b: ReportSnapshot,
): boolean {
  if (a.campaignPrimaryOutcome !== b.campaignPrimaryOutcome) return false
  const outcome = a.campaignPrimaryOutcome ?? ''
  if (WINDOWLESS_OUTCOMES.has(outcome)) return true
  // AN UNKNOWN WINDOW IS NOT A DIFFERENT WINDOW.
  //
  // A row that predates the denormalization carries no window at all, and
  // migration 052 deliberately does not invent one — the Campaign's current
  // dates are not evidence of what an old reading measured. The very next
  // nightly snapshot does carry one, so comparing the two directly meant
  // `undefined !== '2026-06-30'`: every series broke at that boundary, was
  // labelled "window changed" when nothing had changed, and refused to carry a
  // perfectly good legacy value forward if that night's source was unavailable.
  //
  // Not knowing one side's basis is not grounds for claiming it differs. Only
  // two KNOWN windows can disagree.
  if (!bothKnown(a.campaignEndDate, b.campaignEndDate)) return true
  if (a.campaignEndDate !== b.campaignEndDate) return false
  if (!STRICT_WINDOW_OUTCOMES.has(outcome)) return true
  if (!bothKnown(a.campaignStartDate, b.campaignStartDate)) return true
  return a.campaignStartDate === b.campaignStartDate
}

const bothKnown = (a?: string | null, b?: string | null) => !!a && !!b

/**
 * Whether two readings measure the same thing for the PER-TASK numbers.
 *
 * Sessions, clicks and Bluesky engagement per Task are computed from the
 * attributed window and nothing else — `computeCampaignOutcome` consumes
 * `campaign.primaryOutcome` only inside `primaryOutcome()`. So the Campaign's
 * Outcome is not part of their basis, and segmenting them by it discarded
 * perfectly good measurements: after an Outcome edit, `topTasks` and the
 * Channel funnel dropped every number taken before the edit, so a Task with 71
 * measured clicks ranked as unmeasured. Only the window END matters, because
 * that is the one end of the attributed window the Campaign owns.
 */
export function sameTaskMeasurementBasis(
  a: ReportSnapshot,
  b: ReportSnapshot,
): boolean {
  return a.campaignEndDate === b.campaignEndDate
}

/**
 * Segments of readings measured on the same basis.
 *
 * There is no `taskSegments` counterpart: the per-Task numbers are NOT
 * segmented. `lastObservation` is handed the whole set with
 * `sameTaskMeasurementBasis`, so it resets the window-bound fields at a basis
 * change while carrying the windowless Bluesky ones past it — segmenting first
 * threw the earlier rows away before that could happen.
 */
export function metricSegments(rows: ReportSnapshot[]): ReportSnapshot[][] {
  const segments: ReportSnapshot[][] = []
  for (const row of canonicalSnapshots(rows)) {
    const last = segments.at(-1)
    if (!last || !sameMeasurementBasis(last[0], row)) segments.push([row])
    else last.push(row)
  }
  return segments
}

/**
 * Last measured value, NOT sum or max. A missing source is not a zero.
 *
 * `same` decides when a value may no longer carry forward. It defaults to the
 * primary Outcome's basis; callers that only want the per-Task numbers pass
 * `sameTaskMeasurementBasis`, which does not break on an Outcome edit.
 */
export function lastObservation(
  rows: ReportSnapshot[],
  same: (
    a: ReportSnapshot,
    b: ReportSnapshot,
  ) => boolean = sameMeasurementBasis,
): ReportSnapshot | null {
  return canonicalSnapshots(rows)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.takenAt.localeCompare(b.takenAt),
    )
    .reduce<ReportSnapshot | null>((previous, row) => {
      // A basis reset drops the WINDOW-BOUND numbers and nothing else. Per-Task
      // Bluesky engagement is read straight off the published posts' all-time
      // counters (`perTaskOutcomes`), exactly as the Campaign-level figure is,
      // so a window edit cannot change it — but it shared the reset with
      // sessions and clicks, and Top Tasks turned a still-valid engagement
      // count into "Not measured" the first time a Bluesky read was
      // unavailable after one.
      const carried = previous
      if (previous && !same(previous, row)) previous = null
      const windowless: Map<string, ReportSnapshot['perTask'][number]> =
        new Map(
          carried?.perTask.map((t) => [t.taskKey ?? t.task._ref, t]) ?? [],
        )
      const tasks: Map<string, ReportSnapshot['perTask'][number]> = new Map(
        previous?.perTask.map((t) => [t.taskKey ?? t.task._ref, t]) ?? [],
      )
      for (const task of row.perTask) {
        const key = task.taskKey ?? task.task._ref
        const prior = tasks.get(key)
        // Bluesky falls back past the reset, to the last reading of ANY basis.
        const ever = windowless.get(key)
        tasks.set(key, {
          ...task,
          sessions: task.sessions ?? prior?.sessions ?? null,
          clicks: task.clicks ?? prior?.clicks ?? null,
          blueskyLikes: task.blueskyLikes ?? ever?.blueskyLikes ?? null,
          blueskyReposts: task.blueskyReposts ?? ever?.blueskyReposts ?? null,
          blueskyReplies: task.blueskyReplies ?? ever?.blueskyReplies ?? null,
          blueskyQuotes: task.blueskyQuotes ?? ever?.blueskyQuotes ?? null,
        })
      }
      return {
        ...row,
        primaryOutcomeValue:
          row.primaryOutcomeValue ?? previous?.primaryOutcomeValue ?? null,
        primaryOutcomeAttributedValue:
          row.primaryOutcomeAttributedValue ??
          previous?.primaryOutcomeAttributedValue ??
          null,
        secondary: {
          attributedSessions:
            row.secondary.attributedSessions ??
            previous?.secondary.attributedSessions ??
            null,
          checkoutClickThrough:
            row.secondary.checkoutClickThrough ??
            previous?.secondary.checkoutClickThrough ??
            null,
          blueskyInteractions:
            row.secondary.blueskyInteractions ??
            previous?.secondary.blueskyInteractions ??
            null,
        },
        perTask: [...tasks.values()],
      }
    }, null)
}

/** Stored readings are cumulative. Weekly grain selects the last measurement of each field. */
export function foldGrain(
  rows: ReportSnapshot[],
  grain: 'daily' | 'weekly',
): ReportSnapshot[] {
  // Canonicalized ONCE, here. Every step below works on the result, and
  // `lastObservation` canonicalizes what it is handed anyway — the weekly path
  // used to run it three times over the same rows.
  const canonical = canonicalSnapshots(rows)
  if (grain === 'daily') return canonical
  // Grouped per Campaign because this function is exported: the only caller in
  // the Report passes one Campaign's one metric segment, so the map holds a
  // single entry there, but folding two Campaigns' readings into one weekly
  // series would be silently wrong for anyone who passes mixed rows.
  const campaigns = new Map<string, ReportSnapshot[]>()
  for (const row of canonical) {
    const key = row.campaignKey ?? row.campaign._ref
    campaigns.set(key, [...(campaigns.get(key) ?? []), row])
  }
  return [...campaigns.values()]
    .flatMap((campaignRows) => {
      // Bucket by week FIRST. Segmenting by measurement basis first and
      // bucketing inside each segment emitted one point per segment, so a
      // Campaign whose window changed and changed back inside a single week
      // produced THREE points on the same week — a weekly series with three
      // values at one x.
      const buckets = new Map<string, ReportSnapshot[]>()
      for (const row of campaignRows) {
        const key = weekStart(row.date)
        buckets.set(key, [...(buckets.get(key) ?? []), row])
      }
      return [...buckets.values()].map((bucket) => {
        // One point per week, describing the basis in force at the week's end —
        // folded from the FINAL CONTIGUOUS RUN on that basis, not from every
        // row in the bucket that happens to share it.
        //
        // Filtering instead of slicing let an A → B → A week carry the
        // pre-change A value into the post-change A point when the last reading
        // was unavailable: removing the B rows removed the very reset they
        // represent. Daily grain treats those A runs as separate segments, so
        // the two grains disagreed about whether a number still held.
        const last = bucket[bucket.length - 1]
        let start = bucket.length - 1
        while (start > 0 && sameMeasurementBasis(bucket[start - 1], last))
          start -= 1
        return lastObservation(bucket.slice(start))!
      })
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
