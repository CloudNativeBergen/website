import { withAuth } from '@workos-inc/authkit-nextjs'
import Link from 'next/link'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import WorkshopList from '@/components/workshop/WorkshopList'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'
import { checkWorkshopEligibility } from '@/lib/workshop/eligibility'
import { EnvelopeIcon } from '@heroicons/react/24/outline'

export default async function WorkshopPage() {
  const { user } = await withAuth()

  const { conference, error } = await getConferenceForCurrentDomain()
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

  if (!user) {
    const clientId = process.env.WORKOS_CLIENT_ID!
    const baseUrl = 'https://api.workos.com/user_management/authorize'
    const redirectUri = `${process.env.NEXT_PUBLIC_URL}/api/auth/callback`

    const buildAuthUrl = (screenHint: 'sign-in' | 'sign-up') => {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        provider: 'authkit',
        screen_hint: screenHint,
        state: Buffer.from(
          JSON.stringify({ returnPathname: '/workshop' }),
        ).toString('base64'),
      })
      return `${baseUrl}?${params.toString()}`
    }

    const signInUrl = buildAuthUrl('sign-in')
    const signUpUrl = buildAuthUrl('sign-up')

    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
              Workshop Signup
            </h1>
            <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-100">
              <p>Sign in to register for workshops at {conference.title}.</p>
            </div>

            <div className="mt-10 flex gap-4">
              <Button href={signInUrl}>Sign In</Button>
              <Button href={signUpUrl} variant="outline">
                Create Account
              </Button>
            </div>

            <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
              By signing in, you agree to our{' '}
              <Link
                href="/terms"
                className="underline hover:text-blue-600 dark:hover:text-blue-400"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="underline hover:text-blue-600 dark:hover:text-blue-400"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </Container>
      </div>
    )
  }

  if (conference.checkin_customer_id && conference.checkin_event_id) {
    const eligibility = await checkWorkshopEligibility({
      userEmail: user.email,
      customerId: conference.checkin_customer_id,
      eventId: conference.checkin_event_id,
    })

    if (!eligibility.isEligible) {
      return (
        <div className="relative py-20 sm:pt-36 sm:pb-24">
          <BackgroundImage className="-top-36 -bottom-14" />
          <Container className="relative">
            <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
                  Workshop Access Required
                </h1>
                <Link href="/api/auth/signout" prefetch={false}>
                  <Button variant="outline">Sign Out</Button>
                </Link>
              </div>

              <div className="mt-8 rounded-lg bg-yellow-50 p-6 dark:bg-yellow-900/20">
                <div className="flex">
                  <div className="flex-shrink-0">
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
                      Workshop Ticket Required
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                      <p>{eligibility.reason}</p>
                      {eligibility.tickets.length > 0 && (
                        <div className="mt-4">
                          <p className="font-medium">Your current ticket(s):</p>
                          <ul className="mt-2 list-inside list-disc">
                            {eligibility.tickets.map((ticket, i) => (
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
                  href="mailto:contact@cloudnativebergen.dev"
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

  const now = new Date()
  const registrationNotYetOpen =
    conference.workshop_registration_start &&
    new Date(conference.workshop_registration_start) > now
  const registrationClosed =
    conference.workshop_registration_end &&
    new Date(conference.workshop_registration_end) < now

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-display text-4xl font-bold tracking-tighter text-blue-600 sm:text-5xl lg:text-7xl dark:text-blue-400">
              Workshop Signup
            </h1>
            <Link href="/api/auth/signout" prefetch={false}>
              <Button variant="outline" className="shrink-0 whitespace-nowrap">
                Sign Out
              </Button>
            </Link>
          </div>

          <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            <p>
              Welcome,{' '}
              {user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.firstName || user.lastName || user.email}
            </p>
            <p>Register for workshops at {conference.title}.</p>
          </div>

          {registrationNotYetOpen && (
            <div className="mt-8 rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
              <div className="flex">
                <div className="flex-shrink-0">
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
                      {new Date(
                        conference.workshop_registration_start!,
                      ).toLocaleString('en-US', {
                        dateStyle: 'full',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {registrationClosed && (
            <div className="mt-8 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <div className="flex">
                <div className="flex-shrink-0">
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
                      {new Date(
                        conference.workshop_registration_end!,
                      ).toLocaleString('en-US', {
                        dateStyle: 'full',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-12">
            <WorkshopList
              conferenceId={conference._id}
              userWorkOSId={user.id}
              userEmail={user.email}
              userName={
                user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.email
              }
              workshopRegistrationStart={conference.workshop_registration_start}
              workshopRegistrationEnd={conference.workshop_registration_end}
            />
          </div>
        </div>
      </Container>
    </div>
  )
}
