import type { ConferenceSchedule } from '@/lib/conference/types'
import { getTalkStatus } from '@/lib/program/time-utils'
import { isHiddenFromStream, sortTalksByStartTime } from './schedule-utils'

/** The most a room screen shows at once (speaker feedback spec §7.6). */
export const MAX_ROOM_FEEDBACK_CODES = 3

export interface RoomFeedbackCode {
  talkId: string
  title: string
  url: string
}

const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The Feedback Codes a room screen shows now (spec §7.6): today's ended talks
 * in the room since its last break, oldest first, only between talks, and
 * only those in `urls` (talk id → attendee URL, public talks with a code).
 */
export function roomFeedbackCodes(
  schedules: ConferenceSchedule[],
  roomTrackTitle: string,
  urls: Record<string, string>,
  now: Date,
): RoomFeedbackCode[] {
  const today = dayOf(now)
  const schedule = schedules.find((s) => s.date === today)
  const track = schedule?.tracks?.find((t) => t.trackTitle === roomTrackTitle)
  if (!schedule || !track?.talks) return []

  const own = track.talks.filter((s) => s.startTime && s.endTime)
  // Another track's placeholder is a break here too, when no talk of this
  // room overlaps it: a shared "Lunch" is often entered in one track only.
  const shared = schedule.tracks
    .filter((t) => t !== track)
    .flatMap((t) => t.talks ?? [])
    .filter(
      (p) =>
        !p.talk &&
        p.placeholder &&
        p.startTime &&
        p.endTime &&
        !own.some(
          (s) => s.talk && p.startTime < s.endTime && p.endTime > s.startTime,
        ),
    )
  const slots = sortTalksByStartTime([...own, ...shared])
  const status = (s: (typeof slots)[number]) =>
    getTalkStatus(s, schedule.date, now)
  if (slots.some((s) => s.talk && status(s) === 'happening-now')) return []

  const picked: RoomFeedbackCode[] = []
  let sawTalk = false
  for (const slot of slots.filter((s) => status(s) === 'past').reverse()) {
    if (!slot.talk) {
      // A placeholder: the break ending the run, unless no talk came yet.
      if (slot.placeholder && sawTalk) break
      continue
    }
    sawTalk = true
    if (isHiddenFromStream(slot)) continue
    const url = urls[slot.talk._id]
    if (url) picked.push({ talkId: slot.talk._id, title: slot.talk.title, url })
  }
  return picked.slice(0, MAX_ROOM_FEEDBACK_CODES).reverse()
}
