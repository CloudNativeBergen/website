import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'

/**
 * A two-day schedule for the Talk row's stories and tests, shaped as
 * `/wall/post` sends it: ids, titles, rooms and times only.
 */
const slot = (
  id: string,
  title: string,
  startTime: string,
  endTime: string,
): TrackTalk => ({ talk: { _id: id, title }, startTime, endTime }) as TrackTalk

export const STORY_SCHEDULES = [
  {
    _id: 'day-1',
    date: '2026-11-04',
    tracks: [
      {
        trackTitle: 'Main stage',
        trackDescription: '',
        talks: [slot('talk-d1', 'Opening keynote', '09:00', '09:45')],
      },
    ],
  },
  {
    _id: 'day-2',
    date: '2026-11-05',
    tracks: [
      {
        trackTitle: 'Main stage',
        trackDescription: '',
        talks: [
          slot(
            'talk-a1',
            'Running Kubernetes on a fjord ferry',
            '09:00',
            '09:45',
          ),
          slot('talk-a2', 'eBPF for the rest of us', '10:00', '10:45'),
        ],
      },
      {
        trackTitle: 'Workshop room',
        trackDescription: '',
        talks: [slot('talk-b1', 'GitOps from scratch', '09:15', '10:30')],
      },
    ],
  },
] as ConferenceSchedule[]

/** During the first talk on the main stage, day two. */
export const STORY_NOW = new Date('2026-11-05T09:20:00')
