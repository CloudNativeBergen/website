import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { suggestTalks } from '@/lib/photo-wall/talk-suggestion'
import { clearSimulatedTime, setSimulatedTime } from '@/lib/program/dev-time'

const slot = (id: string, startTime: string, endTime: string): TrackTalk =>
  ({ talk: { _id: id }, startTime, endTime }) as TrackTalk

const day = (
  date: string,
  tracks: Record<string, TrackTalk[]>,
): ConferenceSchedule =>
  ({
    _id: date,
    date,
    tracks: Object.entries(tracks).map(([trackTitle, talks]) => ({
      trackTitle,
      trackDescription: '',
      talks,
    })),
  }) as ConferenceSchedule

const schedules = [
  day('2026-11-04', { 'Room A': [slot('d1a', '10:00', '10:45')] }),
  day('2026-11-05', {
    'Room A': [
      slot('a1', '09:00', '09:45'),
      { placeholder: 'Lunch', startTime: '11:00', endTime: '12:00' },
      slot('a2', '12:00', '12:45'),
    ],
    'Room B': [slot('b1', '09:15', '10:00')],
  }),
  day('2026-11-06', { 'Room A': [slot('d3a', '09:00', '09:45')] }),
]

const ids = (list: { slot: TrackTalk }[]) => list.map((t) => t.slot.talk?._id)
const at = (time: string, room = 'Room A', date = '2026-11-05') =>
  suggestTalks(schedules, room, new Date(`${date}T${time}:00`))

describe('suggestTalks', () => {
  it.each([
    ['before the first talk', '08:00', null],
    ['2 minutes before a start', '08:58', 'a1'],
    ['3 minutes before a start', '08:57', null],
    ['during a talk', '09:20', 'a1'],
    ['30 minutes after an end', '10:15', 'a1'],
    ['31 minutes after an end', '10:16', null],
    ['between talks, soon wins over recent', '11:58', 'a2'],
    ['after the last talk of the day', '14:00', null],
  ])('%s', (_, time, expected) => {
    expect(at(time).suggested?.slot.talk?._id ?? null).toBe(expected)
  })

  it('parallel rooms: suggests only the chosen room', () => {
    expect(at('09:50', 'Room B').suggested?.slot.talk?._id).toBe('b1')
    expect(at('09:50', 'Room A').suggested?.slot.talk?._id).toBe('a1')
  })

  it('orders room today, other rooms today, earlier days; skips later days and placeholders', () => {
    expect(ids(at('09:20').options)).toEqual(['a1', 'a2', 'b1', 'd1a'])
  })

  it('a later day: earlier days listed, never suggested', () => {
    const r = at('10:00', 'Room A', '2026-11-06')
    expect(r.suggested?.slot.talk?._id).toBe('d3a')
    expect(ids(r.options)).toEqual(['d3a', 'a2', 'b1', 'a1', 'd1a'])
    expect(at('10:30', 'Room A', '2026-11-05').suggested).toBeNull()
  })

  it('after the conference: no suggestion, every talk still listed', () => {
    const r = at('10:00', 'Room A', '2026-11-20')
    expect(r.suggested).toBeNull()
    expect(ids(r.options)).toEqual(['d3a', 'a2', 'b1', 'a1', 'd1a'])
  })

  it('no schedule', () => {
    expect(suggestTalks([], 'Room A', new Date())).toEqual({
      suggested: null,
      options: [],
    })
  })

  it('defaults to the simulated conference time', () => {
    vi.stubEnv('NODE_ENV', 'development')
    setSimulatedTime('2026-11-05T09:20:00')
    try {
      expect(suggestTalks(schedules, 'Room A').suggested?.slot.talk?._id).toBe(
        'a1',
      )
    } finally {
      clearSimulatedTime()
      vi.unstubAllEnvs()
    }
  })
})
