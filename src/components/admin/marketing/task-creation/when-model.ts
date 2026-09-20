/** The "When" of a manual Task: a Milestone anchor, or a bare date (§2.2). */
import { isCalendarDate } from '@/lib/time'
import { reanchor } from '@/lib/marketing/copy'
import {
  CHANNEL_SLOT,
  WORK_SLOT,
  resolveAnchor,
} from '@/lib/marketing/materialize'
import type { Milestone, ResolvedMilestone } from '@/lib/marketing/milestones'
import type { Anchor } from '@/lib/marketing/template/types'
import type { MarketingChannel, TaskKind } from '@/lib/marketing/types'
import { MILESTONE_LABELS } from '../timeline-model'

export type Milestones = Record<Milestone, ResolvedMilestone>

/** Where an anchored Task lands: the server places it the same way. */
export function anchoredSlot(
  anchor: Anchor,
  milestones: Milestones,
  kind: TaskKind,
  channel: MarketingChannel,
): { date: string; time: string; provisional: boolean } {
  return {
    ...resolveAnchor(anchor, milestones),
    time: kind === 'publishing' ? CHANNEL_SLOT[channel] : WORK_SLOT,
  }
}

/** The anchor nearest a typed `datetime-local` value, if the server takes it. */
export function suggestAnchor(
  due: string,
  milestones: Milestones,
): Anchor | null {
  const date = due.slice(0, 10)
  if (!isCalendarDate(date)) return null
  const anchor = reanchor(date, milestones)
  return Math.abs(anchor.offsetDays) <= 365 ? anchor : null
}

export function describeAnchor({ milestone, offsetDays }: Anchor): string {
  const label = MILESTONE_LABELS[milestone]
  if (offsetDays === 0) return `the day of ${label}`
  const days = Math.abs(offsetDays)
  return `${days} day${days === 1 ? '' : 's'} ${offsetDays < 0 ? 'before' : 'after'} ${label}`
}
