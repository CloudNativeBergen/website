import { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { getSimulatedTime } from './dev-time'

export type TalkStatus =
  | 'past'
  | 'happening-now'
  | 'happening-soon'
  | 'upcoming'

export interface CurrentPosition {
  scheduleIndex: number
  trackIndex: number
  talkIndex: number
  talk: TrackTalk
  scheduleDate: string
}

const HAPPENING_SOON_THRESHOLD_MINUTES = 2
const MILLISECONDS_PER_MINUTE = 60 * 1000

export function getCurrentConferenceTime(): Date {
  return getSimulatedTime() || new Date()
}

export function parseTalkDateTime(
  dateString: string,
  timeString: string,
): Date {
  return new Date(`${dateString}T${timeString}:00`)
}

export function getTalkStatus(
  talk: TrackTalk,
  scheduleDate: string,
  currentTime: Date = getCurrentConferenceTime(),
): TalkStatus {
  const talkStart = parseTalkDateTime(scheduleDate, talk.startTime)
  const talkEnd = parseTalkDateTime(scheduleDate, talk.endTime)
  const minutesUntilStart =
    (talkStart.getTime() - currentTime.getTime()) / MILLISECONDS_PER_MINUTE

  if (currentTime >= talkEnd) return 'past'
  if (currentTime >= talkStart) return 'happening-now'
  if (
    minutesUntilStart > 0 &&
    minutesUntilStart <= HAPPENING_SOON_THRESHOLD_MINUTES
  ) {
    return 'happening-soon'
  }
  return 'upcoming'
}

function stripTime(date: Date): Date {
  const stripped = new Date(date)
  stripped.setHours(0, 0, 0, 0)
  return stripped
}

export function isConferenceDay(
  startDate: string,
  endDate: string,
  currentTime: Date = getCurrentConferenceTime(),
): boolean {
  const start = stripTime(new Date(startDate))
  const end = stripTime(new Date(endDate))
  const now = stripTime(currentTime)
  return now >= start && now <= end
}

export function isScheduleToday(
  scheduleDate: string,
  currentTime: Date = getCurrentConferenceTime(),
): boolean {
  return (
    stripTime(new Date(scheduleDate)).getTime() ===
    stripTime(currentTime).getTime()
  )
}

export function findCurrentTalkPosition(
  schedules: ConferenceSchedule[],
  currentTime: Date = getCurrentConferenceTime(),
): CurrentPosition | null {
  for (
    let scheduleIndex = 0;
    scheduleIndex < schedules.length;
    scheduleIndex++
  ) {
    const schedule = schedules[scheduleIndex]

    if (!isScheduleToday(schedule.date, currentTime)) {
      continue
    }

    let firstUpcoming: CurrentPosition | null = null

    for (
      let trackIndex = 0;
      trackIndex < schedule.tracks.length;
      trackIndex++
    ) {
      const track = schedule.tracks[trackIndex]

      for (let talkIndex = 0; talkIndex < track.talks.length; talkIndex++) {
        const talk = track.talks[talkIndex]
        const status = getTalkStatus(talk, schedule.date, currentTime)

        if (status === 'happening-now' || status === 'happening-soon') {
          return {
            scheduleIndex,
            trackIndex,
            talkIndex,
            talk,
            scheduleDate: schedule.date,
          }
        }

        if (status === 'upcoming' && !firstUpcoming) {
          firstUpcoming = {
            scheduleIndex,
            trackIndex,
            talkIndex,
            talk,
            scheduleDate: schedule.date,
          }
        }
      }
    }

    if (firstUpcoming) {
      return firstUpcoming
    }
  }

  return null
}

export function getTalkStatusMap(
  schedules: ConferenceSchedule[],
  currentTime: Date = getCurrentConferenceTime(),
): Map<string, TalkStatus> {
  const statusMap = new Map<string, TalkStatus>()

  schedules.forEach((schedule) => {
    if (!schedule.tracks || !Array.isArray(schedule.tracks)) return

    schedule.tracks.forEach((track, trackIndex) => {
      if (!track.talks || !Array.isArray(track.talks)) return

      track.talks.forEach((talk) => {
        const key = getTalkStatusKey(
          schedule.date,
          talk.startTime,
          trackIndex,
          talk.talk?._id,
        )
        const status = getTalkStatus(talk, schedule.date, currentTime)
        statusMap.set(key, status)
      })
    })
  })

  return statusMap
}

export function getTalkStatusKey(
  scheduleDate: string,
  startTime: string,
  trackIndex: number,
  talkId?: string,
): string {
  return talkId
    ? `${scheduleDate}-${startTime}-${trackIndex}-${talkId}`
    : `${scheduleDate}-${startTime}-${trackIndex}`
}
