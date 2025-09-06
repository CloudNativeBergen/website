import { Container } from '@/components/Container'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { useMemo } from 'react'
import { CallToAction } from './CallToAction'

// Generate a session-stable seed that changes between page loads/deployments
// but remains consistent during the current session
const getSessionSeed = () => {
  if (typeof window !== 'undefined') {
    // Browser: use session storage to maintain consistency within session
    let seed = sessionStorage.getItem('speaker-selection-seed')
    if (!seed) {
      seed = Math.floor(Math.random() * 1000000).toString()
      sessionStorage.setItem('speaker-selection-seed', seed)
    }
    return parseInt(seed, 10)
  } else {
    // Server: use date-based seed that changes daily
    const today = new Date()
    return (
      today.getFullYear() * 10000 +
      (today.getMonth() + 1) * 100 +
      today.getDate()
    )
  }
}

interface FeaturedSpeakersProps {
  speakers: SpeakerWithTalks[]
  isOrganizers?: boolean
}

export function FeaturedSpeakers({
  speakers,
  isOrganizers = false,
}: FeaturedSpeakersProps) {
  // Memoize speaker selection to prevent re-renders causing different speakers
  const { featuredSpeaker, remainingSpeakers } = useMemo(() => {
    if (speakers.length === 0) {
      return { featuredSpeaker: null, remainingSpeakers: [] }
    }

    // Use a session-stable seed combined with speaker data for deterministic randomness
    const sessionSeed = getSessionSeed()
    const speakerHash = speakers.map((s) => s._id).join('').length
    const combinedSeed = sessionSeed + speakerHash
    const featuredIndex = combinedSeed % speakers.length

    return {
      featuredSpeaker: speakers[featuredIndex],
      remainingSpeakers: speakers.filter((_, index) => index !== featuredIndex),
    }
  }, [speakers])

  // Memoize content strings to prevent unnecessary re-renders
  const content = useMemo(
    () => ({
      title: isOrganizers ? 'Conference Controllers' : 'Masters of the Kube',
      subtitle: isOrganizers
        ? 'Meet the control plane ensuring a smooth conference deployment.'
        : 'Brace yourselves for wisdom deployed directly from the masters of the Cloud Native ecosystem.',
    }),
    [isOrganizers],
  )

  // Early return for empty speakers array
  if (speakers.length === 0) {
    return (
      <section
        id="speakers"
        aria-labelledby="speakers-title"
        className="py-20 sm:py-32"
      >
        <Container>
          <div className="py-32">
            <div className="mx-auto max-w-2xl text-center lg:mx-0">
              <h2
                id="speakers-title"
                className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl"
              >
                {content.title}
              </h2>
              <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                Stay tuned for speaker announcements!
              </p>
            </div>
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section
      id="speakers"
      aria-labelledby="speakers-title"
      className="py-20 sm:py-32"
    >
      <Container>
        <div className="py-32">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2
              id="speakers-title"
              className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl"
            >
              {content.title}
            </h2>
            <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
              {content.subtitle}
            </p>
          </div>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            {/* Featured Speaker - Show randomly selected speaker prominently */}
            {featuredSpeaker && (
              <div className="mt-20 mb-16">
                <SpeakerPromotionCard
                  key={featuredSpeaker._id}
                  speaker={featuredSpeaker}
                  variant="featured"
                />
              </div>
            )}

            {/* Grid of remaining speakers */}
            {remainingSpeakers.length > 0 && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {remainingSpeakers.map((speaker) => (
                  <SpeakerPromotionCard
                    key={speaker._id}
                    speaker={speaker}
                    variant="default"
                  />
                ))}
              </div>
            )}

            {/* Call to Action */}
            <div className="mt-15">
              <CallToAction isOrganizers={isOrganizers} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
