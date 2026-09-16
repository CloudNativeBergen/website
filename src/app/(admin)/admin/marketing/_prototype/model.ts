/**
 * PROTOTYPE — throwaway. Pure helpers the density variants need on top of
 * `timeline-model.ts`. Answers: can a 9-Campaign / 94-Task plan be made
 * workable without a 4000px scroll? See issues #1085 and #1086.
 */
import type { PlanView, TaskView } from '@/lib/marketing/types'
import {
  CHIP_FOOTPRINT_PX,
  MIN_BOARD_WIDTH_PX,
  gapPct,
  pct,
  toMs,
  type TimelineRange,
} from '@/components/admin/marketing/timeline-model'

const DAY = 86_400_000

/** A group of Tasks close enough on the axis to collide. One chip stands for all. */
export interface Cluster {
  x: number
  tasks: TaskView[]
}

/**
 * THE fix for unbounded lane height (#1086 item 3). `packRows` pushes a
 * colliding chip onto a new ROW, so a burst of Tasks makes its lane taller
 * without limit. This folds the burst into ONE chip instead, so a lane is a
 * lane whatever the density.
 */
export function clusterByX(
  tasks: readonly TaskView[],
  range: TimelineRange,
  boardWidthPx = MIN_BOARD_WIDTH_PX,
): Cluster[] {
  const gap = gapPct(CHIP_FOOTPRINT_PX, boardWidthPx)
  const dated = tasks
    .filter((t) => Number.isFinite(toMs(t.date)))
    .map((t) => ({ t, x: pct(t.date, range) }))
    .sort((a, b) => a.x - b.x)
  const out: Cluster[] = []
  for (const { t, x } of dated) {
    const last = out[out.length - 1]
    if (last && x - last.x < gap) last.tasks.push(t)
    else out.push({ x, tasks: [t] })
  }
  return out
}

/**
 * A window around today rather than the whole edition (#1086 item 4). Nine
 * months of axis spends most of its width on quiet months; the bursts that
 * need the width are weeks long.
 */
export function windowRange(
  full: TimelineRange,
  today: string,
  weeks: number | null,
): TimelineRange {
  if (weeks === null) return full
  const mid = Number.isFinite(toMs(today))
    ? toMs(today)
    : (full.start + full.end) / 2
  const half = weeks * 7 * DAY
  const start = Math.max(full.start, mid - half)
  const end = Math.min(full.end, mid + half)
  return end > start ? { start, end } : full
}

export interface Filters {
  status: 'all' | 'overdue' | 'open' | 'done'
  kind: 'all' | TaskView['kind']
  channel: 'all' | 'linkedin' | 'bluesky'
  campaignId: 'all' | string
}

export const NO_FILTERS: Filters = {
  status: 'all',
  kind: 'all',
  channel: 'all',
  campaignId: 'all',
}

export function filterTasks(
  tasks: readonly TaskView[],
  f: Filters,
  today: string,
): TaskView[] {
  const overdue = (t: TaskView) =>
    !t.complete &&
    t.status !== 'skipped' &&
    Number.isFinite(toMs(t.date)) &&
    toMs(t.date) < toMs(today)
  return tasks.filter((t) => {
    if (f.kind !== 'all' && t.kind !== f.kind) return false
    if (f.channel !== 'all' && t.channel !== f.channel) return false
    if (f.campaignId !== 'all' && t.campaignId !== f.campaignId) return false
    if (f.status === 'overdue') return overdue(t)
    if (f.status === 'done') return t.complete
    if (f.status === 'open') return !t.complete && t.status !== 'skipped'
    return true
  })
}

/** Campaigns overlapping today — the ones worth expanding by default (#1086 item 2). */
export function liveCampaignIds(view: PlanView): Set<string> {
  const now = toMs(view.today)
  return new Set(
    view.campaigns
      .filter((c) => {
        const s = toMs(c.startDate)
        const e = toMs(c.endDate)
        return Number.isFinite(s) && Number.isFinite(e) && s <= now && now <= e
      })
      .map((c) => c._id),
  )
}

/** Sort for a work list: overdue first, then soonest. */
export function workOrder(
  tasks: readonly TaskView[],
  today: string,
): TaskView[] {
  const now = toMs(today)
  const rank = (t: TaskView) => {
    const ms = toMs(t.date)
    if (t.complete || t.status === 'skipped') return 3
    if (Number.isFinite(ms) && ms < now) return 0
    return 1
  }
  return [...tasks].sort(
    (a, b) => rank(a) - rank(b) || (toMs(a.date) || 0) - (toMs(b.date) || 0),
  )
}

export function dayLabel(value: string | null): string {
  const ms = toMs(value)
  if (!Number.isFinite(ms)) return 'No date'
  return new Date(ms).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
  })
}
