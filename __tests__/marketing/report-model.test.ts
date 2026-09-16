import { describe, it, expect } from 'vitest'
import {
  foldGrain,
  lastObservation,
  weekStart,
} from '@/lib/marketing/report/grain'
import {
  buildReport,
  comparisonReason,
  planHealth,
  reportRange,
} from '@/lib/marketing/report/model'
import type { ReportSnapshot } from '@/lib/marketing/report/types'
import type { CampaignView, TaskView } from '@/lib/marketing/types'

export function snapshot(date: string, value: number | null): ReportSnapshot {
  return {
    _id: date,
    _type: 'marketingSnapshot',
    campaign: { _type: 'reference', _ref: 'campaign' },
    conference: { _type: 'reference', _ref: 'conference' },
    date,
    takenAt: date + 'T12:00:00Z',
    primaryOutcomeValue: value,
    primaryOutcomeAttributed: true,
    primaryOutcomeAttributedValue: value,
    secondary: {
      attributedSessions: value,
      checkoutClickThrough: value,
      blueskyInteractions: value,
    },
    source: {
      posthog: value === null ? 'unavailable' : 'ok',
      bluesky: value === null ? 'unavailable' : 'ok',
    },
    perTask: [
      {
        _key: 'task',
        _type: 'marketingSnapshotTask',
        task: { _type: 'reference', _ref: 'task', _weak: true },
        sessions: value,
        clicks: value,
        blueskyLikes: value,
        blueskyReposts: 0,
        blueskyReplies: 0,
        blueskyQuotes: 0,
      },
    ],
  }
}
const campaign: CampaignView = {
  _id: 'campaign',
  key: 'key',
  title: 'Campaign',
  startDate: '2026-09-01',
  endDate: '2026-11-01',
  startMilestone: 'CONFERENCE_START',
  endMilestone: 'CONFERENCE_END',
  provisional: false,
  primaryOutcome: 'cfpSubmissions',
  target: 100,
  optional: false,
}
const task: TaskView = {
  _id: 'task',
  campaignId: 'campaign',
  key: 'key',
  title: 'Task',
  kind: 'publishing',
  channel: 'bluesky',
  date: '2026-09-01T10:00:00Z',
  provisional: false,
  milestone: null,
  status: 'failed',
  complete: false,
  prerequisiteIds: ['other'],
  variantId: null,
  assigneeId: null,
  approvedAt: null,
}

describe('report cumulative observation fold', () => {
  it('passes daily rows through unchanged', () => {
    const rows = [snapshot('2026-09-07', 100), snapshot('2026-09-08', 80)]
    expect(foldGrain(rows, 'daily')).toEqual(rows)
  })
  it('takes the LAST observation for every numeric field, neither sum nor max', () => {
    const result = foldGrain(
      [snapshot('2026-09-08', 80), snapshot('2026-09-07', 100)],
      'weekly',
    )
    expect(result).toHaveLength(1)
    expect(result[0].primaryOutcomeValue).toBe(80)
    expect(result[0].primaryOutcomeAttributedValue).toBe(80)
    expect(result[0].secondary).toEqual({
      attributedSessions: 80,
      checkoutClickThrough: 80,
      blueskyInteractions: 80,
    })
    expect(result[0].perTask[0]).toMatchObject({
      sessions: 80,
      clicks: 80,
      blueskyLikes: 80,
    })
  })
  it('keeps all-null weekly buckets null', () => {
    expect(
      foldGrain(
        [snapshot('2026-09-07', null), snapshot('2026-09-08', null)],
        'weekly',
      )[0].primaryOutcomeValue,
    ).toBeNull()
  })
  it('retains the last measurement through a source outage, including task counters', () => {
    const last = foldGrain(
      [snapshot('2026-09-07', 100), snapshot('2026-09-08', null)],
      'weekly',
    )[0]
    expect(last.primaryOutcomeValue).toBe(100)
    expect(last.secondary.attributedSessions).toBe(100)
    expect(last.perTask[0].sessions).toBe(100)
    expect(last.source.posthog).toBe('unavailable')
    expect(last.date).toBe('2026-09-08')
  })
  it('keeps campaigns and weeks independent', () => {
    const other = {
      ...snapshot('2026-09-08', 50),
      campaign: { _type: 'reference' as const, _ref: 'other' },
    }
    expect(
      foldGrain(
        [snapshot('2026-09-07', 100), snapshot('2026-09-14', 70), other],
        'weekly',
      ).map((s) => s.primaryOutcomeValue),
    ).toEqual([100, 50, 70])
  })
  it('uses the conference day at a Sunday UTC / Monday Oslo boundary', () => {
    expect(weekStart('2026-09-06T22:30:00Z')).toBe('2026-09-07')
    expect(weekStart('2026-09-06T21:30:00Z')).toBe('2026-08-31')
  })
  it('accepts a measured zero and preserves unresolved Task references', () => {
    const row = lastObservation([
      snapshot('2026-09-07', 100),
      snapshot('2026-09-08', 0),
    ])!
    expect(row.primaryOutcomeValue).toBe(0)
    expect(row.perTask[0].task._ref).toBe('task')
  })
})
describe('report semantics and health', () => {
  it('keeps the inclusive last attribution day through a half-open next-day boundary', () => {
    expect(reportRange([campaign], '2026-09-01', {})).toMatchObject({
      from: '2026-09-01',
      to: '2026-11-09',
    })
  })
  it('counts an overdue failed waiting Task in every relevant health predicate and stays running through plan end', () => {
    expect(planHealth([task], [campaign], '2026-10-01')).toMatchObject({
      running: true,
      overdue: 1,
      waiting: 1,
      failed: 1,
    })
    expect(planHealth([task], [campaign], '2026-11-02').running).toBe(false)
  })
  it('keeps completed and skipped Tasks out of overdue and waiting counts', () => {
    expect(
      planHealth(
        [
          { ...task, complete: true },
          { ...task, _id: 'skip', status: 'skipped' },
        ],
        [campaign],
        '2026-10-01',
      ),
    ).toMatchObject({ overdue: 0, waiting: 0, complete: 1 })
  })
  it('builds summary and ranking from last observed values, not sums', () => {
    const plan = {
      plan: {
        _id: 'plan',
        ownerId: null,
        ownerName: null,
        templateVersion: '1',
        copiedFromTitle: null,
        createdAt: '',
      },
      campaigns: [campaign],
      tasks: [task],
    }
    const view = buildReport({
      conference: { id: 'conference', title: 'Edition' },
      plan,
      snapshots: [snapshot('2026-09-07', 100), snapshot('2026-09-08', 80)],
      range: reportRange([campaign], '2026-09-01', {}),
      today: '2026-09-09',
    })
    expect(view.summary[0].value).toBe(80)
    expect(view.topTasks[0].clicks).toBe(80)
    expect(view.channels[0]).toEqual({
      channel: 'bluesky',
      sessions: 80,
      clicks: 80,
    })
    expect(view.previousEdition).toBeNull()
  })
  it('does not claim comparability for changed Outcomes or windows', () => {
    expect(
      comparisonReason(
        campaign,
        { ...campaign, primaryOutcome: 'blueskyInteractions' },
        '2026-09-01',
        '2026-09-01',
      ),
    ).toBe('Different Outcome types')
    expect(
      comparisonReason(
        campaign,
        { ...campaign, endDate: '2026-11-02' },
        '2026-09-01',
        '2026-09-01',
      ),
    ).toBe('Different Campaign windows relative to conference start')
    expect(
      comparisonReason(campaign, campaign, '2026-09-01', '2026-09-01'),
    ).toBeNull()
  })
})

describe('primary curve measurement freshness', () => {
  const plan = {
    plan: {
      _id: 'plan',
      ownerId: null,
      ownerName: null,
      templateVersion: '1',
      copiedFromTitle: null,
      createdAt: '',
    },
    campaigns: [campaign],
    tasks: [task],
  }
  it.each([
    'cfpSubmissions',
    'ticketsSoldInWindow',
    'blueskyInteractions',
  ] as const)(
    'does not mistake a PostHog outage for stale %s',
    (primaryOutcome) => {
      const row = snapshot('2026-09-07', 80)
      row.source.posthog = 'unavailable'
      const view = buildReport({
        conference: { id: 'conference', title: 'Edition' },
        plan: { ...plan, campaigns: [{ ...campaign, primaryOutcome }] },
        snapshots: [row],
        range: reportRange([campaign], '2026-09-01', { grain: 'weekly' }),
        today: '2026-09-08',
      })
      expect(view.timeline[0].points[0]).toEqual({
        date: '2026-09-07',
        value: 80,
        stale: false,
      })
    },
  )
  it('marks a carried primary measurement stale even when both vendor sources are healthy', () => {
    const row = snapshot('2026-09-08', null)
    row.source = { posthog: 'ok', bluesky: 'ok' }
    const view = buildReport({
      conference: { id: 'conference', title: 'Edition' },
      plan,
      snapshots: [snapshot('2026-09-07', 80), row],
      range: reportRange([campaign], '2026-09-01', { grain: 'weekly' }),
      today: '2026-09-09',
    })
    expect(view.timeline[0].points[0]).toEqual({
      date: '2026-09-08',
      value: 80,
      stale: true,
    })
  })
})

describe('comparison evidence guards', () => {
  it('refuses to compare all-time observations without post-age evidence', () => {
    const row = { ...campaign, primaryOutcome: 'blueskyInteractions' as const }
    expect(comparisonReason(row, row, '2026-09-01', '2026-09-01')).toBe(
      'All-time post counters have different post ages',
    )
  })
  it('refuses to compare attributed observations without first-publication evidence', () => {
    const row = { ...campaign, primaryOutcome: 'attributedSessions' as const }
    expect(comparisonReason(row, row, '2026-09-01', '2026-09-01')).toBe(
      'First-publication attribution windows are not recorded in Snapshots',
    )
  })
})
