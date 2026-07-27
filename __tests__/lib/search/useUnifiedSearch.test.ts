/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useUnifiedSearch } from '@/lib/search'

const fetchMocks = vi.hoisted(() => ({
  proposal: vi.fn(),
  sponsor: vi.fn(),
  speaker: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
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
  resolve: (value: unknown[]) => void
  promise: Promise<unknown[]>
}

function deferred(): Deferred {
  let resolve!: (value: unknown[]) => void
  const promise = new Promise<unknown[]>((r) => {
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

describe('useUnifiedSearch', () => {
  beforeEach(() => {
    fetchMocks.proposal.mockReset()
    fetchMocks.sponsor.mockReset()
    fetchMocks.speaker.mockReset()
  })

  it('paints results when an in-flight search resolves normally', async () => {
    fetchMocks.proposal.mockResolvedValue(PROPOSALS)
    fetchMocks.sponsor.mockResolvedValue([])
    fetchMocks.speaker.mockResolvedValue([])

    const { result } = renderHook(() => useUnifiedSearch())

    await act(async () => {
      await result.current.search('kubernetes')
    })

    await waitFor(() => {
      expect(result.current.searchResults.totalCount).toBe(1)
    })
    expect(result.current.isSearching).toBe(false)
  })

  it('clearSearch invalidates in-flight searches so late responses cannot repaint', async () => {
    const proposal = deferred()
    const sponsor = deferred()
    const speaker = deferred()
    fetchMocks.proposal.mockReturnValue(proposal.promise)
    fetchMocks.sponsor.mockReturnValue(sponsor.promise)
    fetchMocks.speaker.mockReturnValue(speaker.promise)

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
      proposal.resolve(PROPOSALS)
      sponsor.resolve([])
      speaker.resolve([])
      await pendingSearch
    })

    expect(result.current.searchResults.totalCount).toBe(0)
    expect(result.current.searchResults.groups).toEqual([])
    expect(result.current.isSearching).toBe(false)
  })

  it('a newer search invalidates an older in-flight one', async () => {
    const stale = deferred()
    fetchMocks.proposal.mockReturnValueOnce(stale.promise)
    fetchMocks.sponsor.mockResolvedValue([])
    fetchMocks.speaker.mockResolvedValue([])

    const { result } = renderHook(() => useUnifiedSearch())

    let staleSearch!: Promise<void>
    act(() => {
      staleSearch = result.current.search('old query')
    })

    fetchMocks.proposal.mockResolvedValue(PROPOSALS)
    await act(async () => {
      await result.current.search('kubernetes')
    })
    expect(result.current.searchResults.totalCount).toBe(1)

    await act(async () => {
      stale.resolve([
        { ...PROPOSALS[0], _id: 'stale-1', title: 'Stale Result' },
      ])
      await staleSearch
    })

    expect(result.current.searchResults.totalCount).toBe(1)
    expect(result.current.searchResults.groups[0].items[0].id).toBe('prop-1')
  })
})
