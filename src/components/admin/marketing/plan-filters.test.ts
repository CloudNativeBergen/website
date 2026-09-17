import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/lib/marketing/types'
import { chipTone, isWaiting, STATUS_LABELS } from './timeline-model'
import {
  filterTasks,
  NO_FILTERS,
  parsePlanFilters,
  serializePlanFilters,
  sortTasks,
  summarizeTaskFlags,
  selectPlanFlag,
  reconcilePlanFilters,
  hasActivePlanFilters,
  updatePlanFilters,
} from './plan-filters'

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    _id: 'task',
    campaignId: 'campaign',
    key: 'task',
    title: 'Task',
    kind: 'publishing',
    channel: 'bluesky',
    date: '2027-01-11T07:00:00Z',
    provisional: false,
    milestone: null,
    status: 'draft',
    complete: false,
    prerequisiteIds: [],
    variantId: null,
    assigneeId: 'viewer',
    approvedAt: null,
    ...overrides,
  }
}
const today = '2027-01-10'
function context(tasks: TaskView[]) {
  return {
    today,
    viewerId: 'viewer',
    byId: new Map(tasks.map((t) => [t._id, t])),
  }
}

describe('plan filter URLs', () => {
  it('Omits defaults and restores the complete default state.', () => {
    expect(serializePlanFilters(NO_FILTERS).toString()).toBe('')
    expect(parsePlanFilters(new URLSearchParams())).toEqual(NO_FILTERS)
  })
  it('Keeps all nine known statuses and drops unknown enum values.', () => {
    const parsed = parsePlanFilters(
      new URLSearchParams(
        'status=draft,scheduled,publishing,awaiting-manual,published,failed,open,done,skipped,bogus&kind=publishing,bogus&channel=bluesky,bogus&due=bad&view=bad&flag=bad&axis=bad',
      ),
    )
    expect(parsed.status.length).toBe(9)
    expect(parsed.status).toEqual(Object.keys(STATUS_LABELS))
    expect(parsed.kind).toEqual(['publishing'])
    expect(parsed.channel).toEqual(['bluesky'])
    expect(parsed.due).toBe('all')
    expect(parsed.view).toBe('timeline')
    expect(parsed.flag).toBe('any')
    expect(parsed.axis).toBe('plan')
  })
  it('Round trips multi-value filters and independent axis and expansion state.', () => {
    const filters = {
      ...NO_FILTERS,
      view: 'list' as const,
      status: ['open', 'draft'] as TaskView['status'][],
      campaign: ['one', 'two'],
      assignee: ['me', 'other'],
      due: 'next14' as const,
      flag: 'waiting' as const,
      axis: 'next8w' as const,
      expand: ['one'],
    }
    expect(parsePlanFilters(serializePlanFilters(filters))).toEqual(filters)
    expect(serializePlanFilters(filters).get('campaign')).toBe('one,two')
  })
  it('Distinguishes automatic expansion from explicitly collapsed campaigns.', () => {
    expect(parsePlanFilters(new URLSearchParams()).expand).toBe(null)
    expect(parsePlanFilters(new URLSearchParams('expand=')).expand).toEqual([])
    expect(
      serializePlanFilters({ ...NO_FILTERS, expand: [] }).has('expand'),
    ).toBe(true)
  })
  it('Preserves every filter across a view switch and its URL round trip.', () => {
    const filters = parsePlanFilters(
      new URLSearchParams(
        'status=draft&kind=publishing&channel=bluesky&campaign=one&assignee=me&due=next14&flag=waiting&axis=fromToday&expand=one',
      ),
    )
    const switched = updatePlanFilters(filters, { view: 'list' })
    expect(parsePlanFilters(serializePlanFilters(switched))).toEqual({
      ...filters,
      view: 'list',
    })
    expect(updatePlanFilters(switched, { view: 'timeline' })).toEqual(filters)
  })
})

describe('task filtering', () => {
  it('Combines dimensions with AND while accepting any selection within each dimension.', () => {
    const tasks = [
      task(),
      task({ _id: 'other', campaignId: 'other' }),
      task({ _id: 'kind', kind: 'checklist' }),
    ]
    const filters = {
      ...NO_FILTERS,
      status: ['draft'] as TaskView['status'][],
      kind: ['publishing'] as const,
      channel: ['bluesky'] as const,
      campaign: ['campaign'],
      assignee: ['me'],
    }
    expect(
      filterTasks(
        tasks,
        { ...filters, kind: [...filters.kind], channel: [...filters.channel] },
        context(tasks),
      ).map((t) => t._id),
    ).toEqual(['task'])
  })
  it('Resolves mine without treating unassigned tasks as the signed-out viewer.', () => {
    const tasks = [
      task(),
      task({ _id: 'unassigned', assigneeId: null }),
      task({ _id: 'other', assigneeId: 'other' }),
    ]
    expect(
      filterTasks(
        tasks,
        { ...NO_FILTERS, assignee: ['me', 'other'] },
        context(tasks),
      ).length,
    ).toBe(2)
    expect(
      filterTasks(
        tasks,
        { ...NO_FILTERS, assignee: ['me'] },
        { ...context(tasks), viewerId: null },
      ).length,
    ).toBe(0)
  })
  it('Splits due windows at Oslo midnight and excludes undated tasks from dated windows.', () => {
    const tasks = [
      task({ _id: 'today', date: '2027-01-09T23:30:00Z' }),
      task({ _id: 'last', date: '2027-01-23T22:59:59Z' }),
      task({ _id: 'later', date: '2027-01-23T23:30:00Z' }),
      task({ _id: 'none', date: null }),
    ]
    expect(
      filterTasks(tasks, { ...NO_FILTERS, due: 'next14' }, context(tasks)).map(
        (t) => t._id,
      ),
    ).toEqual(['today', 'last'])
    expect(
      filterTasks(tasks, { ...NO_FILTERS, due: 'later' }, context(tasks)).map(
        (t) => t._id,
      ),
    ).toEqual(['later'])
  })
  it('Keeps fourteen Oslo calendar days across the spring daylight saving transition.', () => {
    const tasks = [
      task({ _id: 'before', date: '2027-03-19T22:59:59Z' }),
      task({ _id: 'today', date: '2027-03-19T23:00:00Z' }),
      task({ _id: 'last', date: '2027-04-02T21:59:59Z' }),
      task({ _id: 'later', date: '2027-04-02T22:00:00Z' }),
    ]
    const ctx = { ...context(tasks), today: '2027-03-20' }
    expect(
      filterTasks(tasks, { ...NO_FILTERS, due: 'next14' }, ctx).map(
        (t) => t._id,
      ),
    ).toEqual(['today', 'last'])
    expect(
      filterTasks(tasks, { ...NO_FILTERS, due: 'later' }, ctx).map(
        (t) => t._id,
      ),
    ).toEqual(['later'])
  })
  it('Makes each stat-card predicate select exactly the rows counted by that card.', () => {
    const tasks = [
      task({ _id: 'late', date: '2027-01-01T00:00:00Z' }),
      task({
        _id: 'waiting',
        date: '2027-01-01T00:00:00Z',
        prerequisiteIds: ['late'],
      }),
      task({
        _id: 'render',
        kind: 'studioRender',
        status: 'open',
        complete: true,
      }),
      task({ _id: 'manual', status: 'awaiting-manual', date: null }),
      task({ _id: 'failed', status: 'failed', date: '2027-01-01T00:00:00Z' }),
    ]
    const ctx = context(tasks)
    const counts = {
      overdue: tasks.filter(
        (t) => chipTone(t, isWaiting(t, ctx.byId), today) === 'overdue',
      ).length,
      waiting: tasks.filter((t) => isWaiting(t, ctx.byId)).length,
      done: tasks.filter((t) => t.complete).length,
    }
    expect(counts.overdue).toBe(2)
    expect(counts.waiting).toBe(1)
    expect(counts.done).toBe(1)
    expect(summarizeTaskFlags(tasks, ctx)).toEqual(counts)
    const prior = {
      ...NO_FILTERS,
      campaign: ['missing'],
      status: ['skipped'] as TaskView['status'][],
      axis: 'next8w' as const,
      expand: [],
    }
    for (const flag of ['overdue', 'waiting', 'done'] as const) {
      const selected = selectPlanFlag(prior, flag)
      expect(filterTasks(tasks, selected, ctx).length).toBe(counts[flag])
      expect(selected.view).toBe('list')
      expect(selected.axis).toBe('next8w')
      expect(selected.expand).toEqual([])
    }
    expect(
      filterTasks(tasks, { ...NO_FILTERS, due: 'overdue' }, ctx).length,
    ).toBe(2)
  })
})

describe('task sorting', () => {
  it('Places overdue tasks first even when waiting or completed tasks have earlier dates.', () => {
    const tasks = [
      task({ _id: 'done', date: '2027-01-01T00:00:00Z', complete: true }),
      task({
        _id: 'waiting',
        date: '2027-01-02T00:00:00Z',
        prerequisiteIds: ['late'],
      }),
      task({ _id: 'late', date: '2027-01-09T00:00:00Z' }),
      task({ _id: 'manual', date: null, status: 'awaiting-manual' }),
    ]
    expect(
      sortTasks(tasks, today, context(tasks).byId).map((t) => t._id),
    ).toEqual(['late', 'manual', 'done', 'waiting'])
    expect(tasks[0]._id).toBe('done')
  })
  it('Sorts each urgency group by due date and places undated tasks last.', () => {
    const tasks = [
      task({ _id: 'none', date: null }),
      task({ _id: 'later', date: '2027-02-01T00:00:00Z' }),
      task({ _id: 'soon' }),
    ]
    expect(
      sortTasks(tasks, today, context(tasks).byId).map((t) => t._id),
    ).toEqual(['soon', 'later', 'none'])
  })
})

describe('task sort selection', () => {
  it('Persists chronological sorting and discards an unknown sort choice.', () => {
    const filters = parsePlanFilters(new URLSearchParams('sort=date'))
    expect(filters.sort).toBe('date')
    expect(serializePlanFilters(filters).get('sort')).toBe('date')
    expect(parsePlanFilters(new URLSearchParams('sort=unknown')).sort).toBe(
      'overdue',
    )
    expect(serializePlanFilters(NO_FILTERS).has('sort')).toBe(false)
  })
  it('Orders by date without urgency grouping when chronological sorting is selected.', () => {
    const tasks = [
      task({ _id: 'late', date: '2027-01-09T00:00:00Z' }),
      task({ _id: 'none', date: null }),
      task({ _id: 'complete', date: '2027-01-01T00:00:00Z', complete: true }),
    ]
    expect(
      sortTasks(tasks, today, context(tasks).byId, 'date').map((t) => t._id),
    ).toEqual(['complete', 'late', 'none'])
  })
})

describe('stat card selection', () => {
  it('toggles its flag off, returning to the timeline it came from', () => {
    // Applying the flag unconditionally left a card showing aria-pressed=true
    // that nothing could un-press — and router.replace means the back button
    // is not an escape either.
    const pressed = selectPlanFlag(NO_FILTERS, 'overdue')
    expect(pressed.flag).toBe('overdue')
    expect(pressed.view).toBe('list')
    const released = selectPlanFlag(pressed, 'overdue')
    expect(released.flag).toBe('any')
    expect(released.view).toBe('timeline')
    // A different card switches rather than clearing.
    expect(selectPlanFlag(pressed, 'waiting').flag).toBe('waiting')
  })
})

describe('reconciling a stale URL against the loaded plan', () => {
  const view = {
    campaigns: [{ _id: 'camp-live' }],
    organizers: [{ _id: 'sp-1' }],
  }
  it('drops a Campaign and an assignee the plan no longer has, keeping "me"', () => {
    const stale = {
      ...NO_FILTERS,
      campaign: ['camp-live', 'camp-deleted'],
      assignee: ['me', 'sp-1', 'sp-gone'],
      expand: ['camp-live', 'camp-deleted'],
    }
    const clean = reconcilePlanFilters(stale, view)
    expect(clean.campaign).toEqual(['camp-live'])
    expect(clean.assignee).toEqual(['me', 'sp-1'])
    expect(clean.expand).toEqual(['camp-live'])
  })
  it('returns the same object when nothing needed dropping', () => {
    const clean = { ...NO_FILTERS, campaign: ['camp-live'] }
    expect(reconcilePlanFilters(clean, view)).toBe(clean)
  })
})

describe('active filter detection', () => {
  it('is false for an untouched plan and true for anything that narrows it', () => {
    expect(hasActivePlanFilters(NO_FILTERS)).toBe(false)
    // View, sort, axis and expansion change what you SEE, not which Tasks
    // qualify, so they must not make an empty plan look filtered.
    expect(
      hasActivePlanFilters({
        ...NO_FILTERS,
        view: 'list',
        sort: 'date',
        axis: 'next8w',
        expand: ['c'],
      }),
    ).toBe(false)
    // EVERY narrowing dimension, not a sample: dropping `status`, `campaign`
    // or `assignee` from the predicate left the suite green, which is exactly
    // the "Clear all filters on an unfiltered plan" bug this guards.
    expect(hasActivePlanFilters({ ...NO_FILTERS, flag: 'overdue' })).toBe(true)
    expect(hasActivePlanFilters({ ...NO_FILTERS, due: 'next14' })).toBe(true)
    expect(hasActivePlanFilters({ ...NO_FILTERS, kind: ['checklist'] })).toBe(
      true,
    )
    expect(hasActivePlanFilters({ ...NO_FILTERS, status: ['draft'] })).toBe(
      true,
    )
    expect(hasActivePlanFilters({ ...NO_FILTERS, channel: ['bluesky'] })).toBe(
      true,
    )
    expect(hasActivePlanFilters({ ...NO_FILTERS, campaign: ['c1'] })).toBe(true)
    expect(hasActivePlanFilters({ ...NO_FILTERS, assignee: ['me'] })).toBe(true)
  })
})
