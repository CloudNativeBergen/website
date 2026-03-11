'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
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
  const requestId = useRef(0)
  const router = useRouter()

  const utils = api.useUtils()

  const providers = useMemo<SearchProvider[]>(() => {
    return [
      new AdminPagesSearchProvider(),
      new ProposalsSearchProvider(),
      new SponsorsSearchProvider(async (query) => {
        const result = await utils.sponsor.list.fetch({ query })
        return result
      }),
      new SpeakersSearchProvider(async (query) => {
        const result = await utils.speakers.search.fetch({
          query,
          includeFeatured: true,
        })
        return result
      }),
    ]
  }, [utils])

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults({ groups: [], totalCount: 0 })
        setSearchError(null)
        return
      }

      requestId.current += 1
      const currentId = requestId.current

      setIsSearching(true)
      setSearchError(null)

      try {
        const results = await Promise.all(
          providers.map((provider) => provider.search(query)),
        )

        if (currentId !== requestId.current) return

        const groups = results
          .filter((result) => result.items.length > 0)
          .sort((a, b) => a.priority - b.priority)

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
        if (currentId !== requestId.current) return
        console.error('Unified search error:', error)
        setSearchError('Failed to perform search')
        setSearchResults({ groups: [], totalCount: 0 })
      } finally {
        if (currentId === requestId.current) {
          setIsSearching(false)
        }
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
