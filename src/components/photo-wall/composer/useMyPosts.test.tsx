/**
 * @vitest-environment jsdom
 *
 * My posts' polling (Photo Wall spec §8, §14): on load, every 15 s while
 * the page is visible, and with NO idle stop: past five idle minutes a
 * Waiting post still turns into On the wall. An explicit interval, so a
 * read resolving while the page is hidden can never clear the timer.
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyPost } from '@/lib/photo-wall/my-posts'
import { MY_POSTS_POLL_MS, useMyPosts } from './useMyPosts'

const post = (status: MyPost['status']): MyPost => ({
  _id: 'wallPost-1',
  status,
  src: 'https://cdn.sanity.io/images/p/d/a.jpg',
  caption: 'Keynote',
  name: 'Ada',
  marketingConsent: false,
  submittedAt: '2026-10-26T09:00:00Z',
})

function Probe({
  load,
  action,
}: {
  load: () => Promise<MyPost[]>
  /** A Delete or Marketing change, read after as the list's actions do. */
  action?: () => Promise<unknown>
}) {
  const { posts, refresh } = useMyPosts(load)
  return (
    <>
      <button
        type="button"
        onClick={() => void action?.().finally(() => void refresh())}
      >
        act
      </button>
      <p data-testid="status">
        {posts === null ? 'loading' : (posts[0]?.status ?? 'none')}
      </p>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </>
  )
}

/**
 * Server Actions as the Next client runs them: ONE AT A TIME, in call order
 * (`app-router-instance.js` queues every action behind the one running),
 * each taking `ms` once its turn comes. Counts the calls not yet answered.
 */
function serializedServer() {
  let tail: Promise<unknown> = Promise.resolve()
  const server = {
    outstanding: 0,
    maxOutstanding: 0,
    call<T>(ms: number, answer: () => T, onTurn?: () => void): Promise<T> {
      server.outstanding++
      server.maxOutstanding = Math.max(
        server.maxOutstanding,
        server.outstanding,
      )
      const run = tail.then(
        () =>
          new Promise<T>((resolve) => {
            onTurn?.()
            setTimeout(() => resolve(answer()), ms)
          }),
      )
      tail = run.catch(() => {})
      return run.finally(() => server.outstanding--)
    },
  }
  return server
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility,
  )
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const setVisibility = async (state: DocumentVisibilityState) => {
  visibility = state
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const tick = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms))

describe('useMyPosts', () => {
  it('loads on mount, then every 15 s, with no idle stop: Waiting turns into On the wall after five idle minutes', async () => {
    let status: MyPost['status'] = 'pending'
    const load = vi.fn(async () => [post(status)])
    render(<Probe load={load} />)
    await act(async () => {})
    expect(load).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('pending')

    // Five minutes without a pointer, key or scroll event.
    await tick(5 * 60_000)
    expect(load).toHaveBeenCalledTimes(1 + 20)
    expect(screen.getByTestId('status')).toHaveTextContent('pending')

    status = 'approved'
    await tick(MY_POSTS_POLL_MS)
    expect(load).toHaveBeenCalledTimes(1 + 21)
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
  })

  it('skips the ticks while the page is hidden and reads at once when it is visible again', async () => {
    const load = vi.fn(async () => [post('pending')])
    render(<Probe load={load} />)
    await act(async () => {})
    expect(load).toHaveBeenCalledTimes(1)

    await setVisibility('hidden')
    await tick(4 * MY_POSTS_POLL_MS)
    expect(load).toHaveBeenCalledTimes(1)

    await setVisibility('visible')
    expect(load).toHaveBeenCalledTimes(2)
    // …and the interval is still running.
    await tick(MY_POSTS_POLL_MS)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('keeps the timer when a read resolves while hidden, and keeps the last list through a failed read', async () => {
    let answer: (posts: MyPost[]) => void = () => {}
    const load = vi
      .fn<() => Promise<MyPost[]>>()
      .mockImplementationOnce(
        () => new Promise<MyPost[]>((resolve) => (answer = resolve)),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([post('approved')])
    render(<Probe load={load} />)
    await act(async () => {})
    // The first read is still out when the page goes hidden, then answers.
    await setVisibility('hidden')
    await act(async () => answer([post('pending')]))
    expect(screen.getByTestId('status')).toHaveTextContent('pending')
    await setVisibility('visible')
    // The second read failed: the list stays.
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('status')).toHaveTextContent('pending')
    await tick(MY_POSTS_POLL_MS)
    expect(load).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
  })

  it('reads slower than the interval, on a server that runs actions one at a time, never pile up: at most one read is out', async () => {
    const server = serializedServer()
    let status: MyPost['status'] = 'pending'
    // Every read takes 20 s, longer than the 15 s interval.
    const load = vi.fn(() => server.call(20_000, () => [post(status)]))
    render(<Probe load={load} />)
    await act(async () => {})
    await tick(5 * 60_000)
    status = 'approved'
    await tick(5 * 60_000)
    expect(server.maxOutstanding).toBe(1)
    // One read per 20-30 s, never one per tick queued up.
    expect(load.mock.calls.length).toBeLessThanOrEqual(31)
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
  })

  it('an action issued while reads are slow reaches the server within one read, and the read after it shows its effect', async () => {
    const server = serializedServer()
    let status: MyPost['status'] = 'pending'
    const load = vi.fn(() => server.call(20_000, () => [post(status)]))
    let reachedAt: number | null = null
    const action = vi.fn(() =>
      server.call(
        1_000,
        () => (status = 'approved'),
        () => (reachedAt = Date.now()),
      ),
    )
    render(<Probe load={load} action={action} />)
    await act(async () => {})
    await tick(5 * 60_000 + 7_000)
    const issuedAt = Date.now()
    await act(async () => {
      screen.getByRole('button', { name: 'act' }).click()
    })
    await tick(20_000)
    expect(reachedAt).not.toBeNull()
    expect(reachedAt! - issuedAt).toBeLessThanOrEqual(20_000)
    // At most the read in flight, the action, and one read queued BEHIND
    // the action (a tick while it runs): never a pile ahead of it.
    expect(server.maxOutstanding).toBeLessThanOrEqual(3)
    await tick(25_000)
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
  })

  it('refresh while a read is out collapses into ONE follow-up read after it', async () => {
    const answers: ((posts: MyPost[]) => void)[] = []
    const load = vi.fn(
      () => new Promise<MyPost[]>((resolve) => answers.push(resolve)),
    )
    render(<Probe load={load} />)
    await act(async () => {})
    await act(async () => {
      screen.getByRole('button', { name: 'refresh' }).click()
      screen.getByRole('button', { name: 'refresh' }).click()
    })
    // A tick and a visibility change while it is out start nothing either.
    await tick(MY_POSTS_POLL_MS)
    await setVisibility('visible')
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => answers[0]([post('pending')]))
    expect(screen.getByTestId('status')).toHaveTextContent('pending')
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => answers[1]([post('approved')]))
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stops on unmount', async () => {
    const load = vi.fn(async () => [post('pending')])
    const { unmount } = render(<Probe load={load} />)
    await act(async () => {})
    unmount()
    await tick(3 * MY_POSTS_POLL_MS)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
