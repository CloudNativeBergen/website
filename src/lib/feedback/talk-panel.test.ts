import { describe, expect, it } from 'vitest'
import { talkFeedbackView } from './talk-panel'

const view = (status: string, today: string, codesLive = true) =>
  talkFeedbackView({
    status,
    conferenceStartDate: '2026-10-27',
    today,
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
        today: '2026-10-27',
        codesLive: true,
      }),
    ).toBe('code')
  })
})
