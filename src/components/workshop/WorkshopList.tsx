'use client'

import { useEffect, useRef, useState } from 'react'
import WorkshopCard from './WorkshopCard'
import WorkshopAnnouncementsSection from './WorkshopAnnouncementsSection'
import type {
  ProposalWithWorkshopData,
  ExperienceLevel,
  OperatingSystem,
} from '@/lib/workshop/types'
import {
  checkWorkshopTimeConflict,
  getWorkshopIdFromSignup,
} from '@/lib/workshop/utils'
import { hasConfirmedSignup } from '@/lib/workshop/status'
import { workshopRegistrationWindow } from '@/lib/workshop/registration-window'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { Button } from '@/components/Button'
import { WORKSHOP_SIGN_IN_PATH } from '@/lib/workshop/sign-in-paths'

interface WorkshopListProps {
  userWorkOSId?: string
  userEmail?: string
  userName?: string
  /** The conference's three registration times; see `workshopRegistrationWindow`. */
  workshopRegistrationSponsorStart?: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
  /**
   * The server has resolved that this person has early access (#1346): their
   * browser opened a sponsor's live link. Only then is the sponsor start time
   * handed over too.
   */
  earlyAccess?: boolean
  /**
   * Called when a sign-up is refused for the window although this list was
   * told the person has early access: the link was revoked while the page was
   * open. The page passes the action that renders it again.
   */
  onEarlyAccessRefused?: () => void | Promise<void>
}

export default function WorkshopList({
  userWorkOSId,
  userEmail,
  userName,
  workshopRegistrationSponsorStart,
  workshopRegistrationStart,
  workshopRegistrationEnd,
  earlyAccess = false,
  onEarlyAccessRefused,
}: WorkshopListProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // The server's refusal, for the window, of a sign-up this list offered
  // because of early access. Usually the link was revoked while the page was
  // open; it can also be the browser's clock running ahead of the server's.
  const [refusedEarly, setRefusedEarly] = useState<string | null>(null)
  // THE KEYBOARD AFTER THAT REFUSAL. When the page renders again without
  // early access, the workshops go, and with them the dialog the person was
  // in: focus would fall back to the page. It goes to the notice instead,
  // once, and only when it is in fact nowhere. NEVER WHILE THE PAGE STILL
  // RESOLVES EARLY ACCESS: until then the dialog can be open, the notice lies
  // behind it, and a browser may report the keyboard as nowhere while the
  // pressed button is disabled.
  const refusalNotice = useRef<HTMLDivElement>(null)
  const refusalWantsFocus = useRef(false)
  useEffect(() => {
    if (!refusalWantsFocus.current || !refusalNotice.current) return
    if (earlyAccess) return
    const lost =
      !document.activeElement || document.activeElement === document.body
    if (!lost) return
    refusalWantsFocus.current = false
    refusalNotice.current.focus()
  })
  // Sign-ups whose cancel the server has answered. The cancel DELETED the
  // sign-up, so a second one is refused with "Signup not found"; while such a
  // sign-up is still on the page (the list has not been read again yet, or the
  // read failed) its card offers no cancel. Keyed on what is shown, not on a
  // pending flag: a flag clears a moment before the new list is drawn.
  const [cancelledSignupIds, setCancelledSignupIds] = useState<string[]>([])

  const {
    data: workshopsData,
    isLoading: workshopsLoading,
    refetch: refetchWorkshops,
  } = api.workshop.list.useQuery({
    includeCapacity: true,
  })

  const {
    data: signupsData,
    refetch: refetchSignups,
    isError: signupsFailed,
    error: signupsError,
    isFetching: signupsFetching,
    dataUpdatedAt: signupsReadAt,
    errorUpdatedAt: signupsErrorAt,
  } = api.workshop.getMySignups.useQuery(undefined, {
    // Identity is resolved server-side from the WorkOS session; this gate is
    // purely a client-side UX guard so the query doesn't fire before the page
    // has established the signed-in user.
    enabled: !!userWorkOSId,
    // The app's provider turns this off. Back on the tab, a read that has gone
    // stale is the only way to see a sign-out made in another tab (#1303).
    refetchOnWindowFocus: true,
  })

  // THE SESSION HAS ENDED (#1303): it lasts 7 days with no renewal, and the
  // attendee can sign out in another tab. Either the read or a write says so,
  // each on its own: a write's refusal does not wait on another read. KEPT
  // until a read SUCCEEDS (they signed in again elsewhere): a later read that
  // fails for an unrelated reason says nothing about the session.
  const [sessionEndedAt, setSessionEndedAt] = useState(0)
  const readEndedAt =
    signupsError?.data?.code === 'UNAUTHORIZED' ? signupsErrorAt : 0
  if (readEndedAt > sessionEndedAt) setSessionEndedAt(readEndedAt)
  const sessionEnded = Math.max(sessionEndedAt, readEndedAt) > signupsReadAt
  // The notice replaces the list, and with it whatever had the keyboard (a
  // dialog, a workshop's button): when the keyboard is left on the page, it
  // goes to the notice. Not when the FIRST read is refused: nothing had the
  // keyboard, and a focus ring would greet the attendee on arrival.
  const replacedTheList =
    sessionEnded && (signupsReadAt > 0 || sessionEndedAt > readEndedAt)
  const sessionNotice = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!replacedTheList) return
    const lost =
      !document.activeElement || document.activeElement === document.body
    if (lost) sessionNotice.current?.focus()
  }, [replacedTheList])

  const signupMutation = api.workshop.signup.useMutation({
    onSuccess: (data) => {
      setSuccessMessage(
        data.message || 'Successfully signed up for the workshop!',
      )
      setErrorMessage(null)
      setRefusedEarly(null)
      refusalWantsFocus.current = false
      setTimeout(() => setSuccessMessage(null), 5000)
      refetchWorkshops()
      refetchSignups()
    },
    onError: (error) => {
      setSuccessMessage(null)
      if (error.data?.code === 'UNAUTHORIZED') {
        setSessionEndedAt(Date.now())
        return
      }
      // The server refused for the window while this list was offering
      // sign-up BECAUSE OF early access: the one case where a refusal
      // contradicts what is on screen. (Once sign-up is open for everyone a
      // refusal for the window is the end having passed, which a refresh of
      // early access has nothing to say about.)
      const shown = workshopRegistrationWindow(
        {
          workshopRegistrationSponsorStart,
          workshopRegistrationStart,
          workshopRegistrationEnd,
        },
        { now: new Date(), earlyAccess },
      )
      if (
        shown.status === 'open' &&
        shown.early &&
        error.data?.code === 'PRECONDITION_FAILED'
      ) {
        // The page may be about to change under the person: if the link was
        // revoked the banner goes, and so do the workshops they were choosing
        // from. Say what the server said, and leave it standing: no timer
        // takes it away. Whether the early access is gone is for the page to
        // say, once it has rendered again (see the notice below).
        setErrorMessage(null)
        setRefusedEarly(error.message)
        refusalWantsFocus.current = true
        void onEarlyAccessRefused?.()
        return
      }
      setErrorMessage(error.message)
      setTimeout(() => setErrorMessage(null), 5000)
    },
  })

  const cancelMutation = api.workshop.cancelSignup.useMutation({
    onSuccess: (_data, { signupId }) => {
      setCancelledSignupIds((ids) => [...ids, signupId])
      setSuccessMessage('Successfully cancelled workshop signup')
      setErrorMessage(null)
      setTimeout(() => setSuccessMessage(null), 5000)
      refetchWorkshops()
      refetchSignups()
    },
    onError: (error) => {
      setSuccessMessage(null)
      if (error.data?.code === 'UNAUTHORIZED') {
        setSessionEndedAt(Date.now())
        return
      }
      setErrorMessage(error.message)
      setTimeout(() => setErrorMessage(null), 5000)
    },
  })

  const handleSignup = async (
    workshopId: string,
    experienceLevel: ExperienceLevel,
    operatingSystem: OperatingSystem,
  ) => {
    if (!userWorkOSId || !userEmail || !userName) {
      setErrorMessage('Please sign in to register for workshops')
      setTimeout(() => setErrorMessage(null), 5000)
      return { success: false, error: 'Not authenticated' }
    }

    // Check if user has a confirmed signup
    if (hasConfirmedSignup(workshopId, userSignups)) {
      setErrorMessage('You are already signed up for this workshop')
      setTimeout(() => setErrorMessage(null), 5000)
      return { success: false, error: 'Already signed up' }
    }

    setSuccessMessage(null)
    setErrorMessage(null)

    const workshopToSignUp = workshops.find((w) => w._id === workshopId)
    if (workshopToSignUp) {
      const { hasConflict, conflictingWorkshop } = checkWorkshopTimeConflict(
        workshopToSignUp,
        userWorkshops,
      )
      if (hasConflict && conflictingWorkshop) {
        const errorMsg = `You are already registered for "${conflictingWorkshop.title}" which overlaps with this workshop's time slot`
        setErrorMessage(errorMsg)
        setTimeout(() => setErrorMessage(null), 7000)
        return { success: false, error: errorMsg }
      }
    }

    try {
      // Identity (userWorkOSId/userEmail/userName) and the conference are
      // intentionally NOT sent: the server binds the signup to the
      // authenticated WorkOS session and the domain-resolved conference.
      await signupMutation.mutateAsync({
        experienceLevel,
        operatingSystem,
        workshop: { _type: 'reference', _ref: workshopId },
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  const handleCancel = async (signupId: string) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await cancelMutation.mutateAsync({
        signupId,
        reason: 'User cancelled',
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  if (workshopsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">
          Loading workshops...
        </div>
      </div>
    )
  }

  // NOTHING BUT THE WAY BACK IN, as on the signed-out view. Whatever the
  // query client still holds is from before the session ended, and an open
  // dialog (the sign-up form, the cancel's question) goes with its card.
  if (sessionEnded) {
    return (
      <div
        ref={sessionNotice}
        role="alert"
        tabIndex={-1}
        className="flex flex-col gap-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-600 sm:flex-row sm:items-center sm:justify-between dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 dark:focus-visible:outline-yellow-400"
      >
        <p>
          Your session has ended. Sign in again to see your workshop
          registrations and sign up for workshops.
        </p>
        {/* A FORM, NOT A LINK, as on the signed-out view: the route sets a
            cookie and redirects to another origin. */}
        <form action={WORKSHOP_SIGN_IN_PATH} method="get" className="shrink-0">
          <Button type="submit" size="sm" className="min-h-11">
            Sign in again
          </Button>
        </form>
      </div>
    )
  }

  const workshops = (workshopsData?.data || []) as ProposalWithWorkshopData[]
  const userSignups = signupsData?.data || []

  // THE ONE WINDOW RULE (#1345), the same one `workshop.signup` and the
  // portal page ask, with the early access the page resolved (#1346).
  const registration = workshopRegistrationWindow(
    {
      workshopRegistrationSponsorStart,
      workshopRegistrationStart,
      workshopRegistrationEnd,
    },
    { now: new Date(), earlyAccess },
  )
  const registrationOpen = registration.status === 'open'
  const registrationClosed = registration.status === 'closed'

  const userWorkshopIds = userSignups
    .filter((s) => s.status === 'confirmed' || s.status === 'waitlist')
    .map((s) => getWorkshopIdFromSignup(s))
    .filter(Boolean)

  const userWorkshops = workshops.filter((w) => userWorkshopIds.includes(w._id))

  const availableWorkshops = workshops.filter(
    (w) => w.available > 0 && !userWorkshopIds.includes(w._id),
  )

  const fullWorkshops = workshops.filter(
    (w) => w.available === 0 && !userWorkshopIds.includes(w._id),
  )

  const checkTimeConflict = (workshop: ProposalWithWorkshopData) => {
    return checkWorkshopTimeConflict(workshop, userWorkshops)
  }

  if (workshops.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-400">
          No workshops are available at this time.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      {refusedEarly && (
        <div
          ref={refusalNotice}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 focus:outline-2 focus:outline-offset-2 focus:outline-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200 dark:focus:outline-red-400"
        >
          {/* "No longer valid" only once the page has rendered again WITHOUT
              early access. While it still resolves it (the refresh has not
              landed, or the link is live and the browser's clock is ahead
              of the server's at the sponsor start time), the server's
              refusal stands alone: the line above the list still says
              "You have early access". */}
          {earlyAccess ? '' : 'Your early access is no longer valid. '}
          {refusedEarly}
        </div>
      )}

      {/* Without this a failed read is indistinguishable from "no signups":
          a registered attendee would see their own workshops offered as
          available, with nothing to say why. */}
      {signupsFailed && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 sm:flex-row sm:items-center sm:justify-between dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200"
        >
          {/* A refusal carries the server's own reason (no ticket, wrong
              ticket type, ticket check unavailable); anything else is a
              failed read, and "try again" is all there is to say. */}
          <p>
            {signupsError?.data?.code === 'FORBIDDEN'
              ? signupsError.message
              : 'We could not load your workshop registrations. Workshops you are already registered for may be listed as available below.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={() => refetchSignups()}
            disabled={signupsFetching}
          >
            Try again
          </Button>
        </div>
      )}

      {userWorkshops.length > 0 && (
        <div>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Your Workshops
          </h2>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              You are registered for{' '}
              {
                userWorkshops.filter((w) => {
                  const signup = userSignups.find(
                    (s) => getWorkshopIdFromSignup(s) === w._id,
                  )
                  return signup?.status === 'confirmed'
                }).length
              }{' '}
              workshop
              {userWorkshops.filter((w) => {
                const signup = userSignups.find(
                  (s) => getWorkshopIdFromSignup(s) === w._id,
                )
                return signup?.status === 'confirmed'
              }).length !== 1
                ? 's'
                : ''}
              {userWorkshops.filter((w) => {
                const signup = userSignups.find(
                  (s) => getWorkshopIdFromSignup(s) === w._id,
                )
                return signup?.status === 'waitlist'
              }).length > 0 && (
                <>
                  {' '}
                  and on the waitlist for{' '}
                  {
                    userWorkshops.filter((w) => {
                      const signup = userSignups.find(
                        (s) => getWorkshopIdFromSignup(s) === w._id,
                      )
                      return signup?.status === 'waitlist'
                    }).length
                  }{' '}
                  workshop
                  {userWorkshops.filter((w) => {
                    const signup = userSignups.find(
                      (s) => getWorkshopIdFromSignup(s) === w._id,
                    )
                    return signup?.status === 'waitlist'
                  }).length !== 1
                    ? 's'
                    : ''}
                </>
              )}
              .
            </p>
          </div>
          <div className="space-y-6">
            {userWorkshops.map((workshop) => {
              const userSignup = userSignups.find(
                (s) => getWorkshopIdFromSignup(s) === workshop._id,
              )
              return (
                <WorkshopCard
                  key={workshop._id}
                  workshop={workshop}
                  userSignups={userSignups}
                  onSignup={handleSignup}
                  onCancel={
                    userSignup ? () => handleCancel(userSignup._id) : undefined
                  }
                  isSignedUp={true}
                  isLoading={
                    !!userSignup && cancelledSignupIds.includes(userSignup._id)
                  }
                  registrationClosed={registrationClosed}
                  announcements={
                    <WorkshopAnnouncementsSection workshopId={workshop._id} />
                  }
                />
              )
            })}
          </div>
        </div>
      )}

      {registrationOpen && availableWorkshops.length > 0 && (
        <div>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Available Workshops
          </h2>
          <div className="space-y-6">
            {availableWorkshops.map((workshop) => {
              const workshopIsSignedUp = hasConfirmedSignup(
                workshop._id,
                userSignups,
              )
              const { hasConflict, conflictingWorkshop } =
                checkTimeConflict(workshop)
              return (
                <WorkshopCard
                  key={workshop._id}
                  workshop={workshop}
                  userSignups={userSignups}
                  onSignup={handleSignup}
                  isSignedUp={workshopIsSignedUp}
                  isLoading={signupMutation.isPending}
                  hasTimeConflict={hasConflict}
                  conflictingWorkshopTitle={conflictingWorkshop?.title}
                  announcements={
                    <WorkshopAnnouncementsSection workshopId={workshop._id} />
                  }
                />
              )
            })}
          </div>
        </div>
      )}

      {registrationOpen && fullWorkshops.length > 0 && (
        <div>
          <h2 className="font-space-grotesk mb-6 flex items-center gap-2 text-2xl font-semibold text-gray-500 dark:text-gray-400">
            <ExclamationTriangleIcon className="h-6 w-6" />
            Full Workshops
          </h2>
          <div className="space-y-6 opacity-75">
            {fullWorkshops.map((workshop) => {
              const userSignup = userSignups.find(
                (s) => getWorkshopIdFromSignup(s) === workshop._id,
              )
              return (
                <WorkshopCard
                  key={workshop._id}
                  workshop={workshop}
                  userSignups={userSignups}
                  onSignup={handleSignup}
                  onCancel={
                    userSignup ? () => handleCancel(userSignup._id) : undefined
                  }
                  isFull={true}
                  isSignedUp={!!userSignup}
                  announcements={
                    <WorkshopAnnouncementsSection workshopId={workshop._id} />
                  }
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
