import type { ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { filterPublicSponsors } from '@/lib/sponsor/utils'

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
