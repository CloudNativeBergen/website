import { type ReactNode } from 'react'
import { Button } from '@/components/Button'
import {
  CalendarDaysIcon,
  InformationCircleIcon,
  MicrophoneIcon,
  PlayCircleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import { PIRSCH_EVENTS } from '@/lib/analytics'
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
  ticketsFromPrice,
}: {
  lifecycle: HomepageLifecycle
  section: 'featured-speakers' | 'featured-organizers'
  ticketsFromPrice?: string | null
}) {
  const events =
    section === 'featured-speakers'
      ? {
          cfp: PIRSCH_EVENTS.cfpFeaturedSpeakers,
          tickets: PIRSCH_EVENTS.ticketsFeaturedSpeakers,
          info: PIRSCH_EVENTS.infoFeaturedSpeakers,
          programme: PIRSCH_EVENTS.programFeaturedSpeakers,
        }
      : {
          cfp: PIRSCH_EVENTS.cfpFeaturedOrganizers,
          tickets: PIRSCH_EVENTS.ticketsFeaturedOrganizers,
          info: PIRSCH_EVENTS.infoFeaturedOrganizers,
          programme: PIRSCH_EVENTS.programFeaturedOrganizers,
        }

  const { primaryCta, cfp, tickets, content, stage } = lifecycle
  const ticketsOnSale = tickets === 'on-sale'
  const buttonClassName =
    'inline-flex items-center space-x-2 px-8 py-4 font-semibold'
  // Checkin.no prices are excl. VAT — disclosed in the caption below the row
  const ticketsLabel = ticketsFromPrice
    ? `Get tickets — from ${ticketsFromPrice} kr`
    : 'Get tickets'
  const showsPrice = Boolean(ticketsFromPrice) && ticketsOnSale

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
      data-pirsch-event={events.programme}
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
      data-pirsch-event={events.tickets}
    >
      <TicketIcon className="h-5 w-5" aria-hidden="true" />
      <span>{ticketsLabel}</span>
    </Button>
  )

  const infoButton = (
    <Button
      href="/info"
      variant="primary"
      className={buttonClassName}
      data-pirsch-event={events.info}
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
          data-pirsch-event={events.cfp}
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
      {showsPrice && (
        <p className="mt-2 text-center text-xs text-brand-slate-gray/70 dark:text-gray-400">
          Ticket prices excl. VAT
        </p>
      )}
      {tickets === 'sold-out' && (
        <p className="font-jetbrains mt-4 text-center text-sm font-semibold tracking-wide text-brand-slate-gray/80 uppercase dark:text-gray-300">
          Tickets are sold out
        </p>
      )}
    </>
  )
}
