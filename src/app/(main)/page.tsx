import { FeaturedSpeakers } from '@/components/FeaturedSpeakers'
import { Hero } from '@/components/Hero'
import { Schedule } from '@/components/Schedule'
import { Speakers } from '@/components/Speakers'
import { Sponsors } from '@/components/Sponsors'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSchedule, ScheduleTrack, TrackTalk } from '@/lib/conference/types'

export const revalidate = 300 // 5 minutes

function schedulesHasSpeakers(schedules: ConferenceSchedule[]) {
  return schedules.some((schedule) =>
    schedule.tracks.some((track: ScheduleTrack) =>
      track.talks.some((talk: TrackTalk) => !!talk.talk?.speaker)
    )
  )
}

export default async function Home() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: true,
    schedule: true,
    sponsors: true,
    revalidate
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  return (
    <>
      <Hero conference={conference} />

      {!conference?.schedules || conference.schedules.length === 0 ? (
        <FeaturedSpeakers speakers={conference.organizers || []} isOrganizers={true} />
      ) : (
        <>
          {!schedulesHasSpeakers(conference.schedules) ? (
            <FeaturedSpeakers speakers={conference.organizers || []} isOrganizers={true} />
          ) : (
            <Speakers tracks={conference.schedules[0].tracks} />
          )}
          <Schedule schedule={conference.schedules[0]} />
        </>
      )}
      <Sponsors sponsors={conference.sponsors || []} />
      {/*<Newsletter />*/}
    </>
  )
}
