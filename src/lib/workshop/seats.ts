/**
 * The seats of a workshop (#1344): every write that confirms a sign-up, or
 * changes how many seats there are, is decided in the dataset itself.
 *
 * THE GUARD. One `workshopSeats` document per workshop. A write that takes a
 * seat reads the capacity, the sign-ups and the guard's `_rev` in ONE query,
 * decides, and commits its change in ONE transaction together with a patch of
 * the guard `ifRevisionID` that revision (or the guard's `create`, when there
 * is none yet). Two such writes can never both commit on what one of them
 * read: Sanity refuses the second (a 409), which reads again and decides
 * again. Nothing is held in the memory of a server process.
 *
 * A READ MAY LAG. Sanity runs queries against a search store that is synced
 * from the document store outside transactions, so a read can show the
 * guard's newest revision without the seat taken in that same write, or a
 * capacity from before its change. So the guard itself remembers, for
 * `RECENT_MS`, the seats it let through and a capacity it set, and the
 * decision counts those beside what the read shows. A decision then rests on
 * the guard's own content, which `ifRevisionID` checks: a guard read stale is
 * refused at the commit.
 *
 * A sign-up that is WAITLISTED does not go through the guard. Deciding
 * "waitlist" on a count that is out of date can only leave a seat empty, never
 * fill one twice, and keeping waitlist writes out of the guard keeps the
 * contention at an opening time to the seats there actually are.
 *
 * ONE SIGN-UP PER PERSON AND WORKSHOP is held by the sign-up's id: it is
 * derived from the person, the workshop and the conference, and Sanity
 * refuses a `create` of a stored id. Sign-ups written before #1344 have random
 * ids; the read finds those.
 *
 * NOT GUARDED, by design: a write that frees a seat (cancel, delete, move to
 * the waitlist). Racing one can only make a sign-up wait for a seat that has
 * just come free. It does make the guard forget the seat (`freeSeat`), so the
 * seat is free to the next sign-up at once, not after `RECENT_MS`; a sign-up
 * deleted in Studio is counted until then.
 */
import { createHash, randomUUID } from 'node:crypto'
import { groq } from 'next-sanity'
import { clientWrite } from '@/lib/sanity/client'
import type { WorkshopSignupExisting, WorkshopSignupInput } from './types'

/**
 * How many times a write that lost a race reads again before giving up. Each
 * round lets one writer through, so at an opening time a request may lose
 * several in a row; with the back-off (at most 200 ms) this is a few seconds
 * of trying before the person is asked to try again.
 */
const MAX_ATTEMPTS = 25

/**
 * How long the guard counts a seat it let through, or holds a capacity it
 * set, beside the read: from when the write was sent, until well after it can
 * have landed (a request lives at most 300 s, Vercel's default, which the
 * tRPC route keeps) and been shown by Sanity's search store ("generally less
 * than 1 second"). The price: a seat freed outside the app (`freeSeat` makes
 * the guard forget at once) is counted until it ends.
 */
const RECENT_MS = 15 * 60_000

export interface SignUpRequest extends Pick<
  WorkshopSignupInput,
  | 'userWorkOSId'
  | 'userEmail'
  | 'userName'
  | 'experienceLevel'
  | 'operatingSystem'
  | 'notes'
> {
  workshopId: string
  conferenceId: string
  /** The sponsor whose early-access link admitted this sign-up (#1346). */
  earlyAccessSponsorId?: string
}

/**
 * `busy`: the request lost the race every time it tried. Nothing was written.
 * `removed`: it was written, and deleted (a cancel) before it could be read
 * back.
 */
export type SignUpOutcome =
  | { signup: WorkshopSignupExisting }
  | {
      refused: 'not-found' | 'already-signed-up' | 'full' | 'busy' | 'removed'
    }

interface Guard {
  _rev: string
  /** The seats it let through, with when. */
  recent?: { _key: string; signup: string; at: string }[] | null
  /** The capacity it last set, with when. */
  capacity?: number | null
  capacitySetAt?: string | null
}

interface Seats {
  /** The workshop's capacity, as the read shows it. */
  capacity: number
  /** `null` when no seat was ever taken through it. */
  guard: Guard | null
  /** When the read was made. */
  now: number
  signups: {
    _id: string
    _createdAt: string
    signedUpAt?: string
    status: 'confirmed' | 'waitlist'
    userWorkOSId: string
  }[]
}

/**
 * Within the conference: a workshop moved to another conference starts a new
 * guard there, instead of finding none (the read is scoped) and colliding
 * with the old one's id on every attempt.
 */
export const seatsDocumentId = (conferenceId: string, workshopId: string) =>
  `workshopSeats-${conferenceId}-${workshopId}`

/**
 * The id of a person's sign-up for a workshop: the same for every attempt.
 * Within the conference, like the guard's: the read that finds a sign-up is
 * scoped to it.
 */
export const signupDocumentId = (
  conferenceId: string,
  workshopId: string,
  userWorkOSId: string,
) =>
  `workshopSignup-${createHash('sha256')
    .update(`${conferenceId}\n${workshopId}\n${userWorkOSId}`)
    .digest('hex')
    .slice(0, 32)}`

const isRecent = (seats: Seats, at: string | null | undefined) =>
  typeof at === 'string' && seats.now - Date.parse(at) < RECENT_MS

/** The guard's own memory of the seats it let through a moment ago. */
const recentIn = (seats: Seats) =>
  (seats.guard?.recent ?? []).filter((r) => isRecent(seats, r.at))

/**
 * The sign-ups that hold a seat: confirmed in the read, and those the guard
 * let through a moment ago, which the read may not show yet.
 */
const takenIn = (seats: Seats) =>
  new Set([
    ...seats.signups.filter((s) => s.status === 'confirmed').map((s) => s._id),
    ...recentIn(seats).map((r) => r.signup),
  ])

/** The lower of the read's capacity and one the guard set a moment ago. */
function capacityOf(seats: Seats) {
  const set = seats.guard?.capacity
  return typeof set === 'number' && isRecent(seats, seats.guard?.capacitySetAt)
    ? Math.min(seats.capacity, set)
    : seats.capacity
}

async function readSeats(
  workshopId: string,
  conferenceId: string,
): Promise<Seats | null> {
  const [seats, guard] = await Promise.all([
    clientWrite.fetch<Omit<Seats, 'now' | 'guard'> | null>(
      groq`*[_type == "talk" && _id == $workshopId && conference._ref == $conferenceId][0]{
        "capacity": coalesce(capacity, 30),
        "signups": *[_type == "workshopSignup" && workshop._ref == ^._id && conference._ref == $conferenceId && status in ["confirmed", "waitlist"] && !(_id in path("drafts.**"))]{
          _id, _createdAt, signedUpAt, status, userWorkOSId
        }
      }`,
      { workshopId, conferenceId },
    ),
    // From the document store, where it is current: a 409 on it is then a
    // race, never a read that has not caught up.
    clientWrite.getDocument<Guard & { _id: string }>(
      seatsDocumentId(conferenceId, workshopId),
    ),
  ])
  if (!seats) return null
  return {
    ...seats,
    // Its id is derived from the conference's own.
    guard: guard ?? null,
    now: Date.now(),
  }
}

type Transaction = ReturnType<typeof clientWrite.transaction>

/**
 * Makes `tx` commit only if no seat changed hands since `seats` was read, and
 * has the guard remember the seats `took` and a `capacity` it sets.
 */
function guard(
  tx: Transaction,
  seats: Seats,
  workshopId: string,
  conferenceId: string,
  { took, capacity }: { took: string[]; capacity?: number },
) {
  const _id = seatsDocumentId(conferenceId, workshopId)
  // When the write is sent, not when it was read.
  const at = new Date().toISOString()
  const remembered = {
    recent: [
      ...recentIn(seats),
      ...took.map((signup) => ({
        _key: randomUUID().slice(0, 12),
        signup,
        at,
      })),
    ],
    ...(capacity !== undefined && { capacity, capacitySetAt: at }),
  }
  if (seats.guard) {
    // Every commit that changes the guard gives it a new revision: the one
    // every other reader of this revision is refused on.
    return tx.patch(_id, {
      ifRevisionID: seats.guard._rev,
      set: remembered,
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
    ...remembered,
  })
}

/**
 * A write refused because the dataset moved on since the read: a revision or
 * an id that is taken (409), or a document the write patches that is gone (an
 * attendee's cancel deletes their sign-up). Sanity documents that such a patch
 * fails, not with which status, so both are read as a lost race.
 */
const lostTheRace = (error: unknown) => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return status === 409 || status === 404
}

/** A short random pause, so the losers of one race do not meet again. */
const backOff = (attempt: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.random() * Math.min(200, 10 * 2 ** attempt)),
  )

/**
 * Reads, lets `decide` add its writes to a transaction, and commits; reads
 * and decides again when another write got there first. `decide` answers a
 * refusal by returning it instead of writing, and `done` with no write by
 * leaving the transaction empty.
 */
async function decideAndCommit<F extends { refused: string }, D>(
  workshopId: string,
  conferenceId: string,
  decide: (
    seats: Seats,
    tx: Transaction,
  ) => F | { done: D } | Promise<F | { done: D }>,
  /** After a lost race: an answer that makes reading again pointless. */
  lost?: () => Promise<F | undefined>,
): Promise<F | { refused: 'not-found' | 'busy' } | { done: D }> {
  // Each round lets one seat through, so one more round per seat left.
  let attempts = MAX_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await backOff(attempt)
    const seats = await readSeats(workshopId, conferenceId)
    if (!seats) return { refused: 'not-found' }
    if (attempt === 0) {
      attempts += Math.max(0, capacityOf(seats) - takenIn(seats).size)
    }
    const tx = clientWrite.transaction()
    const decision = await decide(seats, tx)
    if ('refused' in decision || tx.serialize().length === 0) return decision
    try {
      await tx.commit()
      return decision
    } catch (error) {
      if (!lostTheRace(error)) throw error
      const answer = await lost?.()
      if (answer) return answer
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
  const _id = signupDocumentId(conferenceId, workshopId, request.userWorkOSId)
  const outcome = await decideAndCommit<
    { refused: 'already-signed-up' | 'full' },
    string
  >(
    workshopId,
    conferenceId,
    (seats, tx) => {
      if (seats.signups.some((s) => s.userWorkOSId === request.userWorkOSId)) {
        return { refused: 'already-signed-up' as const }
      }
      const free = takenIn(seats).size < capacityOf(seats)
      if (!free && whenFull === 'refuse') return { refused: 'full' as const }
      if (free) guard(tx, seats, workshopId, conferenceId, { took: [_id] })
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
        ...(request.notes && { notes: request.notes }),
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
    },
    // Lost on the sign-up's own id, which the read does not show yet (or
    // shows edited in Studio): it is stored, so the person is signed up.
    async () =>
      (await isStored(_id))
        ? { refused: 'already-signed-up' as const }
        : undefined,
  )
  if ('refused' in outcome) return outcome
  const signup = await readSignup(outcome.done, conferenceId)
  return signup ? { signup } : { refused: 'removed' }
}

/** From the document store: by an id derived from this conference's own. */
async function isStored(id: string): Promise<boolean> {
  return Boolean(await clientWrite.getDocument(id))
}

async function readSignup(
  id: string,
  conferenceId: string,
): Promise<WorkshopSignupExisting | null> {
  return clientWrite.fetch<WorkshopSignupExisting | null>(
    groq`*[_type == "workshopSignup" && _id == $id && conference._ref == $conferenceId][0]{
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
    { id, conferenceId },
  )
}

interface Confirmed {
  confirmed: string[]
  newlyConfirmed: string[]
  seatsTaken: number
  capacity: number
}

interface CurrentSignup {
  _id: string
  _createdAt: string
  signedUpAt?: string
  status: 'confirmed' | 'waitlist'
}

/**
 * These sign-ups of the workshop, as they are now: from the document store,
 * not from a read that may still show one deleted or moved. A write is then
 * refused only by a race, not by a read that has not caught up.
 */
async function current(
  ids: string[],
  workshopId: string,
  conferenceId: string,
): Promise<CurrentSignup[]> {
  if (ids.length === 0) return []
  const docs = await clientWrite.getDocuments<
    CurrentSignup & {
      workshop?: { _ref: string }
      conference?: { _ref: string }
    }
  >(ids)
  return docs.filter(
    (d): d is NonNullable<typeof d> =>
      d !== null &&
      d.workshop?._ref === workshopId &&
      d.conference?._ref === conferenceId &&
      (d.status === 'confirmed' || d.status === 'waitlist'),
  )
}

/**
 * The organizer's confirm, of sign-ups of ONE workshop. It is allowed past
 * capacity: that is the organizer's call, and the answer says so
 * (`seatsTaken > capacity`). It takes its seats through the guard all the
 * same, so `seatsTaken` is what is stored when it commits, and a sign-up
 * reading at the same moment cannot take the seat it took.
 *
 * `confirmed` names the sign-ups that are confirmed now; one that is gone, or
 * of another workshop, is not in it. `newlyConfirmed` names those this write
 * took a seat for; one that was confirmed already is not in it.
 */
export async function confirmSignups(
  workshopId: string,
  conferenceId: string,
  signupIds: string[],
): Promise<Confirmed | { refused: 'not-found' | 'busy' }> {
  const outcome = await decideAndCommit<never, Confirmed>(
    workshopId,
    conferenceId,
    async (seats, tx) => {
      const taken = takenIn(seats)
      const remembered = new Set(recentIn(seats).map((r) => r.signup))
      const wanted = await current(signupIds, workshopId, conferenceId)
      const waitingNow = wanted.filter((s) => s.status === 'waitlist')
      // Waiting now, but still remembered by the guard as holding a seat
      // (moved to the waitlist outside the app): written confirmed all the
      // same, and not counted twice. A read that still shows it confirmed is
      // no such sign: only the guard's own memory is.
      const waiting = waitingNow.filter((s) => !remembered.has(s._id))
      if (waitingNow.length > 0) {
        guard(tx, seats, workshopId, conferenceId, {
          took: waiting.map((s) => s._id),
        })
        const confirmedAt = new Date().toISOString()
        for (const { _id } of waitingNow) {
          tx.patch(_id, { set: { status: 'confirmed', confirmedAt } })
        }
      }
      return {
        done: {
          confirmed: wanted.map((s) => s._id),
          newlyConfirmed: waiting.map((s) => s._id),
          seatsTaken: new Set([...taken, ...waiting.map((s) => s._id)]).size,
          capacity: capacityOf(seats),
        },
      }
    },
  )
  return 'refused' in outcome ? outcome : outcome.done
}

/**
 * Sets the capacity, and confirms the longest-waiting sign-ups into the seats
 * that are then free, in the same write. Refused below the seats taken.
 * `promoted` names the sign-ups it confirmed, longest-waiting first.
 */
export async function changeCapacity(
  workshopId: string,
  conferenceId: string,
  capacity: number,
): Promise<
  | { promoted: string[] }
  | { refused: 'below-seats-taken'; seatsTaken: number }
  | { refused: 'not-found' | 'busy' }
> {
  const outcome = await decideAndCommit<
    { refused: 'below-seats-taken'; seatsTaken: number },
    string[]
  >(workshopId, conferenceId, async (seats, tx) => {
    const taken = takenIn(seats)
    const seatsTaken = taken.size
    if (capacity < seatsTaken) {
      return { refused: 'below-seats-taken' as const, seatsTaken }
    }
    const since = (s: CurrentSignup) =>
      new Date(s.signedUpAt || s._createdAt).getTime()
    const waitlisted = seats.signups.filter(
      (s) => s.status === 'waitlist' && !taken.has(s._id),
    )
    const promoted = (
      await current(
        waitlisted.map((s) => s._id),
        workshopId,
        conferenceId,
      )
    )
      .filter((s) => s.status === 'waitlist')
      .sort((a, b) => since(a) - since(b))
      .slice(0, capacity - seatsTaken)
    guard(tx, seats, workshopId, conferenceId, {
      took: promoted.map((s) => s._id),
      capacity,
    })
    tx.patch(workshopId, { set: { capacity } })
    const confirmedAt = new Date().toISOString()
    for (const { _id } of promoted) {
      tx.patch(_id, { set: { status: 'confirmed', confirmedAt } })
    }
    return { done: promoted.map((s) => s._id) }
  })
  return 'refused' in outcome ? outcome : { promoted: outcome.done }
}

/**
 * Frees a sign-up's seat: deletes it (an attendee's cancel, an organizer's
 * delete) or moves it to the waitlist. In the same write, the guard forgets
 * that it let the sign-up through, so the next sign-up can have the seat at
 * once. The caller has established that the sign-up is the request's.
 */
export async function freeSeat(
  signupId: string,
  how: 'delete' | 'waitlist',
): Promise<void> {
  const signup = await clientWrite.getDocument<{
    workshop?: { _ref: string }
    conference?: { _ref: string }
  }>(signupId)
  const tx = clientWrite.transaction()
  if (how === 'delete') tx.delete(signupId)
  else tx.patch(signupId, { set: { status: 'waitlist' } })
  const workshopId = signup?.workshop?._ref
  const conferenceId = signup?.conference?._ref
  if (workshopId && conferenceId) {
    // Forgotten in the document store itself, whatever was read and whatever
    // lands first: a confirm of this sign-up committed just before this
    // write has its entry removed here; one after it finds the sign-up gone.
    const _id = seatsDocumentId(conferenceId, workshopId)
    tx.createIfNotExists({
      _id,
      _type: 'workshopSeats',
      workshop: { _type: 'reference', _ref: workshopId, _weak: true },
      conference: { _type: 'reference', _ref: conferenceId, _weak: true },
      writes: 0,
    })
    tx.patch(_id, { unset: [`recent[signup=="${signupId}"]`] })
  }
  await tx.commit()
}
