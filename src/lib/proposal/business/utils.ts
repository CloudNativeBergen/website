import { ProposalExisting } from '../types'
import { Review } from '@/lib/review/types'
import { Speaker, Flags } from '@/lib/speaker/types'

/**
 * Calculate average rating from proposal reviews
 */
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

  const totalPossibleScore = proposal.reviews.length * 15 // 3 scores * 5 max each
  return totalPossibleScore > 0 ? (totalScores / totalPossibleScore) * 5 : 0
}

/**
 * Extract speaker names from proposal
 */
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

/**
 * Check if proposal requires travel funding
 */
export function requiresTravelFunding(proposal: ProposalExisting): boolean {
  if (!proposal.speakers || !Array.isArray(proposal.speakers)) {
    return false
  }

  return proposal.speakers.some((speaker) => {
    if (typeof speaker === 'object' && speaker && 'flags' in speaker) {
      const speakerObj = speaker as Speaker
      return speakerObj.flags?.includes(Flags.requiresTravelFunding)
    }
    return false
  })
}

/**
 * Get proposal summary for listings
 */
export function getProposalSummary(proposal: ProposalExisting) {
  return {
    id: proposal._id,
    title: proposal.title,
    status: proposal.status,
    speakerNames: getProposalSpeakerNames(proposal),
    averageRating: calculateAverageRating(proposal),
    reviewCount: proposal.reviews?.length || 0,
    requiresTravelFunding: requiresTravelFunding(proposal),
    format: proposal.format,
    level: proposal.level,
    language: proposal.language,
    audiences: proposal.audiences || [],
    createdAt: proposal._createdAt,
    updatedAt: proposal._updatedAt,
  }
}

/**
 * Group proposals by status
 */
export function groupProposalsByStatus(proposals: ProposalExisting[]) {
  return proposals.reduce(
    (groups, proposal) => {
      const status = proposal.status
      if (!groups[status]) {
        groups[status] = []
      }
      groups[status].push(proposal)
      return groups
    },
    {} as Record<string, ProposalExisting[]>,
  )
}

/**
 * Sort proposals by multiple criteria
 */
export function sortProposals(
  proposals: ProposalExisting[],
  sortBy: 'title' | 'status' | 'created' | 'speaker' | 'rating',
  sortOrder: 'asc' | 'desc' = 'desc',
): ProposalExisting[] {
  return [...proposals].sort((a, b) => {
    let aValue: string | number
    let bValue: string | number

    switch (sortBy) {
      case 'title':
        aValue = a.title.toLowerCase()
        bValue = b.title.toLowerCase()
        break
      case 'status':
        aValue = a.status
        bValue = b.status
        break
      case 'speaker':
        aValue = getProposalSpeakerNames(a).toLowerCase()
        bValue = getProposalSpeakerNames(b).toLowerCase()
        break
      case 'rating':
        aValue = calculateAverageRating(a)
        bValue = calculateAverageRating(b)
        break
      case 'created':
      default:
        aValue = new Date(a._createdAt).getTime()
        bValue = new Date(b._createdAt).getTime()
        break
    }

    if (sortOrder === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
    }
  })
}
