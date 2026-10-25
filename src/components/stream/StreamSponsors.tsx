import type { ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { trackSponsorOf } from '@/lib/stream/track-sponsor'
import { SponsorBanner } from './SponsorBanner'
import { TrackSponsorBanner } from './TrackSponsorBanner'

/**
 * The sponsors on a room's stream screen: a sponsored track thanks its
 * sponsor alone; every other track thanks all of them in the loop.
 */
export function StreamSponsors({
  track,
  sponsors,
  className,
  speed,
}: {
  track: ScheduleTrack
  sponsors: ConferenceSponsor[]
  className?: string
  speed?: number
}) {
  const trackSponsor = trackSponsorOf(track, sponsors)
  return trackSponsor ? (
    <TrackSponsorBanner sponsor={trackSponsor} className={className} />
  ) : (
    <SponsorBanner
      sponsors={sponsors}
      heading="Thank you to:"
      className={className}
      speed={speed}
    />
  )
}
