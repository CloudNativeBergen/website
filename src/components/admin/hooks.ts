'use client'

import { useMemo, useState } from 'react'
import { ProposalExisting, Status, Format, Level, Language, Audience } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Review } from '@/lib/review/types'
import { FilterState } from './ProposalsFilter'

/**
 * Calculate the average rating for a proposal based on its reviews
 */
export function calculateAverageRating(proposal: ProposalExisting): number {
  if (!proposal.reviews || proposal.reviews.length === 0) {
    return 0
  }

  const totalScores = proposal.reviews.reduce((acc, review) => {
    const reviewObj = typeof review === 'object' && 'score' in review ? review as Review : null
    if (reviewObj && reviewObj.score) {
      return acc + reviewObj.score.content + reviewObj.score.relevance + reviewObj.score.speaker
    }
    return acc
  }, 0)

  const totalPossibleScore = proposal.reviews.length * 15 // 3 scores * 5 max each
  return totalPossibleScore > 0 ? (totalScores / totalPossibleScore) * 5 : 0
}

/**
 * Custom hook for filtering and sorting proposals
 * Separates business logic from UI components
 */
export function useProposalFiltering(proposals: ProposalExisting[], filters: FilterState) {
  return useMemo(() => {
    const filtered = proposals.filter(proposal => {
      // Filter by status
      if (filters.status.length > 0 && !filters.status.includes(proposal.status)) {
        return false
      }

      // Filter by format
      if (filters.format.length > 0 && !filters.format.includes(proposal.format)) {
        return false
      }

      // Filter by level
      if (filters.level.length > 0 && !filters.level.includes(proposal.level)) {
        return false
      }

      // Filter by language
      if (filters.language.length > 0 && !filters.language.includes(proposal.language)) {
        return false
      }

      // Filter by audience
      if (filters.audience.length > 0) {
        const hasMatchingAudience = proposal.audiences?.some(aud => filters.audience.includes(aud))
        if (!hasMatchingAudience) {
          return false
        }
      }

      return true
    })

    // Sort proposals
    filtered.sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (filters.sortBy) {
        case 'title':
          aValue = a.title.toLowerCase()
          bValue = b.title.toLowerCase()
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        case 'speaker':
          aValue = (typeof a.speaker === 'object' && a.speaker && 'name' in a.speaker ? (a.speaker as Speaker).name : 'Unknown').toLowerCase()
          bValue = (typeof b.speaker === 'object' && b.speaker && 'name' in b.speaker ? (b.speaker as Speaker).name : 'Unknown').toLowerCase()
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

      if (filters.sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return filtered
  }, [proposals, filters])
}

/**
 * Custom hook for managing filter state
 * Provides actions for updating filters
 */
export function useFilterState(initialFilters: FilterState) {
  const [filters, setFilters] = useState<FilterState>(initialFilters)

  const toggleFilter = (filterType: keyof FilterState, value: Status | Format | Level | Language | Audience) => {
    setFilters(prev => {
      const currentValues = prev[filterType] as (Status | Format | Level | Language | Audience)[]
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value]

      return {
        ...prev,
        [filterType]: newValues
      }
    })
  }

  const setSortBy = (sortBy: FilterState['sortBy']) => {
    setFilters(prev => ({ ...prev, sortBy }))
  }

  const toggleSortOrder = () => {
    setFilters(prev => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc'
    }))
  }

  const clearAllFilters = () => {
    setFilters({
      status: [Status.submitted, Status.accepted, Status.confirmed],
      format: [],
      level: [],
      language: [],
      audience: [],
      sortBy: 'created',
      sortOrder: 'desc'
    })
  }

  // Count active filters, excluding default status filters
  const defaultStatusFilters = [Status.submitted, Status.accepted, Status.confirmed]
  const additionalStatusFilters = filters.status.filter(status => !defaultStatusFilters.includes(status))
  const removedDefaultStatusFilters = defaultStatusFilters.filter(status => !filters.status.includes(status))
  const statusFilterCount = additionalStatusFilters.length + removedDefaultStatusFilters.length

  const activeFilterCount = statusFilterCount + filters.format.length + filters.level.length + filters.language.length + filters.audience.length

  return {
    filters,
    toggleFilter,
    setSortBy,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount
  }
}
