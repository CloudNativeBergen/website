import { ProposalExisting } from './types'
import { SpeakerWithReviewInfo } from '@/lib/speaker/types'
import { Reference } from 'sanity'

export function extractSpeakersFromProposal(
  proposal: ProposalExisting,
): SpeakerWithReviewInfo[] {
  if (!proposal.speakers || !Array.isArray(proposal.speakers)) {
    return []
  }

  return proposal.speakers.filter(
    (speaker): speaker is SpeakerWithReviewInfo =>
      speaker !== null &&
      typeof speaker === 'object' &&
      'name' in speaker &&
      '_id' in speaker,
  )
}

export function extractSpeakerIds(
  speakers?: Array<string | Reference | { _id: string }>,
): string[] {
  if (!speakers) return []

  return speakers
    .map((s) => {
      if (typeof s === 'string') return s
      if (s && typeof s === 'object' && '_ref' in s)
        return (s as Reference)._ref
      if (s && typeof s === 'object' && '_id' in s)
        return (s as { _id: string })._id
      return null
    })
    .filter((id): id is string => Boolean(id))
}

export function calculateReviewScore(
  reviews: Array<{
    score?: { content?: number; relevance?: number; speaker?: number }
  }>,
  scoreType: 'content' | 'relevance' | 'speaker',
): number {
  if (!reviews || reviews.length === 0) return 0

  const total = reviews.reduce((acc, review) => {
    if (typeof review === 'object' && 'score' in review && review.score) {
      return acc + (review.score[scoreType] || 0)
    }
    return acc
  }, 0)

  return total / reviews.length
}
