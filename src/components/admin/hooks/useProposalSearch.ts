'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { searchProposals } from '@/lib/proposal/client'
import { ProposalExisting } from '@/lib/proposal/types'

export function useProposalSearch() {
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ProposalExisting[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const router = useRouter()

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    setIsSearching(true)
    setSearchError(null)

    try {
      const response = await searchProposals(query)

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
  }, [])

  return {
    search,
    isSearching,
    searchResults,
    searchError,
    navigateToProposal,
    clearSearch,
  }
}
