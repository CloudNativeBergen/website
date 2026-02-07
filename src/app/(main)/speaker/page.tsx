import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { getSpeakers } from '@/lib/speaker/sanity'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

async function CachedSpeakersContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:speakers')

  const { conference } = await getConferenceForDomain(domain)

  const { speakers, err } = await getSpeakers(conference._id)
  if (err) {
    console.error(err)
  }

  const speakersWithTalks: SpeakerWithTalks[] = speakers.map((speaker) => ({
    ...speaker,
    talks: speaker.proposals || [],
  }))

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
                Meet our {speakersWithTalks.length} speakers
              </h1>
              <p className="font-inter mt-6 text-xl leading-8 tracking-tight text-brand-slate-gray dark:text-gray-300">
                These industry experts will share their insights and experiences
                in the world of cloud native technologies. Get ready to be
                inspired and learn from the best in the field.
              </p>
            </div>

            <div className="mx-auto mt-20 grid max-w-2xl auto-rows-fr grid-cols-1 gap-6 md:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
              {speakersWithTalks.map((speaker) => (
                <SpeakerPromotionCard
                  key={speaker._id}
                  speaker={speaker}
                  variant="compact"
                  ctaText="View Profile"
                />
              ))}
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}

export default async function Speakers() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedSpeakersContent domain={domain} />
}
