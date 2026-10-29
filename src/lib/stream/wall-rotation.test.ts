import { describe, expect, it } from 'vitest'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { Status } from '@/lib/proposal/types'
import {
  holdsRoom,
  nextTurn,
  wallRotationRequested,
  type Turn,
} from './wall-rotation'
import { osloLocalInputToIso } from '@/lib/time'

describe('wallRotationRequested', () => {
  it('is on for ?wall=1', () => {
    expect(wallRotationRequested('1')).toBe(true)
  })

  it.each([undefined, '', '0', 'true', 'yes', ['1', '1']])(
    'is off for %j',
    (value) => {
      expect(wallRotationRequested(value)).toBe(false)
    },
  )
})

const talk = (
  startTime: string,
  endTime: string,
  status: Status = Status.confirmed,
): TrackTalk => ({
  startTime,
  endTime,
  talk: { _id: `talk-${startTime}`, status } as ProposalExisting,
  hasTalkRef: true,
})

const day = (date: string, ...talks: TrackTalk[]): ConferenceSchedule => ({
  _id: date,
  date,
  tracks: [
    { trackTitle: 'Hovedsalen', trackDescription: '', talks },
    {
      trackTitle: 'Loftet',
      trackDescription: '',
      talks: [talk('09:30', '10:00')],
    },
  ],
})

// Schedule times are Oslo wall-clock, whatever the screen's own zone.
const local = (date: string, time: string) =>
  new Date(
    Date.parse(osloLocalInputToIso(`${date}T${time.slice(0, 5)}`)!) +
      Number(time.slice(6, 8) || 0) * 1000,
  )

describe('holdsRoom', () => {
  const schedules = [day('2026-10-27', talk('10:00', '10:40'))]

  it('holds the room view in the five minutes before the next talk starts', () => {
    expect(
      holdsRoom(schedules, 'Hovedsalen', local('2026-10-27', '09:55:00')),
    ).toBe(true)
    expect(
      holdsRoom(schedules, 'Hovedsalen', local('2026-10-27', '09:59:59')),
    ).toBe(true)
  })

  it('does not hold earlier than five minutes before', () => {
    expect(
      holdsRoom(schedules, 'Hovedsalen', local('2026-10-27', '09:54:59')),
    ).toBe(false)
  })

  it('lets go once the talk has started', () => {
    expect(
      holdsRoom(schedules, 'Hovedsalen', local('2026-10-27', '10:00:00')),
    ).toBe(false)
  })

  it("does not hold for another room's talk", () => {
    expect(
      holdsRoom(schedules, 'Hovedsalen', local('2026-10-27', '09:27:00')),
    ).toBe(false)
    expect(
      holdsRoom(schedules, 'Loftet', local('2026-10-27', '09:27:00')),
    ).toBe(true)
  })

  it('does not hold for the same clock time on another day', () => {
    expect(
      holdsRoom(schedules, 'Hovedsalen', local('2026-10-26', '09:57:00')),
    ).toBe(false)
  })

  it('does not hold for a withdrawn talk the room screen hides', () => {
    expect(
      holdsRoom(
        [day('2026-10-27', talk('10:00', '10:40', Status.withdrawn))],
        'Hovedsalen',
        local('2026-10-27', '09:57:00'),
      ),
    ).toBe(false)
  })

  it('holds before a service session the room screen shows', () => {
    const opening: TrackTalk = {
      startTime: '08:45',
      endTime: '09:00',
      placeholder: 'Opening',
    }
    expect(
      holdsRoom(
        [day('2026-10-27', opening)],
        'Hovedsalen',
        local('2026-10-27', '08:41:00'),
      ),
    ).toBe(true)
  })
})

describe('nextTurn', () => {
  const room: Turn = { view: 'room', since: 0 }
  const wall: Turn = { view: 'wall', since: 0 }
  const open = { wallOpen: true, held: false }

  it('keeps the room view for 60 s, then turns to the wall', () => {
    expect(nextTurn(room, { ...open, now: 59_999 })).toBe(room)
    expect(nextTurn(room, { ...open, now: 60_000 })).toEqual({
      view: 'wall',
      since: 60_000,
    })
  })

  it('keeps the wall for 30 s, then turns back to the room', () => {
    expect(nextTurn(wall, { ...open, now: 29_999 })).toBe(wall)
    expect(nextTurn(wall, { ...open, now: 30_000 })).toEqual({
      view: 'room',
      since: 30_000,
    })
  })

  it('skips the wall turn while the wall is closed or missing', () => {
    expect(nextTurn(room, { ...open, wallOpen: false, now: 90_000 })).toBe(room)
  })

  it('takes the wall turn as soon as the wall opens again', () => {
    expect(nextTurn(room, { ...open, now: 90_000 })).toEqual({
      view: 'wall',
      since: 90_000,
    })
  })

  it('leaves the wall at once when it closes mid-turn', () => {
    expect(nextTurn(wall, { ...open, wallOpen: false, now: 5_000 })).toEqual({
      view: 'room',
      since: 5_000,
    })
  })

  it('leaves the wall at once when the hold starts mid-turn', () => {
    expect(nextTurn(wall, { ...open, held: true, now: 5_000 })).toEqual({
      view: 'room',
      since: 5_000,
    })
  })

  it('keeps the room view through the hold, and a full turn after it', () => {
    const held = nextTurn(room, { ...open, held: true, now: 120_000 })
    expect(held).toEqual({ view: 'room', since: 120_000 })
    // The talk has started: the room view still gets its 60 s.
    expect(nextTurn(held, { ...open, now: 179_999 })).toBe(held)
    expect(nextTurn(held, { ...open, now: 180_000 })).toEqual({
      view: 'wall',
      since: 180_000,
    })
  })
})
