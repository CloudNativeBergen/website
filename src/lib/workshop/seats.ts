/**
 * The seats of a workshop (#1344): every write that confirms a sign-up, or
 * changes how many seats there are, is decided in the dataset itself.
 *
 * THE GUARD. One `workshopSeats` document per workshop. A write that takes a
 * seat reads the capacity, the sign-ups and the guard's `_rev` in ONE query,
 * decides, and commits its change in ONE transaction together with a patch of
 * the guard `ifRevisionID` that revision (or the guard's `create`, when there
 * is none yet). Two such writes can never both commit on what one of them
 * read: the second is refused with a 409 by Sanity, reads again and decides
 * again. Nothing is held in the memory of a server process.
 *
 * A sign-up that is WAITLISTED does not go through the guard. Deciding
 * "waitlist" on a count that is out of date can only leave a seat empty, never
 * fill one twice, and keeping waitlist writes out of the guard keeps the
 * contention at an opening time to the seats there actually are.
 *
 * ONE SIGN-UP PER PERSON AND WORKSHOP is held by the sign-up's id: it is
 * derived from the two, and Sanity refuses a `create` of a stored id. Sign-ups
 * written before #1344 have random ids; the read finds those.
 *
 * NOT GUARDED, by design: a write that frees a seat (cancel, delete, move to
 * the waitlist). Racing one can only make a sign-up wait for a seat that has
 * just come free.
 */
import { createHash } from 'node:crypto'
import { groq } from 'next-sanity'
import { clientWrite } from '@/lib/sanity/client'
import type {
  ExperienceLevel,
  OperatingSystem,
  WorkshopSignupExisting,
} from './types'

/** How many times a write that lost a race reads again before giving up. */
const MAX_ATTEMPTS = 25

export interface SignUpRequest {
  userWorkOSId: string
  userEmail: string
  userName: string
  experienceLevel: ExperienceLevel
  operatingSystem: OperatingSystem
  workshopId: string
  conferenceId: string
  /** The sponsor whose early-access link admitted this sign-up (#1346). */
  earlyAccessSponsorId?: string
}

/**
 * `busy`: the request lost the race every time it tried. Nothing was written.
 */
export type SignUpOutcome =
  | { signup: WorkshopSignupExisting }
  | { refused: 'not-found' | 'already-signed-up' | 'full' | 'busy' }

interface Seats {
  capacity: number
  /** The guard's revision, or `null` when no seat was ever taken through it. */
  guard: string | null
  signups: {
    _id: string
    _createdAt: string
    signedUpAt?: string
    status: 'confirmed' | 'waitlist'
    userWorkOSId: string
  }[]
}

export const seatsDocumentId = (workshopId: string) =>
  `workshopSeats-${workshopId}`

/** The id of a person's sign-up for a workshop: the same for every attempt. */
export const signupDocumentId = (workshopId: string, userWorkOSId: string) =>
  `workshopSignup-${createHash('sha256')
    .update(`${workshopId}\n${userWorkOSId}`)
    .digest('hex')
    .slice(0, 32)}`

const confirmedIn = (seats: Seats) =>
  seats.signups.filter((s) => s.status === 'confirmed').length

async function readSeats(
  workshopId: string,
  conferenceId: string,
): Promise<Seats | null> {
  return clientWrite.fetch<Seats | null>(
    groq`*[_type == "talk" && _id == $workshopId && conference._ref == $conferenceId][0]{
      "capacity": coalesce(capacity, 30),
      "guard": *[_type == "workshopSeats" && _id == $seatsId][0]._rev,
      "signups": *[_type == "workshopSignup" && workshop._ref == ^._id && status in ["confirmed", "waitlist"]]{
        _id, _createdAt, signedUpAt, status, userWorkOSId
      }
    }`,
    { workshopId, conferenceId, seatsId: seatsDocumentId(workshopId) },
  )
}

type Transaction = ReturnType<typeof clientWrite.transaction>

/** Makes `tx` commit only if no seat changed hands since `seats` was read. */
function guard(
  tx: Transaction,
  seats: Seats,
  workshopId: string,
  conferenceId: string,
) {
  const _id = seatsDocumentId(workshopId)
  if (seats.guard) {
    return tx.patch(_id, {
      ifRevisionID: seats.guard,
      setIfMissing: { writes: 0 },
      inc: { writes: 1 },
    })
  }
  return tx.create({
    _id,
    _type: 'workshopSeats',
    // WEAK: the guard must not keep a workshop or a conference from being
    // deleted.
    workshop: { _type: 'reference', _ref: workshopId, _weak: true },
    conference: { _type: 'reference', _ref: conferenceId, _weak: true },
    writes: 1,
  })
}

/** Sanity's answer to a write that lost the race: a revision or an id. */
const isConflict = (error: unknown) =>
  (error as { statusCode?: unknown } | null)?.statusCode === 409

/** A short random pause, so the losers of one race do not meet again. */
const backOff = (attempt: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.random() * Math.min(200, 10 * 2 ** attempt)),
  )

/**
 * Reads, lets `decide` add its writes to a transaction, and commits; reads
 * and decides again when another write got there first. `decide` answers a
 * refusal by returning it instead of writing.
 */
async function decideAndCommit<R, D>(
  workshopId: string,
  conferenceId: string,
  decide: (seats: Seats, tx: Transaction) => { refused: R } | { done: D },
): Promise<{ refused: R | 'not-found' | 'busy' } | { done: D }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await backOff(attempt)
    const seats = await readSeats(workshopId, conferenceId)
    if (!seats) return { refused: 'not-found' }
    const tx = clientWrite.transaction()
    const decision = decide(seats, tx)
    if ('refused' in decision) return decision
    try {
      await tx.commit()
      return decision
    } catch (error) {
      if (!isConflict(error)) throw error
    }
  }
  return { refused: 'busy' }
}

/**
 * A sign-up: confirmed while a seat is free; when none is, waitlisted, or
 * refused with `full` (`whenFull: 'refuse'`, the organizer's manual add).
 */
export async function signUpForWorkshop(
  request: SignUpRequest,
  { whenFull }: { whenFull: 'waitlist' | 'refuse' },
): Promise<SignUpOutcome> {
  const { workshopId, conferenceId, earlyAccessSponsorId } = request
  const _id = signupDocumentId(workshopId, request.userWorkOSId)
  const outcome = await decideAndCommit(workshopId, conferenceId, (seats, tx) => {
    if (seats.signups.some((s) => s.userWorkOSId === request.userWorkOSId)) {
      return { refused: 'already-signed-up' as const }
    }
    const free = confirmedIn(seats) < seats.capacity
    if (!free && whenFull === 'refuse') return { refused: 'full' as const }
    if (free) guard(tx, seats, workshopId, conferenceId)
    tx.create({
      _id,
      _type: 'workshopSignup',
      userWorkOSId: request.userWorkOSId,
      userEmail: request.userEmail,
      userName: request.userName,
      workshop: { _type: 'reference', _ref: workshopId },
      conference: { _type: 'reference', _ref: conferenceId },
      status: free ? 'confirmed' : 'waitlist',
      confirmationEmailSent: false,
      experienceLevel: request.experienceLevel,
      operatingSystem: request.operatingSystem,
      // WEAK IN THE WRITE ITSELF: the schema's `weak` governs Studio only,
      // and a strong reference would keep the sponsor from being removed
      // from the conference.
      ...(earlyAccessSponsorId && {
        earlyAccessSponsor: {
          _type: 'reference',
          _ref: earlyAccessSponsorId,
          _weak: true,
        },
      }),
    })
    return { done: _id }
  })
  if ('refused' in outcome) return outcome
  return { signup: await readSignup(outcome.done) }
}

async function readSignup(id: string): Promise<WorkshopSignupExisting> {
  return clientWrite.fetch<WorkshopSignupExisting>(
    groq`*[_type == "workshopSignup" && _id == $id][0]{
      _id,
      _type,
      userEmail,
      userName,
      userWorkOSId,
      workshop->{_id, _ref, title, date, startTime, endTime, capacity},
      conference->{_id, _ref, name},
      status,
      signedUpAt,
      _createdAt,
      _updatedAt
    }`,
    { id },
  )
}
