import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { BackgroundImage } from '@/components/BackgroundImage'
import { formatDatesSafe } from '@/lib/time'
import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/dist/client/link'

export default async function Tickets() {
  const { conference, error } = await getConferenceForCurrentDomain()

  if (error) {
    console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  // If registration link is available, redirect to it
  if (conference.registration_link && conference.registration_enabled) {
    redirect(conference.registration_link)
  }

  // Show tickets not available page
  return (
    <div className="relative">
      <BackgroundImage className="-top-24 -bottom-24" />
      <Container className="relative py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm">
            <div className="px-6 py-8 sm:px-10 sm:py-12">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist">
                  <CalendarDaysIcon className="h-8 w-8 text-brand-cloud-blue" />
                </div>

                <h1 className="font-space-grotesk mb-4 text-3xl font-bold text-brand-slate-gray">
                  Tickets Coming Soon
                </h1>

                <p className="font-inter mb-8 text-lg text-brand-slate-gray">
                  Tickets for {conference.title} are not yet available.
                  We&apos;re working hard to bring you an amazing conference
                  experience!
                </p>

                {conference.start_date && (
                  <div className="mb-6 flex items-center justify-center text-brand-slate-gray">
                    <ClockIcon className="mr-2 h-5 w-5 text-brand-cloud-blue" />
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

                <div className="mb-8 rounded-xl bg-brand-sky-mist p-6">
                  <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-cloud-blue">
                    Get Notified
                  </h3>
                  <p className="font-inter text-sm text-brand-slate-gray">
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
                    href="/speakers"
                    variant="outline"
                    className="inline-flex items-center px-6 py-3"
                  >
                    View Speakers
                  </Button>
                </div>

                <div className="mt-8 border-t border-brand-cloud-blue/20 pt-6">
                  <p className="font-inter text-sm text-brand-slate-gray">
                    Have questions?{' '}
                    <Link
                      href={`mailto:${conference.contact_email}`}
                      className="text-brand-cloud-blue transition-colors hover:text-brand-fresh-green"
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
