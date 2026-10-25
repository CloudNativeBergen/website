import { getWorkshops } from '@/lib/proposal/data/sanity'
import type { Conference } from '@/lib/conference/types'
import { sendWorkshopCanceledEmail } from '@/lib/email/workshop'
import {
  deleteWorkshopSignup,
  getCanceledWorkshopOf,
  getSignupsForHolderJoin,
  getWorkshopSignupsByWorkshop,
} from './sanity'
import { signUpForWorkshop } from './seats'
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
  // ponytail: a person's other sign-ups are matched by email, as the
  // ticket-holder join does; the move itself refuses by account.
  const theirs = (email: string) =>
    everyone
      .filter(
        (s) =>
          s.userEmail === email &&
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
    const ids = theirs(s.userEmail)
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
  failed: string[]
}

/**
 * Move sign-ups of a canceled workshop to a listed one, one at a time through
 * the seats guard: a seat while one is free, the waitlist after. The new
 * sign-up is written first and the old one deleted after it, so a failure
 * never loses the person. Each one moved is emailed.
 */
export async function moveSignups({
  conferenceId,
  conference,
  sourceTitle,
  target,
  signups,
}: {
  conferenceId: string
  conference?: Conference
  sourceTitle: string
  target: ProposalWithWorkshopData
  signups: WorkshopSignupExisting[]
}): Promise<MoveResult> {
  const result: MoveResult = {
    confirmed: [],
    waitlisted: [],
    skipped: [],
    failed: [],
  }
  for (const s of signups) {
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
      },
      { whenFull: 'waitlist' },
    ).catch(() => ({ refused: 'error' as const }))
    if ('refused' in outcome) {
      ;(outcome.refused === 'already-signed-up'
        ? result.skipped
        : result.failed
      ).push(s._id)
      continue
    }
    try {
      await deleteWorkshopSignup(s._id)
    } catch {
      // Signed up for the target; the old sign-up is left over.
      result.failed.push(s._id)
      continue
    }
    const status =
      outcome.signup.status === WorkshopSignupStatus.CONFIRMED
        ? 'confirmed'
        : 'waitlist'
    ;(status === 'confirmed' ? result.confirmed : result.waitlisted).push(s._id)
    await sendWorkshopCanceledEmail({
      userEmail: s.userEmail,
      userName: s.userName,
      status: s.status === 'confirmed' ? 'confirmed' : 'waitlist',
      conference,
      workshopTitle: sourceTitle,
      message: '',
      movedTo: { workshopTitle: target.title, status },
    })
  }
  return result
}
