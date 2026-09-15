/**
 * Channel ceilings (spec §5.4): warnings, never blocks.
 */
import { describe, it, expect } from 'vitest'
import {
  ceilingWarnings,
  describeCeilingWarning,
  warningsTouching,
  type CeilingEntry,
} from './ceilings'

const EVENT_WEEK = { start: '2027-06-09', end: '2027-06-11' }

let n = 0
const post = (
  channel: CeilingEntry['channel'],
  at: string,
  taskKey: string | null = `beat${++n}:${channel}`,
): CeilingEntry => ({ variantId: `v${++n}`, taskKey, channel, at })

describe('ceilingWarnings', () => {
  it('is silent within the limits', () => {
    expect(
      ceilingWarnings(
        [
          post('linkedin', '2027-05-01T06:00:00.000Z'),
          post('bluesky', '2027-05-01T16:00:00.000Z'),
          post('bluesky', '2027-05-01T17:00:00.000Z'),
          post('bluesky', '2027-05-01T18:00:00.000Z'),
          post('linkedin', '2027-05-02T06:00:00.000Z'),
        ],
        EVENT_WEEK,
      ),
    ).toEqual([])
  })

  it('counts a post the posts table made, with no Task of its own', () => {
    const a = post('linkedin', '2027-05-01T06:00:00.000Z')
    const loose = post('linkedin', '2027-05-01T12:00:00.000Z', null)
    expect(ceilingWarnings([a, loose], EVENT_WEEK)).toMatchObject([
      { kind: 'perDay', count: 2, variantIds: [a.variantId, loose.variantId] },
    ])
  })

  it('warns at a second LinkedIn post on one Oslo day, naming both posts', () => {
    const a = post('linkedin', '2027-05-01T06:00:00.000Z')
    const b = post('linkedin', '2027-05-01T20:00:00.000Z')
    expect(ceilingWarnings([a, b], EVENT_WEEK)).toEqual([
      {
        kind: 'perDay',
        channel: 'linkedin',
        day: '2027-05-01',
        count: 2,
        limit: 1,
        variantIds: [a.variantId, b.variantId],
      },
    ])
  })

  it('counts by the Oslo calendar day, not the UTC one', () => {
    // 23:30 UTC on 04-30 is 01:30 on 05-01 in Oslo (CEST).
    const warnings = ceilingWarnings(
      [
        post('linkedin', '2027-04-30T23:30:00.000Z'),
        post('linkedin', '2027-05-01T06:00:00.000Z'),
      ],
      EVENT_WEEK,
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ day: '2027-05-01' })
  })

  it('warns at a fourth Bluesky post on one day', () => {
    const four = [14, 15, 16, 17].map((h) =>
      post('bluesky', `2027-05-01T${h}:00:00.000Z`),
    )
    expect(ceilingWarnings(four, EVENT_WEEK)).toMatchObject([
      { kind: 'perDay', channel: 'bluesky', count: 4, limit: 3 },
    ])
  })

  it('lets event week run freely on both Channels', () => {
    const busy = [6, 8, 10, 12, 14].flatMap((h) => [
      post('linkedin', `2027-06-10T${String(h).padStart(2, '0')}:00:00.000Z`),
      post('bluesky', `2027-06-10T${String(h).padStart(2, '0')}:00:00.000Z`),
    ])
    expect(ceilingWarnings(busy, EVENT_WEEK)).toEqual([])
  })

  it('warns at a fourth LinkedIn countdown, wherever it falls', () => {
    const countdowns = [
      post('linkedin', '2027-05-20T06:00:00.000Z', 'countdown3w:linkedin'),
      post('linkedin', '2027-06-03T06:00:00.000Z', 'countdown1w:linkedin'),
      post('linkedin', '2027-06-09T06:00:00.000Z', 'countdown1d:linkedin'),
      post('linkedin', '2027-06-10T06:00:00.000Z', 'countdown0d:linkedin'),
    ]
    expect(ceilingWarnings(countdowns, EVENT_WEEK)).toEqual([
      {
        kind: 'countdowns',
        channel: 'linkedin',
        count: 4,
        limit: 3,
        variantIds: countdowns.map((c) => c.variantId),
      },
    ])
    // Bluesky countdowns are daily by design and never counted.
    expect(
      ceilingWarnings(
        [1, 2, 3, 4].map((d) =>
          post(
            'bluesky',
            `2027-05-0${d}T16:00:00.000Z`,
            `countdown:d-${d}:bluesky`,
          ),
        ),
        EVENT_WEEK,
      ),
    ).toEqual([])
  })
})

describe('ceilingWarnings — what still counts', () => {
  it('says nothing about days that have already passed', () => {
    const yesterday = [
      post('linkedin', '2027-04-30T06:00:00.000Z'),
      post('linkedin', '2027-04-30T12:00:00.000Z'),
    ]
    expect(ceilingWarnings(yesterday, EVENT_WEEK, '2027-05-01')).toEqual([])
    // Without a floor, history is counted like anything else.
    expect(ceilingWarnings(yesterday, EVENT_WEEK)).toHaveLength(1)
  })

  it('counts a countdown only while it is still ahead', () => {
    const countdowns = [
      post('linkedin', '2027-04-20T06:00:00.000Z', 'countdown4w:linkedin'),
      post('linkedin', '2027-05-20T06:00:00.000Z', 'countdown3w:linkedin'),
      post('linkedin', '2027-06-03T06:00:00.000Z', 'countdown1w:linkedin'),
      post('linkedin', '2027-06-08T06:00:00.000Z', 'countdown1d:linkedin'),
    ]
    expect(ceilingWarnings(countdowns, EVENT_WEEK, '2027-05-01')).toEqual([])
    expect(ceilingWarnings(countdowns, EVENT_WEEK, '2027-04-01')).toMatchObject(
      [{ kind: 'countdowns', count: 4 }],
    )
  })
})

describe('warningsTouching / describeCeilingWarning', () => {
  const a = post('linkedin', '2027-05-01T06:00:00.000Z')
  const b = post('linkedin', '2027-05-01T07:00:00.000Z')
  const c = post('bluesky', '2027-05-02T07:00:00.000Z')
  const warnings = ceilingWarnings([a, b, c], EVENT_WEEK)

  it('keeps only the warnings a Task is part of', () => {
    expect(warningsTouching(warnings, [a.variantId])).toHaveLength(1)
    expect(warningsTouching(warnings, [c.variantId])).toEqual([])
  })

  it('reads as one sentence', () => {
    expect(describeCeilingWarning(warnings[0])).toBe(
      'LinkedIn has 2 posts on 1. mai 2027; the ceiling outside event week is 1 a day.',
    )
    expect(
      describeCeilingWarning({
        kind: 'countdowns',
        channel: 'linkedin',
        count: 4,
        limit: 3,
        variantIds: [],
      }),
    ).toBe('LinkedIn has 4 countdown posts; the ceiling is 3.')
  })
})
