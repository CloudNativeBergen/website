import { describe, expect, it } from 'vitest'
import { feedbackTotals } from './totals'
import { hasTooFew, MIN_RANKED_RESPONSES, rankSessions } from './ranking'

const session = (
  title: string,
  [green, yellow, red]: [number, number, number],
  comments = 0,
) => ({
  title,
  totals: feedbackTotals({ live: { green, yellow, red } }),
  comments: Array.from({ length: comments }, () => ({})),
})

const titles = (list: { title: string }[]) => list.map((s) => s.title)

describe('rankSessions (speaker feedback spec §10.1)', () => {
  it('ranks by the share of Loved it, with fewer than 10 responses after the rest', () => {
    const list = [
      session('few but perfect', [9, 0, 0]),
      session('half', [5, 5, 0]),
      session('most', [9, 1, 0]),
      session('none answered', [0, 0, 0]),
      session('all of twelve', [12, 0, 0]),
      session('few and poor', [1, 2, 5]),
    ]
    expect(titles(rankSessions(list, 'lovedIt'))).toEqual([
      'all of twelve',
      'most',
      'half',
      // too few: the most answered first
      'few but perfect',
      'few and poor',
      'none answered',
    ])
  })

  it('ranks on the exact share, not the rounded percent, then on more responses', () => {
    // 99/100 (99.0 %) beats 197/199 (98.99 %), though both round to 99 %
    // and the second has more responses; 20/20 and 10/10 tie exactly.
    const list = [
      session('197 of 199', [197, 2, 0]),
      session('99 of 100', [99, 1, 0]),
      session('10 of 10', [10, 0, 0]),
      session('20 of 20', [20, 0, 0]),
    ]
    expect(titles(rankSessions(list, 'lovedIt'))).toEqual([
      '20 of 20',
      '10 of 10',
      '99 of 100',
      '197 of 199',
    ])
  })

  it('sorts by responses or by comments, most first, title breaking ties', () => {
    const list = [
      session('b', [1, 0, 0], 3),
      session('a', [1, 0, 0], 1),
      session('c', [30, 0, 0], 0),
    ]
    expect(titles(rankSessions(list, 'responses'))).toEqual(['c', 'a', 'b'])
    expect(titles(rankSessions(list, 'comments'))).toEqual(['b', 'a', 'c'])
  })

  it('never reorders its input', () => {
    const list = [session('x', [0, 0, 1]), session('y', [10, 0, 0])]
    rankSessions(list, 'lovedIt')
    expect(titles(list)).toEqual(['x', 'y'])
  })

  it('calls fewer than 10 combined responses too few, a fixed minimum', () => {
    expect(MIN_RANKED_RESPONSES).toBe(10)
    expect(hasTooFew(feedbackTotals({ live: { green: 9 } }))).toBe(true)
    expect(
      hasTooFew(feedbackTotals({ live: { green: 5 }, cards: { redCount: 5 } })),
    ).toBe(false)
  })
})
