/**
 * @vitest-environment jsdom
 *
 * WHAT ⌘K COSTS WHILE SOMEONE IS TYPING.
 *
 * `useDebouncedDataSearch` is the palette's whole scheduling policy: the
 * ≥2-character floor and the debounce window. Neither is visible in a rendered
 * screenshot or in any result assertion — raise the floor, drop it, shorten the
 * timer, or lose the cleanup that cancels the pending timer, and the palette
 * looks and behaves identically while billing a different number of Sanity
 * reads. So these are assertions on CALL COUNTS.
 *
 * The numbers are read from the exported constants rather than hard-coded at
 * every site, but the two that matter are pinned to literals below — otherwise
 * halving the debounce would move the constant AND the test together and prove
 * nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  useDebouncedDataSearch,
} from '@/lib/search'

let search: ReturnType<typeof vi.fn<(query: string) => void>>
let clearSearch: ReturnType<typeof vi.fn<() => void>>

function renderFor(initialQuery: string) {
  return renderHook(
    ({ query }: { query: string }) =>
      useDebouncedDataSearch(query, search, clearSearch),
    { initialProps: { query: initialQuery } },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  search = vi.fn<(query: string) => void>()
  clearSearch = vi.fn<() => void>()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the numbers themselves', () => {
  it('is a 400ms window and a 2-character floor', () => {
    // Pinned to literals on purpose: a test that reads the constant it is
    // checking cannot fail when the constant changes.
    expect(SEARCH_DEBOUNCE_MS).toBe(400)
    expect(MIN_SEARCH_QUERY_LENGTH).toBe(2)
  })
})

describe('the debounce window', () => {
  it('sends nothing before the window has elapsed', () => {
    renderFor('kubernetes')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    })

    expect(search).not.toHaveBeenCalled()
  })

  it('sends exactly once when the window elapses', () => {
    renderFor('kubernetes')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('kubernetes')
  })

  it('collapses a whole keystroke burst into ONE call', () => {
    const { rerender } = renderFor('ku')

    for (const query of [
      'kub',
      'kube',
      'kuber',
      'kubern',
      'kuberne',
      'kubernet',
      'kubernete',
      'kubernetes',
    ]) {
      rerender({ query })
      act(() => {
        // 50ms between keystrokes — comfortably inside the window, so every
        // pending timer must be cancelled by the next character.
        vi.advanceTimersByTime(50)
      })
    }

    expect(search).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('kubernetes')
  })

  it('cancels the pending call when the component unmounts', () => {
    const { unmount } = renderFor('kubernetes')

    unmount()
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2)
    })

    expect(search).not.toHaveBeenCalled()
  })
})

describe('the ≥2-character floor', () => {
  it('sends nothing for one character, however long the user waits', () => {
    renderFor('k')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 20)
    })

    expect(search).not.toHaveBeenCalled()
  })

  it('sends nothing for an empty query', () => {
    renderFor('')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 20)
    })

    expect(search).not.toHaveBeenCalled()
  })

  it('sends at exactly the floor', () => {
    renderFor('k8')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('k8')
  })

  it('drops results IMMEDIATELY when the user backspaces below the floor', () => {
    const { rerender } = renderFor('kubernetes')
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    clearSearch.mockClear()

    rerender({ query: 'k' })

    // No timer advance: stale results must not linger for a debounce window
    // after the query stops being searchable.
    expect(clearSearch).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('does not send the pending long query after backspacing below the floor', () => {
    const { rerender } = renderFor('kubernetes')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    })
    rerender({ query: 'k' })
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2)
    })

    expect(search).not.toHaveBeenCalled()
  })
})
