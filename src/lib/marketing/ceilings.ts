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
 *
 * What counts is what the audience will still get: a post that is drafted,
 * queued, waiting to be posted by hand or already out. A day that has passed
 * is not warned about — nothing can be moved off it any more.
 */

import { formatConferenceDate, osloTodayDateString } from '@/lib/time'
import { addDaysToDate, beatOf } from './materialize'
import type { Milestone, ResolvedMilestone } from './milestones'
import { MARKETING_CHANNEL_LABELS, type MarketingChannel } from './types'

export const PER_DAY_CEILING: Record<MarketingChannel, number> = {
  linkedin: 1,
  bluesky: 3,
}
export const LINKEDIN_COUNTDOWN_CEILING = 3

/**
 * One scheduled post on a Channel: every variant counts, whether a Task owns
 * it or it was made in the posts table — the audience sees them all.
 */
export interface CeilingEntry {
  variantId: string
  channel: MarketingChannel
  /** ISO instant. */
  at: string
  /** The owning Task's key, which is how a countdown is recognised. */
  taskKey: string | null
}

export type CeilingWarning =
  | {
      kind: 'perDay'
      channel: MarketingChannel
      /** YYYY-MM-DD, Oslo. */
      day: string
      count: number
      limit: number
      variantIds: string[]
    }
  | {
      kind: 'countdowns'
      channel: 'linkedin'
      count: number
      limit: number
      variantIds: string[]
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
function isCountdown(taskKey: string | null): boolean {
  return taskKey !== null && beatOf(taskKey).startsWith('countdown')
}

export function ceilingWarnings(
  entries: CeilingEntry[],
  eventWeek: EventWeek,
  /** Today in Oslo: days before it are history, not a choice. */
  from?: string,
): CeilingWarning[] {
  const warnings: CeilingWarning[] = []
  const ahead = from
    ? entries.filter((e) => osloTodayDateString(new Date(e.at)) >= from)
    : entries
  const byDay = new Map<string, CeilingEntry[]>()
  for (const entry of ahead) {
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
        variantIds: group.map((e) => e.variantId),
      })
    }
  }
  const countdowns = ahead.filter(
    (e) => e.channel === 'linkedin' && isCountdown(e.taskKey),
  )
  if (countdowns.length > LINKEDIN_COUNTDOWN_CEILING) {
    warnings.push({
      kind: 'countdowns',
      channel: 'linkedin',
      count: countdowns.length,
      limit: LINKEDIN_COUNTDOWN_CEILING,
      variantIds: countdowns.map((e) => e.variantId),
    })
  }
  return warnings
}

/** The warnings any of these posts is part of. */
export function warningsTouching(
  warnings: CeilingWarning[],
  variantIds: string[],
): CeilingWarning[] {
  const ids = new Set(variantIds)
  return warnings.filter((w) => w.variantIds.some((id) => ids.has(id)))
}

export function describeCeilingWarning(warning: CeilingWarning): string {
  const channel = MARKETING_CHANNEL_LABELS[warning.channel]
  if (warning.kind === 'countdowns') {
    return `${channel} has ${warning.count} countdown posts; the ceiling is ${warning.limit}.`
  }
  const day = formatConferenceDate(warning.day, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `${channel} has ${warning.count} posts on ${day}; the ceiling outside event week is ${warning.limit} a day.`
}
