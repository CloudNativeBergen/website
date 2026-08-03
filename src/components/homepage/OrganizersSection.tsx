import { Container } from '@/components/Container'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { OrganizersCompact } from '@/components/homepage/OrganizersCompact'
import { PhaseCtaRow } from '@/components/homepage/PhaseCtaRow'
import type { Conference } from '@/lib/conference/types'
import {
  DEFAULT_ORGANIZERS_HEADING,
  defaultOrganizersDescription,
  type OrganizersSection,
} from '@/lib/homepage'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'
import { resolveVariant } from '@/lib/homepage/variants'

/**
 * Organizers band (legacy fallback slot). Null when there are none.
 *
 * VARIANTS: `cards` (default) gives every organizer a full promotion card;
 * `compact` collapses the team into a dense avatar-and-name roster. The sort,
 * the copy fallbacks and the phase CTA row are shared by both.
 */
export function OrganizersSectionView({
  conference,
  section,
  lifecycle,
  ticketsFromPrice,
}: {
  conference: Conference
  section: OrganizersSection
  lifecycle: HomepageLifecycle
  ticketsFromPrice?: string | null
}) {
  const sortedOrganizers =
    conference.organizers
      ?.slice()
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ) || []
  if (sortedOrganizers.length === 0) return null
  const variant = resolveVariant('homepageOrganizers', section.variant)
  const heading = section.heading?.trim() || DEFAULT_ORGANIZERS_HEADING
  const description =
    section.description?.trim() ||
    defaultOrganizersDescription(conference.title)
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

        {variant === 'compact' ? (
          <OrganizersCompact organizers={sortedOrganizers} />
        ) : (
          <div className="mt-12 grid auto-rows-fr grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
            {sortedOrganizers.map((organizer) => (
              <SpeakerPromotionCard
                key={organizer._id}
                speaker={{
                  ...organizer,
                  talks: [],
                }}
                variant="organizer"
              />
            ))}
          </div>
        )}

        <PhaseCtaRow
          lifecycle={lifecycle}
          section="featured-organizers"
          ticketsFromPrice={ticketsFromPrice}
        />
      </Container>
    </section>
  )
}
