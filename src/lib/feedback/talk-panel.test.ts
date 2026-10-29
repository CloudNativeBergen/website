import { describe, expect, it } from 'vitest'
import { talkFeedbackView } from './talk-panel'

/** Noon in Oslo on `day`. */
const at = (day: string) => new Date(`${day}T11:00:00Z`)
const view = (status: string, day: string, codesLive = true) =>
  talkFeedbackView({
    status,
    conferenceStartDate: '2026-10-27',
    now: at(day),
    codesLive,
  })

describe('talkFeedbackView', () => {
  it('shows only the code for a confirmed talk before the conference starts (Oslo date)', () => {
    expect(view('confirmed', '2026-10-26')).toBe('code')
  })

  it('shows the whole panel from the conference’s first day', () => {
    expect(view('confirmed', '2026-10-27')).toBe('panel')
    expect(view('accepted', '2026-10-27')).toBe('panel')
  })

  it('shows nothing for an accepted talk before the start, or an unconfirmed one ever', () => {
    expect(view('accepted', '2026-10-26')).toBeNull()
    expect(view('submitted', '2026-11-01')).toBeNull()
    expect(view('withdrawn', '2026-10-26')).toBeNull()
  })

  it('leaves the code out while codes are not live', () => {
    expect(view('confirmed', '2026-10-26', false)).toBeNull()
  })

  it('shows only the code without a start date', () => {
    expect(
      talkFeedbackView({
        status: 'confirmed',
        conferenceStartDate: null,
        now: at('2026-10-27'),
        codesLive: true,
      }),
    ).toBe('code')
  })

  it('judges the day in Oslo, not in UTC', () => {
    // 00:30 on the first day in Oslo (CET) is still the day before in UTC.
    const now = new Date('2026-10-26T23:30:00Z')
    expect(
      talkFeedbackView({
        status: 'confirmed',
        conferenceStartDate: '2026-10-27',
        now,
        codesLive: true,
      }),
    ).toBe('panel')
    // And 23:30 the evening before in Oslo is not yet the first day.
    expect(
      talkFeedbackView({
        status: 'confirmed',
        conferenceStartDate: '2026-10-27',
        now: new Date('2026-10-26T22:30:00Z'),
        codesLive: true,
      }),
    ).toBe('code')
  })
})
