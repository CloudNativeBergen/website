import { describe, it, expect } from 'vitest'
import type { PlanView, TaskView } from '@/lib/marketing/types'
import {
  campaignBand,
  chipAccessibleState,
  chipTone,
  gapPct,
  isWaiting,
  milestoneSettingsHref,
  packMilestones,
  focusWeeks,
  clusterByWeek,
  defaultExpanded,
  weekStartMs,
  WEEK_MS,
  laneHeight,
  MAX_CHIPS_PER_CELL,
  pct,
  timelineRange,
  toMs,
} from './timeline-model'

function task(overrides: Partial<TaskView>): TaskView {
  return {
    _id: 't',
    campaignId: 'c',
    key: 'k',
    title: 'T',
    kind: 'publishing',
    channel: 'linkedin',
    date: '2027-01-10T07:00:00.000Z',
    provisional: false,
    milestone: 'CFP_OPEN',
    status: 'draft',
    complete: false,
    prerequisiteIds: [],
    variantId: 'v',
    assigneeId: 'sp',
    approvedAt: null,
    ...overrides,
  }
}

const milestones = {
  CFP_OPEN: { date: '2027-01-10', provisional: false },
  CFP_CLOSE: { date: '2027-03-01', provisional: false },
  CFP_NOTIFY: { date: '2027-04-01', provisional: false },
  PROGRAM_PUBLISHED: { date: '2027-04-20', provisional: false },
  CONFERENCE_START: { date: '2027-06-10', provisional: false },
  CONFERENCE_END: { date: '2027-06-11', provisional: false },
  TICKETS_OPEN: { date: '2027-03-18', provisional: true },
  EARLY_BIRD_END: { date: '2027-04-20', provisional: true },
  REGISTRATION_CLOSE: { date: '2027-06-03', provisional: true },
  SPEAKERS_ANNOUNCED: { date: '2027-04-08', provisional: true },
  SPONSOR_DEADLINE: { date: '2027-04-29', provisional: true },
  RECORDINGS_LIVE: { date: '2027-06-25', provisional: true },
} as const

const view: PlanView = {
  viewerId: null,
  plan: {
    _id: 'p',
    ownerId: 'sp',
    ownerName: 'Ada',
    templateVersion: '2026.1',
    copiedFromTitle: null,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  campaigns: [
    {
      _id: 'c',
      key: 'cfp',
      title: 'CFP',
      startDate: '2027-01-10',
      endDate: '2027-03-02',
      provisional: false,
      startMilestone: 'CFP_OPEN',
      endMilestone: 'CFP_CLOSE',
      primaryOutcome: 'cfpSubmissions',
      target: null,
      optional: false,
    },
  ],
  tasks: [task({})],
  milestones,
  today: '2027-02-01',
  ceilingWarnings: [],
  organizers: [],
}

describe('timelineRange / pct', () => {
  it('spans the earliest and latest point with a week of padding', () => {
    const range = timelineRange(view)
    // The earliest point is the Task's 07:00 instant, not the calendar day.
    expect(range.start).toBe(toMs('2027-01-03T07:00:00.000Z'))
    expect(range.end).toBe(toMs('2027-07-02'))
  })

  it('places dates proportionally and clamps outside the axis', () => {
    const range = { start: toMs('2027-01-01'), end: toMs('2027-01-11') }
    expect(pct('2027-01-06', range)).toBe(50)
    expect(pct('2026-12-01', range)).toBe(0)
    expect(pct('2028-01-01', range)).toBe(100)
    expect(pct(null, range)).toBe(0)
  })

  it('falls back to a window around today for an empty plan', () => {
    const range = timelineRange({
      ...view,
      campaigns: [],
      tasks: [],
      milestones: {} as PlanView['milestones'],
    })
    expect(pct('2027-02-01', range)).toBe(50)
  })
})

describe('gapPct / campaignBand / chipAccessibleState', () => {
  it('converts a pixel footprint to a share of the measured board, never below the minimum width', () => {
    expect(gapPct(36, 960)).toBeCloseTo(3.75)
    expect(gapPct(36, 1920)).toBeCloseTo(1.875)
    expect(gapPct(36, 100)).toBeCloseTo(3.75)
  })

  it('stretches the band left to the earliest chip and never past the end', () => {
    const range = { start: toMs('2027-01-01'), end: toMs('2027-01-11') }
    const campaign = { startDate: '2027-01-06', endDate: '2027-01-09' }
    expect(campaignBand(campaign, [], range)).toEqual({ left: 50, width: 30 })
    const early = task({ date: '2027-01-04T12:00:00.000Z' })
    expect(campaignBand(campaign, [early], range)).toEqual({
      left: 30,
      width: 50,
    })
    const late = task({ date: '2027-01-10T12:00:00.000Z' })
    expect(campaignBand(campaign, [late], range).left).toBe(50)
  })

  it('names the chip state for assistive tech', () => {
    expect(
      chipAccessibleState(task({ provisional: true }), 'overdue', true),
    ).toEqual(['overdue', 'waiting on a prerequisite', 'provisional date'])
    expect(chipAccessibleState(task({}), 'planned', false)).toEqual([])
  })
})

describe('isWaiting', () => {
  const render = task({ _id: 'r', kind: 'studioRender', status: 'open' })
  const post = task({ _id: 'p', prerequisiteIds: ['r'] })

  it('waits while a Prerequisite is open', () => {
    const byId = new Map([[render._id, render]])
    expect(isWaiting(post, byId)).toBe(true)
  })

  it('stops waiting once the Prerequisite completes, or the Task itself did', () => {
    const byId = new Map([[render._id, { ...render, complete: true }]])
    expect(isWaiting(post, byId)).toBe(false)
    expect(
      isWaiting({ ...post, complete: true }, new Map([[render._id, render]])),
    ).toBe(false)
  })

  it('ignores a Prerequisite that no longer exists', () => {
    expect(isWaiting(post, new Map())).toBe(false)
  })
})

describe('chipTone', () => {
  it('ranks complete, skipped, failed, waiting, overdue, then state', () => {
    expect(chipTone(task({ complete: true }), true, '2027-02-01')).toBe(
      'complete',
    )
    expect(
      chipTone(
        task({ kind: 'checklist', status: 'skipped' }),
        false,
        '2027-02-01',
      ),
    ).toBe('skipped')
    expect(chipTone(task({ status: 'failed' }), true, '2027-02-01')).toBe(
      'failed',
    )
    expect(chipTone(task({}), true, '2027-02-01')).toBe('waiting')
    // Dated before today and not complete.
    expect(chipTone(task({}), false, '2027-02-01')).toBe('overdue')
    expect(
      chipTone(task({ status: 'awaiting-manual' }), false, '2026-01-01'),
    ).toBe('overdue')
    expect(chipTone(task({ status: 'scheduled' }), false, '2026-01-01')).toBe(
      'active',
    )
    expect(chipTone(task({}), false, '2026-01-01')).toBe('planned')
    expect(
      chipTone(
        task({ kind: 'checklist', status: 'open' }),
        false,
        '2026-01-01',
      ),
    ).toBe('planned')
  })
})

describe('milestoneSettingsHref', () => {
  it('sends TICKETS_OPEN to the ticket target editor and the rest to settings', () => {
    expect(milestoneSettingsHref('TICKETS_OPEN')).toBe('/admin/tickets')
    expect(milestoneSettingsHref('EARLY_BIRD_END')).toBe(
      '/admin/settings#schedule',
    )
    expect(milestoneSettingsHref(null)).toBe('/admin/settings#schedule')
  })
})

describe('packMilestones', () => {
  it('staggers Milestones that would overprint on the axis', () => {
    const range = { start: toMs('2027-01-01'), end: toMs('2027-04-11') }
    const { rowOf, rows } = packMilestones(
      {
        A: { date: '2027-01-11', provisional: false },
        B: { date: '2027-01-13', provisional: true },
        C: { date: '2027-03-01', provisional: false },
      },
      range,
    )
    expect(rowOf.get('A')).toBe(0)
    expect(rowOf.get('B')).toBe(1)
    expect(rowOf.get('C')).toBe(0)
    expect(rows).toBe(2)
  })
})

describe('focusWeeks', () => {
  it('starts weeks on Monday at midnight UTC, including Sunday instants', () => {
    expect(weekStartMs(toMs('2027-01-10'))).toBe(
      Date.parse('2027-01-04T00:00:00Z'),
    )
    expect(weekStartMs(toMs('2027-01-11'))).toBe(
      Date.parse('2027-01-11T00:00:00Z'),
    )
  })

  it('buckets an early-Monday instant by its Oslo week, not its UTC one', () => {
    // 00:30 Monday in Oslo is 23:30 the previous Sunday in UTC. Bucketing on
    // UTC calendar fields put the Task in the PREVIOUS week — and since the
    // fromToday and next8w axes drop weeks before today's, it disappeared from
    // the board rather than merely sitting one column to the left.
    const earlyMondayOslo = Date.parse('2027-01-10T23:30:00Z') // 00:30 Mon 11th
    expect(weekStartMs(earlyMondayOslo)).toBe(
      Date.parse('2027-01-11T00:00:00Z'),
    )

    const task = (id: string, date: string): TaskView =>
      ({ ...view.tasks[0], _id: id, date }) as TaskView
    const near = focusWeeks(
      { ...view, today: '2027-01-11', milestones: {} },
      [task('early', '2027-01-10T23:30:00Z')],
      'next8w',
    )
    expect(
      near.some((w) => w.start === Date.parse('2027-01-11T00:00:00Z')),
    ).toBe(true)
  })

  it('keeps campaign endpoints, milestones and today when task filters remove every task', () => {
    const weeks = focusWeeks({ ...view, milestones: {} }, [])
    expect(weeks.length).toBe(3)
    expect(weeks[0].start).toBe(weekStartMs(toMs('2027-01-10')))
    expect(weeks[1].start).toBe(weekStartMs(toMs(view.today)))
    expect(weeks[1].quietWeeksBefore).toBe(3)
    expect(weeks[2].start).toBe(weekStartMs(toMs('2027-03-02')))
    expect(weeks[2].quietWeeksBefore).toBe(3)
  })

  it('includes task and milestone weeks once and omits invalid dates', () => {
    const weeks = focusWeeks(
      { ...view, campaigns: [], milestones: { CFP_OPEN: milestones.CFP_OPEN } },
      [task({}), task({ date: null })],
    )
    expect(weeks.length).toBe(2)
    expect(weeks[0].quietWeeksBefore).toBe(0)
  })

  it('clips focus weeks with an independent axis window', () => {
    const all = focusWeeks(view, view.tasks)
    const future = focusWeeks(view, view.tasks, 'fromToday')
    const near = focusWeeks(view, view.tasks, 'next8w')
    expect(all.length).toBe(11)
    expect(future.length).toBe(10)
    expect(near.length).toBe(3)
    expect(near[0].start).toBe(weekStartMs(toMs(view.today)))
    expect(near[0].quietWeeksBefore).toBe(0)
  })
})

describe('clusterByWeek', () => {
  const daily = Array.from({ length: 30 }, (_, i) =>
    task({
      _id: `day-${i}`,
      date: new Date(Date.UTC(2027, 4, 3 + i)).toISOString(),
    }),
  )
  const weeks = Array.from({ length: 5 }, (_, i) => ({
    start: Date.UTC(2027, 4, 3 + i * 7),
    quietWeeksBefore: 0,
  }))

  it('bounds the expanded thirty-day countdown lane at 128 pixels while keeping every task reachable', () => {
    const cells = clusterByWeek(daily, weeks, MAX_CHIPS_PER_CELL)
    expect(laneHeight(cells)).toBe(128)
    expect(cells.size).toBe(5)
    expect(cells.get(weeks[0].start)?.shown.length).toBe(3)
    expect(cells.get(weeks[0].start)?.hidden.length).toBe(4)
    expect(
      [...cells.values()].reduce(
        (n, cell) => n + cell.shown.length + cell.hidden.length,
        0,
      ),
    ).toBe(30)
  })

  it('sorts chips by date and only places tasks in the supplied weeks', () => {
    const cells = clusterByWeek([...daily].reverse(), weeks.slice(0, 1), 2)
    expect(cells.size).toBe(1)
    expect(cells.get(weeks[0].start)?.shown.map((t) => t._id)).toEqual([
      'day-0',
      'day-1',
    ])
    expect(cells.get(weeks[0].start)?.hidden.length).toBe(5)
    expect(weeks[1].start - weeks[0].start).toBe(WEEK_MS)
  })
})

describe('defaultExpanded', () => {
  it('expands only campaigns overlapping today including both boundary days', () => {
    expect(defaultExpanded(view.campaigns, '2027-01-10').size).toBe(1)
    expect(defaultExpanded(view.campaigns, '2027-03-02').has('c')).toBe(true)
    expect(defaultExpanded(view.campaigns, '2027-03-03').size).toBe(0)
    expect(defaultExpanded(view.campaigns, '2027-01-09').size).toBe(0)
  })
})
