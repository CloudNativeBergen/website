import { Fragment, type ReactNode } from 'react'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { Hero } from '@/components/Hero'
import { ProgramHighlights } from '@/components/ProgramHighlights'
import { Sponsors } from '@/components/Sponsors'
import { ImageGallery } from '@/components/ImageGallery'
import { SpeakerPromotionCard } from '@/components/SpeakerPromotionCard'
import { FeaturedSpeakersShelf } from '@/components/FeaturedSpeakersShelf'
import { CtaBanner } from '@/components/homepage/CtaBanner'
import { RichTextBlock } from '@/components/homepage/RichTextBlock'
import { MetricsBlock } from '@/components/homepage/MetricsBlock'
import {
  InformationCircleIcon,
  MicrophoneIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import type { Conference } from '@/lib/conference/types'
import { isCfpOpen, isRegistrationAvailable } from '@/lib/conference/state'
import { PIRSCH_EVENTS } from '@/lib/analytics'
import { hasPublishedSchedule, type HomepageSection } from '@/lib/homepage'

/** Unknown section `_type`s already warned about (once per process). */
const warnedUnknownSectionTypes = new Set<string>()

/**
 * Front-page builder (F2) renderer: maps each typed section config to its house
 * component. The DEFAULT path (an absent `homepageSections`) is resolved to
 * {@link getDefaultSections} upstream and rendered here, so this file is the
 * single place the legacy composition is reproduced — the featured-speakers and
 * organizers slots and their phase-aware CTA row live here verbatim.
 *
 * FORWARD COMPAT: a stored section whose `_type` is not in the closed registry is
 * SKIPPED with a `console.warn` — never a crash — so data written by a newer
 * schema degrades gracefully on an older deploy.
 */

/**
 * Phase-appropriate CTA row for homepage sections that otherwise end without a
 * call to action: CFP first while open, then tickets, then practical info.
 * (Moved verbatim from the legacy `page.tsx`.)
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
  // Checkin.no prices are excl. VAT — disclosed in the caption below the row
  const ticketsLabel = ticketsFromPrice
    ? `Get tickets — from ${ticketsFromPrice} kr`
    : 'Get tickets'
  const showsPrice = Boolean(ticketsFromPrice) && registrationAvailable

  return (
    <>
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
      {showsPrice && (
        <p className="mt-2 text-center text-xs text-brand-slate-gray/70 dark:text-gray-400">
          Ticket prices excl. VAT
        </p>
      )}
    </>
  )
}

/** Featured-speakers band (legacy middle slot). Null when there are none. */
function FeaturedSpeakersSectionView({
  conference,
  ticketsFromPrice,
}: {
  conference: Conference
  ticketsFromPrice?: string | null
}) {
  if (
    !conference.featuredSpeakers ||
    conference.featuredSpeakers.length === 0
  ) {
    return null
  }
  return (
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

        <FeaturedSpeakersShelf speakers={conference.featuredSpeakers} />

        <PhaseCtaRow
          conference={conference}
          section="featured-speakers"
          ticketsFromPrice={ticketsFromPrice}
        />
      </Container>
    </section>
  )
}

/** Organizers band (legacy fallback slot). Null when there are none. */
function OrganizersSectionView({
  conference,
  ticketsFromPrice,
}: {
  conference: Conference
  ticketsFromPrice?: string | null
}) {
  const sortedOrganizers =
    conference.organizers
      ?.slice()
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ) || []
  if (sortedOrganizers.length === 0) return null
  return (
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
          ticketsFromPrice={ticketsFromPrice}
        />
      </Container>
    </section>
  )
}

/** Program-highlights band (legacy middle slot). Null without a live schedule. */
function ProgramHighlightsSectionView({
  conference,
}: {
  conference: Conference
}) {
  if (!hasPublishedSchedule(conference)) return null
  return (
    <ProgramHighlights
      schedules={conference.schedules!}
      featuredSpeakers={conference.featuredSpeakers || []}
      featuredTalks={conference.featuredTalks || []}
      conference={conference}
    />
  )
}

interface RenderContext {
  conference: Conference
  ticketsFromPrice?: string | null
}

/** Map ONE section config to its rendered node (or null). */
function renderSection(
  section: HomepageSection,
  { conference, ticketsFromPrice }: RenderContext,
): ReactNode {
  switch (section._type) {
    case 'homepageHero':
      return (
        <Hero
          conference={conference}
          ticketsFromPrice={ticketsFromPrice}
          headlineOverride={section.heroHeadline}
          subheadlineOverride={section.heroSubheadline}
          ctaOverrides={section.ctaOverrides}
        />
      )
    case 'homepageGallery':
      return conference.featuredGalleryImages &&
        conference.featuredGalleryImages.length > 0 ? (
        <ImageGallery featuredImages={conference.featuredGalleryImages} />
      ) : null
    case 'homepageProgramHighlights':
      return <ProgramHighlightsSectionView conference={conference} />
    case 'homepageFeaturedSpeakers':
      return (
        <FeaturedSpeakersSectionView
          conference={conference}
          ticketsFromPrice={ticketsFromPrice}
        />
      )
    case 'homepageOrganizers':
      return (
        <OrganizersSectionView
          conference={conference}
          ticketsFromPrice={ticketsFromPrice}
        />
      )
    case 'homepageSponsors':
      return (
        <Sponsors
          sponsors={conference.sponsors || []}
          conference={conference}
        />
      )
    case 'homepageMetrics':
      return <MetricsBlock section={section} conference={conference} />
    case 'homepageCtaBanner':
      return <CtaBanner section={section} />
    case 'homepageRichText':
      return <RichTextBlock section={section} />
    default: {
      // Forward compat: an unknown `_type` (data written by a newer schema
      // during deploy skew) is skipped at runtime, never fatal. Warned once per
      // distinct type per process — this runs on every render of the page.
      const unknown = section as { _type?: string }
      const t = String(unknown._type)
      if (!warnedUnknownSectionTypes.has(t)) {
        warnedUnknownSectionTypes.add(t)
        console.warn(`[homepage] skipping unknown section type: ${t}`)
      }
      return null
    }
  }
}

/**
 * Render an ordered list of homepage sections. Hidden sections (F1 visibility
 * toggle) are skipped. EventJsonLd and page metadata are NOT the renderer's
 * concern — they stay in the page.
 */
export function HomepageSectionRenderer({
  sections,
  conference,
  ticketsFromPrice,
}: {
  sections: HomepageSection[]
  conference: Conference
  ticketsFromPrice?: string | null
}) {
  return (
    <>
      {sections
        .filter((section) => !section.hidden)
        .map((section) => (
          <Fragment key={section._key}>
            {renderSection(section, { conference, ticketsFromPrice })}
          </Fragment>
        ))}
    </>
  )
}
