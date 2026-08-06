import {
  CalendarDaysIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { BackgroundImage } from '@/components/BackgroundImage'
import { formatDatesSafe } from '@/lib/time'
import { PIRSCH_EVENTS } from '@/lib/analytics'

/**
 * What /tickets says when it has no pricing grid to show.
 *
 * There used to be ONE screen here — "Tickets Coming Soon / Tickets for X are
 * not yet available" — and it fired for three unrelated reasons (#846): the
 * event was free to attend (its zero-priced types were filtered away), the
 * tenant registers attendees somewhere else entirely, or the ticket vendor read
 * had FAILED and been cached for hours. Two of those made the page state a
 * confident falsehood while registration was open.
 *
 * Each variant now says only what is actually known:
 *
 *  - `unavailable`        — we could not reach the ticket provider. Claims
 *                           nothing about prices or availability. If
 *                           registration is configured the CTA still shows:
 *                           that fact came from the conference document, which
 *                           we DID read.
 *  - `registration-open`  — no ticket types to price (external registration),
 *                           but registration is open. Send the visitor there.
 *  - `coming-soon`        — the honest original: the read succeeded, there are
 *                           no public ticket types, and registration is not
 *                           open.
 */
export type TicketsStatusVariant =
  'unavailable' | 'registration-open' | 'coming-soon'

export interface TicketsStatusNoticeProps {
  variant: TicketsStatusVariant
  conferenceTitle?: string
  startDate?: string
  endDate?: string
  contactEmail?: string
  /** Rendered as the primary CTA on every variant that has one. */
  registrationLink?: string
  ctaText?: string
}

const COPY: Record<
  TicketsStatusVariant,
  { icon: typeof CalendarDaysIcon; heading: string; note?: string }
> = {
  unavailable: {
    icon: ExclamationTriangleIcon,
    heading: 'Ticket Information Unavailable',
    note: 'This is a temporary problem on our side. Nothing here says tickets are unavailable — we simply could not load them.',
  },
  'registration-open': {
    icon: TicketIcon,
    heading: 'Registration Is Open',
  },
  'coming-soon': {
    icon: CalendarDaysIcon,
    heading: 'Tickets Coming Soon',
    note: 'Want to be the first to know when tickets become available? Follow us on social media or check back here regularly for updates.',
  },
}

export function TicketsStatusNotice({
  variant,
  conferenceTitle,
  startDate,
  endDate,
  contactEmail,
  registrationLink,
  ctaText = 'Register Now',
}: TicketsStatusNoticeProps) {
  const { icon: Icon, heading, note } = COPY[variant]
  const name = conferenceTitle || 'this conference'
  const showRegistrationCta = Boolean(registrationLink)

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/95 dark:ring-gray-700">
            <div className="px-6 py-8 sm:px-10 sm:py-12">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/50">
                  <Icon
                    className="h-8 w-8 text-brand-cloud-blue dark:text-blue-400"
                    aria-hidden="true"
                  />
                </div>

                <h1 className="font-jetbrains mb-4 text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
                  {heading}
                </h1>

                <p className="font-inter mb-8 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
                  {variant === 'unavailable' && (
                    <>
                      We couldn&apos;t load ticket information for {name} right
                      now. Please try again in a few minutes.
                    </>
                  )}
                  {variant === 'registration-open' && (
                    <>
                      Registration for {name} is open. Sign up through our
                      registration partner.
                    </>
                  )}
                  {variant === 'coming-soon' && (
                    <>
                      Tickets for {name} are not yet available. We&apos;re
                      working hard to bring you an amazing conference
                      experience!
                    </>
                  )}
                </p>

                {startDate && (
                  <div className="mb-6 flex items-center justify-center text-brand-slate-gray dark:text-gray-300">
                    <ClockIcon className="mr-2 h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
                    <span className="font-inter text-base">
                      Conference Dates:{' '}
                      <time dateTime={startDate}>
                        {formatDatesSafe(startDate, endDate ?? startDate)}
                      </time>
                    </span>
                  </div>
                )}

                {note && (
                  <div className="mb-8 rounded-xl bg-brand-sky-mist p-6 dark:bg-blue-900/50">
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      {note}
                    </p>
                  </div>
                )}

                <div className="flex flex-col justify-center gap-4 sm:flex-row">
                  {showRegistrationCta && (
                    <Button
                      href={registrationLink!}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="primary"
                      className="inline-flex items-center px-6 py-3"
                      data-pirsch-event={
                        PIRSCH_EVENTS.outboundCheckinTicketsPage
                      }
                    >
                      {ctaText}
                    </Button>
                  )}

                  <Button
                    href="/"
                    variant={showRegistrationCta ? 'outline' : 'primary'}
                    className="inline-flex items-center px-6 py-3"
                  >
                    Back to Home
                  </Button>

                  <Button
                    href="/speaker"
                    variant="outline"
                    className="inline-flex items-center px-6 py-3"
                  >
                    View Speakers
                  </Button>
                </div>

                {contactEmail && (
                  <div className="mt-8 border-t border-brand-cloud-blue/20 pt-6 dark:border-gray-700">
                    <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                      Have questions?{' '}
                      <Link
                        href={`mailto:${contactEmail}`}
                        className="text-brand-cloud-blue transition-colors hover:text-brand-fresh-green dark:text-blue-400 dark:hover:text-brand-fresh-green"
                      >
                        Contact us
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
