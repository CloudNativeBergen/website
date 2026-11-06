/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/conference/konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../__tests__/helpers/rolloutFlags'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  readTalkVersions: vi.fn(),
  ops: [] as string[],
  commit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))
vi.mock('@/lib/feedback/sanity', () => {
  const patch = {
    ifRevisionId: () => patch,
    set: () => patch,
    unset: () => patch,
  }
  const tx = {
    patch: (id: string, fn: (p: typeof patch) => unknown) => {
      fn(patch)
      h.ops.push(`patch:${id}`)
      return tx
    },
    delete: (id: string) => {
      h.ops.push(`delete:${id}`)
      return tx
    },
    commit: h.commit,
  }
  return {
    PUBLISHED_ONLY: 'true',
    versionsClient: () => ({ transaction: () => tx }),
  }
})
vi.mock('@/lib/feedback/talk-versions', () => ({
  readTalkVersions: h.readTalkVersions,
  lockRevision: (p: { ifRevisionId: (r: string) => unknown }, rev: string) =>
    p.ifRevisionId(rev),
}))

import { foldExpiredReviews, foldSummary, pickReviewBatch } from './retention'

const now = new Date('2026-10-31T12:00:00Z')
const review = (id: string, talk: string, n = 3) => ({
  _id: id,
  _rev: `rev-${id}`,
  talk,
  score: { content: n, relevance: n, speaker: n },
})
const talk = (id: string) => ({ _id: id, _rev: `rev-${id}`, _type: 'talk' })
const versionsOf = (
  versions: ReturnType<typeof talk>[] = [],
  locked: ReturnType<typeof talk>[] = [],
) => ({
  published: talk('t1'),
  versions,
  locked,
  releasesListed: true,
})

describe('pickReviewBatch and foldSummary', () => {
  it('keeps talks whole within the budget', () => {
    const batch = pickReviewBatch(
      [review('r1', 't1'), review('r2', 't1'), review('r3', 't2')],
      2,
    )
    expect([...batch.keys()]).toEqual(['t1'])
  })

  it('does not count draft reviews', () => {
    const summary = foldSummary(
      talk('t1'),
      [review('r1', 't1', 4), review('drafts.r2', 't1', 1)],
      now,
    )
    expect(summary).toMatchObject({
      count: 1,
      total: 12,
      foldedAt: now.toISOString(),
    })
  })
})

describe('foldExpiredReviews', () => {
  beforeEach(() => {
    h.fetch.mockReset()
    h.commit.mockReset()
    h.readTalkVersions.mockReset()
    h.ops.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const arrange = (reviews = [review('r1', 't1')]) =>
    h.fetch
      .mockResolvedValueOnce([{ _id: 'c1', endDate: '2020-01-01' }])
      .mockResolvedValueOnce(['t1'])
      .mockResolvedValueOnce(reviews)

  it('writes the summary to every writable version, then deletes, in one transaction', async () => {
    arrange([review('r1', 't1'), review('drafts.r2', 't1')])
    h.readTalkVersions.mockResolvedValueOnce(
      versionsOf([talk('drafts.t1'), talk('versions.rel.t1')]),
    )
    expect(await foldExpiredReviews()).toEqual({ talks: 1, deleted: 2 })
    expect(h.ops).toEqual([
      'patch:t1',
      'patch:drafts.t1',
      'patch:versions.rel.t1',
      'patch:r1',
      'delete:r1',
      'patch:drafts.r2',
      'delete:drafts.r2',
    ])
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.fetch.mock.calls[1][0]).toContain(
      'conference._ref == $conferenceId',
    )
  })

  it('skips a talk with a locked release version', async () => {
    arrange()
    h.readTalkVersions.mockResolvedValueOnce(
      versionsOf([], [talk('versions.sched.t1')]),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await foldExpiredReviews()).toEqual({ talks: 0, deleted: 0 })
    expect(h.ops).toEqual([])
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('deletes nothing when the transaction fails', async () => {
    arrange()
    h.readTalkVersions.mockResolvedValueOnce(versionsOf())
    h.commit.mockRejectedValueOnce(new Error('revision mismatch'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await foldExpiredReviews()).toEqual({ talks: 0, deleted: 0 })
  })

  it('writes nothing on a dry run', async () => {
    arrange()
    h.readTalkVersions.mockResolvedValueOnce(versionsOf())
    expect(await foldExpiredReviews(true)).toEqual({ talks: 1, deleted: 1 })
    expect(h.commit).not.toHaveBeenCalled()
  })

  describe('D1 gateway values and fallbacks (#1997)', () => {
    it('uses D1 endDate when tenant has apiRead enabled (postponed edition is spared)', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      flagTenants('apiRead', 'c1')

      // Sanity endDate is 2020-01-01, but D1 postponed to 2099-01-01
      h.fetch.mockResolvedValueOnce([
        {
          _id: 'c1',
          endDate: '2020-01-01',
          domains: ['c1.example.com'],
        },
      ])

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'c1',
                title: 'CND 2099',
                endDate: '2099-01-01',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await foldExpiredReviews()
      expect(result).toEqual({ talks: 0, deleted: 0 })
      expect(h.ops).toEqual([])
    })

    it('uses D1 endDate when tenant has apiRead enabled (an EARLIER D1 date never widens the fold)', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      flagTenants('apiRead', 'c1')

      // Sanity endDate is 2099-01-01, but D1 ended 2020-01-01
      h.fetch
        .mockResolvedValueOnce([
          {
            _id: 'c1',
            endDate: '2099-01-01',
            domains: ['c1.example.com'],
          },
        ])
        .mockResolvedValueOnce(['t1'])
        .mockResolvedValueOnce([review('r1', 't1')])

      h.readTalkVersions.mockResolvedValueOnce(versionsOf())

      const gatewayFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              conference: {
                id: 'c1',
                title: 'CND 2020',
                endDate: '2020-01-01',
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await foldExpiredReviews()
      expect(gatewayFetch).toHaveBeenCalled()
      expect(result).toEqual({ talks: 0, deleted: 0 })
      expect(h.ops).toEqual([])
    })

    it('falls back to Sanity endDate when tenant is unflagged', async () => {
      vi.stubEnv('KONF_API_URL', 'https://api.example.com')
      flagTenants('apiRead', 'other-conf')

      // Sanity endDate is 2099-01-01 (not expired)
      h.fetch.mockResolvedValueOnce([
        {
          _id: 'c1',
          endDate: '2099-01-01',
          domains: ['c1.example.com'],
        },
      ])

      const gatewayFetch = vi.fn()
      vi.stubGlobal('fetch', gatewayFetch)

      const result = await foldExpiredReviews()
      expect(gatewayFetch).not.toHaveBeenCalled()
      expect(result).toEqual({ talks: 0, deleted: 0 })
    })
  })
})
