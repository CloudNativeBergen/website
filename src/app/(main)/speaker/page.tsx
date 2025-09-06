import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { getSpeakers } from '@/lib/speaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { SpeakerWithTalks } from '@/lib/speaker/types'

export const revalidate = 3600

export default async function Speakers() {
  const { conference } = await getConferenceForCurrentDomain()
  // getSpeakers now defaults to only confirmed speakers, which is what we want for public display
  const { speakers, err } = await getSpeakers(conference._id)
  if (err) {
    console.error(err)
  }

  // Transform speakers to SpeakerWithTalks format for SpeakerPromotionCard component
  const speakersWithTalks: SpeakerWithTalks[] = speakers.map((speaker) => ({
    ...speaker,
    talks: speaker.proposals || [], // Use the proposals from getSpeakers instead of empty array
  }))

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl lg:mx-0">
              <h2 className="font-jetbrains text-3xl font-bold tracking-tight text-brand-slate-gray sm:text-4xl">
                Meet our {speakersWithTalks.length} speakers
              </h2>
              <p className="mt-6 text-lg leading-8 text-brand-cloud-gray">
                These industry experts will share their insights and experiences
                in the world of cloud native technologies. Get ready to be
                inspired and learn from the best in the field.
              </p>
            </div>

            {/* Updated grid layout for SpeakerPromotionCard cards */}
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
