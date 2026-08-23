/**
 * @vitest-environment jsdom
 *
 * The hook's job is now ONE procedure call per search, then pure mapping.
 *
 * The three per-source procedures are still mocked here and asserted UNUSED:
 * tRPC batches parallel calls into a single HTTP request, so a re-introduced
 * fan-out is invisible in the network panel and in every rendering assertion —
 * the only thing that catches it is asserting those handles are never touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUnifiedSearch } from '@/lib/search'

const fetchMocks = vi.hoisted(() => ({
  unified: vi.fn(),
  proposal: vi.fn(),
  sponsor: vi.fn(),
  speaker: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      search: { unified: { fetch: fetchMocks.unified } },
      proposal: { admin: { search: { fetch: fetchMocks.proposal } } },
      sponsor: { list: { fetch: fetchMocks.sponsor } },
      speaker: { admin: { search: { fetch: fetchMocks.speaker } } },
    }),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

interface Deferred {
  resolve: (value: unknown) => void
  promise: Promise<unknown>
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((r) => {
    resolve = r
  })
  return { resolve, promise }
}

const PROPOSALS = [
  {
    _id: 'prop-1',
    title: 'Kubernetes Security',
    status: 'submitted',
    format: 'presentation_25',
    speakers: [],
  },
]

const payload = (overrides: Record<string, unknown> = {}) => ({
  proposals: [],
  sponsors: [],
  speakers: [],
  ...overrides,
})

const noProviderProcedureRan = () => {
  expect(fetchMocks.proposal).not.toHaveBeenCalled()
  expect(fetchMocks.sponsor).not.toHaveBeenCalled()
  expect(fetchMocks.speaker).not.toHaveBeenCalled()
}

describe('useUnifiedSearch', () => {
  beforeEach(() => {
    fetchMocks.unified.mockReset()
    fetchMocks.proposal.mockReset()
    fetchMocks.sponsor.mockReset()
    fetchMocks.speaker.mockReset()
  })

  it('issues exactly ONE procedure call per search', async () => {
    fetchMocks.unified.mockResolvedValue(payload({ proposals: PROPOSALS }))

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('kubernetes')
    })

    expect(fetchMocks.unified).toHaveBeenCalledTimes(1)
    expect(fetchMocks.unified).toHaveBeenCalledWith({ query: 'kubernetes' })
    // The fan-out must not come back through a side door.
    noProviderProcedureRan()
  })

  it('paints results when an in-flight search resolves normally', async () => {
    fetchMocks.unified.mockResolvedValue(payload({ proposals: PROPOSALS }))

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('kubernetes')
    })

    await waitFor(() => {
      expect(result.current.searchResults.totalCount).toBe(1)
    })
    expect(result.current.isSearching).toBe(false)
  })

  it('groups the three sources by their provider priority', async () => {
    fetchMocks.unified.mockResolvedValue(
      payload({
        proposals: PROPOSALS,
        sponsors: [{ _id: 'spon-1', name: 'CNCF', website: 'https://cncf.io' }],
        speakers: [{ _id: 'sp-1', name: 'Jane Doe', title: 'Architect' }],
      }),
    )

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('kubernetes')
    })

    expect(result.current.searchResults.groups.map((g) => g.category)).toEqual([
      'proposals',
      'sponsors',
      'speakers',
    ])
    expect(result.current.searchResults.totalCount).toBe(3)
  })

  it('sends NOTHING for a one-character query', async () => {
    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('k')
    })

    expect(fetchMocks.unified).not.toHaveBeenCalled()
    noProviderProcedureRan()
    expect(result.current.isSearching).toBe(false)
    expect(result.current.searchResults.totalCount).toBe(0)
  })

  it('sends NOTHING for a query that is one character once trimmed', async () => {
    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('  k ')
    })

    expect(fetchMocks.unified).not.toHaveBeenCalled()
  })

  it('sends at exactly two characters', async () => {
    fetchMocks.unified.mockResolvedValue(payload())

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('k8')
    })

    expect(fetchMocks.unified).toHaveBeenCalledTimes(1)
  })

  it('backspacing below the floor discards results already on screen', async () => {
    fetchMocks.unified.mockResolvedValue(payload({ proposals: PROPOSALS }))

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('kubernetes')
    })
    expect(result.current.searchResults.totalCount).toBe(1)

    await act(async () => {
      await result.current.search('k')
    })
    expect(result.current.searchResults.totalCount).toBe(0)
  })

  it('clearSearch invalidates in-flight searches so late responses cannot repaint', async () => {
    const pending = deferred()
    fetchMocks.unified.mockReturnValue(pending.promise)

    const { result } = renderHook(() => useUnifiedSearch())

    let pendingSearch!: Promise<void>
    act(() => {
      pendingSearch = result.current.search('kubernetes')
    })
    expect(result.current.isSearching).toBe(true)

    act(() => {
      result.current.clearSearch()
    })
    expect(result.current.isSearching).toBe(false)

    await act(async () => {
      pending.resolve(payload({ proposals: PROPOSALS }))
      await pendingSearch
    })

    expect(result.current.searchResults.totalCount).toBe(0)
    expect(result.current.searchResults.groups).toEqual([])
    expect(result.current.isSearching).toBe(false)
  })

  it('a newer search invalidates an older in-flight one', async () => {
    const stale = deferred()
    fetchMocks.unified.mockReturnValueOnce(stale.promise)

    const { result } = renderHook(() => useUnifiedSearch())

    let staleSearch!: Promise<void>
    act(() => {
      staleSearch = result.current.search('old query')
    })

    fetchMocks.unified.mockResolvedValue(payload({ proposals: PROPOSALS }))
    await act(async () => {
      await result.current.search('kubernetes')
    })
    expect(result.current.searchResults.totalCount).toBe(1)

    await act(async () => {
      stale.resolve(
        payload({
          proposals: [
            { ...PROPOSALS[0], _id: 'stale-1', title: 'Stale Result' },
          ],
        }),
      )
      await staleSearch
    })

    expect(result.current.searchResults.totalCount).toBe(1)
    expect(result.current.searchResults.groups[0].items[0].id).toBe('prop-1')
  })

  it('surfaces a failed search as an error, not as empty results', async () => {
    fetchMocks.unified.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('kubernetes')
    })

    expect(result.current.searchError).toBe('Failed to perform search')
  })
})
