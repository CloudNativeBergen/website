'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import type {
  SearchProvider,
  SearchResults,
  UnifiedSearchPayload,
} from '../types'
import { MIN_SEARCH_QUERY_LENGTH } from '../types'
import {
  ProposalsSearchProvider,
  SponsorsSearchProvider,
  SpeakersSearchProvider,
} from '../providers'

/**
 * ONE request per search — not one per source.
 *
 * This used to hold three providers, each closing over its OWN tRPC procedure
 * (`proposal.admin.search`, `sponsor.list`, `speaker.admin.search`), and fire
 * all three in parallel on every debounce tick. tRPC batches them into one HTTP
 * request, which is exactly what made the cost invisible in the network panel:
 * Sanity still billed each procedure separately, and each one independently
 * re-ran the authorization waist and its own uncached GROQ.
 *
 * Now a single `search.unified` call returns all three sources, and the
 * providers keep doing the ONLY job that belongs on the client — turning rows
 * into the grouped, prioritised `SearchResults` the palette renders. Their
 * output shape, labels, priorities and grouping are unchanged.
 */
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

  const search = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim()

      // Below the floor there is nothing worth asking for. Bumping the request
      // id first invalidates anything already in flight, so a longer query's
      // answer cannot land after the user has backspaced past the floor.
      if (normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
        requestId.current += 1
        setIsSearching(false)
        setSearchResults({ groups: [], totalCount: 0 })
        setSearchError(null)
        return
      }

      requestId.current += 1
      const currentId = requestId.current

      setIsSearching(true)
      setSearchError(null)

      try {
        const payload: UnifiedSearchPayload = await utils.search.unified.fetch({
          query: normalizedQuery,
        })

        if (currentId !== requestId.current) return

        // The providers are constructed around the ALREADY-FETCHED payload, so
        // `provider.search()` performs no I/O at all. Keeping them is what keeps
        // the rendered result shape byte-identical to the fan-out version.
        const providers: SearchProvider[] = [
          new ProposalsSearchProvider(async () => payload.proposals),
          new SponsorsSearchProvider(async () => payload.sponsors),
          new SpeakersSearchProvider(async () => payload.speakers),
        ]

        const results = await Promise.all(
          providers.map((provider) => provider.search(normalizedQuery)),
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
    [utils],
  )

  const navigateTo = useCallback(
    (url: string) => {
      router.push(url)
    },
    [router],
  )

  const clearSearch = useCallback(() => {
    // Invalidate any in-flight search: bumping the request id makes its
    // `currentId` guard fail, so a late response can neither repaint stale
    // results nor toggle `isSearching` after the clear.
    requestId.current += 1
    setIsSearching(false)
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
