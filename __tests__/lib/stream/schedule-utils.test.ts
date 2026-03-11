import {
  sortSchedulesByDate,
  sortTalksByStartTime,
  findTrackByRoom,
  getAvailableRooms,
} from '@/lib/stream/schedule-utils'
import type { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'

describe('sortSchedulesByDate', () => {
  it('should prioritize today&apos;s schedule first', () => {
    const today = new Date('2025-10-28T10:00:00Z')
    const schedules: ConferenceSchedule[] = [
      { _id: '1', date: '2025-10-29' } as ConferenceSchedule,
      { _id: '2', date: '2025-10-28' } as ConferenceSchedule,
      { _id: '3', date: '2025-10-27' } as ConferenceSchedule,
    ]

    const sorted = sortSchedulesByDate(schedules, today)

    expect(sorted[0]._id).toBe('2') // Today's schedule first
  })

  it('should sort remaining schedules by date', () => {
    const currentTime = new Date('2025-10-30T10:00:00Z')
    const schedules: ConferenceSchedule[] = [
      { _id: '1', date: '2025-10-29' } as ConferenceSchedule,
      { _id: '2', date: '2025-10-27' } as ConferenceSchedule,
      { _id: '3', date: '2025-10-28' } as ConferenceSchedule,
    ]

    const sorted = sortSchedulesByDate(schedules, currentTime)

    expect(sorted.map((s) => s._id)).toEqual(['2', '3', '1'])
  })

  it('should not mutate original array', () => {
    const currentTime = new Date('2025-10-28T10:00:00Z')
    const schedules: ConferenceSchedule[] = [
      { _id: '1', date: '2025-10-29' } as ConferenceSchedule,
      { _id: '2', date: '2025-10-28' } as ConferenceSchedule,
    ]
    const original = [...schedules]

    sortSchedulesByDate(schedules, currentTime)

    expect(schedules).toEqual(original)
  })
})

describe('sortTalksByStartTime', () => {
  it('should sort talks by start time', () => {
    const talks = [
      { _id: '1', startTime: '14:00' },
      { _id: '2', startTime: '09:00' },
      { _id: '3', startTime: '11:30' },
    ]

    const sorted = sortTalksByStartTime(talks)

    expect(sorted.map((t) => t._id)).toEqual(['2', '3', '1'])
  })

  it('should handle talks without start time', () => {
    const talks = [
      { _id: '1', startTime: '14:00' },
      { _id: '2' },
      { _id: '3', startTime: '09:00' },
    ]

    const sorted = sortTalksByStartTime(talks)

    expect(sorted.length).toBe(3)
  })

  it('should not mutate original array', () => {
    const talks = [
      { _id: '1', startTime: '14:00' },
      { _id: '2', startTime: '09:00' },
    ]
    const original = [...talks]

    sortTalksByStartTime(talks)

    expect(talks).toEqual(original)
  })
})

describe('findTrackByRoom', () => {
  const createTrack = (title: string): ScheduleTrack => ({
    trackTitle: title,
    trackDescription: '',
    talks: [],
  })

  const schedules: ConferenceSchedule[] = [
    {
      _id: '1',
      date: '2025-10-28',
      tracks: [
        createTrack('Hovedsalen (2nd Floor)'),
        createTrack('Meeting Room A'),
        createTrack('Workshop Space'),
      ],
    } as ConferenceSchedule,
    {
      _id: '2',
      date: '2025-10-29',
      tracks: [createTrack('Main Hall'), createTrack('Breakout Room')],
    } as ConferenceSchedule,
  ]

  it('should find track by exact room name (case insensitive)', () => {
    const track = findTrackByRoom(schedules, 'HOVEDSALEN (2ND FLOOR)')

    expect(track?.trackTitle).toBe('Hovedsalen (2nd Floor)')
  })

  it('should find track by fuzzy match (prefix)', () => {
    const track = findTrackByRoom(schedules, 'Hovedsalen')

    expect(track?.trackTitle).toBe('Hovedsalen (2nd Floor)')
  })

  it('should trim whitespace from room name', () => {
    const track = findTrackByRoom(schedules, '  Meeting Room A  ')

    expect(track?.trackTitle).toBe('Meeting Room A')
  })

  it('should return null if room not found', () => {
    const track = findTrackByRoom(schedules, 'Nonexistent Room')

    expect(track).toBeNull()
  })

  it('should prioritize exact match over fuzzy match', () => {
    const schedulesWithConflict: ConferenceSchedule[] = [
      {
        _id: '1',
        date: '2025-10-28',
        tracks: [
          createTrack('Main'),
          createTrack('Main Hall'),
          createTrack('Main Conference Room'),
        ],
      } as ConferenceSchedule,
    ]

    const track = findTrackByRoom(schedulesWithConflict, 'Main')

    expect(track?.trackTitle).toBe('Main')
  })

  it('should handle schedules without tracks', () => {
    const emptySchedules: ConferenceSchedule[] = [
      { _id: '1', date: '2025-10-28' } as ConferenceSchedule,
    ]

    const track = findTrackByRoom(emptySchedules, 'Any Room')

    expect(track).toBeNull()
  })

  it('should handle tracks without titles', () => {
    const schedulesWithEmptyTitles: ConferenceSchedule[] = [
      {
        _id: '1',
        date: '2025-10-28',
        tracks: [
          { trackTitle: '', trackDescription: '', talks: [] },
          createTrack('Valid Room'),
        ],
      } as ConferenceSchedule,
    ]

    const track = findTrackByRoom(schedulesWithEmptyTitles, 'Valid Room')

    expect(track?.trackTitle).toBe('Valid Room')
  })
})

describe('getAvailableRooms', () => {
  it('should return all unique room names', () => {
    const schedules: ConferenceSchedule[] = [
      {
        _id: '1',
        date: '2025-10-28',
        tracks: [
          { trackTitle: 'Room A', trackDescription: '', talks: [] },
          { trackTitle: 'Room B', trackDescription: '', talks: [] },
        ],
      } as ConferenceSchedule,
      {
        _id: '2',
        date: '2025-10-29',
        tracks: [
          { trackTitle: 'Room A', trackDescription: '', talks: [] },
          { trackTitle: 'Room C', trackDescription: '', talks: [] },
        ],
      } as ConferenceSchedule,
    ]

    const rooms = getAvailableRooms(schedules)

    expect(rooms).toHaveLength(3)
    expect(rooms).toContain('Room A')
    expect(rooms).toContain('Room B')
    expect(rooms).toContain('Room C')
  })

  it('should handle schedules without tracks', () => {
    const schedules: ConferenceSchedule[] = [
      { _id: '1', date: '2025-10-28' } as ConferenceSchedule,
      {
        _id: '2',
        date: '2025-10-29',
        tracks: [{ trackTitle: 'Room A', trackDescription: '', talks: [] }],
      } as ConferenceSchedule,
    ]

    const rooms = getAvailableRooms(schedules)

    expect(rooms).toEqual(['Room A'])
  })

  it('should handle tracks without titles', () => {
    const schedules: ConferenceSchedule[] = [
      {
        _id: '1',
        date: '2025-10-28',
        tracks: [
          { trackTitle: '', trackDescription: '', talks: [] },
          { trackTitle: 'Room A', trackDescription: '', talks: [] },
        ],
      } as ConferenceSchedule,
    ]

    const rooms = getAvailableRooms(schedules)

    expect(rooms).toEqual(['Room A'])
  })

  it('should return empty array for empty schedules', () => {
    const rooms = getAvailableRooms([])

    expect(rooms).toEqual([])
  })
})
