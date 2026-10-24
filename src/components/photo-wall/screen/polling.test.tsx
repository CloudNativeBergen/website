/**
 * @vitest-environment jsdom
 *
 * Screen Mode's polling (Photo Wall spec §8, §9.3): every 5 s whatever
 * happens — past five idle minutes, hidden, and through failed polls, which
 * keep the last answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { ScreenView } from '@/lib/photo-wall/screen'
import { SCREEN_POLL_MS, screenPolling } from './polling'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The app's defaults (`TRPCProvider`): what the options have to work against. */
const appQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

const view = (posts: ScreenView['posts'] = []): ScreenView => ({
  closed: false,
  sponsorStrip: false,
  posts,
})

let latest: { data?: ScreenView; errorUpdatedAt: number } = {
  errorUpdatedAt: 0,
}
function Poller({ queryFn }: { queryFn: () => Promise<ScreenView> }) {
  const q = useQuery({
    queryKey: ['screen'],
    queryFn,
    initialData: view(),
    ...screenPolling,
  })
  useEffect(() => {
    latest = { data: q.data, errorUpdatedAt: q.errorUpdatedAt }
  })
  return null
}

let visibility: DocumentVisibilityState = 'visible'
beforeEach(() => {
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  vi.useFakeTimers()
})

/** A poll's tick, then the notification React Query schedules after it settles. */
const nextPoll = () =>
  act(() => vi.advanceTimersByTimeAsync(SCREEN_POLL_MS + 10))

const mount = (queryFn = vi.fn(async () => view())) => {
  render(
    <QueryClientProvider client={appQueryClient()}>
      <Poller queryFn={queryFn} />
    </QueryClientProvider>,
  )
  return queryFn
}

describe('screenPolling (§8)', () => {
  it('is 5 s', () => {
    expect(SCREEN_POLL_MS).toBe(5_000)
  })

  it('still polls past five idle minutes, with no interaction at all', async () => {
    const queryFn = mount()
    await act(() => vi.advanceTimersByTimeAsync(SCREEN_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(6 * 60_000))
    expect(queryFn).toHaveBeenCalledTimes(1 + 72)
  })

  it('keeps polling while the page is hidden', async () => {
    const queryFn = mount()
    await act(() => vi.advanceTimersByTimeAsync(SCREEN_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1)
    visibility = 'hidden'
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await act(() => vi.advanceTimersByTimeAsync(10 * SCREEN_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(11)
  })

  it('a failed poll keeps the last answer, counts once, and the next poll still comes (§9.3)', async () => {
    const ok = view([
      {
        _id: 'wallPost-1',
        src: 'https://cdn.sanity.io/images/p/d/1.jpg',
        caption: null,
        name: null,
        approvedAt: '2026-10-26T07:40:00Z',
      },
    ])
    let fail = false
    const queryFn = vi.fn(async () => {
      if (fail) throw new Error('offline')
      return ok
    })
    mount(queryFn)
    await nextPoll()
    expect(latest.data).toEqual(ok)
    fail = true
    await nextPoll()
    // No retry: one call per poll, so each failure is one failure.
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(latest.data).toEqual(ok)
    const firstError = latest.errorUpdatedAt
    expect(firstError).toBeGreaterThan(0)
    await nextPoll()
    expect(queryFn).toHaveBeenCalledTimes(3)
    expect(latest.errorUpdatedAt).toBeGreaterThan(firstError)
    expect(latest.data).toEqual(ok)
    fail = false
    await nextPoll()
    expect(queryFn).toHaveBeenCalledTimes(4)
    expect(latest.data).toEqual(ok)
  })
})
