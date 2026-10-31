/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  readTalkVersions: vi.fn(),
  ops: [] as string[],
  commit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
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

  const arrange = (reviews = [review('r1', 't1')]) =>
    h.fetch
      .mockResolvedValueOnce([{ _id: 'c1' }])
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
})
