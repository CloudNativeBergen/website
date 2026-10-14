/**
 * The promotion emails (#1357): told to each sign-up that a capacity change
 * confirmed from the waitlist (#1344) that it has a seat.
 *
 * THE DEBT IS STORED. `changeCapacity` (`./seats.ts`) sets
 * `promotionEmailDue: true` on each sign-up it promotes, in the write that
 * promotes it. So the list of who to email is in the dataset, not only in the
 * reply to that write: a reply lost after the write landed leaves the debt for
 * the next run (the caller's own, or the hourly cron
 * `/api/cron/workshop-promotion-emails`) to pay.
 *
 * PAID AT MOST ONCE. A run CLAIMS a sign-up before it emails it: a patch
 * `ifRevisionID` the revision it read, unsetting `promotionEmailDue` and
 * setting `promotionEmailClaim` to a token of its own. Two runs over the same
 * sign-up (the inline send and the cron, racing) cannot both claim it: Sanity
 * refuses the second (a 409), which then leaves it alone. A claim whose own
 * reply is lost is read back: it is this run's only if the token stored is
 * this run's.
 *
 * READ FROM THE DOCUMENT STORE. Who owes, and whether it is still confirmed,
 * is asked of the doc endpoint (`getDocuments`), never of a query that may
 * lag behind the write that promoted (or moved back) a moment ago.
 *
 * NOTHING HERE FAILS THE CAPACITY CHANGE: it is already written. An email,
 * or the read it needs, that fails is logged with the sign-up ids so the
 * emails can be sent by hand; a read that fails BEFORE anything is claimed
 * leaves the debt for the next run.
 */
import { randomUUID } from 'node:crypto'
import { EMAIL_CONFIG, delay } from '@/lib/email/config'
import {
  sendBasicWorkshopConfirmation,
  type WorkshopEmailConference,
} from '@/lib/email/workshop'
import { Format, Status, isWorkshopFormat } from '@/lib/proposal/types'
import { clientWrite } from '@/lib/sanity/client'

interface DueSignup {
  _id: string
  _type: string
  _rev: string
  userEmail: string
  userName: string
  status?: string
  promotionEmailDue?: boolean
  promotionEmailClaim?: string
  workshop?: { _ref: string }
  conference?: { _ref: string }
}

/** The conference and the workshops, as the document store has them. */
type StoredConference = WorkshopEmailConference & { _type: 'conference' }
/** A talk stores no date or time of its own (the schedule does): title only. */
interface StoredWorkshop {
  _type: 'talk'
  title?: string
  status?: string
  format?: string
  conference?: { _ref: string }
}

/** The workshop formats, from the one rule (`isWorkshopFormat`). */
const WORKSHOP_FORMATS = Object.values(Format).filter(isWorkshopFormat)

/**
 * The rule `changeCapacity` promotes by, and this conference's to tell: only
 * a workshop that is on, and still of this conference, is told of. One
 * withdrawn, made another format, or moved to another conference since the
 * promotion (the status-only admin path clears no flag) is SKIPPED, its
 * debts left owed: put back on, they are paid then. The sweep leaves such
 * sign-ups out of its window with the same rule (`deliverDuePromotionEmails`).
 */
const stillOn = (workshop: StoredWorkshop | undefined, conferenceId: string) =>
  workshop?.status === Status.confirmed &&
  isWorkshopFormat(workshop.format as Format) &&
  workshop.conference?._ref === conferenceId

/**
 * How many of a promotion's emails the request that made it sends itself
 * (#1357): at 500 ms apart, 20 is ten seconds of a request that has already
 * written the capacity, well under the function's 300 s. The rest stay owed,
 * and the hourly cron pays them: a promotion of hundreds hears within the
 * hour, not within the request.
 */
const INLINE_LIMIT = 20

/**
 * The pace of one run's sends, carried across however many conferences it
 * serves: a pause before every send but the run's first (Resend allows about
 * two requests a second).
 */
export interface Pacing {
  sends: number
}
export const startPacing = (): Pacing => ({ sends: 0 })

const notSent = (ids: string[], why: unknown) =>
  console.error(
    '[workshop] promotion emails not sent, promoted sign-ups:',
    ids,
    why,
  )

/**
 * Emails, once, each of `signupIds` of `conferenceId` that still owes a
 * promotion email and is still confirmed, in the name of that conference.
 * Settles the debt of one that owes but is no longer confirmed (moved back
 * outside the app) without an email. Never throws.
 */
export async function deliverPromotionEmails(
  conferenceId: string,
  signupIds: string[],
  {
    limit = INLINE_LIMIT,
    pacing = startPacing(),
  }: {
    /** At most this many claimed and sent; the rest stay owed. */
    limit?: number
    /** The run's pace so far, when this call is one of several. */
    pacing?: Pacing
  } = {},
): Promise<{ emailed: string[] }> {
  const emailed: string[] = []
  if (signupIds.length === 0) return { emailed }
  try {
    // Only the prefix is read: nothing past the bound is claimed, or touched.
    const prefix = signupIds.slice(0, Math.max(0, Math.floor(limit)))
    if (prefix.length === 0) return { emailed }
    const due = (await clientWrite.getDocuments<DueSignup>(prefix)).filter(
      (d): d is NonNullable<typeof d> =>
        d !== null &&
        d._type === 'workshopSignup' &&
        d.conference?._ref === conferenceId &&
        d.promotionEmailDue === true,
    )
    if (due.length === 0) return { emailed }

    // The conference, BEFORE anything is claimed: a read that fails here
    // costs nothing, the debt stays for the next run. In the conference's
    // own name or not at all: a cron has no request domain, so it is read by
    // the id the sign-up names. (The workshop is read per sign-up, below.)
    const conference =
      await clientWrite.getDocument<StoredConference>(conferenceId)
    if (conference?._type !== 'conference') {
      notSent(
        due.map((d) => d._id),
        new Error(`conference ${conferenceId} could not be read`),
      )
      return { emailed }
    }
    // ONE AT A TIME, a pause apart: Resend allows about two requests a
    // second, and a burst sent at once fails past its retries, after its
    // claim. Each sign-up is claimed right before its own send, so a run
    // that stops (a timeout) leaves the ones after it owed, not claimed.
    const failed: { id: string; why: unknown }[] = []
    for (const candidate of due) {
      // The talk as it is NOW, from the doc endpoint, right before the
      // claim: a run sends for up to a minute, and a withdrawal in that
      // minute must not be told of. One read per send. What is left is the
      // moment between this read and the claim. A read that fails is not
      // the snapshot: the sign-up is skipped, unclaimed, for a later run.
      const workshop = candidate.workshop
        ? await freshWorkshop(candidate.workshop._ref)
        : undefined
      if (workshop === 'unread' || !stillOn(workshop, conferenceId)) continue
      // The pause comes BEFORE the claim: a run killed while pausing has
      // claimed nothing, and the email stays owed.
      if (pacing.sends > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
      const signup = await claim(candidate)
      // Owed, but no longer confirmed (moved back outside the app): settled
      // by the claim, told nothing.
      if (!signup || signup.status !== 'confirmed') continue
      pacing.sends += 1
      // A send that fails answers with an `error`; it does not throw. Each
      // one is logged with the sign-up it was for.
      const why = await sendBasicWorkshopConfirmation({
        userEmail: signup.userEmail,
        userName: signup.userName,
        status: 'confirmed',
        conference,
        workshopTitle: workshop?.title ?? 'Workshop',
      }).then(
        (result) => result?.error,
        (error: unknown) => error ?? new Error('send rejected'),
      )
      if (why !== undefined) failed.push({ id: signup._id, why })
      else emailed.push(signup._id)
    }
    if (failed.length > 0) {
      notSent(
        failed.map((f) => f.id),
        failed.map((f) => f.why),
      )
    }
  } catch (error) {
    notSent(signupIds, error)
  }
  return { emailed }
}

/**
 * The talk from the document store, as it is now: `undefined` when there is
 * no such talk, `'unread'` when the read failed (which is not a talk that is
 * off, and not a reason to trust an older read).
 */
async function freshWorkshop(
  id: string,
): Promise<StoredWorkshop | undefined | 'unread'> {
  try {
    const now = await clientWrite.getDocument<StoredWorkshop>(id)
    return now?._type === 'talk' ? now : undefined
  } catch {
    return 'unread'
  }
}

/**
 * Takes the debt of `signup` for this run: on the revision read, so a run
 * that got there first (or a free, or a cancel) makes this one leave it be.
 * `null` when it is not this run's.
 */
async function claim(signup: DueSignup): Promise<DueSignup | null> {
  const token = randomUUID()
  try {
    await clientWrite
      .patch(signup._id)
      .ifRevisionId(signup._rev)
      .unset(['promotionEmailDue'])
      .set({ promotionEmailClaim: token })
      .commit()
    return signup
  } catch (error) {
    // Refused on the revision (another run's claim, a free) or gone (a
    // cancel): someone else's, or nobody's, now.
    const status = (error as { statusCode?: unknown } | null)?.statusCode
    if (status === 409 || status === 404) return null
    // Anything else, the reply lost among them: the claim may have landed.
    // It is this run's only if the token stored is this run's; and then the
    // sign-up AS IT IS NOW is what is emailed (or not: a free that landed
    // after the claim has moved it back, and the token on it says it is
    // nobody else's to tell).
    try {
      const now = await clientWrite.getDocument<DueSignup>(signup._id)
      return now?.promotionEmailClaim === token ? now : null
    } catch (readError) {
      // Whether the claim landed cannot be known: if it did, nothing will
      // find this sign-up again. Named, for a hand to check.
      console.error(
        '[workshop] promotion email claim uncertain (reply lost, re-read failed), check by hand:',
        [signup._id],
        { claim: error, read: readError },
      )
      return null
    }
  }
}

/**
 * How many owed emails one run of the backstop pays, at most: like the other
 * crons, bounded so one run stays well within a function's time, and a
 * burst (a capacity raised by hundreds) is paid over a few hours instead of
 * timing out and paying nothing.
 */
const BACKSTOP_LIMIT = 100

/**
 * The hourly backstop: pays the promotion emails still owed anywhere, the
 * longest-owed first (by `confirmedAt`, set in the write that promoted and
 * owed: a later edit of the sign-up moves `_updatedAt`, not its place in
 * line), up to `limit`, each in the name of the sign-up's own
 * conference. Finds them with a query (one that may lag can only find a debt
 * late, never pay one twice: the claim decides). Throws only if the query
 * itself fails; the sends never do.
 */
export async function deliverDuePromotionEmails({
  limit = BACKSTOP_LIMIT,
}: { limit?: number } = {}): Promise<{
  found: number
  emailed: number
  conferences: number
}> {
  const take = Math.max(1, Math.floor(limit))
  // groq-global: the backstop sweeps EVERY tenant's sign-ups that still owe
  // a promotion email; each is then emailed by `deliverPromotionEmails`,
  // scoped to, and in the name of, the conference the sign-up itself names.
  // One whose conference is gone (a dangling reference) is left out: the
  // sender could never pay it, and it would hold a place in the window, and
  // be logged, every hour.
  // Only a sign-up whose workshop is on, and of the sign-up's own conference
  // (the rule of `stillOn`): one whose workshop is withdrawn, re-formatted or
  // moved stays owed, but takes no place in the window every hour.
  const query = `*[_type == "workshopSignup" && promotionEmailDue == true && defined(conference->_id) && !(_id in path("drafts.**"))
    && workshop->status == $confirmed && workshop->format in $workshopFormats && workshop->conference._ref == conference._ref]
    | order(confirmedAt asc) [0...${take}]{ _id, "conferenceId": conference._ref }`
  const due = await clientWrite.fetch<
    { _id: string; conferenceId: string | null }[] | null
  >(
    query,
    { confirmed: Status.confirmed, workshopFormats: WORKSHOP_FORMATS },
    { cache: 'no-store' },
  )
  const byConference = new Map<string, string[]>()
  for (const { _id, conferenceId } of due ?? []) {
    if (!conferenceId) continue
    byConference.set(conferenceId, [
      ...(byConference.get(conferenceId) ?? []),
      _id,
    ])
  }
  // One pace for the whole run, across conferences; the window is the bound.
  const pacing = startPacing()
  let emailed = 0
  for (const [conferenceId, ids] of byConference) {
    emailed += (
      await deliverPromotionEmails(conferenceId, ids, {
        limit: ids.length,
        pacing,
      })
    ).emailed.length
  }
  return {
    found: due?.length ?? 0,
    emailed,
    conferences: byConference.size,
  }
}
