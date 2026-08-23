'use client'

import { useEffect } from 'react'
import { MIN_SEARCH_QUERY_LENGTH, SEARCH_DEBOUNCE_MS } from '../types'

/**
 * WHEN the command palette is allowed to spend a Sanity read.
 *
 * Extracted from `CommandPalette` so the two numbers that govern the bill are
 * testable without rendering a HeadlessUI dialog. Both are behaviour, not
 * configuration:
 *
 *  - Below {@link MIN_SEARCH_QUERY_LENGTH} nothing is scheduled AT ALL and the
 *    previous results are dropped immediately rather than after a timer. A
 *    one-character query matches most of the dataset — the most expensive read
 *    to run and the least useful answer to read.
 *  - Above it, a keystroke burst collapses into ONE call after
 *    {@link SEARCH_DEBOUNCE_MS} of quiet.
 *
 * This governs the DATA search only. The palette's registry destinations are
 * scored locally and stay instant at one character — that is what a
 * one-character query is actually good for.
 *
 * `query` must already be normalised (lower-cased and trimmed) by the caller,
 * which is what the palette compares its local destination scoring against.
 */
export function useDebouncedDataSearch(
  query: string,
  search: (query: string) => void,
  clearSearch: () => void,
): void {
  useEffect(() => {
    if (query.length < MIN_SEARCH_QUERY_LENGTH) {
      clearSearch()
      return
    }

    const timeoutId = setTimeout(() => {
      search(query)
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeoutId)
  }, [query, search, clearSearch])
}
