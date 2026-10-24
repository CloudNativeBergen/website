/**
 * @vitest-environment jsdom
 *
 * The moderation queue on `/admin/photo-wall` (Photo Wall spec §8, §10,
 * §12): the polling that never stops for an idle organizer, the tabs, the
 * cards, and the rule that a Wall Post photo is a plain `<img>` of its Sanity
 * URL, never `next/image` (§5.1, §14).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { ModerationPost, ModerationQueue as Queue } from '@/lib/photo-wall'

const h = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('@/lib/trpc/client', () => ({
  api: { photoWall: { moderationQueue: { useQuery: h.useQuery } } },
}))

import { ModerationQueue, ModerationQueueView } from './ModerationQueue'
import { MODERATION_POLL_MS, moderationQueuePolling } from './polling'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/**
 * A QueryClient with the app's defaults (`src/components/providers/
 * TRPCProvider.tsx`): the 60 s stale time and the focus refetch turned off
 * are what the polling has to work against.
 */
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

describe('polling (§8): every 10 s while visible, with no idle stop', () => {
  function Poller({ queryFn }: { queryFn: () => Promise<unknown> }) {
    useQuery({ queryKey: ['queue'], queryFn, ...moderationQueuePolling })
    return null
  }
  let visibility: DocumentVisibilityState = 'visible'
  const setVisibility = (state: DocumentVisibilityState) => {
    visibility = state
    window.dispatchEvent(new Event('visibilitychange'))
  }
  beforeEach(() => {
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
    vi.useFakeTimers()
  })

  const mount = (
    queryFn = vi.fn(async (): Promise<unknown> => ({ posts: [] })),
  ) => {
    render(
      <QueryClientProvider client={appQueryClient()}>
        <Poller queryFn={queryFn} />
      </QueryClientProvider>,
    )
    return queryFn
  }

  it('is 10 s', () => {
    expect(MODERATION_POLL_MS).toBe(10_000)
  })

  it('still polls past five idle minutes: nobody touches a phone in a pocket', async () => {
    const queryFn = mount()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(queryFn).toHaveBeenCalledTimes(1)
    // Not one pointer, key or scroll event in six minutes.
    await act(() => vi.advanceTimersByTimeAsync(6 * 60_000))
    expect(queryFn.mock.calls.length).toBeGreaterThanOrEqual(1 + 36)
    // And the next tick still comes.
    const before = queryFn.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(MODERATION_POLL_MS))
    expect(queryFn.mock.calls.length).toBe(before + 1)
  })

  it('pauses while the page is hidden and resumes when it is visible again', async () => {
    const queryFn = mount()
    await act(() => vi.advanceTimersByTimeAsync(2 * MODERATION_POLL_MS))
    const whenHidden = queryFn.mock.calls.length
    expect(whenHidden).toBe(3)
    act(() => setVisibility('hidden'))
    await act(() => vi.advanceTimersByTimeAsync(10 * MODERATION_POLL_MS))
    expect(queryFn.mock.calls.length).toBe(whenHidden)
    act(() => setVisibility('visible'))
    await act(() => vi.advanceTimersByTimeAsync(0))
    // Back: one read at once, then the interval again.
    expect(queryFn.mock.calls.length).toBe(whenHidden + 1)
    await act(() => vi.advanceTimersByTimeAsync(3 * MODERATION_POLL_MS))
    expect(queryFn.mock.calls.length).toBe(whenHidden + 4)
  })

  it('resumes after the page was hidden while a read was in flight', async () => {
    // A read that resolves while the page is hidden must not end the
    // polling: back within the 60 s stale time, the focus refetch is skipped
    // and nothing re-renders, so only the interval can bring the next read.
    let hold = false
    let release = () => {}
    const queryFn = vi.fn((): Promise<unknown> =>
      hold
        ? new Promise((resolve) => {
            release = () => resolve({ posts: [] })
          })
        : Promise.resolve({ posts: [] }),
    )
    mount(queryFn)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(queryFn).toHaveBeenCalledTimes(1)
    hold = true
    await act(() => vi.advanceTimersByTimeAsync(MODERATION_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(2)
    hold = false
    act(() => setVisibility('hidden'))
    await act(async () => release())
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(queryFn).toHaveBeenCalledTimes(2)
    act(() => setVisibility('visible'))
    await act(() => vi.advanceTimersByTimeAsync(3 * MODERATION_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(2 + 3)
  })
})

const photo = (url: string, width: number, height: number) => ({
  url,
  width,
  height,
})
const post = (
  fields: Partial<ModerationPost> & { _id: string },
): ModerationPost => ({
  status: 'pending',
  photo: photo(
    'https://cdn.sanity.io/images/p/d/abc-1600x1000.jpg?w=1200&fit=max&auto=format',
    1600,
    1000,
  ),
  crop: { x: 0.5, y: 0.5 },
  caption: null,
  name: null,
  marketingConsent: false,
  submittedAt: '2026-10-26T07:30:00Z',
  approvedAt: null,
  decidedAt: null,
  ...fields,
})
const QUEUE: Queue = {
  posts: [
    post({
      _id: 'wallPost-1',
      caption: 'Keynote crowd',
      name: 'Ada',
      marketingConsent: true,
      crop: { x: 0, y: 0.5 },
    }),
    post({
      _id: 'wallPost-2',
      status: 'approved',
      photo: photo(
        'https://cdn.sanity.io/images/p/d/def-1200x1600.jpg?w=1200&fit=max&auto=format',
        1200,
        1600,
      ),
      crop: { x: 0.5, y: 1 },
      approvedAt: '2026-10-26T08:00:00Z',
    }),
    post({
      _id: 'wallPost-3',
      status: 'notShown',
      caption: 'Blurry',
      photo: photo(
        'https://cdn.sanity.io/images/p/d/ghi-1600x1000.jpg?w=1200&fit=max&auto=format',
        1600,
        1000,
      ),
      decidedAt: '2026-10-26T08:10:00Z',
    }),
    post({
      _id: 'wallPost-4',
      status: 'deleting',
      photo: null,
      caption: 'Gone soon',
      name: 'Bo',
    }),
  ],
  pendingCount: 1,
}

const tab = (name: RegExp) => screen.getByRole('tab', { name })

describe('ModerationQueueView (§10)', () => {
  it('shows the live pending count at the top', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    expect(screen.getByTestId('queue-status')).toHaveTextContent(
      '1 waiting for approval',
    )
  })

  it('has the three tabs with their counts, Pending first', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Pending1',
      'On the wall1',
      'Not shown2',
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('a pending card: the whole photo, the crop outline, caption, name, time and the marketing mark', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    const panel = screen.getByRole('tabpanel')
    const card = within(panel).getByRole('article')
    const img = within(card).getByRole('img')
    expect(img).toHaveAttribute(
      'src',
      'https://cdn.sanity.io/images/p/d/abc-1600x1000.jpg?w=1200&fit=max&auto=format',
    )
    expect(img).toHaveAttribute('width', '1600')
    expect(img).toHaveAttribute('height', '1000')
    // 1600×1000, crop x = 0: the square is the left 62.5 %.
    const outline = within(card).getByTestId('crop-outline')
    expect(outline.style.left).toBe('0%')
    expect(outline.style.width).toBe('62.5%')
    expect(outline.style.top).toBe('0%')
    expect(outline.style.height).toBe('100%')
    expect(within(card).getByText('Keynote crowd')).toBeInTheDocument()
    expect(within(card).getByText('Ada')).toBeInTheDocument()
    // Server time 07:30Z is 08:30 in Oslo on 26 October (CET).
    expect(within(card).getByText('Mon 26 Oct, 08:30')).toBeInTheDocument()
    expect(within(card).getByText('Marketing OK')).toBeInTheDocument()
  })

  it('never renders a Wall Post photo through /_next/image (§5.1, §14)', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    const urls = new Set<string>()
    for (const name of [/Pending/, /On the wall/, /Not shown/]) {
      fireEvent.click(tab(name))
      for (const img of within(screen.getByRole('tabpanel')).queryAllByRole(
        'img',
      )) {
        urls.add(img.getAttribute('src') ?? '')
      }
    }
    expect(urls.size).toBe(3)
    for (const url of urls) {
      expect(url).not.toContain('/_next/image')
      expect(url.startsWith('https://cdn.sanity.io/images/')).toBe(true)
    }
    expect(urls).toEqual(
      new Set(QUEUE.posts.flatMap((p) => p.photo?.url ?? [])),
    )
  })

  it('On the wall shows the approved post, a portrait with the crop at the bottom', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    fireEvent.click(tab(/On the wall/))
    const card = within(screen.getByRole('tabpanel')).getByRole('article')
    expect(within(card).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('def-1200x1600'),
    )
    const outline = within(card).getByTestId('crop-outline')
    expect(outline.style.top).toBe('25%')
    expect(outline.style.height).toBe('75%')
    expect(outline.style.width).toBe('100%')
    // No caption and no name: nothing made up for them.
    expect(within(card).queryByText('Marketing OK')).toBeNull()
  })

  it('Not shown holds the rejected post and the deleting one, which has no image and says so (§4.2, §12)', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    fireEvent.click(tab(/Not shown/))
    const cards = within(screen.getByRole('tabpanel')).getAllByRole('article')
    expect(cards).toHaveLength(2)
    const deleting = cards.find((c) => within(c).queryByText('Gone soon'))!
    expect(within(deleting).queryByRole('img')).toBeNull()
    expect(
      within(deleting).getByText('Couldn’t delete. Try again.'),
    ).toBeInTheDocument()
    expect(within(deleting).getByText('Bo')).toBeInTheDocument()
    const rejected = cards.find((c) => within(c).queryByText('Blurry'))!
    expect(within(rejected).getByRole('img')).toBeInTheDocument()
  })

  it('says what an empty tab means', () => {
    render(<ModerationQueueView queue={{ posts: [], pendingCount: 0 }} />)
    expect(screen.getByTestId('queue-status')).toHaveTextContent(
      'Nothing waiting for approval',
    )
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /Nothing waiting\. New posts show up here/,
    )
    fireEvent.click(tab(/On the wall/))
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /Nothing on the wall yet/,
    )
    fireEvent.click(tab(/Not shown/))
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      /Rejected and removed posts/,
    )
  })

  it('moves between tabs with the arrow keys', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    const pending = tab(/Pending/)
    pending.focus()
    fireEvent.keyDown(pending, { key: 'ArrowRight' })
    expect(tab(/On the wall/)).toHaveFocus()
    expect(tab(/On the wall/)).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tab(/On the wall/), { key: 'End' })
    expect(tab(/Not shown/)).toHaveFocus()
    fireEvent.keyDown(tab(/Not shown/), { key: 'ArrowRight' })
    expect(tab(/Pending/)).toHaveFocus()
  })

  it('shows the loading and the failed states', () => {
    const { rerender } = render(<ModerationQueueView loading />)
    expect(screen.getByTestId('queue-status')).toHaveTextContent(
      'Loading posts…',
    )
    rerender(<ModerationQueueView failed />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load the posts. Trying again…',
    )
    // Stale data stays on screen while a refresh fails.
    rerender(<ModerationQueueView queue={QUEUE} failed />)
    expect(screen.getByTestId('queue-status')).toHaveTextContent(
      '1 waiting for approval',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t refresh. Trying again…',
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })
})

describe('ModerationQueue, connected', () => {
  it('polls photoWall.moderationQueue with the visible-only interval and no idle stop', () => {
    h.useQuery.mockReturnValue({
      data: QUEUE,
      isPending: false,
      isError: false,
    })
    render(<ModerationQueue />)
    expect(h.useQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        refetchInterval: moderationQueuePolling.refetchInterval,
      }),
    )
    expect(screen.getByTestId('queue-status')).toHaveTextContent(
      '1 waiting for approval',
    )
  })

  it('shows the loading state, then the failure', () => {
    h.useQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })
    const { rerender } = render(<ModerationQueue />)
    expect(screen.getByTestId('queue-status')).toHaveTextContent(
      'Loading posts…',
    )
    h.useQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    })
    rerender(<ModerationQueue />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load the posts',
    )
  })
})
