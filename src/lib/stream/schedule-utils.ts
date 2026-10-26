import type {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { isScheduleToday } from '@/lib/program/time-utils'
import { isInactiveProposal } from '@/lib/proposal/types'

/**
 * Sort schedules to prioritize today's schedule first, then by date
 */
export function sortSchedulesByDate(
  schedules: ConferenceSchedule[],
  currentTime: Date,
): ConferenceSchedule[] {
  return [...schedules].sort((a, b) => {
    const aIsToday = isScheduleToday(a.date, currentTime)
    const bIsToday = isScheduleToday(b.date, currentTime)
    if (aIsToday && !bIsToday) return -1
    if (!aIsToday && bIsToday) return 1
    return new Date(a.date).getTime() - new Date(b.date).getTime()
  })
}

/**
 * Sort talks by start time
 */
export function sortTalksByStartTime<T extends { startTime?: string }>(
  talks: T[],
): T[] {
  return [...talks].sort((a, b) => {
    if (!a.startTime || !b.startTime) return 0
    return a.startTime.localeCompare(b.startTime)
  })
}

/**
 * Find a track by room name with fuzzy matching support
 * First attempts exact match, then tries prefix matching
 */
export function findTrackByRoom(
  schedules: ConferenceSchedule[],
  roomName: string,
): ScheduleTrack | null {
  const normalizedRoom = roomName.toLowerCase().trim()

  for (const schedule of schedules) {
    if (!schedule.tracks) continue

    // First try exact match
    const exactMatch = schedule.tracks.find(
      (t) => t.trackTitle?.toLowerCase() === normalizedRoom,
    )
    if (exactMatch) return exactMatch

    // Then try fuzzy match (room name is contained in track title)
    const fuzzyMatch = schedule.tracks.find((t) => {
      const trackTitle = t.trackTitle?.toLowerCase()
      if (!trackTitle) return false

      // Check if the provided room name matches the beginning of the track title
      // This handles cases like "Hovedsalen" matching "Hovedsalen (2nd Floor)"
      return trackTitle.startsWith(normalizedRoom)
    })
    if (fuzzyMatch) return fuzzyMatch
  }

  return null
}

/**
 * Get all available room names from schedules
 */
export function getAvailableRooms(schedules: ConferenceSchedule[]): string[] {
  const rooms = new Set<string>()

  for (const schedule of schedules) {
    if (!schedule.tracks) continue

    for (const track of schedule.tracks) {
      if (track.trackTitle) {
        rooms.add(track.trackTitle)
      }
    }
  }

  return Array.from(rooms)
}

/**
 * A slot must not surface on the live stream when it is either:
 *  - a cancelled talk: a resolved proposal whose status is withdrawn/rejected/
 *    deleted (the stream reads with confirmedTalksOnly:false, so these resolve),
 *    which otherwise renders with a "LIVE NOW"/"UP NEXT" badge; or
 *  - a dangling reference: the slot HAD a talk reference that no longer resolves
 *    (the proposal was deleted), which is indistinguishable from a genuine
 *    service session and would otherwise render as a phantom "Service Session".
 * Genuine service sessions (no talk reference, with a placeholder) stay visible.
 */
export function isHiddenFromStream(talk: TrackTalk): boolean {
  if (talk.talk) {
    return isInactiveProposal(talk.talk.status)
  }
  return talk.hasTalkRef === true
}
