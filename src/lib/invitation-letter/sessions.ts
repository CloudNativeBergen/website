import { getProposals } from '@/lib/proposal/data/sanity'
import { Status } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { ConfirmedSession } from './types'

/**
 * The confirmed sessions one speaker presents AT ONE CONFERENCE.
 *
 * Reuses `getProposals` rather than adding a query: it already carries both the
 * `confirmed` status filter and the official-schedule lookup that resolves a
 * talk to its date, time and track, and it is the same read `/speaker` and the
 * CFP list are built on.
 *
 * TENANCY: both ids are required and both are refused when blank. `getProposals`
 * composes its filter from whichever arguments it is given, so calling it
 * without a conference would return this speaker's talks from EVERY edition —
 * and a letter listing a talk from 2024 as the reason to travel in 2026 is a
 * false statement. The guard here is what makes that unreachable.
 *
 * NEVER THROWS. A read failure returns no sessions, so the letter is issued
 * without the programme block rather than not issued at all: the applicant's
 * visa deadline is real and the block is an enhancement, not the letter.
 */
export async function confirmedSessionsForSpeaker(
  speakerId: string | undefined,
  conferenceId: string | undefined,
): Promise<ConfirmedSession[]> {
  if (!speakerId?.trim() || !conferenceId?.trim()) return []

  const { proposals, proposalsError } = await getProposals({
    speakerId,
    conferenceId,
    statuses: [Status.confirmed],
    includeSchedule: true,
  })

  if (proposalsError) {
    // No applicant details here — this path must stay loggable.
    console.error('[invitationLetter] Confirmed session lookup failed', {
      error: proposalsError.message,
    })
    return []
  }

  return (
    (proposals ?? [])
      // Belt and braces over the GROQ `status in ["confirmed"]`: this is the one
      // assertion in the letter that a speaker has actually agreed to present,
      // and an `accepted` talk leaking through would make the letter untrue.
      .filter((proposal) => proposal.status === Status.confirmed)
      .map((proposal) => ({
        title: proposal.title,
        // GROQ returns `null`, not `undefined`, for an unscheduled talk — the
        // projection resolves against a null schedule. Normalised here so the
        // letter never has to care which flavour of empty it received.
        date: proposal.scheduleInfo?.date ?? undefined,
        startTime: proposal.scheduleInfo?.timeSlot?.startTime ?? undefined,
        endTime: proposal.scheduleInfo?.timeSlot?.endTime ?? undefined,
        track: proposal.scheduleInfo?.trackTitle ?? undefined,
      }))
      .sort(byScheduleOrder)
  )
}

/**
 * Chronological, unscheduled talks last.
 *
 * `getProposals` orders by `_updatedAt desc`, which within a single conference
 * means LAST EDITED FIRST — so a speaker with two talks could get day 2 printed
 * above day 1. A consular officer reads this box as an itinerary, so it has to
 * run forwards. Dates are `YYYY-MM-DD` and times `HH:mm`; both sort correctly
 * as plain strings.
 */
function byScheduleOrder(a: ConfirmedSession, b: ConfirmedSession): number {
  if (!a.date && !b.date) return 0
  if (!a.date) return 1
  if (!b.date) return -1
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return (a.startTime ?? '').localeCompare(b.startTime ?? '')
}

/**
 * Whether to offer the one-click "issue an invitation letter" shortcut for a
 * speaker — i.e. do they have a talk CONFIRMED AT THIS CONFERENCE.
 *
 * Both halves are load-bearing, and the conference half is the subtle one. The
 * speaker admin deliberately loads proposals across every edition in the org,
 * so `proposals.some(p => p.status === confirmed)` is true for someone who
 * spoke in a PREVIOUS year. Following that shortcut seeds `role=speaker`, and
 * the letter then asserts the applicant is a confirmed speaker at THIS
 * conference — with no programme block to contradict it, precisely because the
 * session read IS correctly scoped and comes back empty.
 *
 * This is the only check that exists: the resolver reads sessions but never
 * verifies a confirmed talk, by design — an organizer may legitimately issue a
 * speaker letter by hand for someone the schedule does not know about yet.
 */
export function hasConfirmedTalkAtConference(
  proposals: ProposalExisting[] | undefined,
  conferenceId: string | undefined,
): boolean {
  if (!conferenceId?.trim() || !proposals?.length) return false

  return proposals.some(
    (proposal) =>
      proposal.status === Status.confirmed &&
      proposalConferenceId(proposal) === conferenceId,
  )
}

/** The conference a proposal belongs to, whether expanded or left as a ref. */
function proposalConferenceId(proposal: ProposalExisting): string | null {
  const conference = proposal.conference
  if (typeof conference === 'string') return conference
  if (conference && typeof conference === 'object') {
    if ('_id' in conference && typeof conference._id === 'string') {
      return conference._id
    }
    if ('_ref' in conference && typeof conference._ref === 'string') {
      return conference._ref
    }
  }
  return null
}
