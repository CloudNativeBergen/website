import type { Metadata } from 'next'
import { Hero } from '@/components/Hero'
import { ProgramHighlights } from '@/components/ProgramHighlights'
import { Sponsors } from '@/components/Sponsors'
import { ImageGallery } from '@/components/ImageGallery'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import {
  isCfpOpen,
  isConferenceOver,
  isProgramPublished,
  isRegistrationAvailable,
} from '@/lib/conference/state'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import {
  InformationCircleIcon,
  MicrophoneIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import type { Conference } from '@/lib/conference/types'
import {
  getPublicTicketTypes,
  getLowestTicketPrice,
  type LowestTicketPrice,
} from '@/lib/tickets/public'
import { formatDatesSafe } from '@/lib/time'
import { PIRSCH_EVENTS } from '@/lib/analytics'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

function truncateDescription(text: string, maxLength = 160): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  const cut = trimmed.slice(0, maxLength - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength - 1)}…`
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  const { conference, error } = await getConferenceForDomain(domain)

  if (error || !conference?.title) {
    return { twitter: { card: 'summary_large_image' } }
  }

  const dates = formatDatesSafe(conference.startDate, conference.endDate)
  const title = [
    conference.title,
    dates !== 'TBD' ? dates : null,
    conference.city,
  ]
    .filter(Boolean)
    .join(' · ')

  const description =
    conference.description && typeof conference.description === 'string'
      ? truncateDescription(conference.description)
      : undefined

  return {
    title: { absolute: title },
    ...(description && { description }),
    openGraph: {
      title,
      ...(description && { description }),
    },
    twitter: {
      card: 'summary_large_image',
    },
  }
}

/**
 * Builds a schema.org Event JSON-LD object for the homepage.
 * https://nextjs.org/docs/app/guides/json-ld
 */
function buildEventJsonLd(
  conference: Conference,
  domain: string,
  lowestTicketPrice: LowestTicketPrice | null,
): Record<string, unknown> {
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${domain}`

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: conference.title,
    startDate: conference.startDate,
    endDate: conference.endDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    image: [`${siteUrl}/opengraph-image`],
    organizer: {
      '@type': 'Organization',
      name: conference.organizer,
      url: siteUrl,
    },
  }

  if (conference.description && typeof conference.description === 'string') {
    jsonLd.description = conference.description
  }

  if (conference.venueName || conference.city) {
    const address: Record<string, unknown> = { '@type': 'PostalAddress' }
    if (conference.venueAddress) {
      address.streetAddress = conference.venueAddress
    }
    if (conference.city) {
      address.addressLocality = conference.city
    }
    if (conference.country) {
      address.addressCountry = conference.country
    }

    jsonLd.location = {
      '@type': 'Place',
      name: conference.venueName || conference.city,
      address,
    }
  }

  if (conference.registrationLink && !isConferenceOver(conference)) {
    const offers: Record<string, unknown> = {
      '@type': 'Offer',
      url: conference.registrationLink,
      priceCurrency: 'NOK',
    }
    if (lowestTicketPrice) {
      // Google's Event spec wants the lowest price including all mandatory
      // charges, so the structured-data price is incl. VAT
      offers.price = lowestTicketPrice.amountInclVat
    }
    if (isRegistrationAvailable(conference)) {
      offers.availability = 'https://schema.org/InStock'
    }
    jsonLd.offers = offers
  }

  return jsonLd
}

/**
 * Phase-appropriate CTA row for homepage sections that otherwise end without
 * a call to action: CFP first while open, then tickets, then practical info.
 */
function PhaseCtaRow({
  conference,
  section,
  ticketsFromPrice,
}: {
  conference: Conference
  section: 'featured-speakers' | 'featured-organizers'
  ticketsFromPrice?: string | null
}) {
  const events =
    section === 'featured-speakers'
      ? {
          cfp: PIRSCH_EVENTS.cfpFeaturedSpeakers,
          tickets: PIRSCH_EVENTS.ticketsFeaturedSpeakers,
          info: PIRSCH_EVENTS.infoFeaturedSpeakers,
        }
      : {
          cfp: PIRSCH_EVENTS.cfpFeaturedOrganizers,
          tickets: PIRSCH_EVENTS.ticketsFeaturedOrganizers,
          info: PIRSCH_EVENTS.infoFeaturedOrganizers,
        }

  const cfpOpen = isCfpOpen(conference)
  const registrationAvailable = isRegistrationAvailable(conference)
  const buttonClassName =
    'inline-flex items-center space-x-2 px-8 py-4 font-semibold'
  const ticketsLabel = ticketsFromPrice
    ? `Get tickets — from ${ticketsFromPrice} kr excl. VAT`
    : 'Get tickets'

  return (
    <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
      {cfpOpen ? (
        <>
          <Button
            href="/cfp"
            variant="primary"
            className={buttonClassName}
            data-pirsch-event={events.cfp}
          >
            <MicrophoneIcon className="h-5 w-5" aria-hidden="true" />
            <span>Submit a talk</span>
          </Button>
          {registrationAvailable && (
            <Button
              href="/tickets"
              variant="outline"
              className={buttonClassName}
              data-pirsch-event={events.tickets}
            >
              <TicketIcon className="h-5 w-5" aria-hidden="true" />
              <span>{ticketsLabel}</span>
            </Button>
          )}
        </>
      ) : registrationAvailable ? (
        <Button
          href="/tickets"
          variant="primary"
          className={buttonClassName}
          data-pirsch-event={events.tickets}
        >
          <TicketIcon className="h-5 w-5" aria-hidden="true" />
          <span>{ticketsLabel}</span>
        </Button>
      ) : (
        <Button
          href="/info"
          variant="primary"
          className={buttonClassName}
          data-pirsch-event={events.info}
        >
          <InformationCircleIcon className="h-5 w-5" aria-hidden="true" />
          <span>Practical information</span>
        </Button>
      )}
    </div>
  )
}

async function CachedHomeContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:homepage')

  const { conference, error } = await getConferenceForDomain(domain, {
    organizers: true,
    sponsors: true,
    sponsorTiers: true,
    featuredSpeakers: true,
    featuredTalks: true,
    schedule: true,
    gallery: { featuredOnly: true },
  })

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  // Lowest ticket price for CTA labels and JSON-LD offers. Any failure falls
  // back silently to plain labels — the homepage must never fail because
  // checkin.no is unavailable.
  let lowestTicketPrice: LowestTicketPrice | null = null
  if (conference.checkinEventId) {
    try {
      const ticketData = await getPublicTicketTypes(conference.checkinEventId)
      if (ticketData) {
        lowestTicketPrice = getLowestTicketPrice(ticketData.tickets)
      }
    } catch (ticketError) {
      console.error('Failed to fetch ticket prices for homepage:', ticketError)
    }
  }

  const jsonLd = buildEventJsonLd(conference, domain, lowestTicketPrice)

  const hasSchedule =
    isProgramPublished(conference) &&
    conference.schedules &&
    conference.schedules.length > 0
  const hasFeaturedSpeakers =
    conference.featuredSpeakers && conference.featuredSpeakers.length > 0
  const sortedOrganizers =
    conference.organizers
      ?.slice()
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ) || []

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <Hero
        conference={conference}
        ticketsFromPrice={lowestTicketPrice?.formatted}
      />
      {conference.featuredGalleryImages &&
        conference.featuredGalleryImages.length > 0 && (
          <ImageGallery featuredImages={conference.featuredGalleryImages} />
        )}
      {hasSchedule ? (
        <ProgramHighlights
          schedules={conference.schedules!}
          featuredSpeakers={conference.featuredSpeakers || []}
          featuredTalks={conference.featuredTalks || []}
          conference={conference}
        />
      ) : hasFeaturedSpeakers ? (
        <section className="py-20 sm:py-32">
          <Container>
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
              <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                Featured Speakers
              </h2>
              <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                Meet the speakers at {conference.title}
              </p>
            </div>

            <div className="mt-12 grid auto-rows-fr grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {conference.featuredSpeakers!.map((speaker) => (
                <SpeakerPromotionCard
                  key={speaker._id}
                  speaker={speaker}
                  variant="featured"
                />
              ))}
            </div>

            <PhaseCtaRow
              conference={conference}
              section="featured-speakers"
              ticketsFromPrice={lowestTicketPrice?.formatted}
            />
          </Container>
        </section>
      ) : sortedOrganizers.length > 0 ? (
        <section className="py-20 sm:py-32">
          <Container>
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-4xl lg:pr-24">
              <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                Meet Our Organizers
              </h2>
              <p className="font-inter mt-4 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                The passionate team driving {conference.title}
              </p>
            </div>

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

            <PhaseCtaRow
              conference={conference}
              section="featured-organizers"
              ticketsFromPrice={lowestTicketPrice?.formatted}
            />
          </Container>
        </section>
      ) : null}
      <Sponsors sponsors={conference.sponsors || []} conference={conference} />
    </>
  )
}

export default async function Home() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedHomeContent domain={domain} />
}
