import { describe, expect, it } from 'vitest'
import { responseBuckets, selectionIds } from './buckets'
import type { FeedbackColour } from './colour'

const r = (
  id: string,
  submittedAt: string,
  colour: FeedbackColour = 'green',
) => ({
  id,
  colour,
  submittedAt,
})
// 09:00–09:40 Oslo (CEST) on 2026-06-10: open 07:00Z until 07:40Z next day.
const WINDOW = {
  opensAt: '2026-06-10T07:00:00.000Z',
  closesAt: '2026-06-11T07:40:00.000Z',
}

describe('responseBuckets (§10.2: 10-minute buckets across the window)', () => {
  it('runs from the window’s opening to now while it is open, counting each colour', () => {
    const buckets = responseBuckets({
      responses: [
        r('a', '2026-06-10T07:00:00Z'),
        r('b', '2026-06-10T07:09:59Z', 'red'),
        r('c', '2026-06-10T07:10:00Z'),
        r('d', '2026-06-10T07:35:00Z', 'yellow'),
      ],
      window: WINDOW,
      now: new Date('2026-06-10T07:42:00Z'),
    })
    expect(buckets.map((b) => [b.start, b.ids])).toEqual([
      ['2026-06-10T07:00:00.000Z', ['a', 'b']],
      ['2026-06-10T07:10:00.000Z', ['c']],
      ['2026-06-10T07:20:00.000Z', []],
      ['2026-06-10T07:30:00.000Z', ['d']],
      ['2026-06-10T07:40:00.000Z', []],
    ])
    expect(buckets[0].counts).toEqual({ green: 1, yellow: 0, red: 1 })
    expect(buckets[0].end).toBe('2026-06-10T07:10:00.000Z')
  })

  it('runs to the window’s close once it has closed: 24 h 40 min is 148 buckets', () => {
    const buckets = responseBuckets({
      responses: [r('a', '2026-06-10T07:05:00Z')],
      window: WINDOW,
      now: new Date('2026-06-20T00:00:00Z'),
    })
    expect(buckets).toHaveLength(148)
    expect(buckets.at(-1)!.end).toBe('2026-06-11T07:40:00.000Z')
  })

  it('starts at the window’s opening, not at the first answer', () => {
    const buckets = responseBuckets({
      responses: [r('late', '2026-06-10T07:25:00Z')],
      window: WINDOW,
      now: new Date('2026-06-10T07:26:00Z'),
    })
    expect(buckets.map((b) => b.ids)).toEqual([[], [], ['late']])
    expect(buckets[0].start).toBe('2026-06-10T07:00:00.000Z')
  })

  it('stretches to hold a response outside the window (the session moved)', () => {
    const buckets = responseBuckets({
      responses: [r('early', '2026-06-10T06:31:00Z')],
      window: WINDOW,
      now: new Date('2026-06-10T07:15:00Z'),
    })
    expect(buckets[0]).toMatchObject({
      start: '2026-06-10T06:30:00.000Z',
      ids: ['early'],
    })
    expect(buckets.at(-1)!.start).toBe('2026-06-10T07:10:00.000Z')
  })

  it('spans only the responses for a talk with no slot', () => {
    const buckets = responseBuckets({
      responses: [
        r('a', '2026-06-10T10:03:00Z'),
        r('b', '2026-06-10T10:24:00Z'),
      ],
      window: {},
      now: new Date('2026-06-20T00:00:00Z'),
    })
    expect(buckets.map((b) => b.ids)).toEqual([['a'], [], ['b']])
  })

  it('has no buckets without responses', () => {
    expect(
      responseBuckets({ responses: [], window: WINDOW, now: new Date() }),
    ).toEqual([])
  })
})

describe('selectionIds', () => {
  it('gives the ids of the buckets from one end of the range to the other, either way round', () => {
    const buckets = responseBuckets({
      responses: [
        r('a', '2026-06-10T07:00:00Z'),
        r('b', '2026-06-10T07:10:00Z'),
        r('c', '2026-06-10T07:20:00Z'),
      ],
      window: WINDOW,
      now: new Date('2026-06-10T07:25:00Z'),
    })
    expect(selectionIds(buckets, { anchor: 2, focus: 1 })).toEqual(['b', 'c'])
    expect(selectionIds(buckets, { anchor: 0, focus: 0 })).toEqual(['a'])
  })
})
