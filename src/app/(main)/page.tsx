import { FeaturedSpeakers } from '@/components/FeaturedSpeakers'
import { Hero } from '@/components/Hero'
import { Schedule } from '@/components/Schedule'
import { Speakers } from '@/components/Speakers'
import { Sponsors } from '@/components/Sponsors'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const revalidate = 3600

export default async function Home() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: false,
    schedule: true,
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  return (
    <>
      <Hero conference={conference} />

      {!conference?.schedules || conference.schedules.length === 0 ? (
        <FeaturedSpeakers />
      ) : (
        <>
          <Speakers tracks={conference.schedules[0].tracks} />
          <Schedule schedule={conference.schedules[0]} />
        </>
      )}
      <Sponsors />
      {/*<Newsletter />*/}
    </>
  )
}
