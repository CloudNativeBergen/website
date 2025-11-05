import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import Link from 'next/link'

interface SpeakerGridExampleProps {
  speakers: SpeakerWithTalks[]
}

export function SpeakerGridExample({ speakers }: SpeakerGridExampleProps) {
  const featuredSpeakers = speakers.filter((_, index) => index < 2)
  const regularSpeakers = speakers.slice(2)

  return (
    <div className="space-y-8">
      {featuredSpeakers.length > 0 && (
        <div className="mb-12">
          <h2 className="font-space-grotesk mb-6 text-2xl font-bold text-brand-slate-gray">
            Featured Speakers
          </h2>
          <div className="grid auto-rows-fr gap-6 sm:grid-cols-2">
            {featuredSpeakers.map((speaker) => (
              <SpeakerPromotionCard
                key={speaker._id}
                speaker={speaker}
                variant="featured"
                isFeatured={true}
                ctaText="View Speaker"
                ctaUrl={`/speaker/${speaker.slug}`}
              />
            ))}
          </div>
        </div>
      )}

      {regularSpeakers.length > 0 && (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h3 className="font-space-grotesk text-2xl font-bold text-brand-slate-gray">
              All Speakers
            </h3>
            <Link
              href="/speaker"
              className="font-inter text-sm font-semibold text-brand-cloud-blue hover:text-brand-cloud-blue/80"
            >
              View all speakers →
            </Link>
          </div>

          <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {regularSpeakers.map((speaker) => (
              <SpeakerPromotionCard
                key={speaker._id}
                speaker={speaker}
                variant="default"
                ctaText="View Profile"
                ctaUrl={`/speaker/${speaker.slug}`}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-space-grotesk mb-6 text-xl font-bold text-brand-slate-gray">
          Speaker Directory (Compact)
        </h3>
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {speakers.slice(0, 8).map((speaker) => (
            <SpeakerPromotionCard
              key={`compact-${speaker._id}`}
              speaker={speaker}
              variant="compact"
              ctaText="View"
              ctaUrl={`/speaker/${speaker.slug}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
