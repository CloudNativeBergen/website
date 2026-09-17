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

export function metricSegments(rows: ReportSnapshot[]): ReportSnapshot[][] {
  const segments: ReportSnapshot[][] = []
  for (const row of canonicalSnapshots(rows)) {
    const last = segments.at(-1)
    if (!last || last[0].campaignPrimaryOutcome !== row.campaignPrimaryOutcome)
      segments.push([row])
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
      if (previous?.campaignPrimaryOutcome !== row.campaignPrimaryOutcome)
        previous = null
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
    .flatMap((campaignRows) =>
      metricSegments(campaignRows).flatMap((segment) => {
        const buckets = new Map<string, ReportSnapshot[]>()
        for (const row of segment) {
          const key = weekStart(row.date)
          buckets.set(key, [...(buckets.get(key) ?? []), row])
        }
        return [...buckets.values()].map((bucket) => lastObservation(bucket)!)
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}
