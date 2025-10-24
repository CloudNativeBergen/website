import { ProposalExisting } from '../types'
import { Review } from '@/lib/review/types'
import { Speaker } from '@/lib/speaker/types'

export function calculateAverageRating(proposal: ProposalExisting): number {
  if (!proposal.reviews || proposal.reviews.length === 0) {
    return 0
  }

  const totalScores = proposal.reviews.reduce((acc, review) => {
    const reviewObj =
      typeof review === 'object' && 'score' in review
        ? (review as Review)
        : null
    if (reviewObj && reviewObj.score) {
      return (
        acc +
        reviewObj.score.content +
        reviewObj.score.relevance +
        reviewObj.score.speaker
      )
    }
    return acc
  }, 0)

  const totalPossibleScore = proposal.reviews.length * 15
  return totalPossibleScore > 0 ? (totalScores / totalPossibleScore) * 5 : 0
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
