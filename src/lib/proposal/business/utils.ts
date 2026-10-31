import { ProposalExisting } from '../types'
import { reviewStats } from '@/lib/review/summary'
import { Speaker } from '@/lib/speaker/types'

export function calculateAverageRating(proposal: ProposalExisting): number {
  const { count, averageTotal } = reviewStats(
    proposal.reviews,
    proposal.reviewSummary,
  )
  return count > 0 ? (averageTotal / 15) * 5 : 0
}

/** Live reviews plus the folded summary of deleted ones. */
export function reviewCountOf(proposal: ProposalExisting): number {
  return reviewStats(proposal.reviews, proposal.reviewSummary).count
}

export function getProposalSpeakerNames(proposal: ProposalExisting): string {
  const speakers =
    proposal.speakers && Array.isArray(proposal.speakers)
      ? proposal.speakers
          .filter(
            (speaker) =>
              typeof speaker === 'object' && speaker && 'name' in speaker,
          )
          .map((speaker) => speaker as Speaker)
      : []

  return speakers.length > 0
    ? speakers.map((s) => s.name).join(', ')
    : 'Unknown Speaker'
}
