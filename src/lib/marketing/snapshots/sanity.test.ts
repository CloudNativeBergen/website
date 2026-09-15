/**
 * The §6.4 CEILINGS, which the engine tests do not reach: how many editions
 * one run serves and in what order, and how many mutations ride in one Sanity
 * transaction. They are the reason a platform with many tenants stays inside
 * the function timeout and inside Sanity's transaction limit.
 */
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientWrite: { transaction: h.transaction, patch: h.patch },
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CONFERENCES_PER_RUN,
  MAX_MUTATIONS_PER_TRANSACTION,
  firstPublishedAt,
  resolveSnapshotConferences,
  writeSnapshots,
} from './sanity'
import type { SnapshotDocument } from './types'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  transaction: vi.fn(),
  patch: vi.fn(),
}))

function planRow(n: number, lastSnapshotAt: string | null) {
  return {
    planId: `plan-${n}`,
    conferenceId: `conf-${n}`,
    lastSnapshotAt,
  }
}

function document(id: string): SnapshotDocument {
  return {
    _id: id,
    _type: 'marketingSnapshot',
    campaign: { _type: 'reference', _ref: 'camp-1' },
    conference: { _type: 'reference', _ref: 'conf-1' },
    date: '2026-03-01',
    primaryOutcomeValue: null,
    primaryOutcomeAttributed: true,
    primaryOutcomeAttributedValue: null,
    secondary: {
      attributedSessions: null,
      checkoutClickThrough: null,
      blueskyInteractions: null,
    },
    perTask: [],
    source: { posthog: 'unavailable', bluesky: 'unavailable' },
    takenAt: '2026-03-02T04:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveSnapshotConferences', () => {
  it('serves the edition waiting LONGEST first, a never-served plan first of all', async () => {
    h.fetch.mockResolvedValue([
      planRow(1, '2026-03-01T04:00:00.000Z'),
      planRow(2, null),
      planRow(3, '2026-02-01T04:00:00.000Z'),
    ])
    expect(await resolveSnapshotConferences()).toEqual([
      { planId: 'plan-2', conferenceId: 'conf-2' },
      { planId: 'plan-3', conferenceId: 'conf-3' },
      { planId: 'plan-1', conferenceId: 'conf-1' },
    ])
  })

  it('caps one run, so the cap is backpressure and not a longer function', async () => {
    h.fetch.mockResolvedValue(
      Array.from({ length: MAX_CONFERENCES_PER_RUN + 7 }, (_, i) =>
        planRow(
          i,
          `2026-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        ),
      ),
    )
    const served = await resolveSnapshotConferences()
    expect(served).toHaveLength(MAX_CONFERENCES_PER_RUN)
    expect(MAX_CONFERENCES_PER_RUN).toBe(20)
  })

  it('drops a plan whose conference reference is gone', async () => {
    h.fetch.mockResolvedValue([
      { planId: 'plan-1', conferenceId: null, lastSnapshotAt: null },
      planRow(2, null),
    ])
    expect(await resolveSnapshotConferences()).toEqual([
      { planId: 'plan-2', conferenceId: 'conf-2' },
    ])
  })
})

describe('writeSnapshots', () => {
  function fakeTransactions() {
    const committed: string[][] = []
    h.transaction.mockImplementation(() => {
      const ids: string[] = []
      const tx = {
        createOrReplace: (doc: SnapshotDocument) => {
          ids.push(doc._id)
          return tx
        },
        commit: async () => {
          committed.push(ids)
        },
      }
      return tx
    })
    return committed
  }

  it('holds every transaction to the documented mutation ceiling', async () => {
    const committed = fakeTransactions()
    const documents = Array.from(
      { length: MAX_MUTATIONS_PER_TRANSACTION * 2 + 3 },
      (_, i) => document(`snap-${i}`),
    )
    await writeSnapshots(documents)

    expect(committed.map((ids) => ids.length)).toEqual([
      MAX_MUTATIONS_PER_TRANSACTION,
      MAX_MUTATIONS_PER_TRANSACTION,
      3,
    ])
    // Every document is written exactly once, in order.
    expect(committed.flat()).toEqual(documents.map((d) => d._id))
    expect(MAX_MUTATIONS_PER_TRANSACTION).toBe(50)
  })

  it('opens no transaction at all for nothing to write', async () => {
    fakeTransactions()
    await writeSnapshots([])
    expect(h.transaction).not.toHaveBeenCalled()
  })
})

describe('firstPublishedAt', () => {
  it('is the EARLIEST successful attempt, not the last one', async () => {
    expect(
      firstPublishedAt([
        { at: '2026-02-02T10:00:00Z', outcome: 'transient' },
        { at: '2026-02-02T18:00:00Z', outcome: 'published' },
        { at: '2026-02-03T09:00:00Z', outcome: 'published' },
      ]),
    ).toBe('2026-02-02T18:00:00Z')
  })

  it('counts a hand-posted variant as published', () => {
    expect(
      firstPublishedAt([{ at: '2026-02-04T08:00:00Z', outcome: 'manual' }]),
    ).toBe('2026-02-04T08:00:00Z')
  })

  it('is null when every attempt failed, and for no attempts at all', () => {
    expect(
      firstPublishedAt([
        { at: '2026-02-02T10:00:00Z', outcome: 'transient' },
        { at: '2026-02-02T11:00:00Z', outcome: 'rate-limited' },
        { at: '2026-02-02T12:00:00Z', outcome: 'awaiting-manual' },
      ]),
    ).toBeNull()
    expect(firstPublishedAt([])).toBeNull()
    expect(firstPublishedAt(null)).toBeNull()
    expect(firstPublishedAt([{ at: null, outcome: 'published' }])).toBeNull()
  })
})
