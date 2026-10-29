import type { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { filterPublicSponsors } from '@/lib/sponsor/utils'
import { sortSchedulesByDate } from './schedule-utils'

/**
 * The sponsor a room's stream screen thanks alone: the track's sponsor, but
 * only while they are a public sponsor of the conference. A lost deal or a
 * missing tier falls back to the loop of every sponsor.
 */
export function trackSponsorOf(
  track: ScheduleTrack,
  sponsors: ConferenceSponsor[],
): ConferenceSponsor | null {
  const ref = track.sponsor?._ref
  if (!ref) return null
  return (
    filterPublicSponsors(sponsors).find(({ sponsor }) => sponsor._id === ref) ??
    null
  )
}

/**
 * The room's track on the day being shown: today's, or the first day that
 * has the room. Two days can share a room title with only one sponsored.
 */
export function roomTrackOn(
  schedules: ConferenceSchedule[],
  trackTitle: string,
  now: Date,
): ScheduleTrack | null {
  for (const schedule of sortSchedulesByDate(schedules, now)) {
    const track = schedule.tracks?.find((t) => t.trackTitle === trackTitle)
    if (track) return track
  }
  return null
}
