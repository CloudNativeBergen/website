import { describe, it, expect } from 'vitest'
import { crossedThresholds } from './capacity-notice'

const state = (seatsTaken: number, waitlist = false, capacity = 30) => ({
  seatsTaken,
  capacity,
  waitlist,
})

describe('crossedThresholds', () => {
  it('raises 80% when a write takes the workshop from below to at it', () => {
    expect(crossedThresholds(state(23), state(24))).toEqual(['eighty-percent'])
  })

  it('raises nothing below 80% or once above it', () => {
    expect(crossedThresholds(state(22), state(23))).toEqual([])
    expect(crossedThresholds(state(24), state(25))).toEqual([])
  })

  it('raises 80% when a lower capacity crosses it', () => {
    expect(crossedThresholds(state(20), state(20, false, 25))).toEqual([
      'eighty-percent',
    ])
  })

  it('raises the waitlist for the first waitlisted sign-up only', () => {
    expect(crossedThresholds(state(30), state(30, true))).toEqual(['waitlist'])
    expect(crossedThresholds(state(30, true), state(30, true))).toEqual([])
  })

  it('raises nothing for a workshop with no seats', () => {
    expect(crossedThresholds(state(0, false, 0), state(0, false, 0))).toEqual(
      [],
    )
  })
})
