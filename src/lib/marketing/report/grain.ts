import { conferenceDay } from '../outcomes'
import { addDaysToDate } from '../materialize'
import type { ReportSnapshot } from './types'

/** Monday-based buckets follow conference days, never the UTC date of a reading. */
export function observationDay(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const day = conferenceDay(date)
  if (!day) throw new Error('Invalid Snapshot date')
  return day
}
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
 * Whether two readings measure the same thing, so a value may carry from one
 * to the other.
 *
 * The outcome is the obvious half. The **window** is the other half and is
 * easy to miss: `strictWindow` counts `cfpSubmissions` and
 * `ticketsSoldInWindow` strictly inside the Campaign's own dates, so moving a
 * window changes which events the number counts even though the metric's name
 * is unchanged. Carrying a value across that boundary reports the old window's
 * total against the new window — the discontinuity #1083 warns organizers
 * about, silently smoothed over.
 */
export function sameMeasurementBasis(
  a: ReportSnapshot,
  b: ReportSnapshot,
): boolean {
  return (
    a.campaignPrimaryOutcome === b.campaignPrimaryOutcome &&
    a.campaignStartDate === b.campaignStartDate &&
    a.campaignEndDate === b.campaignEndDate
  )
}

export function metricSegments(rows: ReportSnapshot[]): ReportSnapshot[][] {
  const segments: ReportSnapshot[][] = []
  for (const row of canonicalSnapshots(rows)) {
    const last = segments.at(-1)
    if (!last || !sameMeasurementBasis(last[0], row)) segments.push([row])
    else last.push(row)
  }
  return segments
}

/** Last measured value, NOT sum or max. A missing source is not a zero. */
export function lastObservation(rows: ReportSnapshot[]): ReportSnapshot | null {
  return canonicalSnapshots(rows)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.takenAt.localeCompare(b.takenAt),
    )
    .reduce<ReportSnapshot | null>((previous, row) => {
      if (previous && !sameMeasurementBasis(previous, row)) previous = null
      const tasks: Map<string, ReportSnapshot['perTask'][number]> = new Map(
        previous?.perTask.map((t) => [t.taskKey ?? t.task._ref, t]) ?? [],
      )
      for (const task of row.perTask) {
        const prior = tasks.get(task.taskKey ?? task.task._ref)
        tasks.set(task.taskKey ?? task.task._ref, {
          ...task,
          sessions: task.sessions ?? prior?.sessions ?? null,
          clicks: task.clicks ?? prior?.clicks ?? null,
          blueskyLikes: task.blueskyLikes ?? prior?.blueskyLikes ?? null,
          blueskyReposts: task.blueskyReposts ?? prior?.blueskyReposts ?? null,
          blueskyReplies: task.blueskyReplies ?? prior?.blueskyReplies ?? null,
          blueskyQuotes: task.blueskyQuotes ?? prior?.blueskyQuotes ?? null,
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
  if (grain === 'daily') return canonicalSnapshots(rows)
  const campaigns = new Map<string, ReportSnapshot[]>()
  for (const row of canonicalSnapshots(rows)) {
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
      for (const row of canonicalSnapshots(campaignRows)) {
        const key = weekStart(row.date)
        buckets.set(key, [...(buckets.get(key) ?? []), row])
      }
      return [...buckets.values()].map((bucket) => {
        // One point per week, describing the basis in force at the week's
        // end. Rows measured on a different basis are dropped rather than
        // folded in: carrying a value across a basis change is exactly what
        // `sameMeasurementBasis` exists to prevent.
        const last = bucket[bucket.length - 1]
        return lastObservation(
          bucket.filter((row) => sameMeasurementBasis(row, last)),
        )!
      })
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
