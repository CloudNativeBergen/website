'use client'

import { useCallback, useMemo, useState } from 'react'
import { ProposalExisting } from '@/lib/proposal/types'

/**
 * Search + format + level filtering for a list of proposals. Extracted from
 * `UnassignedProposals` so the desktop sidebar and the mobile assign sheet share
 * ONE implementation instead of duplicating the (null-guarded) matching logic.
 */
export interface ProposalFilterState {
  searchQuery: string
  selectedFormat: string
  selectedLevel: string
  availableFormats: string[]
  availableLevels: string[]
  filteredProposals: ProposalExisting[]
  hasActiveFilters: boolean
  statsText: string
  setSearchQuery: (value: string) => void
  setSelectedFormat: (value: string) => void
  setSelectedLevel: (value: string) => void
  clearFilters: () => void
}

export function useProposalFilters(
  proposals: ProposalExisting[],
): ProposalFilterState {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFormat, setSelectedFormat] = useState('')
  const [selectedLevel, setSelectedLevel] = useState('')

  const { availableFormats, availableLevels } = useMemo(() => {
    const formats = new Set(proposals.map((p) => p.format).filter(Boolean))
    const levels = new Set(proposals.map((p) => p.level).filter(Boolean))
    return {
      availableFormats: Array.from(formats).sort(),
      availableLevels: Array.from(levels).sort(),
    }
  }, [proposals])

  const filteredProposals = useMemo(() => {
    if (!searchQuery && !selectedFormat && !selectedLevel) {
      return proposals
    }

    return proposals.filter((proposal) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim()
        // Null-guard every field: a proposal with a missing title/format or a
        // speaker with no name must not throw and blank the whole list.
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

      if (selectedFormat && proposal.format !== selectedFormat) {
        return false
      }

      if (selectedLevel && proposal.level !== selectedLevel) {
        return false
      }

      return true
    })
  }, [proposals, searchQuery, selectedFormat, selectedLevel])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedFormat('')
    setSelectedLevel('')
  }, [])

  const hasActiveFilters = Boolean(
    searchQuery || selectedFormat || selectedLevel,
  )

  const statsText =
    filteredProposals.length === proposals.length
      ? `${proposals.length} ${proposals.length === 1 ? 'talk' : 'talks'}`
      : `${filteredProposals.length} of ${proposals.length} talks`

  return {
    searchQuery,
    selectedFormat,
    selectedLevel,
    availableFormats,
    availableLevels,
    filteredProposals,
    hasActiveFilters,
    statsText,
    setSearchQuery,
    setSelectedFormat,
    setSelectedLevel,
    clearFilters,
  }
}
