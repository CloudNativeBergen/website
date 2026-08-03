import { Fragment, type ReactNode } from 'react'
import { Hero } from '@/components/Hero'
import { Sponsors } from '@/components/Sponsors'
import { ImageGallery } from '@/components/ImageGallery'
import { CtaBanner } from '@/components/homepage/CtaBanner'
import { RichTextBlock } from '@/components/homepage/RichTextBlock'
import { MetricsBlock } from '@/components/homepage/MetricsBlock'
import { FaqBlock } from '@/components/homepage/FaqBlock'
import { Countdown } from '@/components/homepage/Countdown'
import { VenueBlock } from '@/components/homepage/VenueBlock'
import { SaveTheDate } from '@/components/homepage/SaveTheDate'
import { LifecycleNotice } from '@/components/homepage/LifecycleNotice'
import { FeaturedSpeakersSectionView } from '@/components/homepage/FeaturedSpeakersSection'
import { OrganizersSectionView } from '@/components/homepage/OrganizersSection'
import { ProgramHighlightsSectionView } from '@/components/homepage/ProgramHighlightsSection'
import { resolveCountdownTarget } from '@/lib/homepage/countdown'
import type { Conference } from '@/lib/conference/types'
import type { HomepageSection } from '@/lib/homepage'
import {
  resolveHomepageLifecycle,
  type HomepageLifecycle,
} from '@/lib/homepage/lifecycle'
import type { TicketAvailability } from '@/lib/tickets/public'

/** Unknown section `_type`s already warned about (once per process). */
const warnedUnknownSectionTypes = new Set<string>()

/**
 * Front-page builder (F2) renderer: maps each typed section config to its house
 * component. The DEFAULT path (an absent `homepageSections`) is resolved to
 * {@link getDefaultSections} upstream and rendered here.
 *
 * DISPATCH ONLY: every band lives in its own module (the legacy middle slots in
 * `FeaturedSpeakersSection` / `OrganizersSection` / `ProgramHighlightsSection`,
 * their shared phase-aware CTA row in `PhaseCtaRow`). Keeping this file to the
 * mapping, the lifecycle short-circuit and the unknown-`_type` skip is what lets
 * per-section work proceed without every change landing in one file.
 *
 * FORWARD COMPAT: a stored section whose `_type` is not in the closed registry is
 * SKIPPED with a `console.warn` — never a crash — so data written by a newer
 * schema degrades gracefully on an older deploy.
 */

interface RenderContext {
  conference: Conference
  lifecycle: HomepageLifecycle
  ticketsFromPrice?: string | null
}

/** Map ONE section config to its rendered node (or null). */
function renderSection(
  section: HomepageSection,
  { conference, lifecycle, ticketsFromPrice }: RenderContext,
): ReactNode {
  switch (section._type) {
    case 'homepageHero':
      return (
        <Hero
          conference={conference}
          lifecycle={lifecycle}
          ticketsFromPrice={ticketsFromPrice}
          headlineOverride={section.heroHeadline}
          subheadlineOverride={section.heroSubheadline}
          ctaOverrides={section.ctaOverrides}
        />
      )
    case 'homepageGallery':
      return conference.featuredGalleryImages &&
        conference.featuredGalleryImages.length > 0 ? (
        // Blank/absent copy falls through to the component's house defaults.
        <ImageGallery
          featuredImages={conference.featuredGalleryImages}
          heading={section.heading?.trim() || undefined}
          description={section.description?.trim() || undefined}
        />
      ) : null
    case 'homepageSaveTheDate':
      return (
        <SaveTheDate
          section={section}
          conference={conference}
          lifecycle={lifecycle}
        />
      )
    case 'homepageProgramHighlights':
      return (
        <ProgramHighlightsSectionView
          conference={conference}
          lifecycle={lifecycle}
        />
      )
    case 'homepageFeaturedSpeakers':
      return (
        <FeaturedSpeakersSectionView
          conference={conference}
          section={section}
          lifecycle={lifecycle}
          ticketsFromPrice={ticketsFromPrice}
        />
      )
    case 'homepageOrganizers':
      return (
        <OrganizersSectionView
          conference={conference}
          section={section}
          lifecycle={lifecycle}
          ticketsFromPrice={ticketsFromPrice}
        />
      )
    case 'homepageSponsors':
      // The "Become a Sponsor" pitch is suppressed once the event is over: it is
      // the loudest thing on an empty homepage and, after the fact, it asks for
      // money for something that has already happened. Sponsors that DO exist
      // still render — a thank-you wall is exactly what a post-event page wants.
      return (
        <Sponsors
          sponsors={conference.sponsors || []}
          conference={conference}
          showCTA={
            section.showCta !== false && lifecycle.stage !== 'post-event'
          }
          heading={section.heading?.trim() || undefined}
          description={section.description?.trim() || undefined}
          ctaHeading={section.ctaHeading?.trim() || undefined}
          ctaDescription={section.ctaDescription?.trim() || undefined}
        />
      )
    case 'homepageMetrics':
      return <MetricsBlock section={section} conference={conference} />
    case 'homepageCtaBanner':
      return <CtaBanner section={section} />
    case 'homepageRichText':
      return <RichTextBlock section={section} />
    case 'homepageFaq':
      return <FaqBlock section={section} conference={conference} />
    case 'homepageCountdown': {
      // SSR-safe: resolve the target to a stable timestamp server-side; the
      // client component ticks after hydration. Null target → nothing to show.
      const targetMs = resolveCountdownTarget(conference, section)
      if (targetMs === null) return null
      return (
        <Countdown
          targetMs={targetMs}
          heading={section.heading}
          liveMessage={section.liveMessage}
        />
      )
    }
    case 'homepageVenue':
      return <VenueBlock section={section} conference={conference} />
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
  ticketAvailability,
}: {
  sections: HomepageSection[]
  conference: Conference
  ticketsFromPrice?: string | null
  /**
   * Live availability from the ticketing provider (see `getTicketAvailability`).
   * Absent degrades to "on sale" — never to a sold-out claim.
   */
  ticketAvailability?: TicketAvailability | null
}) {
  const lifecycle = resolveHomepageLifecycle(conference, { ticketAvailability })

  // `cancelled` / `archived` REPLACE the page. Short-circuiting above the
  // section list is deliberate: rendering the notice as one more section would
  // leave the hero's ticket CTA, the countdown and the speaker shelf underneath
  // it, and visitors act on buttons rather than on paragraphs.
  if (lifecycle.isOverridden) {
    return (
      <LifecycleNotice
        conference={conference}
        status={lifecycle.stage as 'cancelled' | 'archived'}
      />
    )
  }

  return (
    <>
      {sections
        .filter((section) => !section.hidden)
        .map((section) => (
          <Fragment key={section._key}>
            {renderSection(section, {
              conference,
              lifecycle,
              ticketsFromPrice,
            })}
          </Fragment>
        ))}
    </>
  )
}
