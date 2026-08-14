import { getProposals } from '@/lib/proposal/data/sanity'
import { Status } from '@/lib/proposal/types'
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
        date: proposal.scheduleInfo?.date,
        startTime: proposal.scheduleInfo?.timeSlot?.startTime,
        endTime: proposal.scheduleInfo?.timeSlot?.endTime,
        track: proposal.scheduleInfo?.trackTitle,
      }))
  )
}
