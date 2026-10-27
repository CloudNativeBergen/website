import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import {
  getCurrentConferenceTime,
  getTalkStatus,
  isScheduleInPast,
  isScheduleToday,
  parseTalkDateTime,
} from '@/lib/program/time-utils'

/** A talk that can be tagged (Talk photos spec §6.1). */
export interface TaggableTalk {
  slot: TrackTalk
  date: string
  room: string
}

export interface TalkSuggestion {
  /** Running talk in the room, else one that ended at most 30 minutes ago. */
  suggested: TaggableTalk | null
  /** Today in the room, today in other rooms, then earlier days newest first. */
  options: TaggableTalk[]
}

const RECENT_MINUTES = 30

const startOf = (t: TaggableTalk) => parseTalkDateTime(t.date, t.slot.startTime)
const endOf = (t: TaggableTalk) => parseTalkDateTime(t.date, t.slot.endTime)

/**
 * Pure: everything comes from the arguments. Only slots with a resolved talk
 * are taggable; later days are left out, nobody photographs a talk yet to come.
 */
export function suggestTalks(
  schedules: ConferenceSchedule[],
  room: string,
  now: Date = getCurrentConferenceTime(),
): TalkSuggestion {
  const all: TaggableTalk[] = schedules.flatMap((day) =>
    day.tracks.flatMap((track) =>
      track.talks
        .filter((slot) => slot.talk?._id)
        .map((slot) => ({ slot, date: day.date, room: track.trackTitle })),
    ),
  )
  const today = all
    .filter((t) => isScheduleToday(t.date, now))
    .sort((a, b) => +startOf(a) - +startOf(b))
  const inRoom = today.filter((t) => t.room === room)
  const earlier = all
    .filter((t) => isScheduleInPast(t.date, now))
    .sort((a, b) => +startOf(b) - +startOf(a))

  const statusOf = (t: TaggableTalk) => getTalkStatus(t.slot, t.date, now)
  const recent = inRoom
    .filter((t) => {
      const ago = (+now - +endOf(t)) / 60_000
      return ago >= 0 && ago <= RECENT_MINUTES
    })
    .sort((a, b) => +endOf(b) - +endOf(a))
  const suggested =
    inRoom.find((t) => statusOf(t) === 'happening-now') ??
    inRoom.find((t) => statusOf(t) === 'happening-soon') ??
    recent[0] ??
    null

  return {
    suggested,
    options: [...inRoom, ...today.filter((t) => t.room !== room), ...earlier],
  }
}
