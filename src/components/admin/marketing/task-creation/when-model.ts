/** The "When" of a manual Task: a Milestone anchor, or a bare date (§2.2). */
import { isCalendarDate } from '@/lib/time'
import { reanchor } from '@/lib/marketing/copy'
import {
  addDaysToDate,
  resolveAnchor,
  slotTimeFor,
} from '@/lib/marketing/materialize'
import type { ResolvedMilestones } from '@/lib/marketing/milestones'
import type { Anchor } from '@/lib/marketing/template/types'
import type { MarketingChannel, TaskKind } from '@/lib/marketing/types'
import { MILESTONE_LABELS } from '../timeline-model'

/** The offset the server accepts, either side of the Milestone. */
export const MAX_OFFSET_DAYS = 365

/** Where an anchored Task lands: the server places it the same way. */
export function anchoredSlot(
  anchor: Anchor,
  milestones: ResolvedMilestones,
  kind: TaskKind,
  channel: MarketingChannel,
): { date: string; time: string; provisional: boolean } {
  return {
    ...resolveAnchor(anchor, milestones),
    time: slotTimeFor({ kind, channel }),
  }
}

/** The anchor nearest a typed `datetime-local` value, if the server takes it. */
export function suggestAnchor(
  due: string,
  milestones: ResolvedMilestones,
): Anchor | null {
  const date = due.slice(0, 10)
  if (!isCalendarDate(date)) return null
  const anchor = reanchor(date, milestones)
  return Math.abs(anchor.offsetDays) <= MAX_OFFSET_DAYS ? anchor : null
}

/**
 * Where the form starts: tomorrow, so the slot has not already passed, as an
 * anchor — or the conference itself when no Milestone is within reach.
 */
export function initialAnchor(
  today: string,
  milestones: ResolvedMilestones,
): Anchor {
  return (
    suggestAnchor(addDaysToDate(today, 1), milestones) ?? {
      milestone: 'CONFERENCE_START',
      offsetDays: 0,
    }
  )
}

export function clampOffset(offsetDays: number): number {
  return Math.max(
    -MAX_OFFSET_DAYS,
    Math.min(MAX_OFFSET_DAYS, Math.trunc(offsetDays)),
  )
}

export function describeAnchor({ milestone, offsetDays }: Anchor): string {
  const label = MILESTONE_LABELS[milestone]
  if (offsetDays === 0) return `the day of ${label}`
  const days = Math.abs(offsetDays)
  return `${days} day${days === 1 ? '' : 's'} ${offsetDays < 0 ? 'before' : 'after'} ${label}`
}
