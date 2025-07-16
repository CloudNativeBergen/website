import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { SpeakerPromotion } from '@/components/SpeakerPromotion'
import { getPublicSpeakers } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '../../../lib/conference/sanity'
import { SpeakerWithTalks } from '@/lib/speaker/types'

export const revalidate = 3600

export default async function Speakers() {
  const { conference } = await getConferenceForCurrentDomain()
  const { speakers, err } = await getPublicSpeakers(conference._id, revalidate)
  if (err) {
    console.error(err)
  }

  // Speakers already include talks data from getPublicSpeakers
  const speakersWithTalks: SpeakerWithTalks[] = speakers

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <h2 className="font-jetbrains text-3xl font-bold tracking-tight text-brand-slate-gray sm:text-4xl">
                Meet our speakers
              </h2>
              <p className="mt-6 text-lg leading-8 text-brand-cloud-gray">
                These industry experts will share their insights and experiences
                in the world of cloud native technologies. Get ready to be
                inspired and learn from the best in the field.
              </p>
            </div>

            {/* Updated grid layout for SpeakerPromotion cards */}
            <div className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-6 md:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
              {speakersWithTalks.map((speaker) => (
                <SpeakerPromotion
                  key={speaker._id}
                  speaker={speaker}
                  variant="card"
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
