'use client'

import { useEffect, useState } from 'react'
import type { ConferenceSchedule } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { getCurrentConferenceTime } from '@/lib/program/time-utils'
import { onSimulatedTimeChange } from '@/lib/program/dev-time'
import { roomTrackOn, trackSponsorOf } from '@/lib/stream/track-sponsor'
import { SponsorBanner } from './SponsorBanner'
import { TrackSponsorBanner } from './TrackSponsorBanner'

/** How often the screen checks whether the day has changed. */
const DAY_CHECK_MS = 60_000

/**
 * The sponsors on a room's stream screen: a sponsored track thanks its
 * sponsor alone; every other track thanks all of them in the loop. The
 * room's track is today's, so a room two days share follows the day.
 */
export function StreamSponsors({
  schedules,
  roomTrackTitle,
  sponsors,
  className,
  speed,
}: {
  schedules: ConferenceSchedule[]
  roomTrackTitle: string
  sponsors: ConferenceSponsor[]
  className?: string
  speed?: number
}) {
  // The server cannot know the screen's day (or the simulated time), so the
  // first render takes the first day with the room, then the clock decides.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(getCurrentConferenceTime())
    tick()
    const interval = setInterval(tick, DAY_CHECK_MS)
    const unsubscribe = onSimulatedTimeChange(tick)
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  const track = roomTrackOn(schedules, roomTrackTitle, now ?? new Date(0))
  const trackSponsor = track ? trackSponsorOf(track, sponsors) : null
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
