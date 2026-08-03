import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import type { Conference } from '@/lib/conference/types'
import type { LifecycleStatus } from '@/lib/homepage/lifecycle'
import { formatDatesSafe } from '@/lib/time'
import {
  ArchiveBoxIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

/**
 * The cancelled / archived homepage.
 *
 * These REPLACE the page rather than banner it. A cancelled conference that
 * still renders its speaker shelf, its countdown and a "Get tickets" button
 * below a notice is worse than no site at all — visitors act on the buttons, not
 * the paragraph. So `HomepageSectionRenderer` short-circuits to this component
 * and the stored composition is never rendered.
 *
 * Every string has a derived fallback, because the failure mode being designed
 * out is a heading with nothing under it: an organizer who flips the status and
 * writes no copy still gets a complete, correct page.
 */
export function LifecycleNotice({
  conference,
  status,
}: {
  conference: Conference
  status: LifecycleStatus
}) {
  const cancelled = status === 'cancelled'
  const Icon = cancelled ? ExclamationTriangleIcon : ArchiveBoxIcon
  const dates = formatDatesSafe(conference.startDate, conference.endDate)

  const headline =
    conference.lifecycleHeadline?.trim() ||
    (cancelled
      ? `${conference.title} has been cancelled`
      : `${conference.title} has ended`)

  const message =
    conference.lifecycleMessage?.trim() ||
    (cancelled
      ? `This edition is not going ahead${
          dates !== 'TBD'
            ? ` and will not take place as planned on ${dates}`
            : ''
        }. Ticket holders will be contacted directly. Thank you for your support — please get in touch if you have questions.`
      : 'This conference has ended for good. Thank you to everyone who spoke, sponsored, volunteered and attended over the years.')

  const linkLabel = conference.lifecycleLinkLabel?.trim()
  const linkHref = conference.lifecycleLinkHref?.trim()
  const contactEmail = conference.contactEmail?.trim()

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/95 dark:ring-gray-700">
            <div className="px-6 py-10 text-center sm:px-10 sm:py-14">
              <div
                className={
                  cancelled
                    ? 'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50'
                    : 'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/50'
                }
              >
                <Icon
                  className={
                    cancelled
                      ? 'h-8 w-8 text-amber-700 dark:text-amber-300'
                      : 'h-8 w-8 text-brand-cloud-blue dark:text-blue-400'
                  }
                  aria-hidden="true"
                />
              </div>

              <h1 className="font-jetbrains mb-4 text-3xl font-bold tracking-tighter text-brand-slate-gray sm:text-5xl dark:text-white">
                {headline}
              </h1>

              {/*
                Dates only for a CANCELLED edition, where "this was going to
                happen on these dates" is the whole point. An archived event is
                not about one edition, so printing the last one's dates under a
                tombstone reads like it is still being scheduled.
              */}
              {cancelled && dates !== 'TBD' ? (
                <p className="font-jetbrains mb-6 text-sm tracking-wide text-brand-cloud-blue uppercase dark:text-blue-400">
                  <time dateTime={conference.startDate}>{dates}</time>
                  {conference.city ? ` · ${conference.city}` : ''}
                </p>
              ) : null}

              <p className="font-inter mx-auto max-w-xl text-lg leading-relaxed whitespace-pre-line text-brand-slate-gray dark:text-gray-300">
                {message}
              </p>

              {linkLabel && linkHref ? (
                <div className="mt-10 flex justify-center">
                  <Button
                    href={linkHref}
                    variant="primary"
                    className="inline-flex items-center px-8 py-4 font-semibold"
                  >
                    {linkLabel}
                  </Button>
                </div>
              ) : null}

              {contactEmail ? (
                <p className="font-inter mt-8 text-sm text-brand-slate-gray/70 dark:text-gray-400">
                  Questions?{' '}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="font-semibold text-brand-cloud-blue underline decoration-brand-cloud-blue/30 underline-offset-2 hover:decoration-brand-cloud-blue"
                  >
                    {contactEmail}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
