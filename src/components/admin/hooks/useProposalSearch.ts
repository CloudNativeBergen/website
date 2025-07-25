'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { adminSearchProposals } from '@/lib/proposal'
import { ProposalExisting } from '@/lib/proposal/types'

export function useProposalSearch() {
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ProposalExisting[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const router = useRouter()

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchError(null)
      setSelectedIndex(-1)
      return
    }

    setIsSearching(true)
    setSearchError(null)
    setSelectedIndex(-1)

    try {
      const response = await adminSearchProposals(query)

      if (response.error) {
        setSearchError(response.error.message)
        setSearchResults([])
      } else {
        setSearchResults(response.proposals || [])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchError('Failed to search proposals')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const navigateToProposal = useCallback(
    (proposalId: string) => {
      router.push(`/admin/proposals/${proposalId}`)
    },
    [router],
  )

  const clearSearch = useCallback(() => {
    setSearchResults([])
    setSearchError(null)
    setSelectedIndex(-1)
  }, [])

  const handleKeyNavigation = useCallback(
    (key: string) => {
      if (searchResults.length === 0) return false

      switch (key) {
        case 'ArrowDown':
          setSelectedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : prev,
          )
          return true
        case 'ArrowUp':
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
          return true
        case 'Enter':
          if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
            navigateToProposal(searchResults[selectedIndex]._id)
            return true
          }
          // If no item is selected but there are results, select the first one
          if (searchResults.length > 0) {
            navigateToProposal(searchResults[0]._id)
            return true
          }
          return false
        case 'Escape':
          clearSearch()
          setSelectedIndex(-1)
          return true
        default:
          return false
      }
    },
    [searchResults, selectedIndex, navigateToProposal, clearSearch],
  )

  return {
    search,
    isSearching,
    searchResults,
    searchError,
    selectedIndex,
    navigateToProposal,
    clearSearch,
    handleKeyNavigation,
  }
}
