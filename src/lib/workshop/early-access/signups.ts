/**
 * EARLY SIGN-UPS AS ORGANIZERS READ THEM (#1348, spec §9): which sponsor's
 * link admitted a sign-up.
 *
 * `@/lib/workshop/sanity` takes the projection from this file, not from the
 * barrel, which would pull the cached links and `next/cache` into it.
 */
import { clientReadUncached } from '@/lib/sanity/client'
import type {
  EarlyAccessSponsor,
  SignupEarlyAccess,
  WorkshopSignupStatus,
} from '../types'

/**
 * THE SPONSOR A SIGN-UP RECORDS, READ ONLY IF IT IS A SPONSOR OF
 * `$conferenceId`, else `null`. Written once, for every read that shows it.
 *
 * The stored reference is weak and is followed wherever it points. So a
 * sponsor that was removed from the conference answers `null`, and so does
 * another conference's sponsor (which only a bad write records): its name is
 * never read.
 *
 * A value expression, interpolated where a projection gives a field its
 * value. The tenancy lint reads a root's FILTER as text and cannot see into an
 * interpolation there; one in a projection's value it reads past.
 */
const SPONSOR_OF_THIS_CONFERENCE = `select(earlyAccessSponsor->conference._ref == $conferenceId => earlyAccessSponsor->{ _id, "name": sponsor->name })`

/**
 * The value of `earlyAccess` in a projection of `workshopSignup`, in a query
 * that binds `$conferenceId` ({@link SignupEarlyAccess}): `null` for a sign-up
 * that is not early, `{ sponsor }` for one that is.
 */
export const EARLY_ACCESS_OF_SIGNUP = `select(defined(earlyAccessSponsor._ref) => { "sponsor": ${SPONSOR_OF_THIS_CONFERENCE} }, defined(earlyAccessTicketType) => { "sponsor": null, "ticketType": earlyAccessTicketType })`

/** One row of the "Early sign-ups" list on `/admin/workshops`. */
export interface EarlySignupRow {
  _id: string
  userName: string
  userEmail: string
  status: WorkshopSignupStatus
  /** When the sign-up was made: `signedUpAt`, or when it was created. */
  signedUpAt: string
  /** `null`: the sign-up's workshop is not one of the conference's. */
  workshop: { _id: string; title: string | null } | null
  earlyAccess: NonNullable<SignupEarlyAccess>
}

export interface EarlySignups {
  signups: EarlySignupRow[]
  /**
   * What the list can be narrowed to: the sponsors of the conference that an
   * early sign-up names, and the one it is narrowed to now when that is a
   * sponsor of the conference.
   */
  sponsors: EarlyAccessSponsor[]
}

// THE TWO ROOTS OF THE LIST, sent as one query, so the list costs one read.
//
// Each FILTER is spelled out, with the conference in it and nothing
// interpolated, so the tenancy lint can read it.
//
// PUBLISHED DOCUMENTS ONLY, on every root. The server's client sees drafts,
// and Sanity Studio makes a draft (or a release copy) of a sign-up the moment
// an organizer edits its notes there: a copy is not a second sign-up. The
// count on the sponsor's record (`SPONSOR_FOR_CONFERENCE_FIELDS`) leaves them
// out the same way.
//
// THE WORKSHOP IS READ ONLY IF IT IS ONE OF THE CONFERENCE'S, as the sponsor
// is: a sign-up that points at another conference's workshop (a bad write)
// never carries that workshop's title.
const NARROWED_SIGNUPS = `*[_type == "workshopSignup" && conference._ref == $conferenceId && (defined(earlyAccessSponsor._ref) || defined(earlyAccessTicketType)) && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && (!defined($sponsorId) || earlyAccessSponsor._ref == $sponsorId)] | order(coalesce(signedUpAt, _createdAt) desc) {
  _id,
  userName,
  userEmail,
  status,
  "signedUpAt": coalesce(signedUpAt, _createdAt),
  "workshop": select(workshop->conference._ref == $conferenceId => workshop->{ _id, title }),
  "earlyAccess": select(defined(earlyAccessSponsor._ref) => { "sponsor": ${SPONSOR_OF_THIS_CONFERENCE} }, { "sponsor": null, "ticketType": earlyAccessTicketType })
}`
const SPONSORS_TO_NARROW_TO = `*[_type == "sponsorForConference" && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && (_id == $sponsorId || _id in *[_type == "workshopSignup" && conference._ref == $conferenceId && defined(earlyAccessSponsor._ref) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].earlyAccessSponsor._ref)] | order(sponsor->name asc, _id asc) { _id, "name": sponsor->name }`

/**
 * EVERY early sign-up of `conferenceId`, newest first, optionally narrowed to
 * the ones one sponsor's links admitted. Not sliced: the page's general read
 * of sign-ups stops at a hundred, which is why this is its own read.
 *
 * `sponsorId` IS CLIENT INPUT AND IS TRUSTED FOR NOTHING. Both roots are
 * bound to the conference, so an id of another conference's sponsor answers
 * exactly as an id that does not exist: this conference's sign-ups that name
 * it (none, short of a bad write) and no sponsor.
 *
 * FAILS CLOSED: without a conference nothing is read.
 */
export async function listEarlySignups(
  conferenceId: string,
  sponsorId?: string,
): Promise<EarlySignups> {
  if (!conferenceId) return { signups: [], sponsors: [] }
  const answer = await clientReadUncached.fetch<EarlySignups | null>(
    `{ "signups": ${NARROWED_SIGNUPS}, "sponsors": ${SPONSORS_TO_NARROW_TO} }`,
    { conferenceId, sponsorId: sponsorId ?? null },
    // An organizer's own change (a confirm, a delete) is read back at once.
    { cache: 'no-store' },
  )
  return {
    signups: answer?.signups ?? [],
    sponsors: answer?.sponsors ?? [],
  }
}
