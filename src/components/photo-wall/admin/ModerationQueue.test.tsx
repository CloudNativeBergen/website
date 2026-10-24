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
import type {
  ModerationPost,
  ModerationQueueData,
  PhotoWallAdminView,
} from '@/lib/photo-wall'

const h = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('@/lib/trpc/client', () => ({
  api: { photoWall: { moderationQueue: { useQuery: h.useQuery } } },
}))
// The page's QR code draws on a canvas jsdom does not have.
vi.mock('@/components/feedback/useFeedbackQrPng', () => ({
  useFeedbackQrPng: () => ({ failed: false }),
}))

import { ModerationQueue, ModerationQueueView } from './ModerationQueue'
import { PendingSummary, PendingSummaryView } from './PendingSummary'
import { PhotoWallAdmin } from './PhotoWallAdmin'
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
const QUEUE: ModerationQueueData = {
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
}

const tab = (name: RegExp) => screen.getByRole('tab', { name })

describe('ModerationQueueView (§10)', () => {
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
    render(<ModerationQueueView queue={{ posts: [] }} />)
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Nothing waiting. New posts show up here within about 10 seconds of being posted.',
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
    expect(screen.getByText('Loading posts…')).toBeInTheDocument()
    rerender(<ModerationQueueView failed />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load the posts. Trying again…',
    )
    // Stale data stays on screen while a refresh fails.
    rerender(<ModerationQueueView queue={QUEUE} failed />)
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
    expect(tab(/Pending/)).toHaveAccessibleName('Pending (1)')
  })

  it('shows the loading state, then the failure', () => {
    h.useQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })
    const { rerender } = render(<ModerationQueue />)
    expect(screen.getByText('Loading posts…')).toBeInTheDocument()
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

describe('the live pending count at the top of the page (§10)', () => {
  const VIEW: PhotoWallAdminView = {
    wall: {
      _id: 'photoWall-conf-A',
      postingMode: 'open',
      sponsorStrip: false,
      closedAt: null,
    },
    posting: 'open',
    links: {
      post: 'https://example.test/wall/post',
      wall: 'https://example.test/wall',
      screen: 'https://example.test/wall/screen',
    },
  }
  const pending = (n: number): ModerationQueueData => ({
    posts: Array.from({ length: n }, (_, i) => post({ _id: `wallPost-p${i}` })),
  })
  const page = (view: PhotoWallAdminView, queue: ModerationQueueData) => (
    <PhotoWallAdmin
      view={view}
      onSetUp={() => {}}
      onChange={() => {}}
      summary={<PendingSummaryView pending={queue.posts.length} />}
      queue={<ModerationQueueView queue={queue} />}
    />
  )

  it('says how many photos wait, in words for one, many and none', () => {
    const { rerender } = render(<PendingSummaryView pending={3} />)
    const summary = screen.getByTestId('pending-summary')
    const count = () => summary.querySelector('[aria-live]')
    expect(count()).toHaveTextContent(/^3 photos waiting$/)
    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument()
    rerender(<PendingSummaryView pending={1} />)
    expect(count()).toHaveTextContent(/^1 photo waiting$/)
    rerender(<PendingSummaryView pending={0} />)
    expect(summary).toHaveTextContent(/^Nothing waiting for approval$/)
    expect(screen.queryByRole('link', { name: 'Review' })).toBeNull()
    rerender(<PendingSummaryView />)
    expect(summary).toHaveTextContent(/^$/)
  })

  it("sits under the page header, above Settings, as the page's one live count", () => {
    const { container } = render(page(VIEW, pending(3)))
    const summary = screen.getByTestId('pending-summary')
    const settings = screen.getByRole('region', { name: 'Settings' })
    expect(
      summary.compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // Every live region on the page that says anything about the count.
    const live = [
      ...container.querySelectorAll('[aria-live], [role="status"]'),
    ].filter((el) => /waiting/.test(el.textContent ?? ''))
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent(/^3 photos waiting$/)
    expect(summary).toContainElement(live[0] as HTMLElement)
  })

  it('is not there before the wall is set up', () => {
    render(page({ ...VIEW, wall: null }, pending(3)))
    expect(screen.queryByTestId('pending-summary')).toBeNull()
  })

  it('Review selects and focuses the Pending tab of the queue', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(page(VIEW, QUEUE))
    fireEvent.click(tab(/Not shown/))
    expect(tab(/Pending/)).toHaveAttribute('aria-selected', 'false')
    const review = screen.getByRole('link', { name: 'Review' })
    expect(review).toHaveAttribute('href', '#photo-wall-posts')
    fireEvent.click(review)
    expect(tab(/Pending/)).toHaveAttribute('aria-selected', 'true')
    expect(tab(/Pending/)).toHaveFocus()
    expect(scrollIntoView.mock.contexts[0]).toBe(
      screen.getByRole('region', { name: 'Posts' }),
    )
  })

  it("reads the queue's own query: one read per tick with both on the page", async () => {
    vi.useFakeTimers()
    const queryFn = vi.fn(async () => QUEUE)
    // The connected components over the real React Query: the tRPC hook
    // becomes a plain useQuery under one key, as tRPC's would be.
    h.useQuery.mockImplementation((_input: undefined, options?: object) =>
      useQuery({ queryKey: ['moderationQueue'], queryFn, ...options }),
    )
    render(
      <QueryClientProvider client={appQueryClient()}>
        <PendingSummary />
        <ModerationQueue />
      </QueryClientProvider>,
    )
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('pending-summary')).toHaveTextContent(
      '1 photo waiting',
    )
    await act(() => vi.advanceTimersByTimeAsync(6 * MODERATION_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1 + 6)
  })
})
