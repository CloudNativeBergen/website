/**
 * @vitest-environment jsdom
 *
 * The admin shell's nav counts (speaker feedback spec §10.1, Photo Wall spec
 * §10 P6) through REAL React Query with the app's defaults: only the tRPC
 * transport is replaced, each procedure by a `queryFn` the test controls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  type UseQueryOptions,
} from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({
  flagged: vi.fn(async (): Promise<number> => 0),
  pending: vi.fn(async (): Promise<number> => 0),
}))
vi.mock('@/lib/trpc/client', async () => {
  const { useQuery } = await import('@tanstack/react-query')
  type Opts = Omit<UseQueryOptions, 'queryKey' | 'queryFn'>
  const procedure = (key: string, queryFn: () => Promise<unknown>) => ({
    useQuery: (_input: undefined, opts?: Opts) =>
      useQuery({ queryKey: [key], queryFn, ...opts }),
  })
  return {
    api: {
      sessionFeedback: { flaggedCount: procedure('flagged', h.flagged) },
      photoWall: {
        pendingCount: procedure('pending', h.pending),
      },
    },
  }
})

import { useAdminNavCounts } from './useAdminNavCounts'

/** The app's defaults (`src/components/providers/TRPCProvider.tsx`). */
const appQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

let client: QueryClient
function mount() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useAdminNavCounts(), { wrapper })
}
const settle = () => act(() => vi.advanceTimersByTimeAsync(0))

beforeEach(() => {
  vi.useFakeTimers()
  client = appQueryClient()
  h.flagged.mockReset().mockResolvedValue(0)
  h.pending.mockReset().mockResolvedValue(0)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useAdminNavCounts', () => {
  it('answers each count from its procedure, once the shell mounts', async () => {
    h.flagged.mockResolvedValue(3)
    h.pending.mockResolvedValue(5)
    const { result } = mount()
    await settle()
    expect(result.current).toEqual({ flaggedFeedback: 3, pendingWallPosts: 5 })
    expect(h.pending).toHaveBeenCalledTimes(1)
  })

  it('a failed count is missing, not retried, so its entry shows no badge', async () => {
    h.flagged.mockResolvedValue(3)
    h.pending.mockRejectedValue(new Error('Sanity is down'))
    const { result } = mount()
    await settle()
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(result.current).toEqual({
      flaggedFeedback: 3,
      pendingWallPosts: undefined,
    })
    expect(h.pending).toHaveBeenCalledTimes(1)
  })

  it('a slow count is missing until it answers', async () => {
    let answer: (n: number) => void = () => {}
    h.pending.mockReturnValue(new Promise((r) => (answer = r)))
    const { result } = mount()
    await settle()
    expect(result.current.pendingWallPosts).toBeUndefined()
    await act(async () => answer(2))
    await settle()
    expect(result.current.pendingWallPosts).toBe(2)
  })

  it('reads the pending count again on returning to the tab once stale', async () => {
    h.pending.mockResolvedValue(1)
    const { result } = mount()
    await settle()
    h.pending.mockResolvedValue(4)
    await act(() => vi.advanceTimersByTimeAsync(61_000))
    act(() => window.dispatchEvent(new Event('visibilitychange')))
    await settle()
    expect(result.current.pendingWallPosts).toBe(4)
  })

  it('polls the pending count every minute on any admin page, not while hidden', async () => {
    h.pending.mockResolvedValue(1)
    const { result } = mount()
    await settle()
    h.pending.mockResolvedValue(6)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(result.current.pendingWallPosts).toBe(6)
    expect(h.pending).toHaveBeenCalledTimes(2)
    expect(h.flagged).toHaveBeenCalledTimes(1)

    const hidden = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    act(() => window.dispatchEvent(new Event('visibilitychange')))
    await act(() => vi.advanceTimersByTimeAsync(180_000))
    expect(h.pending).toHaveBeenCalledTimes(2)
    hidden.mockRestore()
  })
})
