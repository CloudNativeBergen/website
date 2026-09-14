/**
 * Pure layout for the Marketing Plan timeline (spec §7): the axis range,
 * where a date sits on it, how chips stack inside a lane, what a Kind looks
 * like, and which chips are waiting on an open Prerequisite.
 */

import type { Milestone, ResolvedMilestone } from '@/lib/marketing/milestones'
import type { PlanView, TaskKind, TaskView } from '@/lib/marketing/types'

export interface TimelineRange {
  /** Epoch ms of the left edge. */
  start: number
  /** Epoch ms of the right edge. */
  end: number
}

const DAY = 86_400_000
const PAD_DAYS = 7

/** A YYYY-MM-DD or ISO datetime as epoch ms; NaN for anything else. */
export function toMs(value: string | null | undefined): number {
  if (!value) return NaN
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T12:00:00Z`)
    : Date.parse(value)
}

/**
 * The axis spans everything on the plan — Campaign windows, dated Tasks and
 * every Milestone — with a week of air on each side, so nothing is drawn off
 * the edge and today is inside whenever the edition is under way.
 */
export function timelineRange(view: PlanView): TimelineRange {
  const points: number[] = []
  for (const c of view.campaigns)
    points.push(toMs(c.startDate), toMs(c.endDate))
  for (const t of view.tasks) points.push(toMs(t.date))
  for (const m of Object.values(view.milestones)) points.push(toMs(m.date))
  const valid = points.filter((p) => Number.isFinite(p))
  if (valid.length === 0) {
    const today = toMs(view.today)
    return { start: today - 30 * DAY, end: today + 30 * DAY }
  }
  const start = Math.min(...valid) - PAD_DAYS * DAY
  const end = Math.max(...valid) + PAD_DAYS * DAY
  return end > start ? { start, end } : { start, end: start + DAY }
}

/** Horizontal position of a date as a percentage of the axis, clamped. */
export function pct(value: string | null | undefined, range: TimelineRange) {
  const ms = toMs(value)
  if (!Number.isFinite(ms)) return 0
  const raw = ((ms - range.start) / (range.end - range.start)) * 100
  return Math.min(100, Math.max(0, raw))
}

/**
 * Greedy row packing: points in x order take the first row whose last point
 * is at least `minGap` to the left. Returns the row per id and the number of
 * rows needed. Used for chips in a lane and for labels on the axis.
 */
export function packByX(
  points: readonly { id: string; x: number }[],
  minGap: number,
): { rowOf: Map<string, number>; rows: number } {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const rowEnds: number[] = []
  const rowOf = new Map<string, number>()
  for (const p of sorted) {
    let row = rowEnds.findIndex((end) => p.x - end >= minGap)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(p.x)
    } else {
      rowEnds[row] = p.x
    }
    rowOf.set(p.id, row)
  }
  return { rowOf, rows: Math.max(1, rowEnds.length) }
}

/** Chip rows inside a lane; undated Tasks get no row. */
export function packRows(
  tasks: readonly TaskView[],
  range: TimelineRange,
  minGapPct = 2.2,
): { rowOf: Map<string, number>; rows: number } {
  return packByX(
    tasks
      .filter((t) => Number.isFinite(toMs(t.date)))
      .map((t) => ({ id: t._id, x: pct(t.date, range) })),
    minGapPct,
  )
}

/** Axis label rows so neighbouring Milestones never overprint. */
export function packMilestones(
  milestones: Record<string, ResolvedMilestone | undefined>,
  range: TimelineRange,
  minGapPct = 9,
): { rowOf: Map<string, number>; rows: number } {
  return packByX(
    Object.entries(milestones)
      .filter((e): e is [string, ResolvedMilestone] => e[1] !== undefined)
      .map(([id, m]) => ({ id, x: pct(m.date, range) })),
    minGapPct,
  )
}

/**
 * A Task is WAITING when it is not complete itself and any Prerequisite is
 * still open. Shown, never enforced: Prerequisites inform approval, they do
 * not block it (spec §3.2).
 */
export function isWaiting(task: TaskView, byId: Map<string, TaskView>) {
  if (task.complete) return false
  return task.prerequisiteIds.some((id) => {
    const p = byId.get(id)
    return p !== undefined && !p.complete
  })
}

/** Which page fixes a provisional date (the Milestone's real source). */
export function milestoneSettingsHref(milestone: Milestone | null): string {
  return milestone === 'TICKETS_OPEN'
    ? '/admin/tickets'
    : '/admin/settings#schedule'
}

export const MILESTONE_LABELS: Record<Milestone, string> = {
  CFP_OPEN: 'CFP opens',
  CFP_CLOSE: 'CFP closes',
  CFP_NOTIFY: 'Speakers notified',
  PROGRAM_PUBLISHED: 'Programme',
  CONFERENCE_START: 'Conference',
  CONFERENCE_END: 'Conference ends',
  TICKETS_OPEN: 'Tickets open',
  EARLY_BIRD_END: 'Early bird ends',
  REGISTRATION_CLOSE: 'Registration closes',
  SPEAKERS_ANNOUNCED: 'Speakers announced',
  SPONSOR_DEADLINE: 'Sponsor deadline',
  RECORDINGS_LIVE: 'Recordings live',
}

/**
 * The silhouette per Kind, so a render, an outreach and a post are told
 * apart without opening them (user story 10).
 */
export type ChipShape = 'pill' | 'square' | 'diamond' | 'tag' | 'tick'

export const KIND_SHAPES: Record<TaskKind, ChipShape> = {
  publishing: 'pill',
  studioRender: 'square',
  speakerOutreach: 'diamond',
  sponsorOutreach: 'diamond',
  eventPageUpdate: 'tag',
  checklist: 'tick',
}

/** Chip tone from the Task's state; `waiting` and `overdue` are computed. */
export type ChipTone =
  | 'complete'
  | 'waiting'
  | 'overdue'
  | 'active'
  | 'failed'
  | 'planned'
  | 'skipped'

export function chipTone(
  task: TaskView,
  waiting: boolean,
  today: string,
): ChipTone {
  if (task.complete) return 'complete'
  if (task.status === 'skipped') return 'skipped'
  if (task.status === 'failed') return 'failed'
  if (waiting) return 'waiting'
  if (task.status === 'awaiting-manual') return 'overdue'
  const ms = toMs(task.date)
  if (Number.isFinite(ms) && ms < toMs(today) - DAY / 2) return 'overdue'
  if (
    task.status === 'scheduled' ||
    task.status === 'publishing' ||
    task.status === 'open'
  ) {
    return task.kind === 'publishing' ? 'active' : 'planned'
  }
  return 'planned'
}
