/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  ops: [] as string[],
  commit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', () => {
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
    clientReadUncached: { fetch: h.fetch },
    clientWrite: { transaction: () => tx },
  }
})

import { foldExpiredReviews, planReviewFold } from './retention'

const now = new Date('2026-10-31T12:00:00Z')
const review = (id: string, talk: string, n = 3) => ({
  _id: id,
  _rev: `rev-${id}`,
  talk,
  score: { content: n, relevance: n, speaker: n },
})

describe('planReviewFold', () => {
  it('summarises per talk, patches the draft too, and keeps talks whole', () => {
    const plan = planReviewFold(
      [
        { _id: 't1', _rev: 'a' },
        { _id: 'drafts.t1', _rev: 'b' },
        { _id: 't2', _rev: 'c' },
      ],
      [review('r1', 't1', 4), review('r2', 't1', 2), review('r3', 't2')],
      2,
      now,
    )
    expect(plan.talks).toHaveLength(1)
    expect(plan.talks[0].docs.map((d) => d._id)).toEqual(['t1', 'drafts.t1'])
    expect(plan.talks[0].summary).toMatchObject({
      count: 2,
      total: 9,
      foldedAt: now.toISOString(),
    })
    expect(plan.reviews.map((r) => r._id)).toEqual(['r1', 'r2'])
  })

  it('leaves reviews of a talk with no published document alone', () => {
    const plan = planReviewFold(
      [{ _id: 'drafts.t1', _rev: 'b' }],
      [review('r1', 't1')],
      200,
      now,
    )
    expect(plan.reviews).toEqual([])
  })
})

describe('foldExpiredReviews', () => {
  beforeEach(() => {
    h.fetch.mockReset()
    h.commit.mockReset()
    h.ops.length = 0
  })

  const arrange = () =>
    h.fetch
      .mockResolvedValueOnce([{ _id: 'c1' }])
      .mockResolvedValueOnce([{ _id: 't1', _rev: 'a' }])
      .mockResolvedValueOnce([review('r1', 't1')])

  it('writes the summary before deleting, in one transaction', async () => {
    arrange()
    expect(await foldExpiredReviews()).toEqual({ talks: 1, deleted: 1 })
    expect(h.ops).toEqual(['patch:t1', 'patch:r1', 'delete:r1'])
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.fetch.mock.calls[1][0]).toContain(
      'conference._ref == $conferenceId',
    )
  })

  it('deletes nothing when the transaction fails', async () => {
    arrange()
    h.commit.mockRejectedValueOnce(new Error('revision mismatch'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await foldExpiredReviews()).toEqual({ talks: 0, deleted: 0 })
  })

  it('writes nothing on a dry run', async () => {
    arrange()
    expect(await foldExpiredReviews(true)).toEqual({ talks: 1, deleted: 1 })
    expect(h.commit).not.toHaveBeenCalled()
  })
})
