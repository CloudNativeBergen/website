import { Container } from '@/components/Container'
import { SpeakerPromotion } from '@/components/SpeakerPromotion'
import { SpeakerWithTalks } from '@/lib/speaker/types'

interface FeaturedSpeakersProps {
  speakers: SpeakerWithTalks[]
  isOrganizers?: boolean
}

export function FeaturedSpeakers({
  speakers,
  isOrganizers,
}: FeaturedSpeakersProps) {
  // Select a random speaker to feature (but keep it consistent during the session)
  const featuredSpeakerIndex =
    speakers.length > 0 ? Math.floor(Math.random() * speakers.length) : 0
  const featuredSpeaker = speakers[featuredSpeakerIndex]
  const remainingSpeakers = speakers.filter(
    (_, index) => index !== featuredSpeakerIndex,
  )

  return (
    <section
      id="speakers"
      aria-labelledby="speakers-title"
      className="py-20 sm:py-32"
    >
      <Container>
        <div className="bg-white py-32">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2
              id="speakers-title"
              className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl"
            >
              {isOrganizers ? 'Conference Controllers' : 'Masters of the Kube'}
            </h2>
            <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray">
              {isOrganizers
                ? 'Meet the control plane ensuring a smooth conference deployment.'
                : 'Brace yourselves for wisdom deployed directly from the masters of the Cloud Native ecosystem.'}
            </p>
          </div>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            {/* Featured Speaker - Show randomly selected speaker prominently */}
            {featuredSpeaker && (
              <div className="mt-20 mb-16">
                <SpeakerPromotion
                  key={featuredSpeaker._id}
                  speaker={featuredSpeaker}
                  variant="featured"
                />
              </div>
            )}

            {/* Grid of remaining speakers */}
            {remainingSpeakers.length > 0 && (
              <div className="mx-auto grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                {remainingSpeakers.map((speaker) => (
                  <SpeakerPromotion
                    key={speaker._id}
                    speaker={speaker}
                    variant="card"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
