'use client'

import { useMemo, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  ProposalExisting,
  Status,
  Format,
  Level,
  Language,
  Audience,
} from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Review } from '@/lib/review/types'
import { FilterState, ReviewStatus } from './ProposalsFilter'

/**
 * Calculate the average rating for a proposal based on its reviews
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
 * Custom hook for filtering and sorting proposals
 * Separates business logic from UI components
 */
export function useProposalFiltering(
  proposals: ProposalExisting[],
  filters: FilterState,
  currentUserId?: string,
) {
  return useMemo(() => {
    const filtered = proposals.filter((proposal) => {
      // Filter by speaker search (includes co-speakers)
      if (filters.speakerSearch && filters.speakerSearch.trim() !== '') {
        const searchLower = filters.speakerSearch.toLowerCase().trim()
        
        // Check primary speaker
        const primarySpeaker = typeof proposal.speaker === 'object' &&
          proposal.speaker &&
          'name' in proposal.speaker
            ? (proposal.speaker as Speaker)
            : null
        
        const primaryMatch = primarySpeaker?.name?.toLowerCase().includes(searchLower)
        
        // Check co-speakers
        const coSpeakerMatch = proposal.coSpeakers?.some((coSpeaker) => {
          const speaker = typeof coSpeaker === 'object' &&
            coSpeaker &&
            'name' in coSpeaker
              ? (coSpeaker as Speaker)
              : null
          return speaker?.name?.toLowerCase().includes(searchLower)
        })
        
        if (!primaryMatch && !coSpeakerMatch) {
          return false
        }
      }

      // Filter by status
      if (
        filters.status.length > 0 &&
        !filters.status.includes(proposal.status)
      ) {
        return false
      }

      // Filter by format
      if (
        filters.format.length > 0 &&
        !filters.format.includes(proposal.format)
      ) {
        return false
      }

      // Filter by level
      if (filters.level.length > 0 && !filters.level.includes(proposal.level)) {
        return false
      }

      // Filter by language
      if (
        filters.language.length > 0 &&
        !filters.language.includes(proposal.language)
      ) {
        return false
      }

      // Filter by audience
      if (filters.audience.length > 0) {
        const hasMatchingAudience = proposal.audiences?.some((aud) =>
          filters.audience.includes(aud),
        )
        if (!hasMatchingAudience) {
          return false
        }
      }

      // Filter by review status (only if currentUserId is provided)
      if (currentUserId && filters.reviewStatus !== ReviewStatus.all) {
        const hasUserReview = proposal.reviews?.some((review) => {
          const reviewObj =
            typeof review === 'object' && 'reviewer' in review
              ? (review as Review)
              : null
          if (!reviewObj) return false

          const reviewerId =
            typeof reviewObj.reviewer === 'object' &&
            '_id' in reviewObj.reviewer
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
          aValue = (
            typeof a.speaker === 'object' && a.speaker && 'name' in a.speaker
              ? (a.speaker as Speaker).name
              : 'Unknown'
          ).toLowerCase()
          bValue = (
            typeof b.speaker === 'object' && b.speaker && 'name' in b.speaker
              ? (b.speaker as Speaker).name
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

      if (filters.sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return filtered
  }, [proposals, filters, currentUserId])
}

/**
 * Custom hook for managing filter state
 * Provides actions for updating filters
 */
export function useFilterState(initialFilters: FilterState) {
  const [filters, setFilters] = useState<FilterState>(initialFilters)

  const toggleFilter = (
    filterType: keyof FilterState,
    value: Status | Format | Level | Language | Audience,
  ) => {
    setFilters((prev) => {
      const currentValues = prev[filterType] as (
        | Status
        | Format
        | Level
        | Language
        | Audience
      )[]
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value]

      return {
        ...prev,
        [filterType]: newValues,
      }
    })
  }

  const setReviewStatus = (reviewStatus: ReviewStatus) => {
    setFilters((prev) => ({ ...prev, reviewStatus }))
  }

  const setSortBy = (sortBy: FilterState['sortBy']) => {
    setFilters((prev) => ({ ...prev, sortBy }))
  }

  const setSpeakerSearch = (speakerSearch: string) => {
    setFilters((prev) => ({ ...prev, speakerSearch }))
  }

  const toggleSortOrder = () => {
    setFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  const clearAllFilters = () => {
    setFilters({
      status: [Status.submitted, Status.accepted, Status.confirmed],
      format: [],
      level: [],
      language: [],
      audience: [],
      reviewStatus: ReviewStatus.all,
      sortBy: 'created',
      sortOrder: 'desc',
      speakerSearch: '',
    })
  } // Count active filters, excluding default status filters
  const defaultStatusFilters = [
    Status.submitted,
    Status.accepted,
    Status.confirmed,
  ]
  const additionalStatusFilters = filters.status.filter(
    (status) => !defaultStatusFilters.includes(status),
  )
  const removedDefaultStatusFilters = defaultStatusFilters.filter(
    (status) => !filters.status.includes(status),
  )
  const statusFilterCount =
    additionalStatusFilters.length + removedDefaultStatusFilters.length

  const reviewStatusFilterCount =
    filters.reviewStatus !== ReviewStatus.all ? 1 : 0

  const speakerSearchCount = filters.speakerSearch?.trim() ? 1 : 0
  
  const activeFilterCount =
    statusFilterCount +
    filters.format.length +
    filters.level.length +
    filters.language.length +
    filters.audience.length +
    reviewStatusFilterCount +
    speakerSearchCount

  return {
    filters,
    toggleFilter,
    setReviewStatus,
    setSortBy,
    setSpeakerSearch,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount,
  }
}

/**
 * URL-aware custom hook for managing filter state
 * Synchronizes filter state with URL query parameters for hot-linking
 */
export function useFilterStateWithURL(initialFilters: FilterState) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filters, setFilters] = useState<FilterState>(() => {
    // Initialize from URL params if available, otherwise use defaults
    const urlFilters = parseFiltersFromURL(searchParams)
    return {
      ...initialFilters,
      ...urlFilters,
    }
  })

  // Update URL when filters change
  const updateURL = useCallback(
    (newFilters: FilterState) => {
      const params = serializeFiltersToURL(newFilters, initialFilters)
      const newURL = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname
      router.replace(newURL, { scroll: false })
    },
    [router, pathname, initialFilters],
  )

  // Update filters and URL
  const updateFilters = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters)
      updateURL(newFilters)
    },
    [updateURL],
  )

  const toggleFilter = useCallback(
    (
      filterType: keyof FilterState,
      value: Status | Format | Level | Language | Audience,
    ) => {
      const newFilters = {
        ...filters,
        [filterType]: (() => {
          const currentValues = filters[filterType] as (
            | Status
            | Format
            | Level
            | Language
            | Audience
          )[]
          return currentValues.includes(value)
            ? currentValues.filter((v) => v !== value)
            : [...currentValues, value]
        })(),
      }
      updateFilters(newFilters)
    },
    [filters, updateFilters],
  )

  const setReviewStatus = useCallback(
    (reviewStatus: ReviewStatus) => {
      const newFilters = { ...filters, reviewStatus }
      updateFilters(newFilters)
    },
    [filters, updateFilters],
  )

  const setSortBy = useCallback(
    (sortBy: FilterState['sortBy']) => {
      const newFilters = { ...filters, sortBy }
      updateFilters(newFilters)
    },
    [filters, updateFilters],
  )

  const setSpeakerSearch = useCallback(
    (speakerSearch: string) => {
      const newFilters = { ...filters, speakerSearch }
      updateFilters(newFilters)
    },
    [filters, updateFilters],
  )

  const toggleSortOrder = useCallback(() => {
    const newFilters: FilterState = {
      ...filters,
      sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc',
    }
    updateFilters(newFilters)
  }, [filters, updateFilters])

  const clearAllFilters = useCallback(() => {
    updateFilters(initialFilters)
  }, [initialFilters, updateFilters])

  // Count active filters, excluding default status filters
  const defaultStatusFilters = [
    Status.submitted,
    Status.accepted,
    Status.confirmed,
  ]
  const additionalStatusFilters = filters.status.filter(
    (status) => !defaultStatusFilters.includes(status),
  )
  const removedDefaultStatusFilters = defaultStatusFilters.filter(
    (status) => !filters.status.includes(status),
  )
  const statusFilterCount =
    additionalStatusFilters.length + removedDefaultStatusFilters.length

  const reviewStatusFilterCount =
    filters.reviewStatus !== ReviewStatus.all ? 1 : 0

  const speakerSearchCount = filters.speakerSearch?.trim() ? 1 : 0
  
  const activeFilterCount =
    statusFilterCount +
    filters.format.length +
    filters.level.length +
    filters.language.length +
    filters.audience.length +
    reviewStatusFilterCount +
    speakerSearchCount

  return {
    filters,
    toggleFilter,
    setReviewStatus,
    setSortBy,
    setSpeakerSearch,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount,
  }
}

/**
 * Utility functions for URL parameter management
 */

/**
 * Parse array values from URL search params
 */
function parseArrayParam<T extends string>(
  param: string | null,
  validValues: T[],
): T[] {
  if (!param) return []
  return param
    .split(',')
    .filter((value): value is T => validValues.includes(value as T))
}

/**
 * Serialize array values for URL search params
 */
function serializeArrayParam<T extends string>(values: T[]): string | null {
  return values.length > 0 ? values.join(',') : null
}

/**
 * Parse FilterState from URL search parameters
 */
function parseFiltersFromURL(
  searchParams: URLSearchParams,
): Partial<FilterState> {
  const filters: Partial<FilterState> = {}

  // Parse status filter
  const statusParam = searchParams.get('status')
  if (statusParam) {
    filters.status = parseArrayParam(statusParam, Object.values(Status))
  }

  // Parse format filter
  const formatParam = searchParams.get('format')
  if (formatParam) {
    filters.format = parseArrayParam(formatParam, Object.values(Format))
  }

  // Parse level filter
  const levelParam = searchParams.get('level')
  if (levelParam) {
    filters.level = parseArrayParam(levelParam, Object.values(Level))
  }

  // Parse language filter
  const languageParam = searchParams.get('language')
  if (languageParam) {
    filters.language = parseArrayParam(languageParam, Object.values(Language))
  }

  // Parse audience filter
  const audienceParam = searchParams.get('audience')
  if (audienceParam) {
    filters.audience = parseArrayParam(audienceParam, Object.values(Audience))
  }

  // Parse review status
  const reviewStatusParam = searchParams.get('reviewStatus')
  if (
    reviewStatusParam &&
    Object.values(ReviewStatus).includes(reviewStatusParam as ReviewStatus)
  ) {
    filters.reviewStatus = reviewStatusParam as ReviewStatus
  }

  // Parse sort options
  const sortByParam = searchParams.get('sortBy')
  if (
    sortByParam &&
    ['title', 'status', 'created', 'speaker', 'rating'].includes(sortByParam)
  ) {
    filters.sortBy = sortByParam as FilterState['sortBy']
  }

  const sortOrderParam = searchParams.get('sortOrder')
  if (sortOrderParam && ['asc', 'desc'].includes(sortOrderParam)) {
    filters.sortOrder = sortOrderParam as 'asc' | 'desc'
  }

  // Parse speaker search
  const speakerSearchParam = searchParams.get('speakerSearch')
  if (speakerSearchParam) {
    filters.speakerSearch = speakerSearchParam
  }

  return filters
}

/**
 * Serialize FilterState to URL search parameters
 */
function serializeFiltersToURL(
  filters: FilterState,
  defaultFilters: FilterState,
): URLSearchParams {
  const params = new URLSearchParams()

  // Only add parameters that differ from defaults
  const defaultStatusFilters = [
    Status.submitted,
    Status.accepted,
    Status.confirmed,
  ]
  if (
    JSON.stringify([...filters.status].sort()) !==
    JSON.stringify([...defaultStatusFilters].sort())
  ) {
    const statusParam = serializeArrayParam(filters.status)
    if (statusParam) params.set('status', statusParam)
  }

  if (filters.format.length > 0) {
    const formatParam = serializeArrayParam(filters.format)
    if (formatParam) params.set('format', formatParam)
  }

  if (filters.level.length > 0) {
    const levelParam = serializeArrayParam(filters.level)
    if (levelParam) params.set('level', levelParam)
  }

  if (filters.language.length > 0) {
    const languageParam = serializeArrayParam(filters.language)
    if (languageParam) params.set('language', languageParam)
  }

  if (filters.audience.length > 0) {
    const audienceParam = serializeArrayParam(filters.audience)
    if (audienceParam) params.set('audience', audienceParam)
  }

  if (filters.reviewStatus !== defaultFilters.reviewStatus) {
    params.set('reviewStatus', filters.reviewStatus)
  }

  if (filters.sortBy !== defaultFilters.sortBy) {
    params.set('sortBy', filters.sortBy)
  }

  if (filters.sortOrder !== defaultFilters.sortOrder) {
    params.set('sortOrder', filters.sortOrder)
  }

  if (filters.speakerSearch && filters.speakerSearch.trim() !== '') {
    params.set('speakerSearch', filters.speakerSearch)
  }

  return params
}
