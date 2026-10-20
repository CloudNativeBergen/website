import { describe, expect, it } from 'vitest'
import {
  answersClosed,
  feedbackVisibleAt,
  feedbackWindow,
  feedbackWindowStateAt,
} from './window'

// Expected instants are worked out by hand from Oslo wall-clock times:
// CEST (summer) is UTC+2, CET (winter) is UTC+1.
const at = (iso: string) => new Date(iso)

const slot = (date: string, startTime: string, endTime: string) => ({
  date,
  startTime,
  endTime,
})

describe('feedbackWindow', () => {
  it('is unscheduled, with no times, for a talk with no slot', () => {
    expect(
      feedbackWindow({
        slots: [],
        conferenceEndDate: '2026-10-29',
        now: at('2026-10-17T12:00:00Z'),
      }),
    ).toEqual({
      state: 'unscheduled',
      feedbackVisible: false,
      // When it will be visible: the conference is over (UTC midnight).
      conferenceOverAt: '2026-10-30T00:00:00.000Z',
    })
  })

  it('runs from the slot start to 24 hours after its end', () => {
    const slots = [slot('2026-06-10', '10:00', '10:40')]
    const before = feedbackWindow({
      slots,
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-10T07:59:59Z'),
    })
    expect(before).toEqual({
      state: 'before',
      opensAt: '2026-06-10T08:00:00.000Z',
      lastSlotEnd: '2026-06-10T08:40:00.000Z',
      closesAt: '2026-06-11T08:40:00.000Z',
      feedbackVisible: false,
    })

    const open = feedbackWindow({
      slots,
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-10T08:00:00Z'),
    })
    expect(open.state).toBe('open')
    expect(open.feedbackVisible).toBe(false)

    const afterSlot = feedbackWindow({
      slots,
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-10T08:40:00Z'),
    })
    expect(afterSlot.state).toBe('open')
    expect(afterSlot.feedbackVisible).toBe(true)

    expect(
      feedbackWindow({
        slots,
        conferenceEndDate: '2026-06-11',
        now: at('2026-06-11T08:39:59Z'),
      }).state,
    ).toBe('open')
    expect(
      feedbackWindow({
        slots,
        conferenceEndDate: '2026-06-11',
        now: at('2026-06-11T08:40:00Z'),
      }).state,
    ).toBe('closed')
  })

  it('treats a split session as one span from its earliest start to its latest end', () => {
    // A workshop in two parts with lunch between, given out of order.
    const w = feedbackWindow({
      slots: [
        slot('2026-06-10', '13:00', '14:30'),
        slot('2026-06-10', '09:00', '11:00'),
      ],
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-10T10:00:00Z'), // 12:00 Oslo, in the lunch break
    })
    expect(w).toEqual({
      state: 'open',
      opensAt: '2026-06-10T07:00:00.000Z',
      lastSlotEnd: '2026-06-10T12:30:00.000Z',
      closesAt: '2026-06-11T12:30:00.000Z',
      // The first part ended, but the session has not: nothing to show yet.
      feedbackVisible: false,
    })
  })

  it('stays open across days for a session on several days', () => {
    const slots = [
      slot('2026-06-10', '09:00', '12:00'),
      slot('2026-06-11', '09:00', '12:00'),
    ]
    const overnight = feedbackWindow({
      slots,
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-10T22:00:00Z'),
    })
    expect(overnight.state).toBe('open')
    expect(overnight.closesAt).toBe('2026-06-12T10:00:00.000Z')
  })

  it('follows a moved talk: later slot means not yet open again', () => {
    const now = at('2026-06-10T09:00:00Z') // 11:00 Oslo
    const original = feedbackWindow({
      slots: [slot('2026-06-10', '10:00', '10:40')],
      conferenceEndDate: '2026-06-11',
      now,
    })
    expect(original.state).toBe('open')

    const moved = feedbackWindow({
      slots: [slot('2026-06-11', '15:00', '15:40')],
      conferenceEndDate: '2026-06-11',
      now,
    })
    expect(moved.state).toBe('before')
    expect(moved.opensAt).toBe('2026-06-11T13:00:00.000Z')
  })

  it('uses the Oslo offset in force on the slot date, across a DST change', () => {
    // 2026-10-25 03:00 CEST becomes 02:00 CET. Same wall-clock times, one day
    // apart, are 25 hours apart in UTC.
    const w = feedbackWindow({
      slots: [
        slot('2026-10-24', '10:00', '11:00'),
        slot('2026-10-25', '10:00', '11:00'),
      ],
      conferenceEndDate: '2026-10-25',
      now: at('2026-10-01T00:00:00Z'),
    })
    expect(w.opensAt).toBe('2026-10-24T08:00:00.000Z')
    expect(w.lastSlotEnd).toBe('2026-10-25T10:00:00.000Z')
    expect(w.closesAt).toBe('2026-10-26T10:00:00.000Z')
  })

  // "Conference over" flips where `isConferenceOver` does, at UTC midnight
  // after the last day, so every surface agrees.
  it('shows feedback once the conference is over, even if the last slot has not ended', () => {
    // A slot dated after the conference's last day (a data error) must not
    // hide feedback forever.
    const slots = [slot('2026-06-20', '10:00', '11:00')]
    const lastDay = feedbackWindow({
      slots,
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-11T23:59:59Z'),
    })
    expect(lastDay.feedbackVisible).toBe(false)
    const dayAfter = feedbackWindow({
      slots,
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-12T00:00:00Z'),
    })
    expect(dayAfter.feedbackVisible).toBe(true)
  })

  it('shows feedback for an unscheduled talk only once the conference is over', () => {
    expect(
      feedbackWindow({
        slots: [],
        conferenceEndDate: '2026-06-11',
        now: at('2026-06-12T00:00:00Z'),
      }),
    ).toEqual({ state: 'unscheduled', feedbackVisible: true })
  })

  it('ignores a slot it cannot read rather than opening a window from it', () => {
    expect(
      feedbackWindow({
        slots: [
          slot('2026-06-10', '', '10:40'),
          { date: '2026-06-10', startTime: '10:00', endTime: null },
          // Ends before it starts (Studio checks only the HH:mm shape): it
          // would make feedback visible before the session is over.
          slot('2026-06-10', '13:00', '01:40'),
          slot('2026-06-10', '13:00', '13:00'),
        ],
        conferenceEndDate: '2026-06-11',
        now: at('2026-06-10T09:00:00Z'),
      }),
    ).toEqual({
      state: 'unscheduled',
      feedbackVisible: false,
      conferenceOverAt: '2026-06-12T00:00:00.000Z',
    })
  })

  it('never treats a missing conference end date as over', () => {
    expect(
      feedbackWindow({
        slots: [],
        conferenceEndDate: null,
        now: at('2030-01-01T00:00:00Z'),
      }).feedbackVisible,
    ).toBe(false)
  })
})

describe('feedbackVisibleAt — whether a shown window shows feedback later', () => {
  it('turns visible at the last slot’s end', () => {
    const shown = feedbackWindow({
      slots: [slot('2026-06-10', '10:00', '10:40')],
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-01T00:00:00Z'),
    })
    expect(feedbackVisibleAt(shown, at('2026-06-10T08:39:59Z'))).toBe(false)
    expect(feedbackVisibleAt(shown, at('2026-06-10T08:40:00Z'))).toBe(true)
  })

  it('turns visible when the conference is over, before a slot dated after it', () => {
    // A slot dated after the conference's last day (a data error).
    const shown = feedbackWindow({
      slots: [slot('2026-06-20', '10:00', '11:00')],
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-01T00:00:00Z'),
    })
    expect(feedbackVisibleAt(shown, at('2026-06-11T23:59:59Z'))).toBe(false)
    expect(feedbackVisibleAt(shown, at('2026-06-12T00:00:00Z'))).toBe(true)
  })

  it('turns an unscheduled talk visible once the conference is over', () => {
    const shown = feedbackWindow({
      slots: [],
      conferenceEndDate: '2026-06-11',
      now: at('2026-06-01T00:00:00Z'),
    })
    expect(feedbackVisibleAt(shown, at('2026-06-11T23:59:59Z'))).toBe(false)
    expect(feedbackVisibleAt(shown, at('2026-06-12T00:00:00Z'))).toBe(true)
  })
})

describe('feedbackWindowStateAt — the state a shown window has at a later time', () => {
  const shown = feedbackWindow({
    slots: [slot('2026-06-10', '10:00', '10:40')],
    conferenceEndDate: '2026-06-11',
    now: at('2026-06-01T00:00:00Z'),
  })

  it('moves from before to open to closed at the window’s own instants', () => {
    expect(shown.state).toBe('before')
    expect(feedbackWindowStateAt(shown, at('2026-06-10T07:59:59Z'))).toBe(
      'before',
    )
    expect(feedbackWindowStateAt(shown, at('2026-06-10T08:00:00Z'))).toBe(
      'open',
    )
    expect(feedbackWindowStateAt(shown, at('2026-06-11T08:39:59Z'))).toBe(
      'open',
    )
    expect(feedbackWindowStateAt(shown, at('2026-06-11T08:40:00Z'))).toBe(
      'closed',
    )
  })

  it('keeps an unscheduled window unscheduled', () => {
    expect(
      feedbackWindowStateAt(
        { state: 'unscheduled' },
        at('2030-01-01T00:00:00Z'),
      ),
    ).toBe('unscheduled')
  })
})

describe('answersClosed', () => {
  const window = (
    now: string,
    slots = [slot('2026-06-10', '10:00', '10:40')],
  ) => feedbackWindow({ slots, conferenceEndDate: '2026-06-11', now: at(now) })

  it('is false before and while the window is open, true from when it closes', () => {
    expect(answersClosed(window('2026-06-10T07:59:59Z'))).toBe(false)
    expect(answersClosed(window('2026-06-11T08:39:59Z'))).toBe(false)
    expect(answersClosed(window('2026-06-11T08:40:00Z'))).toBe(true)
  })

  it('for a talk with no slot, is true only once the conference is over', () => {
    expect(answersClosed(window('2026-06-11T23:59:59Z', []))).toBe(false)
    expect(answersClosed(window('2026-06-12T00:00:00Z', []))).toBe(true)
  })
})
