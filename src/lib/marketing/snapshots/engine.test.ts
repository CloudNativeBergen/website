/**
 * The snapshot run over FAKES: the real engine, real Outcome computation, real
 * windows — only the vendors and Sanity are stand-ins. What is asserted is the
 * documents the engine would commit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignBreakdownRow } from '../analytics'
import {
  planRange,
  runConferenceSnapshots,
  snapshotDate,
  snapshotId,
} from './engine'
import type { SnapshotDeps, SnapshotDocument, SnapshotPlan } from './types'

const CONF = 'conf-1'
/** 06:00 Oslo on 2026-03-02, so "yesterday" is unambiguous. */
const NOW = new Date('2026-03-02T05:00:00Z')

function plan(overrides: Partial<SnapshotPlan> = {}): SnapshotPlan {
  return {
    planId: 'plan-1',
    conferenceId: CONF,
    campaigns: [
      {
        _id: 'camp-1',
        key: 'cfp',
        title: 'CFP',
        startDate: '2026-02-01',
        endDate: '2026-02-20',
        primaryOutcome: 'attributedSessions',
      },
    ],
    tasks: [
      {
        _id: 'task-1',
        campaignId: 'camp-1',
        key: 'cfp:launch:bluesky',
        kind: 'publishing',
        channel: 'bluesky',
        variantStatus: 'published',
        publishedAt: '2026-02-02T18:00:00Z',
        postUri: 'at://did:plc:a/app.bsky.feed.post/1',
      },
    ],
    ...overrides,
  }
}

function row(
  overrides: Partial<CampaignBreakdownRow> = {},
): CampaignBreakdownRow {
  return {
    date: '2026-02-03',
    campaign: 'cfp',
    task: 'cfp:launch:bluesky',
    sessions: 3,
    pageviews: 4,
    cfpClicks: 1,
    sponsorClicks: 0,
    checkoutClicks: 2,
    ...overrides,
  }
}

interface Fakes {
  deps: SnapshotDeps
  written: SnapshotDocument[][]
  breakdown: ReturnType<typeof vi.fn>
  engagement: ReturnType<typeof vi.fn>
  readProposals: ReturnType<typeof vi.fn>
  readTickets: ReturnType<typeof vi.fn>
  markSnapshotted: ReturnType<typeof vi.fn>
}

function fakes(overrides: Partial<SnapshotDeps> = {}): Fakes {
  const written: SnapshotDocument[][] = []
  const breakdown = vi.fn(async () => ({
    ok: true as const,
    rows: [row()],
    truncated: false,
  }))
  const engagement = vi.fn(async () => ({
    ok: true as const,
    counts: new Map([
      [
        'at://did:plc:a/app.bsky.feed.post/1',
        { likes: 5, reposts: 1, replies: 0, quotes: 0 },
      ],
    ]),
    missing: [] as string[],
  }))
  const readProposals = vi.fn(async () => [])
  const readTickets = vi.fn(async () => [])
  const markSnapshotted = vi.fn(async () => {})
  const deps: SnapshotDeps = {
    readPlan: vi.fn(async () => plan()),
    breakdown,
    engagement,
    readProposals,
    readTickets,
    readExisting: vi.fn(async () => []),
    writeSnapshots: vi.fn(async (documents: SnapshotDocument[]) => {
      written.push(documents)
    }),
    markSnapshotted,
    ...overrides,
  }
  // Read the mocks back OFF `deps`, so a test that overrode one asserts on the
  // override rather than on the default it replaced.
  const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>
  return {
    deps,
    written,
    breakdown: asMock(deps.breakdown),
    engagement: asMock(deps.engagement),
    readProposals: asMock(deps.readProposals),
    readTickets: asMock(deps.readTickets),
    markSnapshotted: asMock(deps.markSnapshotted),
  }
}

const onlyDocument = (written: SnapshotDocument[][]): SnapshotDocument => {
  expect(written).toHaveLength(1)
  expect(written[0]).toHaveLength(1)
  return written[0][0]
}

describe('the day a reading covers', () => {
  it('is yesterday in the CONFERENCE zone, by calendar arithmetic', () => {
    expect(snapshotDate(NOW)).toBe('2026-03-01')
    // The DST spring-forward night in Europe/Oslo (2026-03-29) is still one
    // calendar day back, not "24 hours ago".
    expect(snapshotDate(new Date('2026-03-30T04:00:00Z'))).toBe('2026-03-29')
  })

  it('LABELS the same day it fetches, at any hour of the day', () => {
    // 23:30 UTC is already the next conference day. Label and ceiling move
    // together, so a reading never names a day it holds no data for.
    const lateEvening = new Date('2026-03-02T23:30:00Z')
    expect(snapshotDate(lateEvening)).toBe('2026-03-02')
    expect(planRange(plan().campaigns, plan().tasks, lateEvening)?.to).toEqual(
      // Midnight on the 3rd, conference time = 23:00Z on the 2nd.
      new Date('2026-03-02T23:00:00.000Z'),
    )
  })

  it('never reaches into today: the range stops at the conference day’s start', () => {
    expect(planRange(plan().campaigns, plan().tasks, NOW)).toEqual({
      // Midnights in the conference zone, not in UTC — the Campaign's dates
      // are conference days, so the query's buckets have to be too.
      from: new Date('2026-01-31T23:00:00.000Z'),
      to: new Date('2026-03-01T23:00:00.000Z'),
    })
  })

  it('reaches back to a publication that went out BEFORE its Campaign opened', () => {
    const early = plan({
      tasks: [{ ...plan().tasks[0], publishedAt: '2026-01-20T18:00:00Z' }],
    })
    expect(planRange(early.campaigns, early.tasks, NOW)?.from).toEqual(
      new Date('2026-01-19T23:00:00.000Z'),
    )
  })
})

describe('one run, one reading per Campaign', () => {
  let f: Fakes
  beforeEach(() => {
    f = fakes()
  })

  it('writes one Snapshot per Campaign, for yesterday, with the computed numbers', async () => {
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)

    expect(result).toMatchObject({
      conferenceId: CONF,
      date: '2026-03-01',
      written: 1,
      source: { posthog: 'ok', bluesky: 'ok' },
    })
    const document = onlyDocument(f.written)
    expect(document).toMatchObject({
      _type: 'marketingSnapshot',
      date: '2026-03-01',
      campaign: { _type: 'reference', _ref: 'camp-1', _weak: true },
      campaignKey: 'cfp',
      campaignTitle: 'CFP',
      campaignPrimaryOutcome: 'attributedSessions',
      campaignTarget: null,
      campaignStartDate: '2026-02-01',
      campaignEndDate: '2026-02-20',
      conference: { _type: 'reference', _ref: CONF },
      primaryOutcomeValue: 3,
      primaryOutcomeAttributed: true,
      primaryOutcomeAttributedValue: null,
      secondary: {
        attributedSessions: 3,
        checkoutClickThrough: 2,
        blueskyInteractions: 6,
      },
      takenAt: NOW.toISOString(),
    })
    expect(document.perTask).toEqual([
      {
        _key: expect.any(String),
        _type: 'marketingSnapshotTask',
        task: { _type: 'reference', _ref: 'task-1', _weak: true },
        taskKey: 'cfp:launch:bluesky',
        sessions: 3,
        clicks: 3,
        blueskyLikes: 5,
        blueskyReposts: 1,
        blueskyReplies: 0,
        blueskyQuotes: 0,
      },
    ])
  })

  it('takes ONE day-grain attribution reading for the whole plan range', async () => {
    await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(f.breakdown).toHaveBeenCalledTimes(1)
    expect(f.breakdown).toHaveBeenCalledWith({
      conferenceId: CONF,
      from: new Date('2026-01-31T23:00:00.000Z'),
      to: new Date('2026-03-01T23:00:00.000Z'),
    })
  })

  it('sweeps the published post uris once, deduplicated', async () => {
    await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(f.engagement).toHaveBeenCalledTimes(1)
    expect(f.engagement).toHaveBeenCalledWith([
      'at://did:plc:a/app.bsky.feed.post/1',
    ])
  })

  it('gives the same Campaign and day the same document id, so a re-run replaces', async () => {
    await runConferenceSnapshots(CONF, f.deps, NOW)
    await runConferenceSnapshots(CONF, f.deps, new Date('2026-03-02T09:00:00Z'))
    expect(f.written[0][0]._id).toBe(f.written[1][0]._id)
    expect(f.written[0][0]._id).toBe(snapshotId('camp-1', '2026-03-01'))
  })

  it('stamps the plan BEFORE the reading, so a failing edition goes to the back of the queue', async () => {
    const order: string[] = []
    const f2 = fakes({
      markSnapshotted: vi.fn(async () => {
        order.push('stamp')
      }),
      breakdown: vi.fn(async () => {
        order.push('breakdown')
        throw new Error('posthog down')
      }),
    })
    await runConferenceSnapshots(CONF, f2.deps, NOW)
    expect(order).toEqual(['stamp', 'breakdown'])
  })
})

describe('a source that cannot be read is unavailable, never zero', () => {
  it('nulls the PostHog numbers and marks the source when the query fails', async () => {
    const f = fakes({
      breakdown: vi.fn(async () => ({
        ok: false as const,
        kind: 'rate-limited' as const,
        message: 'slow down',
      })),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)

    expect(result.source).toEqual({ posthog: 'unavailable', bluesky: 'ok' })
    expect(result.notes.join(' ')).toContain('rate-limited')
    const document = onlyDocument(f.written)
    expect(document.primaryOutcomeValue).toBeNull()
    expect(document.secondary.attributedSessions).toBeNull()
    expect(document.secondary.checkoutClickThrough).toBeNull()
    // The Bluesky half still read, so it is a number.
    expect(document.secondary.blueskyInteractions).toBe(6)
    expect(document.perTask[0].sessions).toBeNull()
    expect(document.perTask[0].blueskyLikes).toBe(5)
  })

  it('treats a TRUNCATED result as unavailable: the smallest groups may be missing', async () => {
    const f = fakes({
      breakdown: vi.fn(async () => ({
        ok: true as const,
        rows: [row()],
        truncated: true,
      })),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result.source.posthog).toBe('unavailable')
    expect(onlyDocument(f.written).primaryOutcomeValue).toBeNull()
  })

  it('nulls the Bluesky numbers when the engagement sweep fails', async () => {
    const f = fakes({
      engagement: vi.fn(async () => ({
        ok: false as const,
        kind: 'transient' as const,
        message: 'appview down',
      })),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result.source).toEqual({ posthog: 'ok', bluesky: 'unavailable' })
    const document = onlyDocument(f.written)
    expect(document.secondary.blueskyInteractions).toBeNull()
    expect(document.perTask[0].blueskyLikes).toBeNull()
    // The PostHog half is untouched.
    expect(document.secondary.attributedSessions).toBe(3)
  })

  it('a throwing dependency is a failed source, not a failed run', async () => {
    const f = fakes({
      engagement: vi.fn(async () => {
        throw new Error('socket hang up')
      }),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result.written).toBe(1)
    expect(result.source.bluesky).toBe('unavailable')
    expect(result.notes.join(' ')).toContain('socket hang up')
  })

  it('an edition with nothing published on Bluesky reads a true zero, not unavailable', async () => {
    const f = fakes({
      readPlan: vi.fn(async () =>
        plan({
          tasks: [
            {
              _id: 'task-1',
              campaignId: 'camp-1',
              key: 'cfp:launch:linkedin',
              kind: 'publishing',
              channel: 'linkedin',
              variantStatus: 'published',
              publishedAt: '2026-02-02T18:00:00Z',
              postUri: null,
            },
          ],
        }),
      ),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(f.engagement).not.toHaveBeenCalled()
    expect(result.source.bluesky).toBe('ok')
    // READ, and there is nothing: a real zero, not an unknown.
    expect(onlyDocument(f.written).secondary.blueskyInteractions).toBe(0)
  })
})

describe('the expensive sources are only read when a Campaign counts them', () => {
  it('skips tickets and proposals for a plan that needs neither', async () => {
    const f = fakes()
    await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(f.readTickets).not.toHaveBeenCalled()
    expect(f.readProposals).not.toHaveBeenCalled()
  })

  it('reads tickets once for a ticketsSoldInWindow Campaign', async () => {
    const f = fakes({
      readPlan: vi.fn(async () =>
        plan({
          campaigns: [
            {
              _id: 'camp-1',
              key: 'earlyBird',
              title: 'Early bird',
              startDate: '2026-02-01',
              endDate: '2026-02-20',
              primaryOutcome: 'ticketsSoldInWindow',
            },
          ],
        }),
      ),
      readTickets: vi.fn(async () => [
        { orderDate: '2026-02-05T10:00:00Z' },
        { orderDate: '2026-03-05T10:00:00Z' },
      ]),
    })
    await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(f.readTickets).toHaveBeenCalledTimes(1)
    expect(f.readTickets).toHaveBeenCalledWith(CONF)
    const document = onlyDocument(f.written)
    expect(document.primaryOutcomeValue).toBe(1)
    expect(document.primaryOutcomeAttributed).toBe(false)
  })

  it('reads proposals once for a cfpSubmissions Campaign and stores the tagged subset', async () => {
    const f = fakes({
      readPlan: vi.fn(async () =>
        plan({
          campaigns: [
            {
              _id: 'camp-1',
              key: 'cfp',
              title: 'CFP',
              startDate: '2026-02-01',
              endDate: '2026-02-20',
              primaryOutcome: 'cfpSubmissions',
            },
          ],
        }),
      ),
      readProposals: vi.fn(async () => [
        { createdAt: '2026-02-05T10:00:00Z', utmCampaign: 'cfp' },
        { createdAt: '2026-02-06T10:00:00Z', utmCampaign: null },
      ]),
    })
    await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(f.readProposals).toHaveBeenCalledTimes(1)
    const document = onlyDocument(f.written)
    expect(document.primaryOutcomeValue).toBe(2)
    expect(document.primaryOutcomeAttributedValue).toBe(1)
  })
})

describe('bookkeeping', () => {
  it('does nothing for an edition with no plan, and has nothing to stamp', async () => {
    const f = fakes({ readPlan: vi.fn(async () => null) })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result).toMatchObject({ written: 0, skipped: 'no plan' })
    expect(f.deps.writeSnapshots).not.toHaveBeenCalled()
    expect(f.markSnapshotted).not.toHaveBeenCalled()
  })

  it('STAMPS a plan with no Campaigns, so it cannot sit at the head of the queue', async () => {
    const f = fakes({
      readPlan: vi.fn(async () => plan({ campaigns: [], tasks: [] })),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result).toMatchObject({
      written: 0,
      skipped: 'plan has no campaigns',
    })
    expect(f.markSnapshotted).toHaveBeenCalledWith('plan-1', NOW.toISOString())
    expect(f.deps.writeSnapshots).not.toHaveBeenCalled()
  })

  it('leaves a FRESHER reading of the same day alone', async () => {
    const f = fakes({
      readExisting: vi.fn(async () => [
        {
          _id: snapshotId('camp-1', '2026-03-01'),
          takenAt: '2026-03-02T08:00:00.000Z', // later than NOW
        },
      ]),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result.written).toBe(0)
    expect(f.deps.writeSnapshots).not.toHaveBeenCalled()
    expect(result.notes.join(' ')).toContain('fresher reading')
  })

  it('replaces an OLDER reading of the same day', async () => {
    const f = fakes({
      readExisting: vi.fn(async () => [
        {
          _id: snapshotId('camp-1', '2026-03-01'),
          takenAt: '2026-03-02T01:00:00.000Z',
        },
      ]),
    })
    expect((await runConferenceSnapshots(CONF, f.deps, NOW)).written).toBe(1)
  })

  it('still writes when the staleness probe itself fails', async () => {
    const f = fakes({
      readExisting: vi.fn(async () => {
        throw new Error('probe failed')
      }),
    })
    const result = await runConferenceSnapshots(CONF, f.deps, NOW)
    expect(result.written).toBe(1)
    expect(result.notes.join(' ')).toContain('probe failed')
  })

  it('keeps a Snapshot id inside Sanity id limits for an absurd Campaign id', () => {
    const id = snapshotId('c'.repeat(200), '2026-03-01')
    expect(id.length).toBeLessThanOrEqual(128)
    expect(id).toBe(snapshotId('c'.repeat(200), '2026-03-01'))
  })
})
