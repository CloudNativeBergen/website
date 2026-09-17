import type { ReportSnapshot } from './types'
import { describe, expect, it } from 'vitest'
import { exportFixture } from './__tests__/export-fixture'
import { buildReport, comparisonReason, reportRange } from './model'
import { foldGrain, lastObservation } from './grain'

const fixture = exportFixture()
const base = fixture.snapshots[0]
const old = {
  ...base,
  campaignKey: 'cfp',
  campaignTitle: 'Original CFP',
  campaignPrimaryOutcome: 'cfpSubmissions' as const,
  campaignTarget: 250,
  campaignStartDate: '2026-06-01',
  campaignEndDate: '2026-06-30',
}
const current = {
  ...old,
  _id: 'new-snapshot',
  campaign: { ...old.campaign, _ref: 'new-campaign' },
  takenAt: '2026-06-17T05:00:00Z',
  primaryOutcomeValue: 150,
}
const report = (snapshots: ReportSnapshot[] = [old], live = true) =>
  buildReport({
    conference: fixture.conference,
    plan: live
      ? {
          plan: fixture.plan!,
          campaigns: [{ ...fixture.campaigns[0], _id: 'new-campaign' }],
          tasks: [],
        }
      : null,
    snapshots,
    range: fixture.range,
    today: '2026-06-17',
  })

describe('preserved report history', () => {
  it('emits ONE weekly point when a window changes and changes back inside a week', () => {
    // Mon 2026-06-15 … Sun 2026-06-21. The organizer widens the window on the
    // 17th and reverts it on the 19th. Segmenting by basis before bucketing
    // produced one point per segment — three values on the same week.
    const day = (
      date: string,
      value: number,
      endDate = '2026-06-30',
    ): ReportSnapshot => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      campaignEndDate: endDate,
      primaryOutcomeValue: value,
    })
    const week = [
      day('2026-06-15', 10),
      day('2026-06-16', 20),
      day('2026-06-17', 30, '2026-07-15'),
      day('2026-06-18', 40, '2026-07-15'),
      day('2026-06-19', 50),
      day('2026-06-20', 60),
    ]
    const weekly = foldGrain(week, 'weekly')
    expect(weekly).toHaveLength(1)
    expect(weekly[0].primaryOutcomeValue).toBe(60)
    expect(weekly[0].campaignEndDate).toBe('2026-06-30')
    // Daily grain is untouched: every reading is still its own point.
    expect(foldGrain(week, 'daily')).toHaveLength(6)
  })

  it('joins reseeded keys and selects only the newest reading per day', () => {
    expect(report([old]).summary[0].value).toBe(137)
    expect(report([old, current]).summary[0].value).toBe(150)
    expect(
      lastObservation([old, { ...current, primaryOutcomeValue: null }])
        ?.primaryOutcomeValue,
    ).toBe(null)
    expect(
      foldGrain([old, current], 'daily').map((s) => s.primaryOutcomeValue),
    ).toEqual([150])
    expect(
      foldGrain([old, current], 'weekly').map((s) => s.primaryOutcomeValue),
    ).toEqual([150])
  })
  it('retains retired values in the breakdown while live aggregates stay empty', () => {
    const result = report([old], false)
    expect(result.breakdown).toMatchObject([
      {
        title: 'Original CFP',
        retired: true,
        value: 137,
        primaryOutcome: 'cfpSubmissions',
      },
    ])
    expect([
      result.summary.length,
      result.timeline.length,
      result.topTasks.length,
    ]).toEqual([0, 0, 0])
  })
  it('does not carry values across a metric change and labels separate series', () => {
    const changed = {
      ...current,
      date: '2026-06-17',
      campaignPrimaryOutcome: 'ticketsSoldInWindow' as const,
      primaryOutcomeValue: null,
    }
    expect(lastObservation([old, changed])?.primaryOutcomeValue).toBe(null)
    expect(
      report([old, changed]).timeline.map((s) => [
        s.outcome,
        s.metricChanged,
        s.points[0].value,
      ]),
    ).toEqual([
      ['cfpSubmissions', false, 137],
      ['ticketsSoldInWindow', true, null],
    ])
  })
  it('shows the Target the organizer set today, not the one the last Snapshot was taken against', () => {
    // A target is a GOAL, not a property of a past reading: raising it must
    // show immediately rather than waiting for tonight's snapshot. The window
    // and the outcome are the opposite — they describe what the number
    // measured — which is why only `target` follows the live Campaign.
    const raised = { ...fixture.campaigns[0], target: 400 }
    const result = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: [raised], tasks: [] },
      snapshots: [old],
      range: fixture.range,
      today: '2026-07-01',
    })
    expect(result.summary[0].target).toBe(400)
    expect(result.summary[0].value).toBe(137)
    expect(result.summary[0].startDate).toBe('2026-06-01')
  })
  it('compares the measured window after a live window edit, not the replacement window', () => {
    const campaign = { ...fixture.campaigns[0], startDate: '2026-05-01' }
    const result = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: [campaign], tasks: [] },
      snapshots: [old],
      range: fixture.range,
      today: '2026-07-01',
    })
    expect(result.summary[0]).toMatchObject({
      value: 137,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })
    expect(
      comparisonReason(
        result.summary[0],
        {
          ...campaign,
          startDate: '2025-05-01',
          endDate: '2025-06-30',
        },
        '2026-09-01',
        '2025-09-01',
      ),
    ).toBe('Different Campaign windows relative to conference start')
    // The timeline remains a view of today's plan; its band is explicitly
    // documented as current, separate from the window used for comparison.
    expect(result.campaigns[0].startDate).toBe('2026-05-01')
  })
  it('folds reused Task keys into one row with the current document link', () => {
    const first = {
      ...old,
      perTask: [{ ...old.perTask[0], taskKey: 'launch' }],
    }
    const next = {
      ...current,
      date: '2026-06-17',
      perTask: [
        {
          ...first.perTask[0],
          task: { ...first.perTask[0].task, _ref: 'new-task' },
          clicks: 90,
        },
      ],
    }
    expect(
      lastObservation([first, next])?.perTask.map((t) => [
        t.task._ref,
        t.clicks,
      ]),
    ).toEqual([['new-task', 90]])
  })
  it('widens default dates around preserved history, keeping explicit dates', () => {
    expect(reportRange([], '2027-01-01', {}, [old])).toMatchObject({
      from: '2026-06-16',
      to: '2027-01-09',
    })
    expect(
      reportRange([], '2027-01-01', { from: '2027-02-01' }, [old]).from,
    ).toBe('2027-02-01')
  })
})
