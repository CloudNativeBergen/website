import {
  ProposalExisting,
  Status,
  ReviewStatus,
  Language,
  Level,
  Audience,
  Format,
} from '@/lib/proposal/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import { Review } from '@/lib/review/types'
import { calculateAverageRating } from '@/lib/proposal'

export interface ProposalFilters {
  status?: Status[]
  format?: Format[]
  level?: Level[]
  language?: Language[]
  audience?: Audience[]
  speakerFlags?: Flags[]
  reviewStatus?: ReviewStatus
  hideMultipleTalks?: boolean
  searchQuery?: string
  sortBy?: 'title' | 'status' | 'created' | 'speaker' | 'rating'
  sortOrder?: 'asc' | 'desc'
}

export function filterProposals(
  proposals: ProposalExisting[],
  filters: ProposalFilters,
  currentUserId?: string,
): ProposalExisting[] {
  const speakersWithAcceptedTalks = new Set<string>()

  if (filters.hideMultipleTalks) {
    proposals.forEach((proposal) => {
      if (
        proposal.status === Status.accepted ||
        proposal.status === Status.confirmed
      ) {
        if (proposal.speakers && Array.isArray(proposal.speakers)) {
          proposal.speakers.forEach((speaker) => {
            if (typeof speaker === 'object' && 'name' in speaker) {
              speakersWithAcceptedTalks.add(speaker.name)
            } else if (typeof speaker === 'string') {
              speakersWithAcceptedTalks.add(speaker)
            }
          })
        }
      }
    })
  }

  const filtered = proposals.filter((proposal) => {
    if (filters.hideMultipleTalks && proposal.status === Status.submitted) {
      if (proposal.speakers && Array.isArray(proposal.speakers)) {
        const hasSpeakerWithAcceptedTalk = proposal.speakers.some((speaker) => {
          const speakerName =
            typeof speaker === 'object' && 'name' in speaker
              ? speaker.name
              : speaker
          return (
            typeof speakerName === 'string' &&
            speakersWithAcceptedTalks.has(speakerName)
          )
        })
        if (hasSpeakerWithAcceptedTalk) {
          return false
        }
      }
    }

    if (
      filters.status &&
      filters.status.length > 0 &&
      !filters.status.includes(proposal.status)
    ) {
      return false
    }

    if (
      filters.format &&
      filters.format.length > 0 &&
      !filters.format.includes(proposal.format)
    ) {
      return false
    }

    if (
      filters.level &&
      filters.level.length > 0 &&
      !filters.level.includes(proposal.level)
    ) {
      return false
    }

    if (
      filters.language &&
      filters.language.length > 0 &&
      !filters.language.includes(proposal.language)
    ) {
      return false
    }

    if (filters.audience && filters.audience.length > 0) {
      const hasMatchingAudience = proposal.audiences?.some((aud) =>
        filters.audience?.includes(aud),
      )
      if (!hasMatchingAudience) {
        return false
      }
    }

    if (filters.speakerFlags && filters.speakerFlags.length > 0) {
      const hasMatchingSpeakerFlag = proposal.speakers?.some((speaker) => {
        if (typeof speaker === 'object' && 'flags' in speaker) {
          const speakerObj = speaker as Speaker
          return speakerObj.flags?.some((flag) =>
            filters.speakerFlags?.includes(flag),
          )
        }
        return false
      })
      if (!hasMatchingSpeakerFlag) {
        return false
      }
    }

    if (
      currentUserId &&
      filters.reviewStatus &&
      filters.reviewStatus !== ReviewStatus.all
    ) {
      const hasUserReview = proposal.reviews?.some((review) => {
        const reviewObj =
          typeof review === 'object' && 'reviewer' in review
            ? (review as Review)
            : null
        if (!reviewObj) return false

        const reviewerId =
          typeof reviewObj.reviewer === 'object' && '_id' in reviewObj.reviewer
            ? reviewObj.reviewer._id
            : typeof reviewObj.reviewer === 'string'
              ? reviewObj.reviewer
              : null

        return reviewerId === currentUserId
      })

      if (filters.reviewStatus === ReviewStatus.reviewed && !hasUserReview) {
        return false
      }
      if (filters.reviewStatus === ReviewStatus.unreviewed && hasUserReview) {
        return false
      }
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      const matchesSearch =
        proposal.title.toLowerCase().includes(query) ||
        proposal.speakers?.some((speaker) => {
          if (typeof speaker === 'object' && 'name' in speaker) {
            return speaker.name.toLowerCase().includes(query)
          }
          return false
        })
      if (!matchesSearch) {
        return false
      }
    }

    return true
  })

  const sortBy = filters.sortBy || 'created'
  const sortOrder = filters.sortOrder || 'desc'

  filtered.sort((a, b) => {
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
        aValue = (
          a.speakers &&
          a.speakers.length > 0 &&
          typeof a.speakers[0] === 'object' &&
          a.speakers[0] &&
          'name' in a.speakers[0]
            ? (a.speakers[0] as Speaker).name
            : 'Unknown'
        ).toLowerCase()
        bValue = (
          b.speakers &&
          b.speakers.length > 0 &&
          typeof b.speakers[0] === 'object' &&
          b.speakers[0] &&
          'name' in b.speakers[0]
            ? (b.speakers[0] as Speaker).name
            : 'Unknown'
        ).toLowerCase()
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

  return filtered
}
