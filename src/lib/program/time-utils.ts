import { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { getSimulatedTime } from './dev-time'

export type TalkStatus =
  'past' | 'happening-now' | 'happening-soon' | 'upcoming'

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

/**
 * Midnight LOCAL to the viewer for a `YYYY-MM-DD` schedule date.
 *
 * `new Date('2026-11-05')` is parsed as UTC midnight, so for any viewer west of
 * UTC it lands on the PREVIOUS local day — in São Paulo (UTC-3) it is 4 November
 * 21:00, and stripping to local midnight then yields the 4th. Every day
 * comparison here is against the viewer's own clock (deliberately: an on-site
 * attendee's "today" is their own), so the date string has to be read the same
 * way. Building it from the parts keeps it local.
 *
 * Concretely, before this: at 10:00 on 5 November in São Paulo, a schedule dated
 * 2026-11-05 reported `isScheduleToday === false`, so the "happening now" rail
 * never activated on the actual conference day for any Americas tenant.
 */
function startOfLocalDay(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  if (!year || !month || !day) return stripTime(new Date(dateString))
  return new Date(year, month - 1, day)
}

export function isConferenceDay(
  startDate: string,
  endDate: string,
  currentTime: Date = getCurrentConferenceTime(),
): boolean {
  const start = startOfLocalDay(startDate)
  const end = startOfLocalDay(endDate)
  const now = stripTime(currentTime)
  return now >= start && now <= end
}

export function isScheduleToday(
  scheduleDate: string,
  currentTime: Date = getCurrentConferenceTime(),
): boolean {
  return (
    startOfLocalDay(scheduleDate).getTime() === stripTime(currentTime).getTime()
  )
}

export function isScheduleInPast(
  scheduleDate: string,
  currentTime: Date = getCurrentConferenceTime(),
): boolean {
  return (
    startOfLocalDay(scheduleDate).getTime() < stripTime(currentTime).getTime()
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
