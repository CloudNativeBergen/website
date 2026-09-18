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
import { evaluate, parse } from 'groq-js'

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
  it('is null when the scoped read finds nothing', async () => {
    // What a foreign or nonexistent id looks like once the predicates below
    // have done their work: no row, and therefore no ledger.
    h.fetch.mockResolvedValue(null)
    expect(await getCampaignLedger('camp-1', CONF)).toBeNull()
  })

  it('scopes the read to the conference AND to the named Campaign', async () => {
    h.fetch.mockResolvedValue(rawCampaign())
    await getCampaignLedger('camp-1', CONF)

    const [query, params] = h.fetch.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(params).toMatchObject({ conferenceId: CONF, campaignId: 'camp-1' })
    // The ROOT is both the conference's and the named Campaign; a bare
    // `_id ==` would return another tenant's Campaign to this reader.
    expect(query).toMatch(
      /\*\[conference\._ref == \$conferenceId && \(_type == "marketingCampaign" && _id == \$campaignId/,
    )
    // Nested Task, Snapshot, and handoff recipient roots repeat the conference
    // predicate: a Task or a Snapshot
    // pointing at this Campaign from another edition is not ours.
    expect(query.match(/conference\._ref == \$conferenceId/g)).toHaveLength(4)
    expect(query.match(/campaign\._ref == \^\._id/g)).toHaveLength(2)
    expect(query).toContain('order(date desc, takenAt desc, _id desc)[0]')
    // Neither drafts nor version clones ride along on any of the four roots.
    expect(query.match(/!\(_id in path\("drafts\.\*\*"\)\)/g)).toHaveLength(4)
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

it('reattaches reseeded history by key, takes the newest same-day reading, and respects the metric', async () => {
  const ref = (_ref: string) => ({ _type: 'reference', _ref })
  const dataset = [
    { ...rawCampaign(), _type: 'marketingCampaign', conference: ref(CONF) },
    ...[
      ['old', '2027-03-01T01:00:00Z', 11, 'cfpSubmissions', CONF],
      ['new', '2027-03-01T03:00:00Z', 22, 'cfpSubmissions', CONF],
      ['metric', '2027-03-01T02:00:00Z', 99, 'ticketsSoldInWindow', CONF],
      ['foreign', '2027-03-01T05:00:00Z', 88, 'cfpSubmissions', 'foreign'],
    ].map(([id, takenAt, value, metric, conf]) => ({
      ...rawSnapshot(),
      _id: id,
      _type: 'marketingSnapshot',
      campaign: ref('deleted-campaign'),
      campaignKey: 'cfp',
      campaignPrimaryOutcome: metric,
      conference: ref(conf as string),
      takenAt,
      primaryOutcomeValue: value,
    })),
  ]
  h.fetch.mockImplementation(async (query, params) =>
    (await evaluate(parse(query), { dataset, params })).get(),
  )
  expect(
    (await getCampaignLedger('camp-1', CONF))?.snapshot?.primaryValue,
  ).toBe(22)
})

it('matches historical per-Task numbers to the reseeded Task key', async () => {
  h.fetch.mockResolvedValue(
    rawCampaign({
      tasks: [
        {
          _id: 'new-task',
          campaignId: 'camp-1',
          kind: 'checklist',
          key: 'stable-key',
        },
      ],
      snapshot: rawSnapshot({
        perTask: [
          {
            taskId: 'deleted-task',
            taskKey: 'stable-key',
            sessions: 12,
            clicks: 4,
          },
        ],
      }),
    }),
  )
  expect(
    (await getCampaignLedger('camp-1', CONF))?.snapshot?.perTask[0],
  ).toMatchObject({ taskId: 'new-task', sessions: 12, clicks: 4 })
})

it('withholds only the primary figure after an outcome edit, keeping the funnel and per-Task rows', async () => {
  // Dropping the WHOLE reading over an Outcome edit was a bigger bug than the
  // one it fixed. `computeCampaignOutcome` derives `secondary` and `perTask`
  // from the attributed window alone — the Outcome is consumed only inside
  // `primaryOutcome()` — so those numbers are unaffected and still true. The
  // ledger nonetheless said "No reading has been taken for this campaign yet"
  // and blanked every funnel card and per-Task row until the next nightly run.
  h.fetch.mockResolvedValue(
    rawCampaign({
      snapshot: rawSnapshot({
        campaignPrimaryOutcome: 'ticketsSoldInWindow',
        primaryOutcomeValue: 99,
      }),
    }),
  )
  const kept = (await getCampaignLedger('camp-1', CONF))?.snapshot
  expect(kept?.measuredOutcome).toBe('ticketsSoldInWindow')
  // The old metric's number is withheld: it counted something else.
  expect([kept?.primaryValue, kept?.primaryAttributedValue]).toEqual([
    null,
    null,
  ])
  // Everything the Outcome cannot affect survives intact.
  expect(kept?.date).toBe('2027-02-28')
  expect(kept?.secondary).toEqual({
    attributedSessions: 1204,
    checkoutClickThrough: 96,
    blueskyInteractions: 214,
  })
  expect(kept?.perTask).toEqual([
    { taskId: 'task-1', sessions: 612, clicks: 58, blueskyInteractions: 141 },
  ])
})

it('labels a reading from the previous plan and drops its per-Task rows', async () => {
  // Deletion preserves Snapshots on purpose and the delete dialog invites the
  // organizer to seed a new plan. The Template recreates Campaigns with the
  // SAME stable keys, and the ledger joins on the key so history survives a
  // Campaign deletion — so the old plan's last reading came back as the new
  // Campaign's "latest", unannotated, because the Outcome and window matched.
  // Worse, the per-Task rows were rebound by `taskKey` onto the freshly seeded
  // Tasks, so never-published drafts displayed last cycle's engagement.
  h.fetch.mockResolvedValue(
    rawCampaign({
      snapshot: rawSnapshot({ measuredCampaignId: 'camp-previous-plan' }),
    }),
  )
  const kept = (await getCampaignLedger('camp-1', CONF))?.snapshot
  expect(kept?.measuredBeforeReseed).toBe(true)
  // The campaign-level figure is real history for this key, so it is shown.
  expect(kept?.primaryValue).toBe(68)
  // The per-Task rows measured Tasks that no longer exist.
  expect(kept?.perTask).toEqual([])

  // A reading taken against THIS Campaign document is untouched.
  h.fetch.mockResolvedValue(
    rawCampaign({ snapshot: rawSnapshot({ measuredCampaignId: 'camp-1' }) }),
  )
  const current = (await getCampaignLedger('camp-1', CONF))?.snapshot
  expect(current?.measuredBeforeReseed).toBe(false)
  expect(current?.perTask).toHaveLength(1)
})

it('names the window a reading was measured in when the Campaign has moved on', async () => {
  // `strictWindow` counts cfpSubmissions strictly inside the Campaign's dates,
  // so a window edit changes what the number counts even though the metric's
  // name did not. Showing yesterday's count under today's dates reads as
  // current and is not. Same rule as `sameMeasurementBasis` in the Report.
  const measuredInOldWindow = rawCampaign({
    snapshot: rawSnapshot({
      campaignPrimaryOutcome: 'cfpSubmissions',
      campaignStartDate: '2026-11-01',
      campaignEndDate: '2027-02-01',
    }),
  })
  h.fetch.mockResolvedValue(measuredInOldWindow)
  const kept = (await getCampaignLedger('camp-1', CONF))?.snapshot
  // Kept, not dropped: #1078 re-dates Campaign windows whenever a Milestone is
  // set, so blanking here blanked the ledger during normal operation. The
  // number is still true of the span it covered, so the span is named.
  expect(kept?.primaryValue).toBe(68)
  expect(kept?.measuredWindow).toEqual({
    startDate: '2026-11-01',
    endDate: '2027-02-01',
  })

  const measuredInThisWindow = rawCampaign({
    snapshot: rawSnapshot({
      campaignPrimaryOutcome: 'cfpSubmissions',
      campaignStartDate: '2027-01-10',
      campaignEndDate: '2027-03-01',
    }),
  })
  h.fetch.mockResolvedValue(measuredInThisWindow)
  const current = (await getCampaignLedger('camp-1', CONF))?.snapshot
  expect(current?.primaryValue).toBe(68)
  expect(current?.measuredWindow).toBeNull()
})

it('trusts a pre-migration reading that carries no denormalized basis at all', async () => {
  // Those rows predate the ability to edit a window, so there is nothing to
  // disagree with — dropping them would blank the ledger for every edition
  // whose history was written before 052.
  h.fetch.mockResolvedValue(rawCampaign({ snapshot: rawSnapshot() }))
  expect(
    (await getCampaignLedger('camp-1', CONF))?.snapshot?.primaryValue,
  ).toBe(68)
})
