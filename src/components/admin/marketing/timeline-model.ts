/**
 * Pure layout for the Marketing Plan timeline (spec §7): the axis range,
 * where a date sits on it, how chips stack inside a lane, what a Kind looks
 * like, and which chips are waiting on an open Prerequisite.
 */

import type { Milestone, ResolvedMilestone } from '@/lib/marketing/milestones'
import type { PlanView, TaskKind, TaskView } from '@/lib/marketing/types'
import { osloLocalInputToIso, osloTodayDateString } from '@/lib/time'

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
export function timelineRange(
  view: Pick<PlanView, 'campaigns' | 'tasks' | 'today'> & {
    milestones: Partial<PlanView['milestones']>
  },
): TimelineRange {
  const points: number[] = []
  for (const c of view.campaigns)
    points.push(toMs(c.startDate), toMs(c.endDate))
  for (const t of view.tasks) points.push(toMs(t.date))
  for (const m of Object.values(view.milestones)) points.push(toMs(m?.date))
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

/**
 * A chip is 22 px plus the badges that hang off its corners; a Milestone
 * label is up to ~130 px of text. Both are converted to a percentage of the
 * MEASURED board width, so packing stays correct at any zoom or viewport.
 */
export const MILESTONE_LABEL_PX = 136
/** The board never renders narrower than this (`min-w-[960px]`). */
export const MIN_BOARD_WIDTH_PX = 960

export function gapPct(px: number, boardWidthPx: number): number {
  return (px / Math.max(boardWidthPx, MIN_BOARD_WIDTH_PX)) * 100
}

/** Axis label rows so neighbouring Milestones never overprint. */
export function packMilestones(
  milestones: Record<string, ResolvedMilestone | undefined>,
  range: TimelineRange,
  boardWidthPx = MIN_BOARD_WIDTH_PX,
): { rowOf: Map<string, number>; rows: number } {
  return packByX(
    Object.entries(milestones)
      .filter((e): e is [string, ResolvedMilestone] => e[1] !== undefined)
      .map(([id, m]) => ({ id, x: pct(m.date, range) })),
    gapPct(MILESTONE_LABEL_PX, boardWidthPx),
  )
}

/**
 * The band a Campaign draws: its materialized window, stretched left to its
 * earliest chip so a render dated two days before the opening beat is never
 * drawn outside its own swimlane.
 */
export function campaignBand(
  campaign: { startDate: string; endDate: string },
  tasks: readonly TaskView[],
  range: TimelineRange,
): { left: number; width: number } {
  const dated = tasks
    .map((t) => toMs(t.date))
    .filter((ms) => Number.isFinite(ms))
  const startMs = toMs(campaign.startDate)
  const earliest = Math.min(
    Number.isFinite(startMs) ? startMs : Infinity,
    ...dated,
  )
  const left = Number.isFinite(earliest)
    ? pct(new Date(earliest).toISOString(), range)
    : pct(campaign.startDate, range)
  const right = Math.max(pct(campaign.endDate, range), left)
  return { left, width: Math.max(0.5, right - left) }
}

/** The accessible name of a chip: what it is, when, and what state it is in. */
export function chipAccessibleState(
  task: TaskView,
  tone: ChipTone,
  waiting: boolean,
): string[] {
  const parts: string[] = []
  if (tone === 'overdue') parts.push('overdue')
  if (tone === 'failed') parts.push('failed')
  if (tone === 'complete') parts.push('complete')
  if (tone === 'skipped') parts.push('skipped')
  if (waiting) parts.push('waiting on a prerequisite')
  if (task.provisional) parts.push('provisional date')
  return parts
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
  // OSLO midnight, not UTC midnight. `toMs` resolves a bare date to NOON, so
  // `toMs(today) - DAY / 2` was meant to be "the start of today" and landed on
  // 00:00 UTC — an hour early in winter, two in summer. A Task due in that gap
  // is "today" to the plan filters, which use the Oslo boundary, and was
  // "overdue" here: the same Task appeared under both "Next 14 days" and
  // "Overdue".
  const dayStart = toMs(osloLocalInputToIso(`${today}T00:00`) ?? '')
  if (Number.isFinite(ms) && Number.isFinite(dayStart) && ms < dayStart)
    return 'overdue'
  if (
    task.status === 'scheduled' ||
    task.status === 'publishing' ||
    // `submitted` is in flight exactly as `publishing` is (#1128): the post
    // is with the vendor and the plan still has it under way.
    task.status === 'submitted' ||
    task.status === 'open'
  ) {
    return task.kind === 'publishing' ? 'active' : 'planned'
  }
  return 'planned'
}

export const STATUS_LABELS: Record<TaskView['status'], string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  submitted: 'With the publisher',
  'awaiting-manual': 'Post by hand',
  published: 'Published',
  failed: 'Failed',
  open: 'Open',
  done: 'Done',
  skipped: 'Skipped',
}

export const WEEK_MS = 7 * DAY
export const MAX_CHIPS_PER_CELL = 3
export interface FocusWeek {
  start: number
  quietWeeksBefore: number
}
export interface WeekCluster {
  shown: TaskView[]
  hidden: TaskView[]
}

/**
 * Monday at midnight UTC of the **Oslo** calendar week an instant falls in.
 *
 * The Oslo date, not the UTC one. A Task scheduled 00:30 on a Monday in Oslo
 * is 22:30 the previous Sunday in UTC, so bucketing on UTC calendar fields put
 * it in the PREVIOUS week — and because the `fromToday` and `next8w` axes drop
 * weeks before today's, the Task then vanished from the board entirely rather
 * than merely sitting a column to the left.
 */
export function weekStartMs(ms: number): number {
  if (!Number.isFinite(ms)) return NaN
  // The Oslo calendar day, re-parsed at midday so the week arithmetic below
  // cannot be dragged across a boundary by an offset or a DST shift.
  const date = new Date(toMs(osloTodayDateString(new Date(ms))))
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
  )
}

/** A week bucket as an ISO instant, for the date formatters. */
export function weekStartIso(weekStart: number): string {
  return new Date(weekStart).toISOString()
}

/** Keep weeks with work or plan landmarks; collapse quiet stretches. */
export function focusWeeks(
  view: Pick<PlanView, 'campaigns' | 'today'> & {
    milestones: Partial<PlanView['milestones']>
  },
  filtered: readonly TaskView[],
  axis: 'plan' | 'fromToday' | 'next8w' = 'plan',
): FocusWeek[] {
  const today = weekStartMs(toMs(view.today))
  const points = [
    toMs(view.today),
    ...filtered.map((t) => toMs(t.date)),
    ...view.campaigns.flatMap((c) => [toMs(c.startDate), toMs(c.endDate)]),
    ...Object.values(view.milestones).map((m) => toMs(m?.date)),
  ]
  const weeks = [...new Set(points.filter(Number.isFinite).map(weekStartMs))]
    .filter(
      (w) =>
        axis === 'plan' ||
        (w >= today && (axis === 'fromToday' || w < today + 8 * WEEK_MS)),
    )
    .sort((a, b) => a - b)
  return weeks.map((start, i) => ({
    start,
    quietWeeksBefore: i === 0 ? 0 : (start - weeks[i - 1]) / WEEK_MS - 1,
  }))
}

/**
 * How many of the filtered Tasks actually fall inside the drawn weeks.
 *
 * `today` is always an axis point, so a narrowed axis never draws an EMPTY
 * board — it draws one column with nothing in it, while the filter bar still
 * says "Showing 94 of 94 tasks". Zero here is the signal that the window, not
 * the filters, is why there is nothing to see.
 */
export function tasksInAxisWindow(
  view: Parameters<typeof focusWeeks>[0],
  filtered: readonly TaskView[],
  axis: 'plan' | 'fromToday' | 'next8w',
): number {
  const drawn = new Set(focusWeeks(view, filtered, axis).map((w) => w.start))
  return filtered.filter((task) => drawn.has(weekStartMs(toMs(task.date))))
    .length
}

/**
 * Fixed chip budget per week; overflow remains reachable in a popover.
 *
 * WHICH chips get the budget follows the caller's order, so the Sort control
 * decides what survives a crowded week. Re-sorting chronologically first threw
 * that away and made the control a no-op on this view: a week holding three
 * finished Tasks and one overdue one showed the three finished ones and hid
 * the overdue one behind "+1", under "Overdue first".
 *
 * What is DRAWN is still chronological, because chips in a week read
 * left-to-right by date. Only the selection is by priority.
 */
export function clusterByWeek(
  tasks: readonly TaskView[],
  weeks: readonly FocusWeek[],
  maxPerCell: number,
): Map<number, WeekCluster> {
  const result = new Map<number, WeekCluster>(
    weeks.map((w) => [w.start, { shown: [], hidden: [] }]),
  )
  const cap = Math.max(0, Math.floor(maxPerCell))
  for (const task of tasks) {
    const cell = result.get(weekStartMs(toMs(task.date)))
    if (!cell) continue
    if (cell.shown.length < cap) cell.shown.push(task)
    else cell.hidden.push(task)
  }
  const chronological = (a: TaskView, b: TaskView) =>
    toMs(a.date) - toMs(b.date) || a._id.localeCompare(b._id)
  for (const cell of result.values()) {
    cell.shown.sort(chronological)
    cell.hidden.sort(chronological)
  }
  return result
}

/**
 * The span a rendered column actually covers.
 *
 * A GAP column is built by spreading the focus week that follows it, so it
 * carries that week's `start` — testing a Campaign band with `start` alone made
 * the gap inherit the following week's membership, and the band reached back
 * across the very quiet weeks the gap collapses, starting visually before the
 * Campaign did. The gap covers `quietWeeksBefore` weeks ENDING where the focus
 * week begins.
 */
export function columnSpan(column: {
  kind: 'gap' | 'week'
  start: number
  quietWeeksBefore: number
}): { from: number; to: number } {
  return column.kind === 'gap'
    ? {
        from: column.start - column.quietWeeksBefore * WEEK_MS,
        to: column.start,
      }
    : { from: column.start, to: column.start + WEEK_MS }
}

/** Whether a Campaign's window overlaps the span a column draws. */
export function columnInBand(
  column: Parameters<typeof columnSpan>[0],
  campaign: { startDate: string; endDate: string },
): boolean {
  const { from, to } = columnSpan(column)
  return from <= toMs(campaign.endDate) && to > toMs(campaign.startDate)
}

/** Used directly by the rendered lane; includes the overflow control row. */
export function laneHeight(cells: Map<number, WeekCluster>): number {
  const rows = Math.max(
    1,
    ...[...cells.values()].map(
      (c) => c.shown.length + Number(c.hidden.length > 0),
    ),
  )
  return 24 + rows * 26
}

export function defaultExpanded(
  campaigns: PlanView['campaigns'],
  today: string,
): Set<string> {
  const now = toMs(today)
  return new Set(
    campaigns
      .filter((c) => toMs(c.startDate) <= now && now <= toMs(c.endDate))
      .map((c) => c._id),
  )
}
