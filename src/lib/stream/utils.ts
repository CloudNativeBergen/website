import type { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'

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
