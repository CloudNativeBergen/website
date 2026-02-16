'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import type { SearchProvider, SearchResults } from '../types'
import {
  AdminPagesSearchProvider,
  ProposalsSearchProvider,
  SponsorsSearchProvider,
  SpeakersSearchProvider,
} from '../providers'

export function useUnifiedSearch() {
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResults>({
    groups: [],
    totalCount: 0,
  })
  const [searchError, setSearchError] = useState<string | null>(null)
  const router = useRouter()

  const sponsorSearchMutation = api.sponsor.list.useMutation()
  const speakerSearchMutation = api.speakers.search.useMutation()

  const providers = useMemo<SearchProvider[]>(() => {
    return [
      new AdminPagesSearchProvider(),
      new ProposalsSearchProvider(),
      new SponsorsSearchProvider(async (query) => {
        const result = await sponsorSearchMutation.mutateAsync({ query })
        return result
      }),
      new SpeakersSearchProvider(async (query) => {
        const result = await speakerSearchMutation.mutateAsync({
          query,
          includeFeatured: true,
        })
        return result
      }),
    ]
  }, [sponsorSearchMutation, speakerSearchMutation])

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults({ groups: [], totalCount: 0 })
        setSearchError(null)
        return
      }

      setIsSearching(true)
      setSearchError(null)

      try {
        const results = await Promise.all(
          providers.map((provider) => provider.search(query)),
        )

        const groups = results
          .filter((result) => result.items.length > 0)
          .sort((a, b) => {
            const providerA = providers.find((p) => p.category === a.category)
            const providerB = providers.find((p) => p.category === b.category)
            return (providerA?.priority || 0) - (providerB?.priority || 0)
          })

        const totalCount = groups.reduce(
          (sum, group) => sum + group.items.length,
          0,
        )

        setSearchResults({ groups, totalCount })

        const errors = results.filter((r) => r.error).map((r) => r.error)
        if (errors.length > 0) {
          console.warn('Search errors:', errors)
        }
      } catch (error) {
        console.error('Unified search error:', error)
        setSearchError('Failed to perform search')
        setSearchResults({ groups: [], totalCount: 0 })
      } finally {
        setIsSearching(false)
      }
    },
    [providers],
  )

  const navigateTo = useCallback(
    (url: string) => {
      router.push(url)
    },
    [router],
  )

  const clearSearch = useCallback(() => {
    setSearchResults({ groups: [], totalCount: 0 })
    setSearchError(null)
  }, [])

  return {
    search,
    isSearching,
    searchResults,
    searchError,
    navigateTo,
    clearSearch,
  }
}
