'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Status, Format, Level, Language, Audience } from '@/lib/proposal/types'
import { Flags } from '@/lib/speaker/types'
import { FilterState, ReviewStatus } from './ProposalsFilter'

export function useFilterStateWithURL(initialFilters: FilterState) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filters, setFilters] = useState<FilterState>(() => {
    const urlFilters = parseFiltersFromURL(searchParams)
    return {
      ...initialFilters,
      ...urlFilters,

      speakerFlags: urlFilters.speakerFlags || [],
    }
  })

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
      value: Status | Format | Level | Language | Audience | Flags,
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
            | Flags
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

  const setHideMultipleTalks = useCallback(
    (hideMultipleTalks: boolean) => {
      const newFilters = { ...filters, hideMultipleTalks }
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

  const toggleSortOrder = useCallback(() => {
    const newFilters: FilterState = {
      ...filters,
      sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc',
    }
    updateFilters(newFilters)
  }, [filters, updateFilters])

  const setSearchQuery = useCallback(
    (searchQuery: string) => {
      const newFilters = { ...filters, searchQuery }
      updateFilters(newFilters)
    },
    [filters, updateFilters],
  )

  const clearAllFilters = useCallback(() => {
    updateFilters(initialFilters)
  }, [initialFilters, updateFilters])

  // Count active filters (excluding default values)
  const defaultStatusFilters = initialFilters.status
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

  const multipleTalksFilterCount = filters.hideMultipleTalks ? 1 : 0

  const searchQueryFilterCount = filters.searchQuery ? 1 : 0

  const activeFilterCount =
    statusFilterCount +
    filters.format.length +
    filters.level.length +
    filters.language.length +
    filters.audience.length +
    filters.speakerFlags.length +
    reviewStatusFilterCount +
    multipleTalksFilterCount +
    searchQueryFilterCount

  return {
    filters,
    toggleFilter,
    setReviewStatus,
    setSearchQuery,
    setHideMultipleTalks,
    setSortBy,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount,
  }
}

function parseArrayParam<T extends string>(
  param: string | null,
  validValues: T[],
): T[] {
  if (!param) return []
  return param
    .split(',')
    .filter((value): value is T => validValues.includes(value as T))
}

function serializeArrayParam<T extends string>(values: T[]): string | null {
  return values.length > 0 ? values.join(',') : null
}

function parseFiltersFromURL(
  searchParams: URLSearchParams,
): Partial<FilterState> {
  const filters: Partial<FilterState> = {}

  const statusParam = searchParams.get('status')
  if (statusParam) {
    filters.status = parseArrayParam(statusParam, Object.values(Status))
  }

  const formatParam = searchParams.get('format')
  if (formatParam) {
    filters.format = parseArrayParam(formatParam, Object.values(Format))
  }

  const levelParam = searchParams.get('level')
  if (levelParam) {
    filters.level = parseArrayParam(levelParam, Object.values(Level))
  }

  const languageParam = searchParams.get('language')
  if (languageParam) {
    filters.language = parseArrayParam(languageParam, Object.values(Language))
  }

  const audienceParam = searchParams.get('audience')
  if (audienceParam) {
    filters.audience = parseArrayParam(audienceParam, Object.values(Audience))
  }

  const speakerFlagsParam = searchParams.get('speakerFlags')
  if (speakerFlagsParam) {
    filters.speakerFlags = parseArrayParam(
      speakerFlagsParam,
      Object.values(Flags),
    )
  }

  const reviewStatusParam = searchParams.get('reviewStatus')
  if (
    reviewStatusParam &&
    Object.values(ReviewStatus).includes(reviewStatusParam as ReviewStatus)
  ) {
    filters.reviewStatus = reviewStatusParam as ReviewStatus
  }

  const hideMultipleTalksParam = searchParams.get('hideMultipleTalks')
  if (hideMultipleTalksParam === 'true') {
    filters.hideMultipleTalks = true
  }

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

  return filters
}

function serializeFiltersToURL(
  filters: FilterState,
  defaultFilters: FilterState,
): URLSearchParams {
  const params = new URLSearchParams()

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

  if (filters.speakerFlags.length > 0) {
    const speakerFlagsParam = serializeArrayParam(filters.speakerFlags)
    if (speakerFlagsParam) params.set('speakerFlags', speakerFlagsParam)
  }

  if (filters.reviewStatus !== defaultFilters.reviewStatus) {
    params.set('reviewStatus', filters.reviewStatus)
  }

  if (filters.hideMultipleTalks !== defaultFilters.hideMultipleTalks) {
    params.set('hideMultipleTalks', filters.hideMultipleTalks.toString())
  }

  if (filters.sortBy !== defaultFilters.sortBy) {
    params.set('sortBy', filters.sortBy)
  }

  if (filters.sortOrder !== defaultFilters.sortOrder) {
    params.set('sortOrder', filters.sortOrder)
  }

  return params
}
