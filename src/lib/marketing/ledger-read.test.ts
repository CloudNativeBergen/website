/**
 * The ledger READER against raw Sanity rows (#1018). The router tests mock
 * this function; these exercise it for real, because the null-vs-zero rule —
 * an absent count means the source was unavailable, never that nothing
 * happened (spec §2.4) — lives in this normalization and nowhere else.
 */
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientWrite: { patch: vi.fn(), transaction: vi.fn(), create: vi.fn() },
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCampaignLedger } from './sanity'

const h = vi.hoisted(() => ({ fetch: vi.fn() }))

const CONF = 'conf-A'

function rawSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    date: '2027-02-28',
    takenAt: '2027-03-01T04:00:00.000Z',
    primaryOutcomeValue: 68,
    primaryOutcomeAttributed: true,
    primaryOutcomeAttributedValue: 41,
    secondary: {
      attributedSessions: 1204,
      checkoutClickThrough: 96,
      blueskyInteractions: 214,
    },
    source: { posthog: 'ok', bluesky: 'ok' },
    perTask: [
      {
        taskId: 'task-1',
        sessions: 612,
        clicks: 58,
        blueskyLikes: 100,
        blueskyReposts: 30,
        blueskyReplies: 8,
        blueskyQuotes: 3,
      },
    ],
    ...overrides,
  }
}

function rawCampaign(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'camp-1',
    key: 'cfp',
    title: 'Call for papers',
    startDate: '2027-01-10',
    endDate: '2027-03-01',
    provisional: false,
    startMilestone: 'CFP_OPEN',
    endMilestone: 'CFP_CLOSE',
    primaryOutcome: 'cfpSubmissions',
    outcomeTargetPage: '/cfp',
    target: 80,
    optional: false,
    tasks: [],
    snapshot: rawSnapshot(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCampaignLedger', () => {
  it('is null when the Campaign is not this conference’s', async () => {
    h.fetch.mockResolvedValue(null)
    expect(await getCampaignLedger('camp-1', CONF)).toBeNull()
  })

  it('scopes the read to the conference and the named Campaign', async () => {
    h.fetch.mockResolvedValue(rawCampaign())
    await getCampaignLedger('camp-1', CONF)

    const [query, params] = h.fetch.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(params).toMatchObject({ conferenceId: CONF, campaignId: 'camp-1' })
    // The root and BOTH nested roots carry the conference predicate: a Task or
    // a Snapshot pointing at this Campaign from another edition is not ours.
    expect(query.match(/conference\._ref == \$conferenceId/g)).toHaveLength(3)
    expect(query).toContain('order(date desc)[0]')
  })

  it('reads the stored numbers onto the ledger', async () => {
    h.fetch.mockResolvedValue(rawCampaign())
    const ledger = await getCampaignLedger('camp-1', CONF)

    expect(ledger?.campaign).toMatchObject({
      key: 'cfp',
      title: 'Call for papers',
      primaryOutcome: 'cfpSubmissions',
      outcomeTargetPage: '/cfp',
      target: 80,
    })
    expect(ledger?.snapshot).toMatchObject({
      date: '2027-02-28',
      primaryValue: 68,
      primaryAttributed: true,
      primaryAttributedValue: 41,
      source: { posthog: 'ok', bluesky: 'ok' },
    })
    // The four stored counters become the one number the table shows.
    expect(ledger?.snapshot?.perTask).toEqual([
      { taskId: 'task-1', sessions: 612, clicks: 58, blueskyInteractions: 141 },
    ])
  })

  it('keeps an UNREAD count null instead of turning it into a zero', async () => {
    h.fetch.mockResolvedValue(
      rawCampaign({
        snapshot: rawSnapshot({
          primaryOutcomeValue: null,
          primaryOutcomeAttributedValue: null,
          secondary: {
            attributedSessions: null,
            checkoutClickThrough: null,
            blueskyInteractions: 214,
          },
          source: { posthog: 'unavailable', bluesky: 'ok' },
          perTask: [
            {
              taskId: 'task-1',
              sessions: null,
              clicks: null,
              blueskyLikes: null,
              blueskyReposts: null,
              blueskyReplies: null,
              blueskyQuotes: null,
            },
          ],
        }),
      }),
    )
    const snapshot = (await getCampaignLedger('camp-1', CONF))?.snapshot

    expect(snapshot?.primaryValue).toBeNull()
    expect(snapshot?.primaryAttributedValue).toBeNull()
    expect(snapshot?.secondary.attributedSessions).toBeNull()
    expect(snapshot?.secondary.blueskyInteractions).toBe(214)
    expect(snapshot?.source.posthog).toBe('unavailable')
    expect(snapshot?.perTask[0]).toEqual({
      taskId: 'task-1',
      sessions: null,
      clicks: null,
      blueskyInteractions: null,
    })
  })

  it('keeps a genuine ZERO distinct from an unread count', async () => {
    h.fetch.mockResolvedValue(
      rawCampaign({
        snapshot: rawSnapshot({
          primaryOutcomeValue: 0,
          perTask: [
            {
              taskId: 'task-1',
              sessions: 0,
              clicks: 0,
              blueskyLikes: 0,
              blueskyReposts: 0,
              blueskyReplies: 0,
              blueskyQuotes: 0,
            },
          ],
        }),
      }),
    )
    const snapshot = (await getCampaignLedger('camp-1', CONF))?.snapshot
    expect(snapshot?.primaryValue).toBe(0)
    expect(snapshot?.perTask[0].blueskyInteractions).toBe(0)
  })

  it('carries the NOT-ATTRIBUTED label through, and defaults a missing one to attributed', async () => {
    h.fetch.mockResolvedValue(
      rawCampaign({
        snapshot: rawSnapshot({ primaryOutcomeAttributed: false }),
      }),
    )
    expect(
      (await getCampaignLedger('camp-1', CONF))?.snapshot?.primaryAttributed,
    ).toBe(false)

    h.fetch.mockResolvedValue(
      rawCampaign({
        snapshot: rawSnapshot({ primaryOutcomeAttributed: undefined }),
      }),
    )
    expect(
      (await getCampaignLedger('camp-1', CONF))?.snapshot?.primaryAttributed,
    ).toBe(true)
  })

  it('reports NO reading rather than an empty one when none has been taken', async () => {
    h.fetch.mockResolvedValue(rawCampaign({ snapshot: null }))
    expect((await getCampaignLedger('camp-1', CONF))?.snapshot).toBeNull()

    // A row with no `date` is not a reading either.
    h.fetch.mockResolvedValue(
      rawCampaign({ snapshot: rawSnapshot({ date: null }) }),
    )
    expect((await getCampaignLedger('camp-1', CONF))?.snapshot).toBeNull()
  })

  it('drops a perTask entry whose Task reference has gone', async () => {
    h.fetch.mockResolvedValue(
      rawCampaign({
        snapshot: rawSnapshot({
          perTask: [
            { taskId: null, sessions: 5, clicks: 1 },
            { taskId: 'task-1', sessions: 6, clicks: 2 },
          ],
        }),
      }),
    )
    const snapshot = (await getCampaignLedger('camp-1', CONF))?.snapshot
    expect(snapshot?.perTask.map((row) => row.taskId)).toEqual(['task-1'])
  })
})
