'use client'

import { useCallback, useMemo, useState } from 'react'
import { ProposalExisting } from '@/lib/proposal/types'

/** A topic is either a dereferenced document with a title, or a bare string. */
type TopicLike = string | { title?: string }

/**
 * Search + format + level filtering for a list of proposals. Extracted from
 * `UnassignedProposals` so the desktop sidebar and the mobile assign sheet share
 * ONE implementation instead of duplicating the (null-guarded) matching logic.
 */
export interface ProposalFilterState {
  searchQuery: string
  selectedFormats: string[]
  selectedLevels: string[]
  selectedStatuses: string[]
  selectedTopics: string[]
  showPartiallyScheduled: boolean
  availableFormats: string[]
  availableLevels: string[]
  availableStatuses: string[]
  availableTopics: string[]
  filteredProposals: (ProposalExisting & {
    remainingMinutes?: number
    isPartiallyScheduled?: boolean
  })[]
  totalCount: number
  hasActiveFilters: boolean
  statsText: string
  setSearchQuery: (value: string) => void
  setSelectedFormats: (value: string[]) => void
  setSelectedLevels: (value: string[]) => void
  setSelectedStatuses: (value: string[]) => void
  setSelectedTopics: (value: string[]) => void
  setShowPartiallyScheduled: (value: boolean) => void
  clearFilters: () => void
}

export function useProposalFilters(
  proposals: (ProposalExisting & {
    remainingMinutes?: number
    isPartiallyScheduled?: boolean
  })[],
): ProposalFilterState {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedLevels, setSelectedLevels] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  // Defaults ON. Splitting a talk (resizing it down) leaves a REMAINDER in the
  // unassigned list; with this off the remainder vanished the instant it was
  // created and the only clue was a checkbox buried in the filter bar. Hiding
  // partials is now the deliberate act, so it counts as an active filter below.
  const [showPartiallyScheduled, setShowPartiallyScheduled] = useState(true)

  const {
    availableFormats,
    availableLevels,
    availableStatuses,
    availableTopics,
  } = useMemo(() => {
    const formats = new Set(proposals.map((p) => p.format).filter(Boolean))
    const levels = new Set(proposals.map((p) => p.level).filter(Boolean))
    const statuses = new Set(proposals.map((p) => p.status).filter(Boolean))
    const topics = new Set<string>()
    proposals.forEach((p) => {
      if (Array.isArray(p.topics)) {
        p.topics.forEach((t: TopicLike) => {
          const title = typeof t === 'string' ? t : t.title
          if (title) topics.add(title)
        })
      }
    })
    return {
      availableFormats: Array.from(formats).sort(),
      availableLevels: Array.from(levels).sort(),
      availableStatuses: Array.from(statuses).sort(),
      availableTopics: Array.from(topics).sort(),
    }
  }, [proposals])

  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      if (!showPartiallyScheduled && proposal.isPartiallyScheduled) {
        return false
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim()
        const titleMatch = proposal.title?.toLowerCase().includes(query)

        const speakerMatch =
          proposal.speakers &&
          Array.isArray(proposal.speakers) &&
          proposal.speakers.some(
            (speaker) =>
              typeof speaker === 'object' &&
              'name' in speaker &&
              speaker.name?.toLowerCase().includes(query),
          )

        const formatMatch = proposal.format?.toLowerCase().includes(query)

        if (!titleMatch && !speakerMatch && !formatMatch) {
          return false
        }
      }

      if (
        selectedFormats.length > 0 &&
        (!proposal.format || !selectedFormats.includes(proposal.format))
      ) {
        return false
      }

      if (
        selectedLevels.length > 0 &&
        (!proposal.level || !selectedLevels.includes(proposal.level))
      ) {
        return false
      }

      if (
        selectedStatuses.length > 0 &&
        (!proposal.status || !selectedStatuses.includes(proposal.status))
      ) {
        return false
      }

      if (selectedTopics.length > 0) {
        const pTopics = Array.isArray(proposal.topics)
          ? proposal.topics.map(
              (t: TopicLike) => (typeof t === 'string' ? t : t.title) ?? '',
            )
          : []
        if (!pTopics.some((t) => selectedTopics.includes(t))) {
          return false
        }
      }

      return true
    })
  }, [
    proposals,
    searchQuery,
    selectedFormats,
    selectedLevels,
    selectedStatuses,
    selectedTopics,
    showPartiallyScheduled,
  ])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedFormats([])
    setSelectedLevels([])
    setSelectedStatuses([])
    setSelectedTopics([])
    // Back to the default (shown), not to hidden.
    setShowPartiallyScheduled(true)
  }, [])

  const hasActiveFilters = Boolean(
    searchQuery ||
    selectedFormats.length > 0 ||
    selectedLevels.length > 0 ||
    selectedTopics.length > 0 ||
    !showPartiallyScheduled,
  )

  const statsText =
    filteredProposals.length === proposals.length
      ? `${proposals.length} ${proposals.length === 1 ? 'talk' : 'talks'}`
      : `${filteredProposals.length} of ${proposals.length} talks`

  return {
    searchQuery,
    selectedFormats,
    selectedLevels,
    selectedTopics,
    selectedStatuses,
    showPartiallyScheduled,
    availableFormats,
    availableLevels,
    availableTopics,
    availableStatuses,
    filteredProposals,
    totalCount: proposals.length,
    hasActiveFilters,
    statsText,
    setSearchQuery,
    setSelectedFormats,
    setSelectedLevels,
    setSelectedTopics,
    setSelectedStatuses,
    setShowPartiallyScheduled,
    clearFilters,
  }
}
