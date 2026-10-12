import { formatRegistrationInstant } from '@/lib/time'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import WorkshopList from '@/components/workshop/WorkshopList'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { decideWorkshopPortalAccess } from '@/lib/workshop/access'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { resolveConferenceContact } from '@/lib/email/from'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { notFound, redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { WORKSHOP_SIGN_IN_INCOMPLETE } from '@/lib/workshop/sign-in-paths'
import {
  readWorkshopPortal,
  sessionCookie,
} from '@/lib/workshop/central-sign-in'
import {
  workshopMainHost,
  workshopPortalUrl,
  workshopRequestHost,
} from '@/lib/workshop/sign-in'
import { WorkshopUnavailable } from '@/components/workshop/WorkshopUnavailable'
import { WorkshopSignedOut } from '@/components/workshop/WorkshopSignedOut'
import { WorkshopSignOutButton } from '@/components/workshop/WorkshopSignOutButton'
import { workshopRegistrationWindow } from '@/lib/workshop/registration-window'
import { signOutOfWorkshop } from './actions'

/** Is `url` on `host` (a Host header value), compared as URLs compare hosts? */
function isSameHost(url: string, host: string | null): boolean {
  try {
    return new URL(url).host === new URL(`https://${host}`).host
  } catch {
    return false
  }
}

export default async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { conference, error } = await getConferenceForCurrentDomain()

  // FEATURE GATE (#689), BEFORE THE SESSION IS READ: the segment layout gates
  // too, but ordering it first means this page spends no record read on a
  // tenant without workshops. A signed-out visitor of one with them gets the
  // signed-out view below, whose two buttons are the only way into a sign-in.
  // Fail-closed on an unresolvable org.
  if (!(await isWorkshopsEnabledForConference(conference))) {
    notFound()
  }

  if (error || !conference?._id) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
              Conference not found
            </h1>
          </div>
        </Container>
      </div>
    )
  }

  // THE ONE READ OF THE SESSION (#1311, spec §6): whether this host can carry
  // a sign-in at all, and who is signed in, from one live record read. WorkOS
  // is not called and nothing is written.
  const requestHeaders = await headers()
  const portal = await readWorkshopPortal(
    requestHeaders,
    (await cookies()).get(sessionCookie().name)?.value,
  )

  // A HOST THAT CANNOT SIGN IN (#1298). The view says sign-up is not available
  // and nothing about why.
  if (!portal.available) {
    // A SECONDARY host that cannot sign in, while the main host can: send the
    // attendee to the working portal (the same link the email carries). Never
    // from the main host to itself: that would loop wherever the two answers
    // differ (an unusable `WORKSHOP_AUTH_ORIGIN` refuses every host here, and
    // the link does not ask). Nothing more is read on the main host either.
    const requestHost = workshopRequestHost(requestHeaders)
    const mainHost = workshopMainHost(conference)
    if (mainHost && !isSameHost(`https://${mainHost}`, requestHost)) {
      const mainPortal = await workshopPortalUrl(conference)
      if (mainPortal) redirect(mainPortal)
    }
    return (
      <WorkshopUnavailable
        conferenceTitle={conference.title}
        contactEmail={resolveConferenceContact(conference)}
        registrationClosed={
          workshopRegistrationWindow(conference, {
            now: new Date(),
            earlyAccess: false,
          }).status === 'closed'
        }
      />
    )
  }

  // The session is for the conference that claims this host, read live.
  // `conference` comes through a cache, so right after a host changes hands
  // the two can differ: then nobody is signed in to the one shown here.
  const user =
    portal.session?.conferenceId === conference._id ? portal.session : null
  if (!user) {
    // A refused redeem lands here with one fixed marker, whatever refused it.
    const { [WORKSHOP_SIGN_IN_INCOMPLETE.param]: marker } = await searchParams
    return (
      <WorkshopSignedOut
        conferenceTitle={conference.title}
        signInIncomplete={marker === WORKSHOP_SIGN_IN_INCOMPLETE.value}
      />
    )
  }
  const userName = user.name || user.email

  // THE ONE ACCESS DECISION (#1294) — the same call the attendee procedures
  // make, so this page can never show a signup form the API would refuse (or
  // the reverse). It no longer skips the ticket check for a conference without
  // ticketing ids: no ticketing means nobody can be shown to hold a ticket.
  {
    const access = await decideWorkshopPortalAccess({ conference, user })

    // Unreachable after the gate above, but the decision is the authority.
    if (!access.allowed && access.denial === 'feature-disabled') {
      notFound()
    }

    if (!access.allowed) {
      return (
        <div className="relative py-20 sm:pt-36 sm:pb-24">
          <BackgroundImage className="-top-36 -bottom-14" />
          <Container className="relative">
            <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
                  Workshop Access Required
                </h1>
                <WorkshopSignOutButton action={signOutOfWorkshop} />
              </div>

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
                    <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      {access.denial === 'email-unverified'
                        ? 'Email Address Not Verified'
                        : 'Workshop Ticket Required'}
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                      <p>{access.reason}</p>
                      {access.tickets.length > 0 && (
                        <div className="mt-4">
                          <p className="font-medium">Your current ticket(s):</p>
                          <ul className="mt-2 list-inside list-disc">
                            {access.tickets.map((ticket, i) => (
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
                <Button
                  href={`mailto:${resolveConferenceContact(conference)}`}
                  variant="outline"
                >
                  <EnvelopeIcon className="mr-2 h-5 w-5" />
                  Contact Support
                </Button>
              </div>
            </div>
          </Container>
        </div>
      )
    }
  }

  // THE ONE WINDOW RULE (#1345), the same call `workshop.signup` and the list
  // below make. Nobody has early access yet (#1346).
  const registration = workshopRegistrationWindow(conference, {
    now: new Date(),
    earlyAccess: false,
  })

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-display text-4xl font-bold tracking-tighter text-blue-600 sm:text-5xl lg:text-7xl dark:text-blue-400">
              Workshop Signup
            </h1>
            <WorkshopSignOutButton action={signOutOfWorkshop} />
          </div>

          <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            <p>Welcome, {userName}</p>
            <p>Register for workshops at {conference.title}.</p>
          </div>

          {registration.status === 'not-open-yet' && (
            <div className="mt-8 rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
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
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Workshop registration is not yet open
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <p>
                      Registration will open on{' '}
                      {formatRegistrationInstant(registration.opensAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {registration.status === 'closed' && (
            <div className="mt-8 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <div className="flex">
                <div className="shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                    Workshop registration has closed
                  </h3>
                  <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                    <p>
                      Registration closed on{' '}
                      {formatRegistrationInstant(registration.closedAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-12">
            <WorkshopList
              userWorkOSId={user.userId}
              userEmail={user.email}
              userName={userName}
              workshopRegistrationSponsorStart={
                conference.workshopRegistrationSponsorStart
              }
              workshopRegistrationStart={conference.workshopRegistrationStart}
              workshopRegistrationEnd={conference.workshopRegistrationEnd}
            />
          </div>
        </div>
      </Container>
    </div>
  )
}
