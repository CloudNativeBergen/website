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
  packRows,
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
  plan: {
    _id: 'p',
    ownerId: 'sp',
    ownerName: 'Ada',
    templateVersion: '2026.1',
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

describe('packRows', () => {
  it('keeps chips far apart on one row and stacks close ones', () => {
    const range = { start: toMs('2027-01-01'), end: toMs('2027-04-11') } // 100 d
    const tasks = [
      task({ _id: 'a', date: '2027-01-11' }),
      task({ _id: 'b', date: '2027-01-12' }), // 1 % later → stacks
      task({ _id: 'c', date: '2027-02-10' }), // far → row 0 again
      task({ _id: 'u', date: null }),
    ]
    const { rowOf, rows } = packRows(tasks, range)
    expect(rowOf.get('a')).toBe(0)
    expect(rowOf.get('b')).toBe(1)
    expect(rowOf.get('c')).toBe(0)
    expect(rowOf.has('u')).toBe(false)
    expect(rows).toBe(2)
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
