import { describe, expect, it } from 'vitest'
import type { CampaignBreakdownRow } from './analytics'
import {
  ATTRIBUTION_TAIL_DAYS,
  attributedWindow,
  computeCampaignOutcome,
  strictWindow,
  utcDay,
  type OutcomeCampaign,
  type OutcomeInput,
  type OutcomeTask,
} from './outcomes'
import type { PostEngagement } from '@/lib/social/provider'

const NOW = new Date('2026-06-01T09:00:00Z')

const CAMPAIGN: OutcomeCampaign = {
  key: 'cfp',
  primaryOutcome: 'attributedSessions',
  startDate: '2026-01-10',
  endDate: '2026-01-20',
}

function task(overrides: Partial<OutcomeTask> = {}): OutcomeTask {
  return {
    _id: 't1',
    key: 'cfp:launch:bluesky',
    kind: 'publishing',
    channel: 'bluesky',
    variantStatus: 'published',
    publishedAt: '2026-01-12T18:00:00Z',
    postUri: 'at://did:plc:a/app.bsky.feed.post/1',
    ...overrides,
  }
}

function row(
  date: string,
  overrides: Partial<CampaignBreakdownRow> = {},
): CampaignBreakdownRow {
  return {
    date,
    campaign: 'cfp',
    task: 'cfp:launch:bluesky',
    sessions: 1,
    pageviews: 1,
    cfpClicks: 0,
    sponsorClicks: 0,
    checkoutClicks: 0,
    ...overrides,
  }
}

function counts(overrides: Partial<PostEngagement> = {}): PostEngagement {
  return { likes: 1, reposts: 1, replies: 1, quotes: 1, ...overrides }
}

function input(overrides: Partial<OutcomeInput> = {}): OutcomeInput {
  return {
    campaign: CAMPAIGN,
    tasks: [task()],
    rows: [],
    engagement: new Map(),
    proposals: [],
    tickets: [],
    now: NOW,
    ...overrides,
  }
}

describe('windows', () => {
  it('the strict window is the Campaign dates, end INCLUSIVE', () => {
    expect(strictWindow(CAMPAIGN, NOW)).toEqual({
      from: '2026-01-10',
      to: '2026-01-21',
    })
  })

  it('the attributed window starts at the FIRST publication, not the Campaign start', () => {
    const tasks = [
      task({ _id: 'a', publishedAt: '2026-01-15T08:00:00Z' }),
      task({ _id: 'b', publishedAt: '2026-01-12T18:00:00Z' }),
      task({ _id: 'c', publishedAt: '2026-01-18T08:00:00Z' }),
    ]
    expect(attributedWindow(CAMPAIGN, tasks, NOW)).toEqual({
      from: '2026-01-12',
      to: '2026-01-28', // end + 7 days, exclusive of the 8th
    })
    expect(ATTRIBUTION_TAIL_DAYS).toBe(7)
  })

  it('has NO attributed window while the Campaign has published nothing', () => {
    for (const unpublished of [
      task({ variantStatus: 'scheduled', publishedAt: null }),
      task({ variantStatus: 'draft', publishedAt: null }),
      task({ variantStatus: 'failed', publishedAt: null }),
      // A checklist Task is not a publication however it is ticked off.
      task({ kind: 'checklist', channel: null, variantStatus: null }),
    ]) {
      expect(attributedWindow(CAMPAIGN, [unpublished], NOW)).toBeNull()
    }
    expect(attributedWindow(CAMPAIGN, [], NOW)).toBeNull()
  })

  it('never counts a SCHEDULED time as a publication', () => {
    expect(
      attributedWindow(
        CAMPAIGN,
        [task({ variantStatus: 'scheduled', publishedAt: null })],
        NOW,
      ),
    ).toBeNull()
  })

  it('never reaches into the current UTC day', () => {
    const midCampaign = new Date('2026-01-15T23:59:00Z')
    expect(strictWindow(CAMPAIGN, midCampaign)).toEqual({
      from: '2026-01-10',
      to: '2026-01-15',
    })
    expect(attributedWindow(CAMPAIGN, [task()], midCampaign)).toEqual({
      from: '2026-01-12',
      to: '2026-01-15',
    })
  })

  it('is null while no day of the window is complete', () => {
    const dayOne = new Date('2026-01-10T06:00:00Z')
    expect(strictWindow(CAMPAIGN, dayOne)).toBeNull()
    const beforeStart = new Date('2026-01-01T06:00:00Z')
    expect(strictWindow(CAMPAIGN, beforeStart)).toBeNull()
  })

  it('reads a UTC day off an instant and refuses a broken one', () => {
    expect(utcDay('2026-01-12T23:30:00Z')).toBe('2026-01-12')
    expect(utcDay('not a date')).toBeNull()
  })
})

describe('the six Outcomes', () => {
  it('attributedSessions sums sessions inside the attributed window only', () => {
    const result = computeCampaignOutcome(
      input({
        rows: [
          row('2026-01-11', { sessions: 100 }), // before the first publication
          row('2026-01-12', { sessions: 3 }),
          row('2026-01-27', { sessions: 4 }), // last day of the tail
          row('2026-01-28', { sessions: 500 }), // past the tail
          row('2026-01-13', { sessions: 9, campaign: 'other' }),
        ],
      }),
    )
    expect(result.value).toBe(7)
    expect(result.attributed).toBe(true)
    expect(result.attributedValue).toBeNull()
  })

  it('checkoutClickThrough and sponsorContactClicks each sum their own column', () => {
    const rows = [
      row('2026-01-12', { checkoutClicks: 2, sponsorClicks: 5, cfpClicks: 9 }),
      row('2026-01-13', { checkoutClicks: 1, sponsorClicks: 1 }),
    ]
    expect(
      computeCampaignOutcome(
        input({
          campaign: { ...CAMPAIGN, primaryOutcome: 'checkoutClickThrough' },
          rows,
        }),
      ).value,
    ).toBe(3)
    expect(
      computeCampaignOutcome(
        input({
          campaign: { ...CAMPAIGN, primaryOutcome: 'sponsorContactClicks' },
          rows,
        }),
      ).value,
    ).toBe(6)
  })

  it('cfpSubmissions counts the STRICT window and reports the tagged subset beside it', () => {
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'cfpSubmissions' },
        proposals: [
          { createdAt: '2026-01-09T12:00:00Z', utmCampaign: 'cfp' }, // before
          { createdAt: '2026-01-10T12:00:00Z', utmCampaign: 'cfp' },
          { createdAt: '2026-01-20T23:00:00Z', utmCampaign: null },
          { createdAt: '2026-01-20T23:30:00Z', utmCampaign: 'other' },
          { createdAt: '2026-01-21T00:30:00Z', utmCampaign: 'cfp' }, // after
        ],
      }),
    )
    expect(result.value).toBe(3)
    expect(result.attributedValue).toBe(1)
    expect(result.attributed).toBe(true)
  })

  it('cfpSubmissions uses the strict window even once posts have gone out', () => {
    // The attributed window opens on 2026-01-12, four days after the strict one;
    // a proposal on the 10th must still count.
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'cfpSubmissions' },
        proposals: [{ createdAt: '2026-01-10T09:00:00Z', utmCampaign: null }],
      }),
    )
    expect(result.value).toBe(1)
  })

  it('ticketsSoldInWindow counts the strict window and is labelled NOT attributed', () => {
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'ticketsSoldInWindow' },
        tickets: [
          { orderDate: '2026-01-09T23:00:00Z' },
          { orderDate: '2026-01-10T00:00:00Z' },
          { orderDate: '2026-01-20T22:00:00Z' },
          { orderDate: '2026-01-21T00:00:00Z' },
        ],
      }),
    )
    expect(result.value).toBe(2)
    expect(result.attributed).toBe(false)
    expect(result.attributedValue).toBeNull()
  })

  it('blueskyInteractions sums all four counters over the published Bluesky Tasks, ALL TIME', () => {
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'blueskyInteractions' },
        tasks: [
          task({ _id: 'a', postUri: 'at://a' }),
          task({ _id: 'b', postUri: 'at://b' }),
          // LinkedIn is attribution-only: it has no engagement to read.
          task({ _id: 'c', channel: 'linkedin', postUri: 'at://c' }),
          // An unpublished Bluesky Task contributes nothing.
          task({
            _id: 'd',
            postUri: 'at://d',
            variantStatus: 'scheduled',
            publishedAt: null,
          }),
        ],
        engagement: new Map([
          ['at://a', counts({ likes: 10, reposts: 2, replies: 1, quotes: 0 })],
          ['at://b', counts({ likes: 1, reposts: 0, replies: 0, quotes: 0 })],
          ['at://c', counts({ likes: 99 })],
          ['at://d', counts({ likes: 99 })],
        ]),
        // The window is irrelevant to this Outcome — no rows at all.
        rows: [],
      }),
    )
    expect(result.value).toBe(14)
  })
})

describe('unknown is null, never zero', () => {
  it('nulls every PostHog-fed number when the source could not be read', () => {
    const result = computeCampaignOutcome(input({ rows: null }))
    expect(result.value).toBeNull()
    expect(result.secondary.attributedSessions).toBeNull()
    expect(result.secondary.checkoutClickThrough).toBeNull()
    expect(result.perTask[0].sessions).toBeNull()
    expect(result.perTask[0].clicks).toBeNull()
  })

  it('nulls the Bluesky numbers when Bluesky could not be read', () => {
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'blueskyInteractions' },
        engagement: null,
      }),
    )
    expect(result.value).toBeNull()
    expect(result.secondary.blueskyInteractions).toBeNull()
    expect(result.perTask[0].engagement).toBeNull()
  })

  it('nulls the tickets and proposals Outcomes when those sources failed', () => {
    expect(
      computeCampaignOutcome(
        input({
          campaign: { ...CAMPAIGN, primaryOutcome: 'ticketsSoldInWindow' },
          tickets: null,
        }),
      ).value,
    ).toBeNull()
    expect(
      computeCampaignOutcome(
        input({
          campaign: { ...CAMPAIGN, primaryOutcome: 'cfpSubmissions' },
          proposals: null,
        }),
      ).value,
    ).toBeNull()
  })

  it('nulls the attributed numbers while the Campaign has published nothing', () => {
    const result = computeCampaignOutcome(
      input({
        tasks: [task({ variantStatus: 'draft', publishedAt: null })],
        rows: [row('2026-01-12', { sessions: 50 })],
      }),
    )
    expect(result.attributedWindow).toBeNull()
    expect(result.value).toBeNull()
    expect(result.secondary.attributedSessions).toBeNull()
  })

  it('reads an OPEN window with no traffic as a real zero', () => {
    const result = computeCampaignOutcome(input({ rows: [] }))
    expect(result.attributedWindow).not.toBeNull()
    expect(result.value).toBe(0)
    expect(result.secondary.checkoutClickThrough).toBe(0)
  })

  it('keeps an unknown Bluesky counter out of the total instead of zeroing it', () => {
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'blueskyInteractions' },
        tasks: [task({ _id: 'a', postUri: 'at://a' })],
        engagement: new Map([
          ['at://a', { likes: 4, reposts: null, replies: null, quotes: null }],
        ]),
      }),
    )
    expect(result.value).toBe(4)
  })

  it('ignores an undated row: a total cannot be placed in a window', () => {
    const result = computeCampaignOutcome(
      input({ rows: [{ ...row('2026-01-12'), date: null, sessions: 40 }] }),
    )
    expect(result.value).toBe(0)
  })
})

describe('the secondary panel and the per-Task rows', () => {
  it('computes all three secondary numbers whatever the primary Outcome is', () => {
    const result = computeCampaignOutcome(
      input({
        campaign: { ...CAMPAIGN, primaryOutcome: 'ticketsSoldInWindow' },
        rows: [row('2026-01-12', { sessions: 6, checkoutClicks: 2 })],
        engagement: new Map([
          [
            'at://did:plc:a/app.bsky.feed.post/1',
            counts({ likes: 3, reposts: 0, replies: 0, quotes: 0 }),
          ],
        ]),
      }),
    )
    expect(result.secondary).toEqual({
      attributedSessions: 6,
      checkoutClickThrough: 2,
      blueskyInteractions: 3,
    })
  })

  it('keys per-Task numbers on the Task key and sums every click column', () => {
    const other = task({
      _id: 't2',
      key: 'cfp:reminder:linkedin',
      channel: 'linkedin',
    })
    const result = computeCampaignOutcome(
      input({
        tasks: [task(), other],
        rows: [
          row('2026-01-12', {
            sessions: 2,
            cfpClicks: 1,
            sponsorClicks: 2,
            checkoutClicks: 3,
          }),
          row('2026-01-13', {
            task: 'cfp:reminder:linkedin',
            sessions: 5,
            cfpClicks: 4,
          }),
          row('2026-01-13', { task: '(none)', sessions: 99, cfpClicks: 99 }),
        ],
      }),
    )
    expect(result.perTask).toEqual([
      {
        taskId: 't1',
        taskKey: 'cfp:launch:bluesky',
        sessions: 2,
        clicks: 6,
        engagement: null,
      },
      {
        taskId: 't2',
        taskKey: 'cfp:reminder:linkedin',
        sessions: 5,
        clicks: 4,
        engagement: null,
      },
    ])
  })

  it('carries each Task its own Bluesky counters', () => {
    const result = computeCampaignOutcome(
      input({
        tasks: [task({ _id: 'a', postUri: 'at://a' })],
        engagement: new Map([['at://a', counts({ likes: 7 })]]),
      }),
    )
    expect(result.perTask[0].engagement).toEqual(counts({ likes: 7 }))
  })

  it('sums the per-Task rows to the Campaign total (one window, one query)', () => {
    const rows = [
      row('2026-01-12', { sessions: 2 }),
      row('2026-01-13', { task: 'cfp:reminder:linkedin', sessions: 5 }),
    ]
    const tasks = [
      task(),
      task({ _id: 't2', key: 'cfp:reminder:linkedin', channel: 'linkedin' }),
    ]
    const result = computeCampaignOutcome(input({ tasks, rows }))
    const perTaskTotal = result.perTask.reduce(
      (total, entry) => total + (entry.sessions ?? 0),
      0,
    )
    expect(perTaskTotal).toBe(result.secondary.attributedSessions)
  })
})
