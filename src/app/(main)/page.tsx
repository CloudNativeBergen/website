import { FeaturedSpeakers } from '@/components/FeaturedSpeakers'
import { Hero } from '@/components/Hero'
import { Schedule } from '@/components/Schedule'
import { Speakers } from '@/components/Speakers'
import { Sponsors } from '@/components/Sponsors'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'

export const revalidate = 300 // 5 minutes

function schedulesHasSpeakers(schedules: ConferenceSchedule[]) {
  return schedules.some((schedule) =>
    schedule.tracks.some((track: ScheduleTrack) =>
      track.talks.some((talk: TrackTalk) => !!talk.talk?.speaker),
    ),
  )
}

export default async function Home() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: true,
    featuredSpeakers: true,
    schedule: true,
    sponsors: true,
    revalidate,
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  const hasSchedules = conference.schedules && conference.schedules.length > 0
  const hasScheduledSpeakers = hasSchedules && schedulesHasSpeakers(conference.schedules!)
  const currentSchedule = hasSchedules ? conference.schedules![0] : null
  const displaySpeakers = conference.featured_speakers && conference.featured_speakers.length > 0
    ? conference.featured_speakers
    : conference.organizers
  const isOrganizers = !conference.featured_speakers || conference.featured_speakers.length === 0

  return (
    <>
      <Hero conference={conference} />

      {hasScheduledSpeakers ? (
        <Speakers tracks={currentSchedule!.tracks} />
      ) : (
        <FeaturedSpeakers speakers={displaySpeakers} isOrganizers={isOrganizers} />
      )}

      {currentSchedule && <Schedule schedule={currentSchedule} />}

      <Sponsors sponsors={conference.sponsors || []} />
    </>
  )
}
