import type { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'
import { isScheduleToday } from '@/lib/program/time-utils'

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
