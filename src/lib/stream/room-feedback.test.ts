import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { Status } from '@/lib/proposal/types'
import { clearSimulatedTime, setSimulatedTime } from '@/lib/program/dev-time'
import { getCurrentConferenceTime } from '@/lib/program/time-utils'
import { roomFeedbackCodes } from './room-feedback'

const DATE = '2026-10-27'
const ROOM = 'Main Hall'

const talk = (
  id: string,
  startTime: string,
  endTime: string,
  status: Status = Status.confirmed,
): TrackTalk => ({
  startTime,
  endTime,
  hasTalkRef: true,
  talk: { _id: id, title: `Talk ${id}`, status } as ProposalExisting,
})
const pause = (startTime: string, endTime: string): TrackTalk => ({
  startTime,
  endTime,
  placeholder: 'Coffee Break',
})

const schedules = (
  talks: TrackTalk[],
  otherTrack: TrackTalk[] = [],
): ConferenceSchedule[] => [
  {
    _id: 's',
    date: DATE,
    tracks: [
      { trackTitle: 'Track A', trackDescription: '', talks: otherTrack },
      { trackTitle: ROOM, trackDescription: '', talks },
    ],
  } as ConferenceSchedule,
]

const DAY = schedules([
  talk('a', '09:00', '09:40'),
  pause('09:40', '10:00'),
  talk('b', '10:00', '10:40'),
  talk('c', '10:45', '11:25'),
  pause('11:25', '11:45'),
  talk('d', '11:45', '12:25'),
])
const URLS = Object.fromEntries(
  ['a', 'b', 'c', 'd'].map((id) => [id, `https://x.test/f/${id}`]),
)
const at = (hhmm: string) => new Date(`${DATE}T${hhmm}:00`)
const ids = (hhmm: string, urls = URLS, day = DAY) =>
  roomFeedbackCodes(day, ROOM, urls, at(hhmm)).map((c) => c.talkId)

describe('roomFeedbackCodes', () => {
  afterEach(() => {
    clearSimulatedTime()
    vi.unstubAllEnvs()
  })

  it('shows a back-to-back pair in the break after it', () => {
    expect(ids('11:30')).toEqual(['b', 'c'])
  })

  it('stops at the last break before the run', () => {
    expect(ids('11:30')).not.toContain('a')
  })

  it('keeps showing between talks until the next talk starts', () => {
    expect(ids('10:42')).toEqual(['b'])
    expect(ids('11:44')).toEqual(['b', 'c'])
  })

  it('shows nothing while a talk runs', () => {
    expect(ids('10:20')).toEqual([])
    expect(ids('11:00')).toEqual([])
  })

  it('shows the last run for the rest of the day', () => {
    expect(ids('15:00')).toEqual(['d'])
  })

  it('takes every ended talk when no break came yet', () => {
    const day = schedules([
      talk('a', '09:00', '09:40'),
      talk('b', '09:45', '10:20'),
    ])
    expect(ids('10:30', URLS, day)).toEqual(['a', 'b'])
  })

  it('ends the run at a break entered only in another track', () => {
    const day = schedules(
      [
        talk('a', '09:00', '09:40'),
        talk('b', '10:00', '10:40'),
        talk('c', '10:45', '11:25'),
      ],
      [pause('09:40', '10:00')],
    )
    expect(ids('11:30', URLS, day)).toEqual(['b', 'c'])
  })

  it("ignores another track's placeholder that overlaps one of this room's talks", () => {
    const day = schedules(
      [
        talk('a', '09:00', '09:40'),
        talk('b', '09:45', '10:20'),
        talk('c', '10:25', '11:00'),
      ],
      [pause('09:50', '10:10')],
    )
    expect(ids('11:10', URLS, day)).toEqual(['a', 'b', 'c'])
  })

  it('skips a talk with no code', () => {
    const noB = { ...URLS }
    delete noB.b
    expect(ids('11:30', noB)).toEqual(['c'])
  })

  it('skips a withdrawn talk without ending the run', () => {
    const day = schedules([
      talk('a', '09:00', '09:40'),
      talk('b', '09:45', '10:20', Status.withdrawn),
      talk('c', '10:25', '11:00'),
    ])
    expect(ids('11:10', URLS, day)).toEqual(['a', 'c'])
  })

  it('shows at most three, the latest', () => {
    const day = schedules([
      talk('a', '09:00', '09:30'),
      talk('b', '10:00', '10:30'),
      talk('c', '11:00', '11:30'),
      talk('d', '12:00', '12:30'),
    ])
    expect(ids('13:00', URLS, day)).toEqual(['b', 'c', 'd'])
  })

  it('shows nothing on another day', () => {
    expect(
      roomFeedbackCodes(DAY, ROOM, URLS, new Date('2026-10-28T11:30:00')),
    ).toEqual([])
  })

  it('follows the dev-time simulation', () => {
    vi.stubEnv('NODE_ENV', 'development')
    setSimulatedTime(at('11:30'))
    expect(
      roomFeedbackCodes(DAY, ROOM, URLS, getCurrentConferenceTime()).map(
        (c) => c.talkId,
      ),
    ).toEqual(['b', 'c'])
  })
})
