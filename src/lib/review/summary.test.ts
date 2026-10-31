/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { reviewStats, summarizeReviews } from './summary'
import { calculateAverageRating, reviewCountOf } from '@/lib/proposal'
import type { ProposalExisting } from '@/lib/proposal/types'

vi.mock('@/lib/sanity/client', () => ({}))
const { REVIEW_COUNT_FIELD, REVIEW_SCORES_FIELD } =
  await import('@/lib/proposal/data/sanity')

const s = (content: number, relevance: number, speaker: number) => ({
  score: { content, relevance, speaker },
})

describe('summarizeReviews', () => {
  it('averages each category and the total', () => {
    expect(summarizeReviews([s(4, 5, 3), s(2, 3, 1)])).toEqual({
      count: 2,
      content: 3,
      relevance: 4,
      speaker: 2,
      total: 9,
    })
  })

  it('adds reviews to a folded base, weighted by its count', () => {
    const base = {
      ...summarizeReviews([s(5, 5, 5), s(5, 5, 5)]),
      foldedAt: 'x',
    }
    expect(summarizeReviews([s(2, 2, 2)], base)).toMatchObject({
      count: 3,
      content: 4,
      total: 12,
    })
  })

  it('ignores a backfilled base: its reviews are still live', () => {
    const base = summarizeReviews([s(5, 5, 5)])
    expect(summarizeReviews([s(5, 5, 5)], base).count).toBe(1)
  })

  it('is empty for no reviews', () => {
    expect(reviewStats([], null)).toEqual({ count: 0, averageTotal: 0 })
  })
})

describe('readers fall back to the folded summary', () => {
  const folded = {
    count: 4,
    content: 4,
    relevance: 4,
    speaker: 4,
    total: 12,
    foldedAt: 'x',
  }

  it('calculateAverageRating and reviewCountOf', () => {
    const talk = {
      reviews: [],
      reviewSummary: folded,
    } as unknown as ProposalExisting
    expect(reviewCountOf(talk)).toBe(4)
    expect(calculateAverageRating(talk)).toBe(4)
  })

  it('the GROQ count and score fields add folded and live reviews', async () => {
    const dataset = [
      { _id: 't1', _type: 'talk', reviewSummary: folded },
      {
        _id: 't2',
        _type: 'talk',
        reviewSummary: { ...folded, foldedAt: undefined },
      },
      { _id: 'r1', _type: 'review', proposal: { _ref: 't1' }, ...s(1, 1, 1) },
      { _id: 'r2', _type: 'review', proposal: { _ref: 't2' }, ...s(2, 2, 2) },
    ]
    const query = `*[_type == "talk"] | order(_id){ ${REVIEW_COUNT_FIELD}, ${REVIEW_SCORES_FIELD} }`
    const rows = await (await evaluate(parse(query), { dataset })).get()
    expect(rows).toEqual([
      {
        reviewCount: 5,
        reviewScores: [{ total: 3 }, { total: 12, weight: 4 }],
      },
      // Backfilled (not folded) summary is not counted on top of live reviews.
      { reviewCount: 1, reviewScores: [{ total: 6 }] },
    ])
  })
})
