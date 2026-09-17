/**
 * @vitest-environment node
 *
 * The verdict and the variance were computed independently — `variance >= -5`
 * in the processor, `variance >= 0` for the arrow and colour beside it — so a
 * conference 4.2% behind target was shown a red downward arrow, "-4.2%" and
 * the words "On Track" in the same line. Both were stating the same verdict
 * from different rules. The tolerance stays; there is now one rule stating it.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { TicketSalesProcessor } from './processor'
import { isOnTrack, ON_TRACK_VARIANCE } from './utils'
import type { Conference } from '@/lib/conference/types'
import type { ProcessTicketSalesInput, SalesTargetConfig } from './types'

const config: SalesTargetConfig = {
  enabled: true,
  salesStartDate: '2026-01-01',
  targetCurve: 'linear',
  milestones: [],
}

const conference = { sponsors: [] } as unknown as Conference

/**
 * One ticket of 100, two weeks into a year-long linear run: 1% sold against a
 * ~3.8% target, so the variance lands INSIDE the tolerance. A fixture past it
 * would read as behind under any rule and prove nothing about the band.
 */
function slightlyBehindInput(): ProcessTicketSalesInput {
  return {
    tickets: [
      {
        order_id: 1,
        order_date: '2026-01-05T10:00:00Z',
        category: 'Regular',
        sum: '2500',
      },
    ],
    config,
    capacity: 100,
    conference,
    conferenceDate: '2027-01-01',
    speakerCount: 0,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isOnTrack', () => {
  it('holds a conference inside the tolerance on track', () => {
    expect(isOnTrack(0)).toBe(true)
    expect(isOnTrack(-0.1)).toBe(true)
    expect(isOnTrack(-4.2)).toBe(true)
    expect(isOnTrack(ON_TRACK_VARIANCE)).toBe(true)
  })

  it('calls a conference past the tolerance behind', () => {
    expect(isOnTrack(ON_TRACK_VARIANCE - 0.1)).toBe(false)
    expect(isOnTrack(-20)).toBe(false)
  })

  it('states the tolerance once, so every surface can read it', () => {
    // A sales curve is a forecast; the slack is deliberate. Retuning it must
    // be one edit, not a hunt through the surfaces that report a verdict.
    expect(ON_TRACK_VARIANCE).toBeLessThan(0)
  })
})

describe('calculatePerformance', () => {
  it('reports the verdict its own variance implies, inside the tolerance', () => {
    const { performance } = new TicketSalesProcessor(
      slightlyBehindInput(),
    ).process()

    // Inside the tolerance, which is the point of the fixture: a rule keyed on
    // the sign of the variance would disagree here, and that disagreement was
    // the bug.
    expect(performance.variance).toBeLessThan(0)
    expect(performance.variance).toBeGreaterThan(ON_TRACK_VARIANCE)
    expect(performance.isOnTrack).toBe(true)
    // The two fields agree by construction, not by coincidence.
    expect(performance.isOnTrack).toBe(isOnTrack(performance.variance))
  })
})
