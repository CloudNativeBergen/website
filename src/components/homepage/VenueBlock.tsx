import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { MapPinIcon } from '@heroicons/react/24/outline'
import {
  DEFAULT_VENUE_HEADING,
  type VenueSection,
} from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'
import { buildDirectionsUrl } from '@/lib/homepage/venue'
import { resolveVariant } from '@/lib/homepage/variants'

/**
 * Venue block (front-page builder F4). Name + address come from the conference
 * fields; the block carries only an optional heading/description. A "Get
 * directions" house Button links to a constructed maps URL. Renders nothing when
 * the conference has neither a venue name nor address.
 *
 * VARIANTS. `card` (the default) is today's centred hero-style card, unchanged.
 * `split` puts the heading and description beside the address card on wide
 * screens, which reads as a "practical information" band rather than a
 * centrepiece — the right weight for a page that already leads with something
 * else. Both stack to the same single column on a phone.
 *
 * NO MAP EMBEDS, in either variant: the "Get directions" link is built at
 * render time from the name and address (see `buildDirectionsUrl`); no tiles,
 * no iframes, no stored URL.
 */
export function VenueBlock({
  section,
  conference,
}: {
  section: VenueSection
  conference: Conference
}) {
  const variant = resolveVariant('homepageVenue', section.variant)
  const name = conference.venueName?.trim()
  const address = conference.venueAddress?.trim()
  if (!name && !address) return null

  const heading = section.heading?.trim() || DEFAULT_VENUE_HEADING
  const description = section.description?.trim()
  const directionsUrl = buildDirectionsUrl(name, address)

  if (variant === 'split') {
    return (
      <section className="py-20 sm:py-32">
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                {heading}
              </h2>
              {description ? (
                <p className="font-inter mt-4 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                  {description}
                </p>
              ) : null}
            </div>
            {/* Same card chrome as the default — only its position moves, so a
                tenant switching variants keeps a surface they recognise. */}
            <div className="rounded-2xl bg-white/80 p-6 shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm sm:p-8 dark:bg-gray-800/80 dark:ring-gray-700">
              {name ? (
                <p className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-100">
                  {name}
                </p>
              ) : null}
              {address ? (
                <p className="font-inter mt-1 whitespace-pre-line text-brand-slate-gray/80 dark:text-gray-300">
                  {address}
                </p>
              ) : null}
              {directionsUrl ? (
                <div className="mt-6 flex">
                  <Button
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    className="inline-flex items-center space-x-2 px-6 py-3 font-semibold"
                  >
                    <MapPinIcon className="h-5 w-5" aria-hidden="true" />
                    <span>Get directions</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-20 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
            {heading}
          </h2>
          {description ? (
            <p className="font-inter mt-4 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
              {description}
            </p>
          ) : null}
          <div className="mt-8 rounded-2xl bg-white/80 p-6 shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-gray-700">
            {name ? (
              <p className="font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-100">
                {name}
              </p>
            ) : null}
            {address ? (
              <p className="font-inter mt-1 whitespace-pre-line text-brand-slate-gray/80 dark:text-gray-300">
                {address}
              </p>
            ) : null}
            {directionsUrl ? (
              <div className="mt-6 flex justify-center">
                <Button
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="primary"
                  className="inline-flex items-center space-x-2 px-6 py-3 font-semibold"
                >
                  <MapPinIcon className="h-5 w-5" aria-hidden="true" />
                  <span>Get directions</span>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  )
}
