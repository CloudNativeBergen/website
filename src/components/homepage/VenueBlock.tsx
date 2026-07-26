import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { MapPinIcon } from '@heroicons/react/24/outline'
import type { VenueSection } from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'
import { buildDirectionsUrl } from '@/lib/homepage/venue'

/**
 * Venue block (front-page builder F4). Name + address come from the conference
 * fields; the block carries only an optional heading/description. A "Get
 * directions" house Button links to a constructed maps URL. Renders nothing when
 * the conference has neither a venue name nor address.
 */
export function VenueBlock({
  section,
  conference,
}: {
  section: VenueSection
  conference: Conference
}) {
  const name = conference.venueName?.trim()
  const address = conference.venueAddress?.trim()
  if (!name && !address) return null

  const heading = section.heading?.trim() || 'Venue'
  const description = section.description?.trim()
  const directionsUrl = buildDirectionsUrl(name, address)

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
