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

function Probe({ load }: { load: () => Promise<MyPost[]> }) {
  const { posts, refresh } = useMyPosts(load)
  return (
    <>
      <p data-testid="status">
        {posts === null ? 'loading' : (posts[0]?.status ?? 'none')}
      </p>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </>
  )
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

  it('reads slower than the interval still land: each answer newer than the last shown is shown', async () => {
    let status: MyPost['status'] = 'pending'
    // Every read takes 20 s, longer than the 15 s interval, so a tick always
    // finds the previous read still out.
    const load = vi.fn(
      () =>
        new Promise<MyPost[]>((resolve) => {
          const answer = [post(status)]
          setTimeout(() => resolve(answer), 20_000)
        }),
    )
    render(<Probe load={load} />)
    await act(async () => {})
    await tick(20_000)
    expect(screen.getByTestId('status')).toHaveTextContent('pending')

    // Read 3 starts at 30 s and lands at 50 s, though reads 4 and 5 (45 s,
    // 60 s) are out by then.
    status = 'approved'
    await tick(10_000)
    expect(screen.getByTestId('status')).toHaveTextContent('pending')
    await tick(20_000)
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
  })

  it('refresh reads at once, and an older read that answers after a newer one is ignored', async () => {
    const answers: ((posts: MyPost[]) => void)[] = []
    const load = vi.fn(
      () => new Promise<MyPost[]>((resolve) => answers.push(resolve)),
    )
    render(<Probe load={load} />)
    await act(async () => {})
    await act(async () => {
      screen.getByRole('button', { name: 'refresh' }).click()
    })
    expect(load).toHaveBeenCalledTimes(2)
    // The refresh answers first, then the stale mount read.
    await act(async () => answers[1]([post('approved')]))
    await act(async () => answers[0]([post('pending')]))
    expect(screen.getByTestId('status')).toHaveTextContent('approved')
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
