import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'

/**
 * The workshop portal on a host that cannot sign in yet (#1298): a tenant with
 * workshops whose host is unverified, not yet registered with WorkOS, or
 * refused by it.
 *
 * SAYS NOTHING ABOUT WHY. No host, verification state or WorkOS error reaches
 * this view; the organizer sees the reason in `/admin/settings`. The attendee
 * gets one thing to do: write to the organizer.
 */
export function WorkshopUnavailable({
  conferenceTitle,
  contactEmail,
}: {
  conferenceTitle: string
  contactEmail: string
}) {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
            Workshop Signup
          </h1>
          <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            <p>Workshop sign-up for {conferenceTitle} is not available yet.</p>
          </div>
          <p className="mt-6 text-base text-gray-700 dark:text-gray-300">
            Please check back later. If you have a workshop ticket and need
            help, contact the organizers at{' '}
            <a
              href={`mailto:${contactEmail}`}
              className="font-medium break-all text-blue-600 underline hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {contactEmail}
            </a>
            .
          </p>
          <div className="mt-10">
            <Button href={`mailto:${contactEmail}`} variant="outline">
              <EnvelopeIcon className="mr-2 size-5" />
              Contact the organizers
            </Button>
          </div>
        </div>
      </Container>
    </div>
  )
}
