import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { ProgramClient } from './ProgramClient'
import { Sponsors } from '@/components/Sponsors'
import { DevTimeProvider } from '@/components/program/DevTimeProvider'
import { DevTimeControl } from '@/components/program/DevTimeControl'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata = {
  title: 'Program',
  description: 'Conference program and schedule',
  twitter: {
    card: 'summary_large_image',
  },
}

async function CachedProgramContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:program')

  const { conference, error } = await getConferenceForDomain(domain, {
    organizers: false,
    schedule: true,
    topics: true,
    sponsors: true,
    sponsorTiers: true,
    confirmedTalksOnly: false,
  })

  if (error || !conference) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <Container>
          <div className="text-center">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
              Conference Program
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
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
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
              Conference Program
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">
              The conference program will be available soon. Stay tuned!
            </p>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24 print:py-0">
      <DevTimeProvider />
      <DevTimeControl schedules={conference.schedules} />
      <BackgroundImage className="-top-40 -bottom-32 print:hidden" />
      <Container className="relative print:max-w-full">
        <div className="mx-auto mb-16 max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24 print:mb-2 print:max-w-full print:pr-0">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400 print:mb-1 print:text-sm print:font-semibold">
            Conference Program
          </h1>
          <p className="font-inter mt-6 text-xl leading-8 tracking-tight text-brand-slate-gray dark:text-gray-300 print:hidden">
            Explore our comprehensive program of talks, workshops, and sessions.
            Filter by topic, speaker expertise, or format to build your perfect
            conference experience.
          </p>
        </div>

        <ProgramClient
          schedules={conference.schedules}
          conferenceTopics={conference.topics || []}
          conferenceStartDate={conference.startDate}
          conferenceEndDate={conference.endDate}
        />

        <div className="print:hidden">
          <Sponsors
            sponsors={conference.sponsors || []}
            conference={conference}
          />
        </div>
      </Container>
    </div>
  )
}

export default async function Program() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedProgramContent domain={domain} />
}
