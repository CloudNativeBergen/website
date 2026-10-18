import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { decideWorkshopPortalAccess } from '@/lib/workshop/access'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { resolveConferenceContact } from '@/lib/email/from'
import { notFound, redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import {
  WORKSHOP_EARLY_ACCESS_INVALID,
  WORKSHOP_SIGN_IN_INCOMPLETE,
} from '@/lib/workshop/sign-in-paths'
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
import { WorkshopNoTicket } from '@/components/workshop/WorkshopNoTicket'
import { WorkshopPortal } from '@/components/workshop/WorkshopPortal'
import { workshopRegistrationWindow } from '@/lib/workshop/registration-window'
import {
  earlyAccessTokenOf,
  registrationWindowFor,
  resolveEarlyAccess,
} from '@/lib/workshop/early-access'
import { earlyAccessTicketTypeOf } from '@/lib/workshop/early-access/ticket'
import { refreshWorkshopPortal, signOutOfWorkshop } from './actions'

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
  // JUST OPENED AN EARLY-ACCESS LINK THAT IS NOT LIVE (#1346): the route that
  // opens a link lands here with one fixed marker. The notice is all the
  // signed-out view and the no-ticket view ever show about early access.
  const query = await searchParams
  const earlyAccessInvalid =
    query[WORKSHOP_EARLY_ACCESS_INVALID.param] ===
    WORKSHOP_EARLY_ACCESS_INVALID.value
  if (!user) {
    // A refused redeem, or a refused return the callback sends back, lands
    // here with one fixed marker, whatever refused it.
    const { [WORKSHOP_SIGN_IN_INCOMPLETE.param]: marker } = query
    return (
      <WorkshopSignedOut
        conferenceTitle={conference.title}
        signInIncomplete={marker === WORKSHOP_SIGN_IN_INCOMPLETE.value}
        earlyAccessInvalid={earlyAccessInvalid}
      />
    )
  }
  const userName = user.name || user.email

  // THE ONE ACCESS DECISION (#1294) — the same call the attendee procedures
  // make, so this page can never show a signup form the API would refuse (or
  // the reverse). It no longer skips the ticket check for a conference without
  // ticketing ids: no ticketing means nobody can be shown to hold a ticket.
  const access = await decideWorkshopPortalAccess({ conference, user })
  {
    // Unreachable after the gate above, but the decision is the authority.
    if (!access.allowed && access.denial === 'feature-disabled') {
      notFound()
    }

    if (!access.allowed) {
      return (
        <WorkshopNoTicket
          denial={access.denial}
          reason={access.reason}
          tickets={access.tickets}
          contactEmail={resolveConferenceContact(conference)}
          signOutAction={signOutOfWorkshop}
          earlyAccessInvalid={earlyAccessInvalid}
        />
      )
    }
  }

  // THE ONE WINDOW RULE (#1345), the same one `workshop.signup` and the list
  // below ask, with this person's early access (#1346).
  //
  // RESOLVED ONLY HERE, for a person the portal admits, and only when it can
  // matter (see `registrationWindowFor`): the cookie is not even read after
  // the official opening. Through the ONE cached read of the conference's
  // links, never a live read: it decides what is shown, and the sign-up
  // checks the link live. A cookie whose link is no longer live is no cookie.
  const { registration, access: earlyAccess } = await registrationWindowFor(
    conference,
    new Date(),
    async () => {
      // BY TICKET TYPE first, as `workshop.signup` asks it: from the tickets
      // the decision above already read.
      const ticketType = earlyAccessTicketTypeOf(
        access.allowed ? access.eligibleTickets : [],
        conference.workshopEarlyAccessTicketTypes,
      )
      // The banner reads "early access through …".
      if (ticketType) return { sponsorName: `your “${ticketType}” ticket` }
      try {
        return await resolveEarlyAccess(
          conference._id,
          earlyAccessTokenOf(await cookies()),
        )
      } catch (error) {
        // THE PAGE ONLY DECIDES WHAT IS SHOWN: when the links cannot be read,
        // the person sees the portal as everyone does. For a person who does
        // have early access that is wrong until a later view: they see the
        // banner naming the official opening and no workshop to sign up for,
        // and nothing tells them why.
        console.error('[workshop] early-access links could not be read', error)
        return null
      }
    },
  )

  return (
    <WorkshopPortal
      conferenceTitle={conference.title}
      userWorkOSId={user.userId}
      userEmail={user.email}
      userName={userName}
      times={{
        workshopRegistrationSponsorStart:
          conference.workshopRegistrationSponsorStart,
        workshopRegistrationStart: conference.workshopRegistrationStart,
        workshopRegistrationEnd: conference.workshopRegistrationEnd,
      }}
      registration={registration}
      earlyAccess={earlyAccess}
      earlyAccessInvalid={earlyAccessInvalid}
      signOutAction={signOutOfWorkshop}
      refreshAction={refreshWorkshopPortal}
    />
  )
}
