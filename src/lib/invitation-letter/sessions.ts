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

// Client-safe halves live in ./talks so client components avoid the data layer.
export { hasConfirmedTalkAtConference } from './talks'
