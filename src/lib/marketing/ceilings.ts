/**
 * CHANNEL CEILINGS — pure (spec §5.4). How many posts a Channel carries
 * before the audience tunes out. They WARN — at expansion, at manual
 * scheduling, and on the timeline — and never block: an organizer may know
 * better than the playbook.
 *
 * - LinkedIn: at most one post a day outside event week, and at most three
 *   countdown posts in total.
 * - Bluesky: at most three posts a day outside event week.
 *
 * Days are Oslo calendar days. Event week is the Event week Campaign's
 * window: `CONFERENCE_START − 1 d` through `CONFERENCE_END`.
 */

import { osloTodayDateString } from '@/lib/time'
import { addDaysToDate } from './generate'
import type { Milestone, ResolvedMilestone } from './milestones'
import { MARKETING_CHANNEL_LABELS, type MarketingChannel } from './types'

export const PER_DAY_CEILING: Record<MarketingChannel, number> = {
  linkedin: 1,
  bluesky: 3,
}
export const LINKEDIN_COUNTDOWN_CEILING = 3

/** One dated publishing Task. */
export interface CeilingEntry {
  taskId: string
  key: string
  channel: MarketingChannel
  /** ISO instant. */
  at: string
}

export type CeilingWarning =
  | {
      kind: 'perDay'
      channel: MarketingChannel
      /** YYYY-MM-DD, Oslo. */
      day: string
      count: number
      limit: number
      taskIds: string[]
    }
  | {
      kind: 'countdowns'
      channel: 'linkedin'
      count: number
      limit: number
      taskIds: string[]
    }

export interface EventWeek {
  /** YYYY-MM-DD, inclusive. */
  start: string
  end: string
}

export function eventWeekOf(
  milestones: Record<Milestone, ResolvedMilestone>,
): EventWeek {
  return {
    start: addDaysToDate(milestones.CONFERENCE_START.date, -1),
    end: milestones.CONFERENCE_END.date,
  }
}

/** A countdown beat: the Template's `countdown…` recipe keys. */
function isCountdown(key: string): boolean {
  return key.split(':')[0].startsWith('countdown')
}

export function ceilingWarnings(
  entries: CeilingEntry[],
  eventWeek: EventWeek,
): CeilingWarning[] {
  const warnings: CeilingWarning[] = []
  const byDay = new Map<string, CeilingEntry[]>()
  for (const entry of entries) {
    const day = osloTodayDateString(new Date(entry.at))
    if (day >= eventWeek.start && day <= eventWeek.end) continue
    const bucket = `${entry.channel}|${day}`
    byDay.set(bucket, [...(byDay.get(bucket) ?? []), entry])
  }
  for (const [bucket, group] of [...byDay].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const [channel, day] = bucket.split('|') as [MarketingChannel, string]
    const limit = PER_DAY_CEILING[channel]
    if (group.length > limit) {
      warnings.push({
        kind: 'perDay',
        channel,
        day,
        count: group.length,
        limit,
        taskIds: group.map((e) => e.taskId),
      })
    }
  }
  const countdowns = entries.filter(
    (e) => e.channel === 'linkedin' && isCountdown(e.key),
  )
  if (countdowns.length > LINKEDIN_COUNTDOWN_CEILING) {
    warnings.push({
      kind: 'countdowns',
      channel: 'linkedin',
      count: countdowns.length,
      limit: LINKEDIN_COUNTDOWN_CEILING,
      taskIds: countdowns.map((e) => e.taskId),
    })
  }
  return warnings
}

/** The warnings any of these Tasks is part of. */
export function warningsTouching(
  warnings: CeilingWarning[],
  taskIds: string[],
): CeilingWarning[] {
  const ids = new Set(taskIds)
  return warnings.filter((w) => w.taskIds.some((id) => ids.has(id)))
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function describeCeilingWarning(warning: CeilingWarning): string {
  const channel = MARKETING_CHANNEL_LABELS[warning.channel]
  if (warning.kind === 'countdowns') {
    return `${channel} has ${warning.count} countdown posts; the ceiling is ${warning.limit}.`
  }
  const [y, m, d] = warning.day.split('-').map(Number)
  return `${channel} has ${warning.count} posts on ${d} ${MONTHS[m - 1]} ${y}; the ceiling outside event week is ${warning.limit} a day.`
}

/** Every ceiling warning among a plan's dated publishing Tasks. */
export function planCeilingWarnings(
  tasks: {
    _id: string
    key: string
    kind: string
    channel: MarketingChannel | null
    date: string | null
  }[],
  milestones: Record<Milestone, ResolvedMilestone>,
): CeilingWarning[] {
  return ceilingWarnings(
    tasks.flatMap((t) =>
      t.kind === 'publishing' && t.date && t.channel
        ? [{ taskId: t._id, key: t.key, channel: t.channel, at: t.date }]
        : [],
    ),
    eventWeekOf(milestones),
  )
}
