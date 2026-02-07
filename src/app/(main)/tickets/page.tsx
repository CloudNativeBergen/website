import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isRegistrationAvailable } from '@/lib/conference/state'
import { getPublicTicketTypes } from '@/lib/tickets/public'
import { TicketPricingGrid } from '@/components/TicketPricingGrid'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { BackgroundImage } from '@/components/BackgroundImage'
import { formatDatesSafe } from '@/lib/time'
import * as HeroIcons from '@heroicons/react/24/outline'
import {
  CalendarDaysIcon,
  ClockIcon,
  TicketIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { headers } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'
import type { ElementType } from 'react'

export const metadata = {
  title: 'Tickets - Cloud Native Days Norway',
  description: 'Get your tickets for Cloud Native Days Norway conference',
  twitter: {
    card: 'summary_large_image',
  },
}

function DynamicIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const IconComponent = (HeroIcons as Record<string, ElementType>)[name]
  if (!IconComponent) return null
  return <IconComponent className={className} aria-hidden="true" />
}

async function CachedTicketsContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:tickets')

  const { conference, error } = await getConferenceForDomain(domain)

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  const ticketData = conference.checkin_event_id
    ? await getPublicTicketTypes(conference.checkin_event_id)
    : null

  const hasTicketPricing = ticketData && ticketData.tickets.length > 0
  const registrationAvailable = isRegistrationAvailable(conference)

  const customization = conference.ticket_customization
  const inclusions = conference.ticket_inclusions ?? []
  const faqs = conference.ticket_faqs ?? []
  const vanityMetrics = conference.vanity_metrics ?? []
  const showVanityMetrics =
    customization?.show_vanity_metrics && vanityMetrics.length > 0

  const heroHeadline = customization?.hero_headline || 'Tickets'
  const heroSubheadline = customization?.hero_subheadline
  const ctaText = customization?.cta_button_text || 'Register Now'
  const groupDiscountInfo = customization?.group_discount_info

  if (hasTicketPricing) {
    return (
      <div className="relative overflow-hidden">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-5xl">
            {/* Header */}
            <div className="mb-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/50">
                <TicketIcon className="h-7 w-7 text-brand-cloud-blue dark:text-blue-400" />
              </div>
              <h1 className="font-space-grotesk mb-3 text-3xl font-bold text-brand-slate-gray sm:text-4xl dark:text-white">
                {heroHeadline}
              </h1>
              <p className="font-inter mx-auto max-w-2xl text-lg text-brand-slate-gray/80 dark:text-gray-300">
                {heroSubheadline || (
                  <>
                    Secure your spot at {conference.title}
                    {conference.start_date && (
                      <>
                        {' '}
                        &mdash;{' '}
                        <time dateTime={conference.start_date}>
                          {formatDatesSafe(
                            conference.start_date,
                            conference.end_date,
                          )}
                        </time>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>

            {/* Vanity Metrics */}
            {showVanityMetrics && (
              <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {vanityMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl bg-white/80 p-4 text-center shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-gray-700"
                  >
                    <div className="font-space-grotesk text-2xl font-bold text-brand-cloud-blue dark:text-blue-400">
                      {metric.value}
                    </div>
                    <div className="font-inter mt-1 text-xs font-medium tracking-wide text-brand-slate-gray/60 uppercase dark:text-gray-400">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pricing grid */}
            <div className="rounded-2xl bg-white/95 p-6 shadow-xl ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm sm:p-8 dark:bg-gray-800/95 dark:ring-gray-700">
              <TicketPricingGrid
                tickets={ticketData.tickets}
                registrationLink={conference.registration_link}
                complimentaryTickets={ticketData.complimentaryTickets}
              />
            </div>

            {/* Main CTA */}
            {registrationAvailable && (
              <div className="mt-8 text-center">
                <Button
                  href={conference.registration_link!}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="primary"
                  size="lg"
                >
                  {ctaText}
                </Button>
              </div>
            )}

            {/* What's Included */}
            {inclusions.length > 0 && (
              <div className="mt-14">
                <h2 className="font-space-grotesk mb-6 text-center text-2xl font-bold text-brand-slate-gray dark:text-white">
                  What&apos;s Included
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inclusions.map((inclusion) => (
                    <div
                      key={inclusion._key || inclusion.title}
                      className="flex items-start gap-3 rounded-xl bg-white/80 p-4 shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-gray-700"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-sky-mist dark:bg-blue-900/50">
                        {inclusion.icon ? (
                          <DynamicIcon
                            name={inclusion.icon}
                            className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400"
                          />
                        ) : (
                          <TicketIcon className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                          {inclusion.title}
                        </h3>
                        {inclusion.description && (
                          <p className="font-inter mt-1 text-xs leading-relaxed text-brand-slate-gray/70 dark:text-gray-400">
                            {inclusion.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Group Discounts */}
            {groupDiscountInfo && (
              <div className="mt-10 rounded-xl bg-brand-sky-mist/50 p-6 ring-1 ring-brand-cloud-blue/10 dark:bg-blue-900/20 dark:ring-blue-800/30">
                <h2 className="font-space-grotesk mb-2 text-lg font-bold text-brand-slate-gray dark:text-white">
                  Partner Nodes &amp; Sponsor Capacity
                </h2>
                <div className="font-inter space-y-2 text-sm leading-relaxed text-brand-slate-gray/80 dark:text-gray-300">
                  {groupDiscountInfo.split('\n\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </div>
            )}

            {/* FAQs */}
            {faqs.length > 0 && (
              <div className="mt-14">
                <h2 className="font-space-grotesk mb-6 text-center text-2xl font-bold text-brand-slate-gray dark:text-white">
                  Frequently Asked Questions
                </h2>
                <div className="mx-auto max-w-3xl space-y-3">
                  {faqs.map((faq) => (
                    <details
                      key={faq._key || faq.question}
                      className="group rounded-xl bg-white/80 shadow-md ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/80 dark:ring-gray-700"
                    >
                      <summary className="flex cursor-pointer items-center justify-between px-5 py-4">
                        <span className="font-space-grotesk pr-4 text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                          {faq.question}
                        </span>
                        <ChevronDownIcon className="h-4 w-4 shrink-0 text-brand-cloud-blue transition-transform group-open:rotate-180 dark:text-blue-400" />
                      </summary>
                      <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-700">
                        <p className="font-inter text-sm leading-relaxed text-brand-slate-gray/80 dark:text-gray-300">
                          {faq.answer}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Contact footer */}
            <div className="mt-10 text-center">
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Need help or have questions about tickets?{' '}
                <Link
                  href={`mailto:${conference.contact_email}`}
                  className="text-brand-cloud-blue transition-colors hover:text-brand-fresh-green dark:text-blue-400 dark:hover:text-brand-fresh-green"
                >
                  Contact us
                </Link>
              </p>
            </div>
          </div>
        </Container>
      </div>
    )
  }

  // Fallback: "Tickets Coming Soon" when no pricing data is available
  return (
    <div className="relative overflow-hidden">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/95 dark:ring-gray-700">
            <div className="px-6 py-8 sm:px-10 sm:py-12">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/50">
                  <CalendarDaysIcon className="h-8 w-8 text-brand-cloud-blue dark:text-blue-400" />
                </div>

                <h1 className="font-space-grotesk mb-4 text-3xl font-bold text-brand-slate-gray dark:text-white">
                  Tickets Coming Soon
                </h1>

                <p className="font-inter mb-8 text-lg text-brand-slate-gray dark:text-gray-300">
                  Tickets for {conference.title} are not yet available.
                  We&apos;re working hard to bring you an amazing conference
                  experience!
                </p>

                {conference.start_date && (
                  <div className="mb-6 flex items-center justify-center text-brand-slate-gray dark:text-gray-300">
                    <ClockIcon className="mr-2 h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
                    <span className="font-inter text-base">
                      Conference Dates:{' '}
                      <time dateTime={conference.start_date}>
                        {formatDatesSafe(
                          conference.start_date,
                          conference.end_date,
                        )}
                      </time>
                    </span>
                  </div>
                )}

                <div className="mb-8 rounded-xl bg-brand-sky-mist p-6 dark:bg-blue-900/50">
                  <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                    Get Notified
                  </h3>
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                    Want to be the first to know when tickets become available?
                    Follow us on social media or check back here regularly for
                    updates.
                  </p>
                </div>

                <div className="flex flex-col justify-center gap-4 sm:flex-row">
                  <Button
                    href="/"
                    variant="primary"
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

                <div className="mt-8 border-t border-brand-cloud-blue/20 pt-6 dark:border-gray-700">
                  <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                    Have questions?{' '}
                    <Link
                      href={`mailto:${conference.contact_email}`}
                      className="text-brand-cloud-blue transition-colors hover:text-brand-fresh-green dark:text-blue-400 dark:hover:text-brand-fresh-green"
                    >
                      Contact us
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

export default async function TicketsPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedTicketsContent domain={domain} />
}
