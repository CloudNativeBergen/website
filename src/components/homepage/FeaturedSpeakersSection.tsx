import { Container } from '@/components/Container'
import { FeaturedSpeakersShelf } from '@/components/FeaturedSpeakersShelf'
import { PhaseCtaRow } from '@/components/homepage/PhaseCtaRow'
import type { Conference } from '@/lib/conference/types'
import {
  DEFAULT_FEATURED_SPEAKERS_HEADING,
  defaultFeaturedSpeakersDescription,
  type FeaturedSpeakersSection,
} from '@/lib/homepage'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'

/** Featured-speakers band (legacy middle slot). Null when there are none. */
export function FeaturedSpeakersSectionView({
  conference,
  section,
  lifecycle,
  ticketsFromPrice,
}: {
  conference: Conference
  section: FeaturedSpeakersSection
  lifecycle: HomepageLifecycle
  ticketsFromPrice?: string | null
}) {
  if (
    !conference.featuredSpeakers ||
    conference.featuredSpeakers.length === 0
  ) {
    return null
  }
  const heading = section.heading?.trim() || DEFAULT_FEATURED_SPEAKERS_HEADING
  const description =
    section.description?.trim() ||
    defaultFeaturedSpeakersDescription(conference.title)
  return (
    <section className="py-20 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
          <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
            {heading}
          </h2>
          <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
            {description}
          </p>
        </div>

        <FeaturedSpeakersShelf speakers={conference.featuredSpeakers} />

        <PhaseCtaRow
          lifecycle={lifecycle}
          section="featured-speakers"
          ticketsFromPrice={ticketsFromPrice}
        />
      </Container>
    </section>
  )
}
