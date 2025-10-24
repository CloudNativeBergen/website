import type { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'

export function findTrackByRoom(
  schedules: ConferenceSchedule[],
  roomName: string,
): ScheduleTrack | null {
  const normalizedRoom = roomName.toLowerCase()

  for (const schedule of schedules) {
    if (!schedule.tracks) continue

    const track = schedule.tracks.find(
      (t) => t.trackTitle?.toLowerCase() === normalizedRoom,
    )

    if (track) return track
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
