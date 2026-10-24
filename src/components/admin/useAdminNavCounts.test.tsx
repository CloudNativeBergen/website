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
import type { ModerationQueueData, WallPostStatus } from '@/lib/photo-wall/moderation'

const h = vi.hoisted(() => ({
  flagged: vi.fn(async (): Promise<number> => 0),
  pending: vi.fn(async (): Promise<number> => 0),
  queue: vi.fn(async (): Promise<unknown> => ({ posts: [] })),
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
        moderationQueue: procedure('queue', h.queue),
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

const queueOf = (...statuses: WallPostStatus[]): ModerationQueueData => ({
  posts: statuses.map((status, i) => ({
    _id: `wallPost-${i}`,
    status,
    photo: null,
    crop: { x: 0.5, y: 0.5 },
    caption: null,
    name: null,
    marketingConsent: false,
    submittedAt: null,
    approvedAt: null,
    decidedAt: null,
  })),
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
  h.queue.mockReset().mockResolvedValue({ posts: [] })
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
    let answer = (_n: number) => {}
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

  it('follows the moderation page’s poll while it is open, and never fetches the queue itself', async () => {
    h.pending.mockResolvedValue(5)
    const { result } = mount()
    await settle()
    expect(result.current.pendingWallPosts).toBe(5)
    // `/admin/photo-wall` polls the queue: two of three now pending.
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    act(() => {
      client.setQueryData(
        ['queue'],
        queueOf('pending', 'approved', 'pending', 'notShown', 'deleting'),
      )
    })
    await settle()
    expect(result.current.pendingWallPosts).toBe(2)
    // An Approve all lands on the next poll.
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    act(() => {
      client.setQueryData(['queue'], queueOf('approved', 'approved'))
    })
    await settle()
    expect(result.current.pendingWallPosts).toBe(0)
    expect(h.queue).not.toHaveBeenCalled()
  })

  it('a pending count read after the last poll wins over it', async () => {
    h.pending.mockResolvedValue(5)
    const { result } = mount()
    await settle()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    act(() => {
      client.setQueryData(['queue'], queueOf('pending'))
    })
    await settle()
    expect(result.current.pendingWallPosts).toBe(1)
    // The organizer left the page; back on the tab later, a fresh count.
    h.pending.mockResolvedValue(7)
    await act(() => vi.advanceTimersByTimeAsync(61_000))
    act(() => window.dispatchEvent(new Event('visibilitychange')))
    await settle()
    expect(result.current.pendingWallPosts).toBe(7)
  })
})
