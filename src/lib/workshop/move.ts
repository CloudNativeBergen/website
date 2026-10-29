import { getWorkshops } from '@/lib/proposal/data/sanity'
import type { Conference } from '@/lib/conference/types'
import { sendWorkshopCanceledEmail } from '@/lib/email/workshop'
import {
  deleteWorkshopSignup,
  getCanceledWorkshopOf,
  getSignupsForHolderJoin,
  getWorkshopSignupsByWorkshop,
} from './sanity'
import { current, signUpForWorkshop, signupDocumentId } from './seats'
import { fanOutEmails } from './announcements'
import { checkWorkshopTimeConflict } from './utils'
import {
  WorkshopSignupStatus,
  type ProposalWithWorkshopData,
  type WorkshopSignupExisting,
} from './types'

export interface MoveCandidate {
  signupId: string
  userName: string
  userEmail: string
  status: 'confirmed' | 'waitlist'
  /** Already signed up for the target: skipped by the move. */
  inTarget: boolean
  /** The title of another workshop of theirs at the same time as the target. */
  conflict: string | null
}

/**
 * What moving the sign-ups of a canceled workshop to a listed one would do:
 * both workshops checked in the conference, and each person's standing in the
 * target. `null` source or target: refused.
 */
export async function readMove(
  conferenceId: string,
  fromWorkshopId: string,
  toWorkshopId: string,
) {
  const source = await getCanceledWorkshopOf(fromWorkshopId, conferenceId)
  if (!source) return { refused: 'source' as const }
  // Listed and of this conference, with the schedule the conflicts need.
  const { workshops, workshopsError } = await getWorkshops({
    conferenceId,
    includeScheduleInfo: true,
  })
  if (workshopsError) throw workshopsError
  const listed = workshops as ProposalWithWorkshopData[]
  const target = listed.find((w) => w._id === toWorkshopId)
  if (!target) return { refused: 'target' as const }

  const [signups, everyone] = await Promise.all([
    getWorkshopSignupsByWorkshop(source._id, conferenceId),
    getSignupsForHolderJoin(conferenceId),
  ])
  // The person by account, as the move refuses by it; by email for a
  // sign-up stored without one.
  const who = (s: {
    userWorkOSId?: string | null
    userEmail?: string | null
  }) => s.userWorkOSId ?? s.userEmail
  const theirs = (signup: WorkshopSignupExisting) =>
    everyone
      .filter(
        (s) =>
          who(s) === who(signup) &&
          (s.status === 'confirmed' || s.status === 'waitlist'),
      )
      .map((s) => s.workshop?._id)

  const moving = signups
    .filter(
      (s) =>
        s.status === WorkshopSignupStatus.CONFIRMED ||
        s.status === WorkshopSignupStatus.WAITLIST,
    )
    // Seats go first to those who had one, then to the waitlist in order.
    .sort(
      (a, b) =>
        Number(a.status !== 'confirmed') - Number(b.status !== 'confirmed') ||
        (a.signedUpAt ?? a._createdAt).localeCompare(
          b.signedUpAt ?? b._createdAt,
        ),
    )

  const candidates = moving.map((s): MoveCandidate => {
    const ids = theirs(s)
    return {
      signupId: s._id,
      userName: s.userName,
      userEmail: s.userEmail,
      status: s.status as 'confirmed' | 'waitlist',
      inTarget: ids.includes(target._id),
      conflict:
        checkWorkshopTimeConflict(
          target,
          listed.filter((w) => ids.includes(w._id)),
        ).conflictingWorkshop?.title ?? null,
    }
  })

  return {
    source,
    target,
    seatsFree: Math.max(0, target.capacity - (target.signups ?? 0)),
    signups: moving,
    candidates,
  }
}

export interface MoveResult {
  confirmed: string[]
  waitlisted: string[]
  /** Already signed up for the target. Their old sign-up is left. */
  skipped: string[]
  /** Deleted or moved since the dialog read them: nothing done, no email. */
  gone: string[]
  failed: string[]
  /** Moved, but the email to them did not go out. */
  emailFailed: string[]
}

/**
 * Move sign-ups of a canceled workshop to a listed one, one at a time through
 * the seats guard: a seat while one is free, the waitlist after. The new
 * sign-up is written first and the old one deleted after it, so a failure
 * never loses the person, and a retry finds the sign-up its first try wrote
 * (`movedFromSignup`) and finishes. Everyone moved is emailed at the end.
 */
export async function moveSignups({
  conferenceId,
  conference,
  source,
  target,
  signups,
}: {
  conferenceId: string
  conference?: Conference
  source: { _id: string; title?: string }
  target: ProposalWithWorkshopData
  signups: WorkshopSignupExisting[]
}): Promise<MoveResult> {
  const result: MoveResult = {
    confirmed: [],
    waitlisted: [],
    skipped: [],
    gone: [],
    failed: [],
    emailFailed: [],
  }
  const moved: {
    signup: WorkshopSignupExisting
    status: 'confirmed' | 'waitlist'
  }[] = []

  for (const s of signups) {
    // From the store, not the dialog's read: one deleted or moved since is
    // left alone.
    const [now] = await current([s._id], source._id, conferenceId)
    if (!now) {
      result.gone.push(s._id)
      continue
    }
    const outcome = await signUpForWorkshop(
      {
        userWorkOSId: s.userWorkOSId,
        userEmail: s.userEmail,
        userName: s.userName,
        experienceLevel: s.experienceLevel,
        operatingSystem: s.operatingSystem,
        notes: s.notes,
        workshopId: target._id,
        conferenceId,
        movedFromSignup: s._id,
      },
      { whenFull: 'waitlist' },
    ).catch((error: unknown) => {
      console.error('[workshop-move] sign-up failed', s._id, error)
      return { refused: 'error' as const }
    })
    let status: 'confirmed' | 'waitlist'
    if ('refused' in outcome) {
      if (outcome.refused !== 'already-signed-up') {
        result.failed.push(s._id)
        continue
      }
      // Signed up already: by an earlier try of this move, whose delete
      // failed, it is finished now; by the person themselves, skipped.
      const [theirs] = await current(
        [signupDocumentId(conferenceId, target._id, s.userWorkOSId)],
        target._id,
        conferenceId,
      )
      if (theirs?.movedFromSignup !== s._id) {
        result.skipped.push(s._id)
        continue
      }
      status = theirs.status
    } else {
      status =
        outcome.signup.status === WorkshopSignupStatus.CONFIRMED
          ? 'confirmed'
          : 'waitlist'
    }
    try {
      await deleteWorkshopSignup(s._id)
    } catch (error) {
      // In the target; the old sign-up is left over until a retry.
      console.error('[workshop-move] old sign-up not deleted', s._id, error)
      result.failed.push(s._id)
      continue
    }
    ;(status === 'confirmed' ? result.confirmed : result.waitlisted).push(s._id)
    moved.push({ signup: s, status })
  }

  await fanOutEmails(moved, async ({ signup, status }) => {
    const sent = await sendWorkshopCanceledEmail({
      userEmail: signup.userEmail,
      userName: signup.userName,
      status: signup.status === 'confirmed' ? 'confirmed' : 'waitlist',
      conference,
      workshopTitle: source.title ?? '',
      message: '',
      movedTo: { workshopTitle: target.title, status },
    })
    if (sent.error) result.emailFailed.push(signup._id)
    return sent
  })
  if (result.emailFailed.length > 0) {
    console.error('[workshop-move] emails not sent', result.emailFailed)
  }
  return result
}
