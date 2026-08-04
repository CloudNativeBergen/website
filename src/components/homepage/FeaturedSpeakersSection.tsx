import { Container } from '@/components/Container'
import { FeaturedSpeakersGrid } from '@/components/FeaturedSpeakersGrid'
import { FeaturedSpeakersShelf } from '@/components/FeaturedSpeakersShelf'
import { PhaseCtaRow } from '@/components/homepage/PhaseCtaRow'
import type { Conference } from '@/lib/conference/types'
import {
  DEFAULT_FEATURED_SPEAKERS_HEADING,
  defaultFeaturedSpeakersDescription,
  type FeaturedSpeakersSection,
} from '@/lib/homepage'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'
import { resolveVariant } from '@/lib/homepage/variants'

/**
 * Featured-speakers band (legacy middle slot). Null when there are none.
 *
 * VARIANTS: `shelf` (default) is the horizontally scrolling peek-and-snap row;
 * `grid` shows every featured speaker at once in a static wall. Only the
 * speaker-list presentation differs — the heading, the copy fallbacks and the
 * phase-aware CTA row are shared, so the two variants never disagree about what
 * the band SAYS, only about how the people are arranged.
 */
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
  // Single source of truth for "is there anything to show": the lifecycle model
  // already answers this (`resolveHomepageContent`), and it is the same
  // question the phase CTA row is resolved from. Re-deriving it inline here was
  // the same answer by coincidence, not by construction.
  if (!lifecycle.content.hasFeaturedSpeakers) return null
  const speakers = conference.featuredSpeakers ?? []
  const variant = resolveVariant('homepageFeaturedSpeakers', section.variant)
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

        {variant === 'grid' ? (
          <FeaturedSpeakersGrid speakers={speakers} />
        ) : (
          <FeaturedSpeakersShelf speakers={speakers} />
        )}

        <PhaseCtaRow
          lifecycle={lifecycle}
          section="featured-speakers"
          ticketsFromPrice={ticketsFromPrice}
        />
      </Container>
    </section>
  )
}
