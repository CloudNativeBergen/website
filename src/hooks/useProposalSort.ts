'use client'

import { ProposalExisting } from '@/lib/proposal/types'
import { useMemo, useState } from 'react'
import { getAverageScore } from '@/utils/reviewUtils'

// Define the sort fields and their types
export type SortField =
  | 'title'
  | 'speakers'
  | 'format'
  | 'language'
  | 'level'
  | 'status'
  | 'score'
export type SortDirection = 'asc' | 'desc'
export type SortConfig = {
  field: SortField
  direction: SortDirection
} | null

export function useProposalSort(initialProposals: ProposalExisting[]) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  // Sort handler function
  const handleSort = (field: SortField) => {
    let direction: SortDirection = 'asc'
    if (sortConfig?.field === field && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ field, direction })
  }

  // Calculate and return sorted proposals
  const sortedProposals = useMemo(() => {
    if (!sortConfig) return initialProposals

    return [...initialProposals].sort((a, b) => {
      // Special case for speakers field which needs to extract the names
      if (sortConfig.field === 'speakers') {
        const speakersA =
          a.speakers && Array.isArray(a.speakers)
            ? a.speakers
                .map((speaker) =>
                  typeof speaker === 'object' && 'name' in speaker
                    ? speaker.name
                    : 'Unknown',
                )
                .join(', ')
            : 'Unknown'
        const speakersB =
          b.speakers && Array.isArray(b.speakers)
            ? b.speakers
                .map((speaker) =>
                  typeof speaker === 'object' && 'name' in speaker
                    ? speaker.name
                    : 'Unknown',
                )
                .join(', ')
            : 'Unknown'
        return sortConfig.direction === 'asc'
          ? speakersA.localeCompare(speakersB)
          : speakersB.localeCompare(speakersA)
      }

      // Special case for score field which needs numerical comparison
      if (sortConfig.field === 'score') {
        const scoreA = getAverageScore(a.reviews || [])
        const scoreB = getAverageScore(b.reviews || [])
        return sortConfig.direction === 'asc'
          ? scoreA - scoreB
          : scoreB - scoreA
      }

      // For all other string fields, use localeCompare directly
      const valueA = a[sortConfig.field] as string
      const valueB = b[sortConfig.field] as string

      return sortConfig.direction === 'asc'
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA)
    })
  }, [initialProposals, sortConfig])

  return { sortedProposals, sortConfig, handleSort }
}
