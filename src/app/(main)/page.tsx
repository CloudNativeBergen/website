import { Hero } from '@/components/Hero'
import { ProgramHighlights } from '@/components/ProgramHighlights'
import { Sponsors } from '@/components/Sponsors'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const revalidate = 300

export default async function Home() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: true,
    featuredSpeakers: true,
    featuredTalks: true,
    schedule: true,
    sponsors: true,
    revalidate,
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  return (
    <>
      <Hero conference={conference} />
      {conference.schedules && conference.schedules.length > 0 && (
        <ProgramHighlights
          schedules={conference.schedules}
          featuredSpeakers={conference.featured_speakers || []}
          featuredTalks={conference.featured_talks || []}
          tickets_enabled={conference.registration_enabled}
        />
      )}
      <Sponsors sponsors={conference.sponsors || []} />
    </>
  )
}
