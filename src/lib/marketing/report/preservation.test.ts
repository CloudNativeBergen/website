import type { ReportSnapshot } from './types'
import { describe, expect, it } from 'vitest'
import { exportFixture } from './__tests__/export-fixture'
import { buildReport, comparisonReason, reportRange } from './model'
import {
  foldGrain,
  lastObservation,
  metricSegments,
  sameMeasurementBasis,
} from './grain'

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
  it('splits a series on the window END for every Outcome, on the START only for the strict ones', () => {
    // Two different failures met in this one function.
    //
    // Treating the window as part of the basis for EVERY Outcome was an
    // integration bug with #1078: re-dating moves Campaign windows whenever a
    // Milestone is set, so on completely intact data every series broke at that
    // moment and the Report read "Not measured" for Visits, CTA clicks,
    // Bluesky and the Channel funnel.
    //
    // Treating it as irrelevant to all the non-strict Outcomes was the
    // opposite: `attributedWindow` runs to `endDate` plus the attribution tail,
    // so moving the END does move the span they are measured over. Only its
    // START comes from when Tasks published.
    const reading = (
      date: string,
      value: number,
      window: { startDate?: string; endDate?: string } = {},
    ) => ({
      ...old,
      _id: `snap-${date}-${window.startDate ?? ''}${window.endDate ?? ''}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      campaignPrimaryOutcome: 'attributedSessions' as const,
      campaignStartDate: window.startDate ?? '2026-06-01',
      campaignEndDate: window.endDate ?? '2026-06-30',
      primaryOutcomeValue: value,
    })
    const strict = (row: ReportSnapshot) => ({
      ...row,
      campaignPrimaryOutcome: 'cfpSubmissions' as const,
    })

    // START moved. Attributed: same basis, because it begins at the first
    // published Task. Strict: different, because it counts from the start date.
    const startBefore = reading('2026-06-15', 40)
    const startAfter = reading('2026-06-16', 55, { startDate: '2026-05-01' })
    expect(sameMeasurementBasis(startBefore, startAfter)).toBe(true)
    expect(metricSegments([startBefore, startAfter])).toHaveLength(1)
    expect(sameMeasurementBasis(strict(startBefore), strict(startAfter))).toBe(
      false,
    )
    expect(
      metricSegments([strict(startBefore), strict(startAfter)]),
    ).toHaveLength(2)

    // END moved. Different basis for BOTH: the attributed window runs to the
    // end date plus the tail, so the number covered a different span.
    const endAfter = reading('2026-06-16', 55, { endDate: '2026-07-31' })
    expect(sameMeasurementBasis(startBefore, endAfter)).toBe(false)
    expect(metricSegments([startBefore, endAfter])).toHaveLength(2)
    expect(sameMeasurementBasis(strict(startBefore), strict(endAfter))).toBe(
      false,
    )
  })

  it('reports the basis in force at the END of the week, not its start', () => {
    // The earlier test changed the window and changed it back, so the first and
    // last rows agreed and `bucket[0]` passed just as well as `bucket.at(-1)`.
    // Here the change does NOT revert.
    const day = (date: string, value: number, endDate: string) => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      campaignEndDate: endDate,
      primaryOutcomeValue: value,
    })
    const weekly = foldGrain(
      [
        day('2026-06-15', 10, '2026-06-30'),
        day('2026-06-16', 20, '2026-06-30'),
        day('2026-06-18', 30, '2026-07-15'),
        day('2026-06-19', 40, '2026-07-15'),
      ],
      'weekly',
    )
    expect(weekly).toHaveLength(1)
    expect(weekly[0].campaignEndDate).toBe('2026-07-15')
    expect(weekly[0].primaryOutcomeValue).toBe(40)
  })

  it('emits one point per WEEK across a week boundary', () => {
    // Nothing exercised `weekStart` itself: every fixture sat in one week, so
    // replacing the bucket key with a constant kept the suite green.
    const at = (date: string, value: number) => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      primaryOutcomeValue: value,
    })
    // Sun 2026-06-14 and Mon 2026-06-15 are different ISO weeks.
    const weekly = foldGrain(
      [at('2026-06-14', 5), at('2026-06-15', 9)],
      'weekly',
    )
    expect(weekly).toHaveLength(2)
    expect(weekly.map((s) => s.primaryOutcomeValue)).toEqual([5, 9])
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
  it('never pairs the old metric value with the new metric target', () => {
    // The most natural edit in #1083's Campaign editor is to change the metric
    // and set a goal for it. `primaryOutcome` comes from the Snapshot (it
    // describes what was measured) and `target` came from the live Campaign (a
    // goal the organizer just set), so the card rendered the OLD metric's
    // number against the NEW metric's target — 137 CFP submissions "/ 400
    // target" where 400 is a ticket target — and nothing said so, because one
    // stored reading is one segment and `metricChanged` stays false.
    const edited = {
      ...fixture.campaigns[0],
      _id: 'new-campaign',
      primaryOutcome: 'ticketsSoldInWindow' as const,
      target: 400,
    }
    const result = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: [edited], tasks: [] },
      snapshots: [old],
      range: fixture.range,
      today: '2026-06-17',
    })
    expect(result.summary[0]).toMatchObject({
      primaryOutcome: 'cfpSubmissions',
      value: 137,
      target: 250,
      outcomeChanged: true,
    })
    // The live Campaign's own Outcome is still what the timeline band shows.
    expect(result.campaigns[0].primaryOutcome).toBe('ticketsSoldInWindow')
    // And an unedited Campaign still follows the live target immediately.
    const raised = { ...fixture.campaigns[0], _id: 'new-campaign', target: 900 }
    expect(
      buildReport({
        conference: fixture.conference,
        plan: { plan: fixture.plan!, campaigns: [raised], tasks: [] },
        snapshots: [old],
        range: fixture.range,
        today: '2026-06-17',
      }).summary[0],
    ).toMatchObject({ target: 900, outcomeChanged: false })
  })

  it('does not call the newest possible reading stale before the nightly run', () => {
    // A snapshot covers the last completed conference day, so the run on day D
    // stamps D-1. The run is at 06:20 Oslo, so from midnight until then the
    // newest reading that exists anywhere is dated D-2 — and the threshold
    // flagged exactly that, annotating every card "may be stale" for about six
    // hours a day on current data.
    const reading = (date: string) => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:20:00Z`,
    })
    const staleness = (snapshot: ReportSnapshot, today: string) =>
      buildReport({
        conference: fixture.conference,
        plan: {
          plan: fixture.plan!,
          campaigns: [{ ...fixture.campaigns[0], _id: 'new-campaign' }],
          tasks: [],
        },
        snapshots: [snapshot],
        range: fixture.range,
        today,
      }).summary[0].stale
    // Yesterday's run, before today's: current, not stale.
    expect(staleness(reading('2026-06-15'), '2026-06-17')).toBe(false)
    // Today's run has landed: also current.
    expect(staleness(reading('2026-06-16'), '2026-06-17')).toBe(false)
    // A night genuinely missed is still reported.
    expect(staleness(reading('2026-06-14'), '2026-06-17')).toBe(true)
  })

  it('keeps per-Task clicks and the Channel funnel across an Outcome edit', () => {
    // Per-Task sessions, clicks and Bluesky engagement come from the attributed
    // window; `computeCampaignOutcome` consumes the Outcome only inside
    // `primaryOutcome()`. Segmenting them by the Outcome's basis threw away
    // every per-Task number measured before an Outcome edit, so a Task with 71
    // measured clicks showed as unmeasured and ranked last, and the Channel
    // funnel went blank — until the next nightly run.
    const measured = {
      ...old,
      perTask: [{ ...old.perTask[0], taskKey: 'launch', clicks: 71 }],
    }
    const afterEdit = {
      ...old,
      _id: 'snap-after-edit',
      date: '2026-06-17',
      takenAt: '2026-06-18T04:00:00Z',
      campaignPrimaryOutcome: 'ticketsSoldInWindow' as const,
      primaryOutcomeValue: null,
      perTask: [
        {
          ...old.perTask[0],
          taskKey: 'launch',
          clicks: null,
          sessions: null,
        },
      ],
    }
    // The Campaign keeps the id the readings were taken against: this is an
    // Outcome edit, not a reseed. The two are deliberately different — see the
    // next test.
    const result = buildReport({
      conference: fixture.conference,
      plan: {
        plan: fixture.plan!,
        campaigns: fixture.campaigns,
        tasks: fixture.tasks,
      },
      snapshots: [measured, afterEdit],
      range: fixture.range,
      today: '2026-06-18',
    })
    expect(result.topTasks[0].clicks).toBe(71)
    expect(result.channels[0].clicks).toBe(71)
  })

  it("does not hand a reseeded Task the previous plan's clicks", () => {
    // `matches` joins on the stable Template key so history survives a Campaign
    // being deleted. A plan deleted and RESEEDED recreates Campaigns with those
    // same keys, so the old plan's rows matched the new Campaign too, and the
    // `taskKey` lookup handed their sessions and clicks to the freshly seeded
    // Task that reused the key — a never-published draft showing up in Top
    // Tasks and the Channel funnel with last cycle's numbers. The ledger
    // already refuses this; the Report's own path did not.
    const previous = {
      ...old,
      campaignKey: 'cfp',
      perTask: [{ ...old.perTask[0], taskKey: 'launch', clicks: 71 }],
    }
    const result = buildReport({
      conference: fixture.conference,
      plan: {
        plan: fixture.plan!,
        // Same stable key, new document — what the seeder produces.
        campaigns: [
          { ...fixture.campaigns[0], _id: 'campaign-after-reseed', key: 'cfp' },
        ],
        tasks: fixture.tasks.map((task) => ({
          ...task,
          campaignId: 'campaign-after-reseed',
        })),
      },
      snapshots: [previous],
      range: fixture.range,
      today: '2026-06-18',
    })
    expect(result.topTasks).toEqual([])
    expect(result.channels).toEqual([])
    // The campaign-level figure is still real history for the key.
    expect(result.summary[0].value).toBe(137)
  })

  it('draws ONE weekly series when a window changes and changes back in a week', () => {
    // Through `buildReport`, deliberately. The helper-level version of this
    // passed while the report was still broken: the timeline segmented the
    // DAILY rows before `foldGrain` ever saw them, so its bucket-by-week-first
    // rule could not collapse the week and the chart drew three series, each
    // contributing a single point at the same x.
    const day = (date: string, value: number, endDate = '2026-06-30') => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      campaignEndDate: endDate,
      primaryOutcomeValue: value,
    })
    const result = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: fixture.campaigns, tasks: [] },
      snapshots: [
        day('2026-06-15', 10),
        day('2026-06-16', 20),
        day('2026-06-17', 30, '2026-07-15'),
        day('2026-06-18', 40, '2026-07-15'),
        day('2026-06-19', 50),
        day('2026-06-20', 60),
      ],
      range: { ...fixture.range, grain: 'weekly', to: '2026-07-08' },
      today: '2026-06-21',
    })
    expect(result.timeline).toHaveLength(1)
    expect(result.timeline[0].points.map((p) => [p.date, p.value])).toEqual([
      ['2026-06-20', 60],
    ])
    expect(result.timeline[0].windowChanged).toBeFalsy()
    // Daily grain still shows every reading, on the basis in force.
    const daily = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: fixture.campaigns, tasks: [] },
      snapshots: [day('2026-06-15', 10), day('2026-06-16', 20)],
      range: { ...fixture.range, grain: 'daily' },
      today: '2026-06-17',
    })
    expect(daily.timeline[0].points).toHaveLength(2)
  })

  it("does not let an earlier series borrow a later one's observation date", () => {
    // A Campaign whose basis goes A → B → A has two A segments. Matching the
    // measurement date on basis alone let the FIRST A series take the second
    // one's date — a date after its own final point, and fresh enough to clear
    // a staleness threshold it should have failed.
    const at = (date: string, value: number | null, endDate: string) => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      campaignEndDate: endDate,
      primaryOutcomeValue: value,
    })
    const result = buildReport({
      conference: fixture.conference,
      plan: { plan: fixture.plan!, campaigns: fixture.campaigns, tasks: [] },
      snapshots: [
        at('2026-06-01', 10, '2026-06-30'),
        at('2026-06-08', 20, '2026-07-31'),
        at('2026-06-15', 30, '2026-06-30'),
      ],
      range: { ...fixture.range, grain: 'daily', from: '2026-06-01' },
      today: '2026-06-16',
    })
    expect(result.timeline).toHaveLength(3)
    // Each series names a date inside its own span.
    expect(
      result.timeline.map((t) => [
        t.points.at(-1)?.date,
        t.measurement?.observationDate,
      ]),
    ).toEqual([
      ['2026-06-01', '2026-06-01'],
      ['2026-06-08', '2026-06-08'],
      ['2026-06-15', '2026-06-15'],
    ])
    // The first series is genuinely stale; borrowing the third's date hid that.
    expect(result.timeline[0].measurement?.stale).toBe(true)
  })

  it('does not split a Bluesky series on a window edit, and carries its count', () => {
    // `blueskyEngagements` sums the all-time counters of the Campaign's
    // published posts — neither `strictWindow` nor `attributedWindow` is
    // consulted — so a window edit cannot change what the number counted.
    // Treating `endDate` as part of its basis put a false "Campaign window
    // changed" split in the timeline and, when the next Bluesky read came back
    // unavailable, refused to carry the previous valid count forward.
    const at = (date: string, value: number | null, endDate: string) => ({
      ...old,
      _id: `snap-${date}`,
      date,
      takenAt: `${date}T04:00:00Z`,
      campaignPrimaryOutcome: 'blueskyInteractions' as const,
      campaignEndDate: endDate,
      primaryOutcomeValue: value,
    })
    const before = at('2026-06-15', 214, '2026-06-30')
    const afterEdit = at('2026-06-16', null, '2026-07-31')
    expect(sameMeasurementBasis(before, afterEdit)).toBe(true)
    expect(metricSegments([before, afterEdit])).toHaveLength(1)
    // The count survives the unavailable read.
    expect(lastObservation([before, afterEdit])?.primaryOutcomeValue).toBe(214)
    // A window-sensitive Outcome over the same edit still splits.
    expect(
      sameMeasurementBasis(
        { ...before, campaignPrimaryOutcome: 'cfpSubmissions' },
        { ...afterEdit, campaignPrimaryOutcome: 'cfpSubmissions' },
      ),
    ).toBe(false)
  })

  it('widens default dates around preserved history, keeping explicit dates', () => {
    expect(reportRange([], '2027-01-01', {}, [old.date])).toMatchObject({
      from: '2026-06-16',
      to: '2027-01-09',
    })
    expect(
      reportRange([], '2027-01-01', { from: '2027-02-01' }, [old.date]).from,
    ).toBe('2027-02-01')
  })
})
