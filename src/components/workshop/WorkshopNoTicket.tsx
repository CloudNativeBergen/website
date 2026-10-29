import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { WorkshopEarlyAccessInvalidNotice } from './WorkshopEarlyAccess'
import { WorkshopSignOutButton } from './WorkshopSignOutButton'

/**
 * The workshop portal for a person who is signed in and is not admitted
 * (#1294): their email address is not verified, or they hold no ticket that
 * includes workshops. What the access decision said is shown as it is.
 *
 * NOTHING ABOUT EARLY ACCESS is shown here, whatever cookie the browser holds
 * (#1346, spec §7), apart from `earlyAccessInvalid`: the one notice for a
 * person who just opened a link that is not live.
 */
export function WorkshopNoTicket({
  denial,
  reason,
  tickets,
  contactEmail,
  signOutAction,
  earlyAccessInvalid = false,
}: {
  /** Why the access decision refused. */
  denial: string
  reason: string
  tickets: readonly { category: string }[]
  contactEmail: string
  signOutAction: () => Promise<void>
  earlyAccessInvalid?: boolean
}) {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          {/* On a phone the title and the button do not fit on one row:
              there the button goes below. From `sm` up it is as it was. */}
          <div className="flex items-center justify-between max-sm:flex-wrap max-sm:gap-4">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
              Workshop Access Required
            </h1>
            <WorkshopSignOutButton action={signOutAction} />
          </div>

          {earlyAccessInvalid && <WorkshopEarlyAccessInvalidNotice />}

          <div className="mt-8 rounded-lg bg-yellow-50 p-6 dark:bg-yellow-900/20">
            <div className="flex">
              <div className="shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h2 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  {denial === 'email-unverified'
                    ? 'Email Address Not Verified'
                    : 'Workshop Ticket Required'}
                </h2>
                <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                  <p>{reason}</p>
                  {tickets.length > 0 && (
                    <div className="mt-4">
                      <p className="font-medium">Your current ticket(s):</p>
                      <ul className="mt-2 list-inside list-disc">
                        {tickets.map((ticket, i) => (
                          <li key={i}>{ticket.category}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Button href={`mailto:${contactEmail}`} variant="outline">
              <EnvelopeIcon className="mr-2 h-5 w-5" />
              Contact Support
            </Button>
          </div>
        </div>
      </Container>
    </div>
  )
}
