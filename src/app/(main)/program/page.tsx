import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ProgramClient } from './ProgramClient'
import { Sponsors } from '../../../components/Sponsors'

export const revalidate = 300

export default async function Program() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: false,
    schedule: true,
    topics: true,
    sponsors: true,
    confirmedTalksOnly: false,
  })

  if (error || !conference) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <Container>
          <div className="text-center">
            <h1 className="font-space-grotesk text-4xl font-bold tracking-tight text-brand-slate-gray sm:text-5xl">
              Conference Program
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Unable to load conference program. Please try again later.
            </p>
          </div>
        </Container>
      </div>
    )
  }

  if (!conference.schedules || conference.schedules.length === 0) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-40 -bottom-32" />
        <Container className="relative">
          <div className="text-center">
            <h1 className="font-space-grotesk text-4xl font-bold tracking-tight text-brand-slate-gray sm:text-5xl">
              Conference Program
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              The conference program will be available soon. Stay tuned!
            </p>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-40 -bottom-32" />
      <Container className="relative">
        <div className="mx-auto mb-16 max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
          <h1 className="font-space-grotesk text-4xl font-bold tracking-tight text-brand-cloud-blue sm:text-5xl">
            Conference Program
          </h1>
          <p className="font-inter mt-6 text-xl leading-8 text-brand-slate-gray">
            Explore our comprehensive program of talks, workshops, and sessions.
            Filter by topic, speaker expertise, or format to build your perfect
            conference experience.
          </p>
        </div>

        <ProgramClient
          schedules={conference.schedules}
          conferenceTopics={conference.topics || []}
        />

        <Sponsors sponsors={conference.sponsors || []} />
      </Container>
    </div>
  )
}
