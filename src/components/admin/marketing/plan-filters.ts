import { addDaysToDate } from '@/lib/marketing/materialize'
import { osloLocalInputToIso } from '@/lib/time'
import {
  MARKETING_CHANNELS,
  TASK_KINDS,
  type MarketingChannel,
  type TaskKind,
  type TaskView,
} from '@/lib/marketing/types'
import { chipTone, isWaiting, STATUS_LABELS, toMs } from './timeline-model'

export interface PlanFilters {
  view: 'timeline' | 'list'
  sort: 'overdue' | 'date'
  status: TaskView['status'][]
  kind: TaskKind[]
  channel: MarketingChannel[]
  campaign: string[]
  assignee: string[]
  due: 'all' | 'overdue' | 'next14' | 'later'
  flag: 'any' | 'overdue' | 'waiting' | 'done'
  axis: 'plan' | 'fromToday' | 'next8w'
  /** null applies today's automatic expansion; [] explicitly collapses all. */
  expand: string[] | null
}

export const NO_FILTERS: PlanFilters = {
  view: 'timeline',
  sort: 'overdue',
  status: [],
  kind: [],
  channel: [],
  campaign: [],
  assignee: [],
  due: 'all',
  flag: 'any',
  axis: 'plan',
  expand: null,
}

function values(params: URLSearchParams, key: string): string[] {
  return [...new Set((params.get(key) ?? '').split(',').filter(Boolean))]
}
function known<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => allowed.some((a) => a === value))
}
function choice<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((a) => a === value) ?? fallback
}

export function parsePlanFilters(params: URLSearchParams): PlanFilters {
  return {
    view: choice(params.get('view'), ['timeline', 'list'], 'timeline'),
    sort: choice(params.get('sort'), ['overdue', 'date'], 'overdue'),
    status: known(
      values(params, 'status'),
      Object.keys(STATUS_LABELS) as TaskView['status'][],
    ),
    kind: known(values(params, 'kind'), TASK_KINDS),
    channel: known(values(params, 'channel'), MARKETING_CHANNELS),
    campaign: values(params, 'campaign'),
    assignee: values(params, 'assignee'),
    due: choice(
      params.get('due'),
      ['all', 'overdue', 'next14', 'later'],
      'all',
    ),
    flag: choice(
      params.get('flag'),
      ['any', 'overdue', 'waiting', 'done'],
      'any',
    ),
    axis: choice(params.get('axis'), ['plan', 'fromToday', 'next8w'], 'plan'),
    expand: params.has('expand') ? values(params, 'expand') : null,
  }
}

export function serializePlanFilters(filters: PlanFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of [
    'status',
    'kind',
    'channel',
    'campaign',
    'assignee',
  ] as const) {
    if (filters[key].length) params.set(key, filters[key].join(','))
  }
  for (const key of ['view', 'sort', 'due', 'flag', 'axis'] as const) {
    if (filters[key] !== NO_FILTERS[key]) params.set(key, filters[key])
  }
  if (filters.expand !== null) params.set('expand', filters.expand.join(','))
  return params
}

/** A view switch changes presentation without discarding the current filters. */
export function updatePlanFilters(
  filters: PlanFilters,
  patch: Partial<PlanFilters>,
): PlanFilters {
  return { ...filters, ...patch }
}

interface FilterContext {
  today: string
  byId: Map<string, TaskView>
  viewerId: string | null
}

export function filterTasks(
  tasks: readonly TaskView[],
  filters: PlanFilters,
  ctx: FilterContext,
): TaskView[] {
  const dayStart = toMs(osloLocalInputToIso(`${ctx.today}T00:00`))
  const endNext14 = toMs(
    osloLocalInputToIso(`${addDaysToDate(ctx.today, 14)}T00:00`),
  )
  return tasks.filter((task) => {
    if (filters.status.length && !filters.status.includes(task.status))
      return false
    if (filters.kind.length && !filters.kind.includes(task.kind)) return false
    if (
      filters.channel.length &&
      (!task.channel || !filters.channel.includes(task.channel))
    )
      return false
    if (filters.campaign.length && !filters.campaign.includes(task.campaignId))
      return false
    if (
      filters.assignee.length &&
      !filters.assignee.some((id) =>
        id === 'me'
          ? ctx.viewerId !== null && task.assigneeId === ctx.viewerId
          : task.assigneeId === id,
      )
    )
      return false
    const waiting = isWaiting(task, ctx.byId)
    const overdue = chipTone(task, waiting, ctx.today) === 'overdue'
    if (filters.flag === 'overdue' && !overdue) return false
    if (filters.flag === 'waiting' && !waiting) return false
    if (filters.flag === 'done' && !task.complete) return false
    if (filters.due === 'overdue' && !overdue) return false
    const date = toMs(task.date)
    if (filters.due === 'next14' && !(date >= dayStart && date < endNext14))
      return false
    if (filters.due === 'later' && !(date >= endNext14)) return false
    return true
  })
}

export function sortTasks(
  tasks: readonly TaskView[],
  today: string,
  byId: Map<string, TaskView>,
  order: PlanFilters['sort'] = 'overdue',
): TaskView[] {
  const overdue = (task: TaskView) =>
    chipTone(task, isWaiting(task, byId), today) === 'overdue'
  const date = (task: TaskView) =>
    Number.isFinite(toMs(task.date)) ? toMs(task.date) : Infinity
  return [...tasks].sort(
    (a, b) =>
      (order === 'overdue' ? Number(overdue(b)) - Number(overdue(a)) : 0) ||
      date(a) - date(b),
  )
}

export function summarizeTaskFlags(
  tasks: readonly TaskView[],
  ctx: FilterContext,
) {
  return {
    overdue: tasks.filter(
      (task) =>
        chipTone(task, isWaiting(task, ctx.byId), ctx.today) === 'overdue',
    ).length,
    waiting: tasks.filter((task) => isWaiting(task, ctx.byId)).length,
    done: tasks.filter((task) => task.complete).length,
  }
}

/** Cards show plan-wide counts, so their action clears conflicting task filters. */
/**
 * Clicking a stat card TOGGLES its flag.
 *
 * Applying it unconditionally left a card showing `aria-pressed="true"` that
 * could not be un-pressed by any means — and because the URL is written with
 * `router.replace`, the back button was not an escape either. Clicking the
 * pressed card now returns to `'any'` and to the timeline the organizer came
 * from.
 *
 * The other filters are still cleared, because a card states a count over the
 * WHOLE plan: leaving a Kind or Channel filter in place would show a list that
 * does not add up to the number just clicked.
 */
/**
 * Drop ids the plan no longer contains.
 *
 * `campaign` and `assignee` cannot be validated when the URL is parsed — the
 * parser has no plan to check against — so a bookmarked link, a deleted
 * Campaign or a departed organizer leaves a filter that matches nothing and
 * has no checkbox to clear: the list is empty and the reason is invisible.
 * Reconciling once the plan has loaded keeps the URL honest. `'me'` is a
 * reserved assignee value and always survives.
 */
/** Whether anything is actually narrowing the Task set. */
export function hasActivePlanFilters(filters: PlanFilters): boolean {
  return (
    filters.status.length > 0 ||
    filters.kind.length > 0 ||
    filters.channel.length > 0 ||
    filters.campaign.length > 0 ||
    filters.assignee.length > 0 ||
    filters.due !== 'all' ||
    filters.flag !== 'any'
  )
}

export function reconcilePlanFilters(
  filters: PlanFilters,
  view: { campaigns: { _id: string }[]; organizers: { _id: string }[] },
): PlanFilters {
  const campaigns = new Set(view.campaigns.map((c) => c._id))
  const organizers = new Set(view.organizers.map((o) => o._id))
  const campaign = filters.campaign.filter((id) => campaigns.has(id))
  const assignee = filters.assignee.filter(
    (id) => id === 'me' || organizers.has(id),
  )
  const expand =
    filters.expand === null
      ? null
      : filters.expand.filter((id) => campaigns.has(id))
  const same =
    campaign.length === filters.campaign.length &&
    assignee.length === filters.assignee.length &&
    (expand === null || expand.length === filters.expand!.length)
  return same ? filters : { ...filters, campaign, assignee, expand }
}

export function selectPlanFlag(
  filters: PlanFilters,
  flag: PlanFilters['flag'],
): PlanFilters {
  const pressed = filters.flag === flag
  return {
    ...NO_FILTERS,
    axis: filters.axis,
    expand: filters.expand,
    view: pressed ? 'timeline' : 'list',
    flag: pressed ? 'any' : flag,
  }
}
