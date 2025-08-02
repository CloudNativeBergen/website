import { ProposalExisting } from '@/lib/proposal/types'

export function isFromDifferentConference(
  proposal: ProposalExisting,
  currentConferenceId: string,
): boolean {
  return (
    typeof proposal.conference === 'object' &&
    proposal.conference !== null &&
    '_id' in proposal.conference &&
    proposal.conference._id !== currentConferenceId
  )
}

export function isCfpEnded(proposal: ProposalExisting): boolean {
  return Boolean(
    typeof proposal.conference === 'object' &&
      proposal.conference !== null &&
      'cfp_end_date' in proposal.conference &&
      proposal.conference.cfp_end_date &&
      new Date(proposal.conference.cfp_end_date as string) < new Date(),
  )
}

export function isProposalReadOnly(
  proposal: ProposalExisting,
  currentConferenceId: string,
): boolean {
  return (
    isFromDifferentConference(proposal, currentConferenceId) ||
    isCfpEnded(proposal)
  )
}
