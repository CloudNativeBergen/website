/**
 * EARLY SIGN-UPS AS ORGANIZERS READ THEM (#1348, spec §9): which sponsor's
 * link admitted a sign-up.
 *
 * `@/lib/workshop/sanity` takes the projection from this file, not from the
 * barrel, which would pull the cached links and `next/cache` into it.
 */
import { clientReadUncached } from '@/lib/sanity/client'
import type { WorkshopSignupStatus } from '../types'

/**
 * The sponsor behind an early sign-up, for a projection of `workshopSignup`
 * in a query that binds `$conferenceId`.
 *
 *  - `null` for a sign-up that is not early.
 *  - `{ sponsor: null }` for an early one whose sponsor is not in the
 *    conference: the reference is weak, so the sponsor can have been removed.
 *  - THE NAME IS READ ONLY FROM A SPONSOR OF `$conferenceId`. The stored
 *    reference is followed wherever it points, so a sign-up that names another
 *    conference's sponsor (a bad write) answers `{ sponsor: null }`, never
 *    that sponsor's name.
 */
export const EARLY_ACCESS_PROJECTION = `"earlyAccess": select(defined(earlyAccessSponsor._ref) => {
    "sponsor": select(earlyAccessSponsor->conference._ref == $conferenceId => earlyAccessSponsor->{ _id, "name": sponsor->name })
  })`

/** What {@link EARLY_ACCESS_PROJECTION} answers for one sign-up. */
export type SignupEarlyAccess = {
  /** `null`: the sponsor is no longer in the conference. */
  sponsor: { _id: string; name: string | null } | null
} | null

/** One row of the "Early sign-ups" list on `/admin/workshops`. */
export interface EarlySignupRow {
  _id: string
  userName: string
  userEmail: string
  status: WorkshopSignupStatus
  /** When the sign-up was made: `signedUpAt`, or when it was created. */
  signedUpAt: string
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
  sponsors: { _id: string; name: string | null }[]
}

// THE TWO ROOTS OF THE LIST, sent as one query, so the list costs one read.
//
// Each is spelled out, with the conference in its own filter and nothing
// interpolated: the tenancy lint reads a root only when it is literal text.
// That is why the projection below repeats `EARLY_ACCESS_PROJECTION`.
//
// `status in ["confirmed", "waitlist"]`: a seat or a place in line, the only
// two statuses a sign-up is stored with. The count on the sponsor's record
// (`SPONSOR_FOR_CONFERENCE_FIELDS`) asks for the same two, so the two agree.
// A cancelled sign-up has neither: it is deleted (`deleteWorkshopSignup`).
const NARROWED_SIGNUPS = `*[_type == "workshopSignup" && conference._ref == $conferenceId && defined(earlyAccessSponsor._ref) && status in ["confirmed", "waitlist"] && (!defined($sponsorId) || earlyAccessSponsor._ref == $sponsorId)] | order(coalesce(signedUpAt, _createdAt) desc) {
  _id,
  userName,
  userEmail,
  status,
  "signedUpAt": coalesce(signedUpAt, _createdAt),
  "workshop": workshop->{ _id, title },
  "earlyAccess": {
    "sponsor": select(earlyAccessSponsor->conference._ref == $conferenceId => earlyAccessSponsor->{ _id, "name": sponsor->name })
  }
}`
const SPONSORS_TO_NARROW_TO = `*[_type == "sponsorForConference" && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && (_id == $sponsorId || _id in *[_type == "workshopSignup" && conference._ref == $conferenceId && defined(earlyAccessSponsor._ref) && status in ["confirmed", "waitlist"]].earlyAccessSponsor._ref)] | order(sponsor->name asc, _id asc) { _id, "name": sponsor->name }`

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
