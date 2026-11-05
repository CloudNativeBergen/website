import { Status } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'

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
export function proposalConferenceId(
  proposal: ProposalExisting,
): string | null {
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
