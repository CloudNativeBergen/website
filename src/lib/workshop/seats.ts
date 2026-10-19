/**
 * The seats of a workshop (#1344): every write that confirms a sign-up, or
 * changes how many seats there are, is decided in the dataset itself.
 *
 * THE GUARD. One `workshopSeats` document per workshop. A write that takes a
 * seat reads the guard and the workshop from the document store (the doc
 * endpoint, where they are current) and the sign-ups with a query, decides,
 * and commits its change in ONE transaction together with a patch of the
 * guard `ifRevisionID` the revision it read (or the guard's `create`, when
 * there is none yet). Two such writes can never both commit on what one of
 * them read: Sanity refuses the second (a 409), which reads again and decides
 * again. Nothing is held in the memory of a server process.
 *
 * THE QUERY MAY LAG. Sanity runs queries against a search store that is
 * synced from the document store outside transactions, so the sign-ups it
 * shows can miss a seat taken a moment ago. So the guard itself remembers,
 * for `RECENT_MS`, the seats it let through, and the decision counts those
 * beside what the query shows.
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
import { Format, Status, isWorkshopFormat } from '@/lib/proposal/types'
import { type SeatState, reportCapacityThresholds } from './capacity-notice'
import { isListedWorkshop } from './listed'
import type {
  FullSeats,
  WorkshopSignupExisting,
  WorkshopSignupInput,
} from './types'

/**
 * How many times a write that lost a race reads again before giving up. Each
 * round lets one writer through, so at an opening time a request may lose
 * several in a row; with the back-off (at most 200 ms) this is a few seconds
 * of trying before the person is asked to try again.
 */
const MAX_ATTEMPTS = 25

/**
 * How long the guard counts a seat it let through, beside the query: from
 * when the write was sent, until well after it can
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
  /** The ticket type that admitted this sign-up early, with no link. */
  earlyAccessTicketType?: string
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
}

interface Seats {
  /** The workshop's capacity, status, format and revision, as they are now. */
  capacity: number
  status?: string
  format?: string
  talkRev: string
  title?: string
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
  /** Set by the write: the sign-ups its guard took seats for. */
  took?: string[]
  /** Set by the write: it waitlisted a new sign-up. */
  waitlisted?: boolean
}

/**
 * Within the conference: a workshop moved to another conference starts a new
 * guard there, instead of finding none (the read is scoped) and colliding
 * with the old one's id on every attempt. Hashed, like the sign-up's: two
 * pairs of ids never share one, and it stays within Sanity's 128 characters.
 */
export const seatsDocumentId = (conferenceId: string, workshopId: string) =>
  `workshopSeats-${createHash('sha256')
    .update(`${conferenceId}\n${workshopId}`)
    .digest('hex')
    .slice(0, 32)}`

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

async function readSeats(
  workshopId: string,
  conferenceId: string,
): Promise<Seats | 'lagging' | null> {
  const [read, [guard, talk]] = await Promise.all([
    clientWrite.fetch<Pick<Seats, 'signups'> | null>(
      groq`*[_type == "talk" && _id == $workshopId && conference._ref == $conferenceId][0]{
        "signups": *[_type == "workshopSignup" && workshop._ref == ^._id && conference._ref == $conferenceId && status in ["confirmed", "waitlist"] && !(_id in path("drafts.**"))]{
          _id, _createdAt, signedUpAt, status, userWorkOSId
        }
      }`,
      { workshopId, conferenceId },
    ),
    // The guard and the talk from the document store, where they are
    // current: a 409 on either is then a race, never a read that has not
    // caught up.
    clientWrite.getDocuments<Record<string, unknown>>([
      seatsDocumentId(conferenceId, workshopId),
      workshopId,
    ]),
  ])
  const workshop = talk as {
    _type?: string
    _rev: string
    title?: string
    capacity?: number
    status?: string
    format?: string
    conference?: { _ref: string }
  } | null
  if (
    workshop?._type !== 'talk' ||
    workshop.conference?._ref !== conferenceId
  ) {
    return null
  }
  // The document store has it in this conference, the query not (yet): its
  // sign-ups are unknown, not none.
  if (!read) return 'lagging'
  return {
    capacity: workshop.capacity ?? 30,
    status: workshop.status,
    format: workshop.format,
    talkRev: workshop._rev,
    title: workshop.title,
    signups: read.signups ?? [],
    // Its id is derived from the conference's own.
    guard: (guard as Guard | null) ?? null,
    now: Date.now(),
  }
}

type Transaction = ReturnType<typeof clientWrite.transaction>

/**
 * Makes `tx` commit only if no seat changed hands since `seats` was read, and
 * has the guard remember, from now, the sign-ups `took` writes confirmed (an
 * older entry of one gives way).
 */
function guard(
  tx: Transaction,
  seats: Seats,
  workshopId: string,
  conferenceId: string,
  { took }: { took: string[] },
) {
  const _id = seatsDocumentId(conferenceId, workshopId)
  seats.took = took
  // When the write is sent, not when it was read.
  const at = new Date().toISOString()
  const remembered = {
    recent: [
      ...recentIn(seats).filter((r) => !took.includes(r.signup)),
      ...took.map((signup) => ({
        _key: randomUUID().slice(0, 12),
        signup,
        at,
      })),
    ],
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

/** The seats as `seats` shows them, or as the write it decided leaves them. */
function seatState(seats: Seats, { after }: { after: boolean }): SeatState {
  const took = (after && seats.took) || []
  return {
    seatsTaken: new Set([...takenIn(seats), ...took]).size,
    capacity: seats.capacity,
    waitlist:
      (after && seats.waitlisted === true) ||
      seats.signups.some(
        (s) => s.status === 'waitlist' && !took.includes(s._id),
      ),
  }
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
  let budgeted = false
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await backOff(attempt)
    const seats = await readSeats(workshopId, conferenceId)
    if (!seats) return { refused: 'not-found' }
    if (seats === 'lagging') continue
    if (!budgeted) {
      attempts += Math.max(0, seats.capacity - takenIn(seats).size)
      budgeted = true
    }
    const tx = clientWrite.transaction()
    const before = seatState(seats, { after: false })
    const decision = await decide(seats, tx)
    if ('refused' in decision || tx.serialize().length === 0) return decision
    try {
      await tx.commit()
      reportCapacityThresholds({
        conferenceId,
        workshopId,
        workshopTitle: seats.title ?? '',
        before,
        after: seatState(seats, { after: true }),
      })
      return decision
    } catch (error) {
      if (!lostTheRace(error)) throw error
      // A document the write patches is gone: if it is the workshop, which a
      // read may still show, there is nothing left to decide.
      if (
        (error as { statusCode?: unknown }).statusCode === 404 &&
        !(await clientWrite.getDocument(workshopId))
      ) {
        return { refused: 'not-found' }
      }
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
  const {
    workshopId,
    conferenceId,
    earlyAccessSponsorId,
    earlyAccessTicketType,
  } = request
  const _id = signupDocumentId(conferenceId, workshopId, request.userWorkOSId)
  const outcome = await decideAndCommit<
    { refused: 'already-signed-up' | 'full' | 'not-found' },
    string
  >(
    workshopId,
    conferenceId,
    async (seats, tx) => {
      // ONLY WHAT THE PORTAL LISTS (#1301), asked again of the talk this
      // round read: one withdrawn since the router's check takes no sign-up.
      if (!isListedWorkshop({ _id: workshopId, ...seats })) {
        return { refused: 'not-found' as const }
      }
      const mine = seats.signups.filter(
        (s) => s.userWorkOSId === request.userWorkOSId,
      )
      // A read may still show one cancelled a moment ago: only one stored
      // now makes the person signed up.
      if (
        mine.length > 0 &&
        (
          await current(
            mine.map((s) => s._id),
            workshopId,
            conferenceId,
          )
        ).length > 0
      ) {
        return { refused: 'already-signed-up' as const }
      }
      const free = takenIn(seats).size < seats.capacity
      if (!free && whenFull === 'refuse') return { refused: 'full' as const }
      if (free) guard(tx, seats, workshopId, conferenceId, { took: [_id] })
      else seats.waitlisted = true
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
        ...(earlyAccessTicketType && { earlyAccessTicketType }),
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
  /** The revision checked: the write is made on it, or not at all. */
  _rev: string
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
 * A confirm that would take the workshop past capacity, refused before
 * anything is written (#1358): `seatsTaken` now, and `after` what the confirm
 * would make it.
 */
export interface Full extends FullSeats {
  refused: 'full'
  /** Of the sign-ups asked for, those confirmed already: they take no seat. */
  confirmed: string[]
  /**
   * Of the sign-ups asked for, those waiting now (from the document store):
   * the ones to send again with the overshoot accepted. One gone, or of
   * another workshop, is not among them.
   */
  waiting: string[]
}

/**
 * The organizer's confirm, of sign-ups of ONE workshop. It takes its seats
 * through the guard, so `seatsTaken` is what is stored when it commits, and a
 * sign-up reading at the same moment cannot take the seat it took.
 *
 * PAST CAPACITY IS A CHOICE MADE ON THE TRUE COUNT (#1358). A confirm that
 * would go past capacity is refused as `full` unless `acceptPast`, how many
 * seats past capacity the organizer agreed to (what the question showed),
 * covers how far it would go. The decision is made inside the guard: a seat
 * taken, or a capacity lowered, between the refusal and the override makes
 * the override stale, and it is refused again with the new numbers. A batch
 * that only partly fits is refused as a whole. A sign-up confirmed already
 * takes no seat, so it is never refused, whatever the count.
 *
 * `confirmed` names the sign-ups that are confirmed now; one that is gone, or
 * of another workshop, is not in it. `newlyConfirmed` names those this write
 * took a seat for; one that was confirmed already is not in it.
 */
export async function confirmSignups(
  workshopId: string,
  conferenceId: string,
  signupIds: string[],
  { acceptPast }: { acceptPast?: number } = {},
): Promise<Confirmed | Full | { refused: 'not-found' | 'busy' }> {
  const outcome = await decideAndCommit<Full, Confirmed>(
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
      const after = new Set([...taken, ...waiting.map((s) => s._id)]).size
      if (
        waiting.length > 0 &&
        after > seats.capacity &&
        (acceptPast === undefined || after - seats.capacity > acceptPast)
      ) {
        return {
          refused: 'full' as const,
          confirmed: wanted
            .filter((s) => s.status === 'confirmed')
            .map((s) => s._id),
          waiting: waitingNow.map((s) => s._id),
          seatsTaken: taken.size,
          capacity: seats.capacity,
          after,
        }
      }
      if (waitingNow.length > 0) {
        guard(tx, seats, workshopId, conferenceId, {
          took: waitingNow.map((s) => s._id),
        })
        const confirmedAt = new Date().toISOString()
        for (const { _id, _rev } of waitingNow) {
          tx.patch(_id, {
            ifRevisionID: _rev,
            set: { status: 'confirmed', confirmedAt },
            // A promotion email still owed from before (moved back outside
            // the app, so `freeSeat` never settled it) is owed no more when
            // this confirm reports the sign-up newly confirmed: the confirm
            // then tells the person, or chose not to. One the guard still
            // remembers is reported as nothing new, and told nothing by the
            // confirm, so its email stays owed to the outbox (#1357).
            ...(remembered.has(_id) ? {} : { unset: ['promotionEmailDue'] }),
          })
        }
      }
      return {
        done: {
          confirmed: wanted.map((s) => s._id),
          newlyConfirmed: waiting.map((s) => s._id),
          seatsTaken: after,
          capacity: seats.capacity,
        },
      }
    },
  )
  return 'refused' in outcome ? outcome : outcome.done
}

/**
 * Sets the capacity, and confirms the longest-waiting sign-ups into the seats
 * that are then free, in the same write, only while the talk is a confirmed
 * workshop: as it is read on each try, with the status and format of an
 * `edit` that changes them too in its place.
 * Refused below the seats taken. `promoted` names the sign-ups it confirmed,
 * longest-waiting first.
 */
export async function changeCapacity(
  workshopId: string,
  conferenceId: string,
  capacity: number,
  { edit = {} }: { edit?: { status?: string; format?: string } } = {},
): Promise<
  | { promoted: string[] }
  | { refused: 'below-seats-taken'; seatsTaken: number }
  | { refused: 'not-found' | 'busy' }
> {
  const outcome = await decideAndCommit<
    { refused: 'below-seats-taken'; seatsTaken: number },
    string[]
  >(workshopId, conferenceId, async (seats, tx) => {
    // Only a workshop that is on, as this try reads it and as the edit
    // leaves it, gives its waiting sign-ups seats.
    const promoting =
      (edit.status ?? seats.status) === Status.confirmed &&
      isWorkshopFormat((edit.format ?? seats.format) as Format)
    const taken = takenIn(seats)
    const seatsTaken = taken.size
    if (capacity < seatsTaken) {
      return { refused: 'below-seats-taken' as const, seatsTaken }
    }
    const since = (s: CurrentSignup) =>
      new Date(s.signedUpAt || s._createdAt).getTime()
    const waitlisted = promoting
      ? seats.signups.filter(
          (s) => s.status === 'waitlist' && !taken.has(s._id),
        )
      : []
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
    })
    // On the revision read: a talk withdrawn or changed meanwhile has the
    // decision made again.
    tx.patch(workshopId, { ifRevisionID: seats.talkRev, set: { capacity } })
    // As the write leaves it, for the capacity notice.
    seats.capacity = capacity
    const confirmedAt = new Date().toISOString()
    for (const { _id, _rev } of promoted) {
      // The debt of a promotion email is stored WITH the promotion (#1357):
      // a reply lost after this write still leaves it for the sender
      // (`./promoted.ts`) to find, and a retry that finds nobody newly
      // promoted has not lost it.
      tx.patch(_id, {
        ifRevisionID: _rev,
        set: { status: 'confirmed', confirmedAt, promotionEmailDue: true },
      })
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
  // A promotion email still owed is owed no more (#1357): the sign-up waits
  // again, and one confirmed by hand later is told so by hand.
  else {
    tx.patch(signupId, {
      set: { status: 'waitlist' },
      unset: ['promotionEmailDue'],
    })
  }
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
