import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { ContentCard } from '@/components/ContentCard'
import { formatRegistrationInstant } from '@/lib/time'
import type { WorkshopRegistrationWindow } from '@/lib/workshop/registration-window'
import {
  WorkshopEarlyAccessBanner,
  WorkshopEarlyAccessInvalidNotice,
} from './WorkshopEarlyAccess'
import WorkshopList from './WorkshopList'
import { WorkshopSignOutButton } from './WorkshopSignOutButton'

/**
 * The workshop portal for a person it admits: signed in, with a ticket that
 * includes workshops. The page (`src/app/(workshop)/workshop/page.tsx`)
 * decides who that is, what the registration window answers for them and
 * whether they have early access; this renders it.
 *
 * WHICH BANNER (#1346, spec §7), one of them at most:
 *
 *  - with early access: the early-access banner, IN THE PLACE of the one that
 *    names the official opening;
 *  - without it, before the official opening: the banner naming that time;
 *  - after the end: the banner saying sign-up has closed, and nothing about
 *    early access.
 *
 * `earlyAccessInvalid` is separate from all three: the one notice for a
 * person who just opened a link that is not live.
 *
 * WHAT REACHES THE BROWSER: the list is a client component, so every prop it
 * is handed is sent. The sponsor start time is handed over only with early
 * access; no token and no sponsor name is handed to it at all.
 */
export function WorkshopPortal({
  conferenceTitle,
  userWorkOSId,
  userEmail,
  userName,
  times,
  registration,
  earlyAccess,
  earlyAccessInvalid = false,
  signOutAction,
  refreshAction,
}: {
  conferenceTitle: string
  userWorkOSId: string
  userEmail: string
  userName: string
  /** The conference's registration times, as stored. */
  times: {
    workshopRegistrationSponsorStart?: string
    workshopRegistrationStart?: string
    workshopRegistrationEnd?: string
  }
  /** What the window rule answers for this person, now. */
  registration: WorkshopRegistrationWindow
  /** The sponsor of this person's own live link, or `null`. */
  earlyAccess: { sponsorName: string | null } | null
  earlyAccessInvalid?: boolean
  signOutAction: () => Promise<void>
  /** Renders the page again: for the list, when early access turns out gone. */
  refreshAction?: () => Promise<void>
}) {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          {/* On the narrowest phones the title and the button do not fit on
              one row: there, and only there, the button goes below. */}
          <div className="flex items-center justify-between gap-4 max-[360px]:flex-wrap">
            <h1 className="font-display text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl lg:text-7xl dark:text-blue-400">
              Workshop Signup
            </h1>
            <WorkshopSignOutButton action={signOutAction} />
          </div>

          <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            <p>Welcome, {userName}</p>
            <p>Register for workshops at {conferenceTitle}.</p>
          </div>
          <ContentCard className="[&>*:first-child]:mt-0">
            {earlyAccessInvalid && <WorkshopEarlyAccessInvalidNotice />}

            {/* ONE OR THE OTHER, never both: with early access the banner
              below takes the place of the one naming the official opening. */}
            {earlyAccess && registration.status !== 'closed' && (
              <WorkshopEarlyAccessBanner
                sponsorName={earlyAccess.sponsorName}
                opensAt={
                  registration.status === 'not-open-yet'
                    ? registration.opensAt
                    : undefined
                }
              />
            )}

            {registration.status === 'not-open-yet' && !earlyAccess && (
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
                    <h2 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Workshop registration is not yet open
                    </h2>
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
                    <h2 className="text-sm font-medium text-red-800 dark:text-red-200">
                      Workshop registration has closed
                    </h2>
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
                userWorkOSId={userWorkOSId}
                userEmail={userEmail}
                userName={userName}
                // The list is a client component, so every prop is sent to the
                // attendee's browser. The sponsor start time goes only to a
                // person whose early access was resolved above (#1346); the
                // link's token and the sponsor's name are not passed at all.
                earlyAccess={!!earlyAccess}
                workshopRegistrationSponsorStart={
                  earlyAccess
                    ? times.workshopRegistrationSponsorStart
                    : undefined
                }
                workshopRegistrationStart={times.workshopRegistrationStart}
                workshopRegistrationEnd={times.workshopRegistrationEnd}
                onEarlyAccessRefused={refreshAction}
              />
            </div>
          </ContentCard>
        </div>
      </Container>
    </div>
  )
}
