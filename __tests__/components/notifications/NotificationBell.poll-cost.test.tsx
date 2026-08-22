/**
 * @vitest-environment jsdom
 *
 * THE COST CONTRACT OF THE NOTIFICATION HUB'S POLLING.
 *
 * The bell and the PWA app-icon badge mount on EVERY authenticated page, in
 * both shells, for every signed-in user. Whatever they poll, they poll all day
 * — which makes this the highest-volume Sanity read in the product and the one
 * place where an extra query is worth a regression net.
 *
 * The contract, in two halves:
 *
 *  1. The BELL issues exactly ONE polled query — `notification.unreadCount` at
 *     `NOTIFICATION_POLL_MS`. It used to issue a second one
 *     (`notification.list({ limit: 1 })`) on the same cadence, purely to title a
 *     toast; that title is now read once, on the rise itself.
 *  2. The BADGE adds NONE. It reads the same key with the same options, and
 *     React Query collapses the two observers into a single fetch — a claim this
 *     file proves against the REAL library rather than asserting in a comment,
 *     including the drift case that shows why the shared constant is
 *     load-bearing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { QueryClient, QueryObserver, focusManager } from '@tanstack/react-query'
import type { Session } from 'next-auth'
import { NOTIFICATION_POLL_MS } from '@/lib/notification/polling'
import { POLL_IDLE_AFTER_MS } from '@/hooks/useIdlePolling'

/** Every `useQuery` the components under test set up, in mount order. */
interface RecordedQuery {
  proc: string
  refetchInterval: unknown
  enabled: boolean
}
const queries: RecordedQuery[] = []

function recorder(proc: string) {
  return (
    _input?: unknown,
    opts?: { refetchInterval?: unknown; enabled?: boolean },
  ) => {
    queries.push({
      proc,
      refetchInterval: opts?.refetchInterval,
      enabled: opts?.enabled !== false,
    })
    return { data: undefined, isSuccess: false }
  }
}

let session: Session | null = null
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session,
    status: session ? 'authenticated' : 'unauthenticated',
  }),
}))

vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotificationSafe: () => ({
    showNotification: vi.fn(),
    removeNotification: vi.fn(),
  }),
}))

// `notification.list.useQuery` is DELIBERATELY present and recordable: if it
// ever comes back as a polled query the assertion below must fail on the
// recorded VALUE, not on a missing mock blowing up the render.
const unreadInvalidate = vi.fn()
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      notification: {
        list: { fetch: vi.fn(async () => []) },
        unreadCount: { invalidate: unreadInvalidate },
      },
    }),
    notification: {
      unreadCount: { useQuery: recorder('notification.unreadCount') },
      list: { useQuery: recorder('notification.list') },
    },
  },
}))

import { NotificationBell } from '@/components/notifications/NotificationBell'
import { AppBadgeSync } from '@/components/pwa/AppBadgeSync'

/** The queries that actually cost a request on a timer. */
const polled = () =>
  queries.filter((q) => q.enabled && typeof q.refetchInterval === 'number')

beforeEach(() => {
  queries.length = 0
  unreadInvalidate.mockClear()
  session = {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { name: 'Jane' },
    speaker: { _id: 'sp-1', name: 'Jane', isOrganizer: true },
  } as unknown as Session
})

afterEach(() => {
  cleanup()
})

describe('the bell costs exactly one polled query', () => {
  it('polls notification.unreadCount and nothing else', () => {
    render(<NotificationBell />)
    expect(polled().map((q) => q.proc)).toEqual(['notification.unreadCount'])
  })

  it('polls it once a minute (NOT the old 30s)', () => {
    render(<NotificationBell />)
    expect(polled()[0].refetchInterval).toBe(NOTIFICATION_POLL_MS)
    expect(NOTIFICATION_POLL_MS).toBe(60_000)
  })

  it('adds no second polled query when the app badge mounts beside it', () => {
    render(
      <>
        <NotificationBell />
        <AppBadgeSync />
      </>,
    )
    // TWO observers, ONE query key, ONE interval — see the react-query proof
    // below for why that is one fetch and not two.
    expect(polled().map((q) => q.proc)).toEqual([
      'notification.unreadCount',
      'notification.unreadCount',
    ])
    expect(new Set(polled().map((q) => q.refetchInterval))).toEqual(
      new Set([NOTIFICATION_POLL_MS]),
    )
  })

  it('never fires the protected query for a signed-out visitor (badge)', () => {
    session = null
    render(<AppBadgeSync />)
    expect(polled()).toEqual([])
  })
})

/**
 * AN ABANDONED TAB MUST STOP. The badge is on every page, so a tab left open on
 * any of them polls forever without this.
 */
describe('the bell stops polling when nobody is there', () => {
  const latestInterval = () =>
    queries.filter((q) => q.proc === 'notification.unreadCount').at(-1)
      ?.refetchInterval

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('withdraws the interval after the idle threshold', async () => {
    render(<NotificationBell />)
    expect(latestInterval()).toBe(NOTIFICATION_POLL_MS)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_AFTER_MS + 60_000)
    })

    expect(latestInterval()).toBe(false)
  })

  it('resumes and refetches the count the moment the user comes back', async () => {
    render(<NotificationBell />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_IDLE_AFTER_MS + 60_000)
    })
    expect(latestInterval()).toBe(false)
    expect(unreadInvalidate).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
      await vi.advanceTimersByTimeAsync(0)
    })

    // Both halves: the timer is back AND the badge is not left showing the
    // count from before the user walked away.
    expect(latestInterval()).toBe(NOTIFICATION_POLL_MS)
    expect(unreadInvalidate).toHaveBeenCalledTimes(1)
  })
})

/**
 * The half of the contract that lives in the LIBRARY, exercised against the real
 * `@tanstack/react-query` — a mock of react-query would be no evidence about
 * react-query.
 */
describe('react-query collapses two same-key observers into one fetch', () => {
  const observe = (
    client: QueryClient,
    refetchInterval: number,
    queryFn: () => Promise<number>,
  ) => {
    const observer = new QueryObserver(client, {
      queryKey: ['notification.unreadCount'],
      queryFn,
      refetchInterval,
      staleTime: 10_000,
    })
    return observer.subscribe(() => {})
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    focusManager.setFocused(undefined)
  })

  it('fetches once per interval with the bell and the badge both subscribed', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryFn = vi.fn(async () => 1)
    const bell = observe(client, NOTIFICATION_POLL_MS, queryFn)
    const badge = observe(client, NOTIFICATION_POLL_MS, queryFn)

    await vi.advanceTimersByTimeAsync(1)
    expect(queryFn).toHaveBeenCalledTimes(1) // the shared mount fetch

    await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS)
    expect(queryFn).toHaveBeenCalledTimes(2) // ONE poll, not two

    await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS)
    expect(queryFn).toHaveBeenCalledTimes(3)

    bell()
    badge()
  })

  it('costs an extra fetch as soon as the two cadences DRIFT apart', async () => {
    // Why `NOTIFICATION_POLL_MS` is shared rather than written out twice: the
    // collapse above holds only while both observers tick together.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryFn = vi.fn(async () => 1)
    const bell = observe(client, NOTIFICATION_POLL_MS, queryFn)
    const badge = observe(client, NOTIFICATION_POLL_MS / 2, queryFn)

    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS)
    expect(queryFn.mock.calls.length).toBeGreaterThan(2)

    bell()
    badge()
  })

  it('does not poll at all while the tab is backgrounded', async () => {
    // The constraint react-query already enforces (`refetchIntervalInBackground`
    // defaults to false and TRPCProvider does not override it). Locked here so a
    // future default flip is caught.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryFn = vi.fn(async () => 1)
    const bell = observe(client, NOTIFICATION_POLL_MS, queryFn)

    await vi.advanceTimersByTimeAsync(1)
    expect(queryFn).toHaveBeenCalledTimes(1)

    focusManager.setFocused(false)
    await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 3)
    expect(queryFn).toHaveBeenCalledTimes(1)

    bell()
  })
})
