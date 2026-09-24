import { type ReactNode } from 'react'
import { Button } from '@/components/Button'
import {
  CalendarDaysIcon,
  InformationCircleIcon,
  MicrophoneIcon,
  PlayCircleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { ANALYTICS_EVENTS } from '@/lib/analytics'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'

/**
 * Lifecycle-appropriate CTA row for homepage sections that otherwise end without
 * a call to action.
 *
 * ORDER: after the event the PROGRAMME leads — a "Get tickets" button on a
 * finished conference is the single clearest signal that a site is unmaintained,
 * and what a post-event visitor actually wants is the talks. Before the event
 * the CFP leads while open (speakers are the scarcer supply), then tickets, then
 * practical info. A sold-out event never renders a ticket CTA.
 */
export function PhaseCtaRow({
  lifecycle,
  section,
}: {
  lifecycle: HomepageLifecycle
  section: 'featured-speakers' | 'featured-organizers'
}) {
  const events =
    section === 'featured-speakers'
      ? {
          cfp: ANALYTICS_EVENTS.cfpFeaturedSpeakers,
          tickets: ANALYTICS_EVENTS.ticketsFeaturedSpeakers,
          info: ANALYTICS_EVENTS.infoFeaturedSpeakers,
          programme: ANALYTICS_EVENTS.programFeaturedSpeakers,
        }
      : {
          cfp: ANALYTICS_EVENTS.cfpFeaturedOrganizers,
          tickets: ANALYTICS_EVENTS.ticketsFeaturedOrganizers,
          info: ANALYTICS_EVENTS.infoFeaturedOrganizers,
          programme: ANALYTICS_EVENTS.programFeaturedOrganizers,
        }

  const { primaryCta, cfp, tickets, content, stage } = lifecycle
  const ticketsOnSale = tickets === 'on-sale'
  const buttonClassName =
    'inline-flex items-center space-x-2 px-8 py-4 font-semibold'

  // "Watch the talks" is a POST-EVENT promise. `hasRecordings` alone is not
  // enough: a recording can be attached to a confirmed talk before the event
  // (a re-run, a teaser), and the pre-event `programme` stage also renders this
  // button — which would advertise talks nobody has given yet. The stage is the
  // half of the condition that says the event has actually happened.
  const showsRecordings = stage === 'post-event' && content.hasRecordings

  const programmeButton = (
    <Button
      href="/program"
      variant="primary"
      className={buttonClassName}
      data-ph-capture-attribute-cta={events.programme}
    >
      {showsRecordings ? (
        <>
          <PlayCircleIcon className="h-5 w-5" aria-hidden="true" />
          <span>Watch the talks</span>
        </>
      ) : (
        <>
          <CalendarDaysIcon className="h-5 w-5" aria-hidden="true" />
          <span>See the programme</span>
        </>
      )}
    </Button>
  )

  const ticketsButton = (variant: 'primary' | 'outline') => (
    <Button
      href="/tickets"
      variant={variant}
      className={buttonClassName}
      data-ph-capture-attribute-cta={events.tickets}
    >
      <TicketIcon className="h-5 w-5" aria-hidden="true" />
      <span>Get tickets</span>
    </Button>
  )

  const infoButton = (
    <Button
      href="/info"
      variant="primary"
      className={buttonClassName}
      data-ph-capture-attribute-cta={events.info}
    >
      <InformationCircleIcon className="h-5 w-5" aria-hidden="true" />
      <span>Practical information</span>
    </Button>
  )

  let buttons: ReactNode
  if (primaryCta === 'programme') {
    buttons = (
      <>
        {programmeButton}
        {ticketsOnSale && ticketsButton('outline')}
      </>
    )
  } else if (primaryCta === 'cfp' || cfp === 'open') {
    buttons = (
      <>
        <Button
          href="/cfp"
          variant="primary"
          className={buttonClassName}
          data-ph-capture-attribute-cta={events.cfp}
        >
          <MicrophoneIcon className="h-5 w-5" aria-hidden="true" />
          <span>Submit a talk</span>
        </Button>
        {ticketsOnSale && ticketsButton('outline')}
      </>
    )
  } else if (primaryCta === 'tickets') {
    buttons = ticketsButton('primary')
  } else {
    buttons = infoButton
  }

  return (
    <>
      <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
        {buttons}
      </div>
      {tickets === 'sold-out' && (
        <p className="font-jetbrains mt-4 text-center text-sm font-semibold tracking-wide text-brand-slate-gray/80 uppercase dark:text-gray-300">
          Tickets are sold out
        </p>
      )}
    </>
  )
}
