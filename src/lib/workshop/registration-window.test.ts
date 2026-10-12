/**
 * @vitest-environment node
 *
 * THE ONE WINDOW RULE (#1345): every row of the table in
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §3, on the function's answer.
 * Every expected answer is written out; none is computed.
 */
import { describe, it, expect } from 'vitest'
import { workshopRegistrationWindow } from './registration-window'

const SPONSOR = '2026-06-01T06:00:00.000Z'
const OFFICIAL = '2026-06-15T06:30:00.000Z'
const END = '2026-07-01T07:00:00.000Z'

const BEFORE_SPONSOR = '2026-05-20T12:00:00.000Z'
const IN_EARLY_ACCESS = '2026-06-10T12:00:00.000Z'
const AFTER_OFFICIAL = '2026-06-20T12:00:00.000Z'
const AFTER_END = '2026-07-02T12:00:00.000Z'

const ALL_THREE = {
  workshopRegistrationSponsorStart: SPONSOR,
  workshopRegistrationStart: OFFICIAL,
  workshopRegistrationEnd: END,
}

const at = (
  times: Parameters<typeof workshopRegistrationWindow>[0],
  now: string,
  earlyAccess: boolean,
) => workshopRegistrationWindow(times, { now: new Date(now), earlyAccess })

const OPENS_AT_OFFICIAL = {
  status: 'not-open-yet',
  opensAt: OFFICIAL,
  early: false,
}
const OPENS_AT_SPONSOR = {
  status: 'not-open-yet',
  opensAt: SPONSOR,
  early: true,
}
const OPEN = { status: 'open', early: false }
const OPEN_EARLY = { status: 'open', early: true }
const CLOSED = { status: 'closed' }

describe('the registration window without early access', () => {
  it.each([
    ['before the sponsor start time', BEFORE_SPONSOR, OPENS_AT_OFFICIAL],
    ['inside the early-access window', IN_EARLY_ACCESS, OPENS_AT_OFFICIAL],
    ['at the sponsor start time', SPONSOR, OPENS_AT_OFFICIAL],
    ['at the official opening', OFFICIAL, OPEN],
    ['from the official opening until the end', AFTER_OFFICIAL, OPEN],
    ['at the end', END, OPEN],
    ['after the end', AFTER_END, CLOSED],
  ])('%s', (_when, now, expected) => {
    expect(at(ALL_THREE, now, false)).toEqual(expected)
  })
})

describe('the registration window with early access', () => {
  it.each([
    ['before the sponsor start time', BEFORE_SPONSOR, OPENS_AT_SPONSOR],
    ['at the sponsor start time', SPONSOR, OPEN_EARLY],
    ['inside the early-access window', IN_EARLY_ACCESS, OPEN_EARLY],
    // From the official opening on, the sign-up is nobody's early one.
    ['at the official opening', OFFICIAL, OPEN],
    ['from the official opening until the end', AFTER_OFFICIAL, OPEN],
    ['at the end', END, OPEN],
    ['after the end', AFTER_END, CLOSED],
  ])('%s', (_when, now, expected) => {
    expect(at(ALL_THREE, now, true)).toEqual(expected)
  })

  it('never closes after the official opening when no end is set', () => {
    const times = { ...ALL_THREE, workshopRegistrationEnd: undefined }
    expect(at(times, IN_EARLY_ACCESS, true)).toEqual(OPEN_EARLY)
    expect(at(times, '2099-01-01T00:00:00.000Z', true)).toEqual(OPEN)
  })

  it('does not open a window whose end has already passed', () => {
    // An end before the sponsor start time: a combination no save accepts.
    const times = { ...ALL_THREE, workshopRegistrationEnd: BEFORE_SPONSOR }
    expect(at(times, IN_EARLY_ACCESS, true)).toEqual(CLOSED)
  })
})

/**
 * Spec §2: the early-access window exists only when both times are set and the
 * sponsor start time is the earlier one. Without it early access changes
 * nothing, and the answer is today's.
 */
describe('with no early-access window, early access changes nothing', () => {
  const LATER_THAN_OFFICIAL = '2026-06-18T06:00:00.000Z'

  describe.each([
    [
      'no sponsor start time',
      { ...ALL_THREE, workshopRegistrationSponsorStart: undefined },
    ],
    [
      'a sponsor start time stored as null',
      { ...ALL_THREE, workshopRegistrationSponsorStart: null },
    ],
    [
      'a sponsor start time equal to the official opening',
      { ...ALL_THREE, workshopRegistrationSponsorStart: OFFICIAL },
    ],
    [
      'a sponsor start time later than the official opening',
      { ...ALL_THREE, workshopRegistrationSponsorStart: LATER_THAN_OFFICIAL },
    ],
    [
      'a sponsor start time that is not a time',
      { ...ALL_THREE, workshopRegistrationSponsorStart: 'soon' },
    ],
  ])('%s', (_what, times) => {
    it.each([
      ['before the sponsor start time', BEFORE_SPONSOR, OPENS_AT_OFFICIAL],
      ['where the window would have been', IN_EARLY_ACCESS, OPENS_AT_OFFICIAL],
      ['from the official opening until the end', AFTER_OFFICIAL, OPEN],
      // Later than the official opening AND than the misplaced sponsor start.
      ['later still, before the end', '2026-06-25T12:00:00.000Z', OPEN],
      ['after the end', AFTER_END, CLOSED],
    ])('%s', (_when, now, expected) => {
      expect(at(times, now, true)).toEqual(expected)
      expect(at(times, now, false)).toEqual(expected)
    })
  })

  describe('a sponsor start time and no official opening', () => {
    const times = {
      workshopRegistrationSponsorStart: SPONSOR,
      workshopRegistrationEnd: END,
    }

    it.each([
      // No official opening is open from the beginning, sponsor start or not.
      ['before the sponsor start time', BEFORE_SPONSOR, OPEN],
      ['after the sponsor start time', IN_EARLY_ACCESS, OPEN],
      ['after the end', AFTER_END, CLOSED],
    ])('%s', (_when, now, expected) => {
      expect(at(times, now, true)).toEqual(expected)
      expect(at(times, now, false)).toEqual(expected)
    })
  })

  it('with no time set at all, is open', () => {
    expect(at({}, IN_EARLY_ACCESS, true)).toEqual(OPEN)
    expect(at({}, IN_EARLY_ACCESS, false)).toEqual(OPEN)
  })
})
