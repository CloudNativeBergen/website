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
  onlineManager,
  useQuery,
} from '@tanstack/react-query'
import type {
  ModerationPost,
  ModerationQueueData,
  PhotoWallAdminView,
} from '@/lib/photo-wall'

const h = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidate: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  remove: vi.fn(),
  deletePost: vi.fn(),
  withdrawMarketing: vi.fn(),
  approveAllPending: vi.fn(),
  setTalkTag: vi.fn(),
}))
vi.mock('@/lib/trpc/client', () => {
  const mutation = (mutateAsync: unknown) => ({
    useMutation: () => ({ mutateAsync }),
  })
  return {
    api: {
      useUtils: () => ({
        photoWall: {
          moderationQueue: { invalidate: h.invalidate },
          // The nav badge push (P6), proven on the real wiring in
          // `usePushPendingCount.test.tsx`.
          pendingCount: { cancel: async () => {}, setData: () => {} },
        },
      }),
      photoWall: {
        moderationQueue: { useQuery: h.useQuery },
        approve: mutation(h.approve),
        reject: mutation(h.reject),
        remove: mutation(h.remove),
        deletePost: mutation(h.deletePost),
        withdrawMarketing: mutation(h.withdrawMarketing),
        approveAllPending: mutation(h.approveAllPending),
        talks: {
          useQuery: () => ({
            data: [
              { _id: 'talk-1', title: 'Keynote', speakers: ['Ada'] },
              { _id: 'talk-2', title: 'Kubernetes at scale', speakers: ['Bo'] },
            ],
          }),
        },
        setTalkTag: mutation(h.setTalkTag),
      },
    },
  }
})
// The page's QR code draws on a canvas jsdom does not have.
vi.mock('@/components/feedback/useFeedbackQrPng', () => ({
  useFeedbackQrPng: () => ({ failed: false }),
}))

import { ModerationQueue, ModerationQueueView } from './ModerationQueue'
import { PendingSummaryView } from './PendingSummary'
import { PhotoWallAdmin } from './PhotoWallAdmin'
import { MODERATION_POLL_MS, moderationQueuePolling } from './polling'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  onlineManager.setOnline(true)
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
  incarnation: { createdAt: null, assetId: null },
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

/** Opens a card's ⋯ menu and answers its items' names. */
const menuOf = (card: HTMLElement) => {
  fireEvent.click(within(card).getByRole('button', { name: 'More actions' }))
  return screen.getAllByRole('menuitem').map((item) => item.textContent)
}
/** Chooses `name` from a card's ⋯ menu. */
const choose = (card: HTMLElement, name: string) => {
  menuOf(card)
  fireEvent.click(screen.getByRole('menuitem', { name }))
}
/** The incarnation the fixtures' cards show: no creation time, no photo id. */
const NO_PHOTO_ID = { createdAt: null, assetId: null }

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
    const outline = within(card).getByTestId('thumb-outline')
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
    const outline = within(card).getByTestId('thumb-outline')
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
    // The placeholder stands where the photo was, and says so.
    expect(within(deleting).getByText('No photo')).toBeInTheDocument()
    const rejected = cards.find((c) => within(c).queryByText('Blurry'))!
    expect(within(rejected).getByRole('img')).toBeInTheDocument()
  })

  it('a card without a caption has no name of its own; its photo says who', () => {
    render(
      <ModerationQueueView
        queue={{ posts: [post({ _id: 'wallPost-n', name: 'Ada' })] }}
      />,
    )
    const card = within(screen.getByRole('tabpanel')).getByRole('article')
    expect(card).not.toHaveAttribute('aria-label')
    expect(card).toHaveAccessibleName('')
    expect(within(card).getByRole('img')).toHaveAccessibleName('Photo by Ada')
  })

  it('only a deleting card says the delete did not finish (§12)', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    const notes = () =>
      within(screen.getByRole('tabpanel'))
        .getAllByRole('article')
        .map((c) => c.textContent?.includes('Couldn’t delete. Try again.'))
    expect(notes()).toEqual([false]) // pending
    fireEvent.click(tab(/On the wall/))
    expect(notes()).toEqual([false]) // approved
    fireEvent.click(tab(/Not shown/))
    // Rejected (latest decision) first, then the deleting one.
    expect(notes()).toEqual([false, true])
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

  it('moves between tabs with the arrow keys, Home and End (WAI-ARIA tabs)', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    const panel = screen.getByRole('tabpanel')
    /** The selected tab: focused, the only one in the Tab order, labelling the panel. */
    const expectSelected = (name: RegExp) => {
      const selected = tab(name)
      expect(selected).toHaveFocus()
      expect(
        screen
          .getAllByRole('tab')
          .map((t) => [
            t.getAttribute('aria-selected'),
            t.tabIndex,
            t.getAttribute('aria-controls'),
          ]),
      ).toEqual(
        screen
          .getAllByRole('tab')
          .map((t) =>
            t === selected ? ['true', 0, panel.id] : ['false', -1, panel.id],
          ),
      )
      expect(panel).toHaveAttribute('aria-labelledby', selected.id)
    }
    tab(/Pending/).focus()
    const press = (key: string) =>
      fireEvent.keyDown(document.activeElement!, { key })
    press('ArrowRight')
    expectSelected(/On the wall/)
    press('End')
    expectSelected(/Not shown/)
    press('ArrowRight')
    expectSelected(/Pending/)
    press('ArrowLeft')
    expectSelected(/Not shown/)
    press('ArrowLeft')
    expectSelected(/On the wall/)
    press('Home')
    expectSelected(/Pending/)
    expect(panel.id).toBe('photo-wall-posts-panel')
  })

  it('shows the loading and the failed states', () => {
    const { rerender } = render(<ModerationQueueView loading />)
    expect(screen.getByText('Loading posts…')).toBeInTheDocument()
    // The skeleton's three placeholder cards, hidden from readers.
    const skeleton = screen
      .getByRole('tabpanel')
      .querySelector('[aria-hidden="true"]')
    expect(skeleton?.children).toHaveLength(3)
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
    // The whole options object: the interval AND the focus refetch the app
    // turns off by default.
    expect(h.useQuery).toHaveBeenCalledWith(undefined, {
      refetchInterval: MODERATION_POLL_MS,
      refetchOnWindowFocus: true,
    })
    expect(h.useQuery.mock.calls[0][1]).toBe(moderationQueuePolling)
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

describe('the live pending count beside the queue heading (§10)', () => {
  const VIEW: PhotoWallAdminView = {
    wall: {
      _id: 'photoWall-conf-A',
      postingMode: 'open',
      sponsorStrip: false,
      look: 'pinboard',
      trustedPostersSkipApproval: false,
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
      queue={
        <ModerationQueueView
          queue={queue}
          summary={<PendingSummaryView pending={queue.posts.length} />}
        />
      }
    />
  )

  it('says how many photos wait, in words for one, many and none', () => {
    const { rerender } = render(<PendingSummaryView pending={3} />)
    const summary = screen.getByTestId('pending-summary')
    const count = () => summary.querySelector('[aria-live]')
    expect(count()).toHaveTextContent(/^3 photos waiting$/)
    // Announced without interrupting the organizer.
    expect(count()).toHaveAttribute('aria-live', 'polite')
    expect(count()).toHaveAttribute('aria-atomic', 'true')
    rerender(<PendingSummaryView pending={1} />)
    expect(count()).toHaveTextContent(/^1 photo waiting$/)
    rerender(<PendingSummaryView pending={0} />)
    expect(summary).toHaveTextContent(/^Nothing waiting for approval$/)
    rerender(<PendingSummaryView />)
    expect(summary).toHaveTextContent(/^$/)
  })

  it("sits in the queue, straight under the header, as the page's one live count", () => {
    const { container } = render(page(VIEW, pending(3)))
    const summary = screen.getByTestId('pending-summary')
    expect(screen.getByRole('region', { name: 'Posts' })).toContainElement(
      summary,
    )
    // Settings are on the Setup page now.
    expect(screen.queryByRole('region', { name: 'Settings' })).toBeNull()
    // Every live region on the page that says anything about the count.
    const live = [
      ...container.querySelectorAll('[aria-live], [role="status"]'),
    ].filter((el) => /waiting/.test(el.textContent ?? ''))
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent(/^3 photos waiting$/)
    expect(summary).toContainElement(live[0] as HTMLElement)
  })

  it('is not there before the wall is set up, nor is the queue', () => {
    render(page({ ...VIEW, wall: null }, pending(3)))
    expect(
      screen.getByRole('button', { name: 'Set up the Photo Wall' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pending-summary')).toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
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

describe('the count says when it is not current (§10)', () => {
  /**
   * Both connected components over the real React Query with the app's
   * defaults; `queryFn` answers each read in turn. The first read lands at
   * 07:30Z, 08:30 in Oslo.
   */
  const mountPage = (queryFn: () => Promise<ModerationQueueData>) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T07:30:00Z'))
    h.useQuery.mockImplementation((_input: undefined, options?: object) =>
      useQuery({ queryKey: ['moderationQueue'], queryFn, ...options }),
    )
    render(
      <QueryClientProvider client={appQueryClient()}>
        <ModerationQueue />
      </QueryClientProvider>,
    )
  }
  const live = () =>
    screen.getByTestId('pending-summary').querySelector('[aria-live]')!

  it('is current while the reads answer', async () => {
    mountPage(async () => QUEUE)
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(5 * MODERATION_POLL_MS))
    expect(live()).toHaveTextContent(/^1 photo waiting$/)
  })

  it('offline: the paused read says since when the count is old', async () => {
    mountPage(async () => QUEUE)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(live()).toHaveTextContent(/^1 photo waiting$/)
    act(() => onlineManager.setOnline(false))
    await act(() => vi.advanceTimersByTimeAsync(MODERATION_POLL_MS))
    expect(live()).toHaveTextContent(/^1 photo waitingNot updated since 08:30$/)
    act(() => onlineManager.setOnline(true))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(live()).toHaveTextContent(/^1 photo waiting$/)
  })

  it('a failed read says so at the top, not only in the queue below', async () => {
    let reads = 0
    mountPage(async () => {
      reads += 1
      if (reads > 1) throw new Error('down')
      return { posts: [] }
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(live()).toHaveTextContent(/^Nothing waiting for approval$/)
    // The tick, its retry, and the error.
    await act(() => vi.advanceTimersByTimeAsync(MODERATION_POLL_MS + 2_000))
    expect(live()).toHaveTextContent(
      /^Nothing waiting for approvalNot updated since 08:30$/,
    )
  })

  it('a read that never answers: stale after two missed polls', async () => {
    let reads = 0
    mountPage(() => {
      reads += 1
      return reads > 1 ? new Promise<never>(() => {}) : Promise.resolve(QUEUE)
    })
    await act(() => vi.advanceTimersByTimeAsync(0))
    await act(() => vi.advanceTimersByTimeAsync(2 * MODERATION_POLL_MS))
    expect(live()).toHaveTextContent(/^1 photo waiting$/)
    await act(() => vi.advanceTimersByTimeAsync(MODERATION_POLL_MS))
    expect(live()).toHaveTextContent(/^1 photo waitingNot updated since 08:30$/)
  })

  it('offline before the first read: no count, and it says so', async () => {
    onlineManager.setOnline(false)
    const queryFn = vi.fn(async () => QUEUE)
    mountPage(queryFn)
    await act(() => vi.advanceTimersByTimeAsync(3 * MODERATION_POLL_MS))
    expect(queryFn).not.toHaveBeenCalled()
    expect(live()).toHaveTextContent(
      /^Couldn’t load the count\. Trying again…$/,
    )
    act(() => onlineManager.setOnline(true))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(live()).toHaveTextContent(/^1 photo waiting$/)
  })

  it('no count at all when the first read fails', async () => {
    mountPage(async () => {
      throw new Error('down')
    })
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(live()).toHaveTextContent(
      /^Couldn’t load the count\. Trying again…$/,
    )
  })
})

describe('an empty Pending tab says when posting is shut (§7)', () => {
  it.each([
    [undefined, /^Nothing waiting\. New posts show up here/],
    ['open', /^Nothing waiting\. New posts show up here/],
    [
      'paused',
      /^Nothing waiting\. Posting is paused, so no new photos come in\.$/,
    ],
    ['notYetOpen', /^Nothing waiting\. Posting hasn’t opened yet\.$/],
    ['ended', /^Nothing waiting\. Posting is closed\.$/],
  ] as const)('posting %s', (posting, text) => {
    render(<ModerationQueueView queue={{ posts: [] }} posting={posting} />)
    expect(screen.getByRole('tabpanel')).toHaveTextContent(text)
  })
})

describe('a failed first load shows no zeros as real (§10)', () => {
  it('no counts on the tabs and no empty-tab text without data', () => {
    render(<ModerationQueueView failed />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Pending',
      'On the wall',
      'Not shown',
    ])
    expect(tab(/Pending/)).toHaveAccessibleName('Pending')
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/^$/)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load the posts. Trying again…',
    )
  })
})

describe('the card (§10)', () => {
  it('caps a tall photo at 70vh and keeps the outline on the photo box', () => {
    render(
      <ModerationQueueView
        queue={{
          posts: [
            post({
              _id: 'wallPost-tall',
              photo: photo(
                'https://cdn.sanity.io/images/p/d/t-320x2048.jpg',
                320,
                2048,
              ),
              crop: { x: 0.5, y: 1 },
            }),
          ],
        }}
      />,
    )
    // The card shows a square thumbnail; the photo opens large.
    expect(screen.getByTestId('thumb-box').style.width).toBe('15.625%')
    fireEvent.click(screen.getByRole('button', { name: /^Enlarge/ }))
    const box = screen.getByTestId('photo-box')
    expect(box.style.width).toMatch(/^min\(100%, 70vh ?\* ?0\.15625\)$/)
    expect(box.style.aspectRatio).toBe('320 / 2048')
    // The outline and the photo are inside the capped box, not its frame.
    expect(box).toContainElement(screen.getByTestId('crop-outline'))
    expect(box).toContainElement(within(box).getByRole('img'))
    expect(screen.getByTestId('crop-outline').style.top).toBe('84.375%')
  })

  it('lets a caption and a name in any script set their own direction', () => {
    render(
      <ModerationQueueView
        queue={{
          posts: [post({ _id: 'wallPost-rtl', caption: 'شكرا', name: 'سارة' })],
        }}
      />,
    )
    expect(screen.getByText('شكرا')).toHaveAttribute('dir', 'auto')
    expect(screen.getByText('سارة')).toHaveAttribute('dir', 'auto')
  })
})

describe('the actions (§10)', () => {
  beforeEach(() => {
    for (const fn of [
      h.invalidate,
      h.approve,
      h.reject,
      h.remove,
      h.deletePost,
      h.withdrawMarketing,
      h.approveAllPending,
    ]) {
      fn.mockReset()
    }
    h.useQuery.mockReturnValue({
      data: QUEUE,
      isPending: false,
      isError: false,
    })
  })

  const card = (name: string) => screen.getByRole('article', { name })
  // The card's buttons by name, leaving out the thumbnail's Enlarge.
  const buttons = (el: HTMLElement) =>
    within(el)
      .queryAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
      .filter((name) => !name?.startsWith('Enlarge'))
  const notice = () => screen.getByRole('status')

  it('each status offers its own actions; a deleting card only Try again', () => {
    render(<ModerationQueue />)
    // Withdraw marketing OK only on a card with the mark.
    // The decisions are buttons; the rest is in the ⋯ menu.
    expect(buttons(card('Keynote crowd'))).toEqual([
      'Approve',
      'Reject',
      'More actions',
    ])
    expect(menuOf(card('Keynote crowd'))).toEqual([
      'Add talk',
      'Withdraw marketing OK',
      'Delete now',
    ])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(tab(/^On the wall/))
    expect(buttons(screen.getByRole('article'))).toEqual([
      'Remove',
      'More actions',
    ])
    expect(menuOf(screen.getByRole('article'))).toEqual([
      'Add talk',
      'Delete now',
    ])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(tab(/^Not shown/))
    expect(buttons(card('Blurry'))).toEqual(['Approve', 'More actions'])
    expect(buttons(card('Gone soon'))).toEqual(['Try again'])
  })

  it('a deleting card with the mark still offers only Try again', () => {
    render(
      <ModerationQueueView
        queue={{
          posts: [
            post({
              _id: 'wallPost-9',
              status: 'deleting',
              photo: null,
              caption: 'Half gone',
              marketingConsent: true,
            }),
          ],
        }}
        onAction={async () => 'done'}
      />,
    )
    fireEvent.click(tab(/^Not shown/))
    expect(buttons(card('Half gone'))).toEqual(['Try again'])
  })

  it('Withdraw marketing OK asks first; Cancel withdraws nothing and gives focus back', async () => {
    render(<ModerationQueue />)
    choose(card('Keynote crowd'), 'Withdraw marketing OK')
    const confirm = within(card('Keynote crowd')).getByRole('group', {
      name: 'Withdraw marketing OK? The photo leaves the marketing export. Only the contributor can give it again.',
    })
    await vi.waitFor(() =>
      expect(
        within(confirm).getByRole('button', { name: 'Cancel' }),
      ).toHaveFocus(),
    )
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() =>
      expect(
        within(card('Keynote crowd')).getByRole('button', {
          name: 'More actions',
        }),
      ).toHaveFocus(),
    )
    expect(h.withdrawMarketing).not.toHaveBeenCalled()
  })

  it('Withdraw marketing OK, confirmed, sends the post the card showed, says so, and reads the queue again', async () => {
    h.withdrawMarketing.mockResolvedValue({ status: 'done' })
    render(<ModerationQueue />)
    choose(card('Keynote crowd'), 'Withdraw marketing OK')
    fireEvent.click(
      within(card('Keynote crowd')).getByRole('button', { name: 'Withdraw' }),
    )
    await screen.findByText(
      'Marketing OK withdrawn. The photo is left out of the marketing export.',
    )
    // The id and the post shown: nothing that could give consent.
    expect(h.withdrawMarketing).toHaveBeenCalledWith({
      id: 'wallPost-1',
      shown: NO_PHOTO_ID,
    })
    expect(h.invalidate).toHaveBeenCalledTimes(1)
    expect(h.deletePost).not.toHaveBeenCalled()
  })

  describe('a poll makes the post ineligible while Withdraw asks', () => {
    const consenting = post({
      _id: 'wallPost-7',
      status: 'notShown',
      caption: 'Late one',
      marketingConsent: true,
      decidedAt: '2026-10-26T08:10:00Z',
    })
    const view = (p: ModerationPost) => (
      <ModerationQueueView
        queue={{ posts: [p] }}
        onAction={async () => 'done'}
      />
    )
    const openConfirm = () => {
      const r = render(view(consenting))
      fireEvent.click(tab(/^Not shown/))
      choose(card('Late one'), 'Withdraw marketing OK')
      return r
    }
    const confirmGroup = () =>
      within(card('Late one')).queryByRole('group', {
        name: /^Withdraw marketing OK\?/,
      })

    it.each([
      [
        'the mark is gone (another organizer withdrew it)',
        { marketingConsent: false },
        ['Approve', 'More actions'],
        'More actions',
      ],
      [
        'the post is deleting (another organizer started a Delete)',
        { status: 'deleting' as const, photo: null },
        ['Try again'],
        'Try again',
      ],
    ])(
      'closes when %s, and hands focus to the delete button',
      async (_name, change, after, focused) => {
        const { rerender } = openConfirm()
        await vi.waitFor(() =>
          expect(
            within(confirmGroup()!).getByRole('button', { name: 'Cancel' }),
          ).toHaveFocus(),
        )
        rerender(view({ ...consenting, ...change }))
        expect(confirmGroup()).toBeNull()
        expect(buttons(card('Late one'))).toEqual(after)
        await vi.waitFor(() =>
          expect(
            within(card('Late one')).getByRole('button', { name: focused }),
          ).toHaveFocus(),
        )
        // Closed for good: the mark coming back does not reopen it.
        rerender(view(consenting))
        expect(confirmGroup()).toBeNull()
      },
    )

    it('leaves focus the organizer moved elsewhere alone', async () => {
      const { rerender } = openConfirm()
      const elsewhere = tab(/^Pending/)
      elsewhere.focus()
      rerender(view({ ...consenting, marketingConsent: false }))
      expect(confirmGroup()).toBeNull()
      await act(() => Promise.resolve())
      expect(elsewhere).toHaveFocus()
    })
  })

  it.each([
    ['gone', { status: 'gone' }, 'This photo was deleted.'],
    ['failed', null, 'Couldn’t withdraw marketing OK. Try again.'],
  ] as const)(
    'Withdraw marketing OK %s says so',
    async (_name, answer, said) => {
      if (answer) h.withdrawMarketing.mockResolvedValue(answer)
      else h.withdrawMarketing.mockRejectedValue(new Error('offline'))
      render(<ModerationQueue />)
      choose(card('Keynote crowd'), 'Withdraw marketing OK')
      fireEvent.click(
        within(card('Keynote crowd')).getByRole('button', { name: 'Withdraw' }),
      )
      await screen.findByText(said)
    },
  )

  it('a card without onAction has no actions (read only)', () => {
    render(<ModerationQueueView queue={QUEUE} />)
    expect(buttons(card('Keynote crowd'))).toEqual([])
  })

  it('the talk tag (Talk photos spec §6.3): Add talk searches and sets it, Clear tag clears it', async () => {
    h.setTalkTag.mockResolvedValue({ status: 'done' })
    render(<ModerationQueue />)
    const keynote = card('Keynote crowd')
    expect(within(keynote).getByText('No talk tagged.')).toBeTruthy()
    choose(keynote, 'Add talk')
    fireEvent.change(within(keynote).getByRole('searchbox'), {
      target: { value: 'bo' },
    })
    expect(within(keynote).queryByRole('button', { name: /^Keynote/ })).toBe(
      null,
    )
    fireEvent.click(
      within(keynote).getByRole('button', { name: /Kubernetes at scale/ }),
    )
    await vi.waitFor(() =>
      expect(h.setTalkTag).toHaveBeenCalledWith({
        id: 'wallPost-1',
        shown: NO_PHOTO_ID,
        talkId: 'talk-2',
      }),
    )
    expect(h.invalidate).toHaveBeenCalled()
  })

  it('a tagged card shows the talk and Clear tag sends null; a deleting card has no tag actions', async () => {
    h.setTalkTag.mockResolvedValue({ status: 'done' })
    h.useQuery.mockReturnValue({
      data: {
        posts: [
          post({
            _id: 'wallPost-1',
            caption: 'Tagged',
            talk: { _id: 'talk-1', title: 'Keynote', speakers: ['Ada'] },
          }),
        ],
      },
      isPending: false,
      isError: false,
    })
    render(<ModerationQueue />)
    const tagged = card('Tagged')
    expect(within(tagged).getByTestId('talk-tag').textContent).toContain(
      'Talk: Keynote · Ada',
    )
    choose(tagged, 'Clear tag')
    await vi.waitFor(() =>
      expect(h.setTalkTag).toHaveBeenCalledWith({
        id: 'wallPost-1',
        shown: NO_PHOTO_ID,
        talkId: null,
      }),
    )
  })

  it('Approve sends the status the card showed, says so, and reads the queue again', async () => {
    h.approve.mockResolvedValue({ status: 'done' })
    render(<ModerationQueue />)
    fireEvent.click(
      within(card('Keynote crowd')).getByRole('button', { name: 'Approve' }),
    )
    await screen.findByText('Approved · Undo takes it off the wall')
    expect(h.approve).toHaveBeenCalledWith({
      id: 'wallPost-1',
      from: 'pending',
      shown: NO_PHOTO_ID,
    })
    expect(h.invalidate).toHaveBeenCalledTimes(1)

    fireEvent.click(tab(/^Not shown/))
    fireEvent.click(
      within(card('Blurry')).getByRole('button', { name: 'Approve' }),
    )
    await vi.waitFor(() =>
      expect(h.approve).toHaveBeenLastCalledWith({
        id: 'wallPost-3',
        from: 'notShown',
        shown: NO_PHOTO_ID,
      }),
    )
  })

  it.each([
    [
      'Reject',
      h.reject,
      'Keynote crowd',
      'Rejected · Undo puts it on the wall',
    ],
  ] as const)('%s', async (label, fn, name, said) => {
    fn.mockResolvedValue({ status: 'done' })
    render(<ModerationQueue />)
    fireEvent.click(within(card(name)).getByRole('button', { name: label }))
    await screen.findByText(said)
    expect(fn).toHaveBeenCalledWith({ id: 'wallPost-1', shown: NO_PHOTO_ID })
  })

  it('Remove', async () => {
    h.remove.mockResolvedValue({ status: 'done' })
    render(<ModerationQueue />)
    fireEvent.click(tab(/^On the wall/))
    fireEvent.click(
      within(screen.getByRole('article')).getByRole('button', {
        name: 'Remove',
      }),
    )
    await screen.findByText('Removed · Undo puts it back on the wall')
    expect(h.remove).toHaveBeenCalledWith({
      id: 'wallPost-2',
      from: 'approved',
      shown: NO_PHOTO_ID,
    })
  })

  it('Delete now asks first; Cancel deletes nothing and gives focus back', async () => {
    render(<ModerationQueue />)
    choose(card('Keynote crowd'), 'Delete now')
    const confirm = within(card('Keynote crowd')).getByRole('group', {
      name: 'Delete this photo for good? It can’t be undone.',
    })
    // Focus goes to Cancel, never the destructive choice.
    await vi.waitFor(() =>
      expect(
        within(confirm).getByRole('button', { name: 'Cancel' }),
      ).toHaveFocus(),
    )
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() =>
      expect(
        within(card('Keynote crowd')).getByRole('button', {
          name: 'More actions',
        }),
      ).toHaveFocus(),
    )
    expect(h.deletePost).not.toHaveBeenCalled()
  })

  it('Delete now, confirmed, deletes it', async () => {
    h.deletePost.mockResolvedValue({ status: 'deleted' })
    render(<ModerationQueue />)
    choose(card('Keynote crowd'), 'Delete now')
    fireEvent.click(
      within(card('Keynote crowd')).getByRole('button', { name: 'Delete' }),
    )
    await screen.findByText('Deleted for good.')
    expect(h.deletePost).toHaveBeenCalledWith({
      id: 'wallPost-1',
      shown: NO_PHOTO_ID,
    })
  })

  it('Try again finishes a delete without asking again', async () => {
    h.deletePost.mockResolvedValue({ status: 'deleted' })
    render(<ModerationQueue />)
    fireEvent.click(tab(/^Not shown/))
    fireEvent.click(
      within(card('Gone soon')).getByRole('button', { name: 'Try again' }),
    )
    await screen.findByText('Deleted for good.')
    expect(h.deletePost).toHaveBeenCalledWith({
      id: 'wallPost-4',
      shown: NO_PHOTO_ID,
    })
  })

  it('a press while the card is busy does nothing, and the button keeps focus', async () => {
    let finish: (value: { status: string }) => void = () => {}
    h.approve.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<ModerationQueue />)
    const approve = within(card('Keynote crowd')).getByRole('button', {
      name: 'Approve',
    })
    approve.focus()
    fireEvent.click(approve)
    await vi.waitFor(() => expect(approve).toHaveTextContent('Approving…'))
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(approve).toHaveFocus()
    fireEvent.click(approve)
    fireEvent.click(
      within(card('Keynote crowd')).getByRole('button', { name: 'Reject' }),
    )
    expect(h.approve).toHaveBeenCalledTimes(1)
    expect(h.reject).not.toHaveBeenCalled()
    await act(async () => finish({ status: 'done' }))
  })

  it('says when someone else changed the post first, and when it is gone', async () => {
    h.reject.mockResolvedValueOnce({ status: 'changed' })
    h.reject.mockResolvedValueOnce({ status: 'gone' })
    render(<ModerationQueue />)
    const reject = () =>
      fireEvent.click(
        within(card('Keynote crowd')).getByRole('button', { name: 'Reject' }),
      )
    reject()
    await vi.waitFor(() =>
      expect(notice()).toHaveTextContent(
        'Another organizer changed this photo first. Showing it as it is now.',
      ),
    )
    reject()
    await vi.waitFor(() =>
      expect(notice()).toHaveTextContent('This photo was deleted.'),
    )
    expect(h.invalidate).toHaveBeenCalledTimes(2)
  })

  it('a failed action says so on the card, and the queue is read again', async () => {
    h.approve.mockRejectedValue(new Error('offline'))
    render(<ModerationQueue />)
    fireEvent.click(
      within(card('Keynote crowd')).getByRole('button', { name: 'Approve' }),
    )
    expect(
      await within(card('Keynote crowd')).findByRole('alert'),
    ).toHaveTextContent('Couldn’t approve. Try again.')
    expect(notice()).toHaveTextContent('')
    expect(h.invalidate).toHaveBeenCalledTimes(1)
  })

  describe('Approve all pending (§10)', () => {
    const many: ModerationQueueData = {
      posts: [
        ...QUEUE.posts,
        post({ _id: 'wallPost-5', caption: 'Second' }),
        post({ _id: 'wallPost-6', caption: 'Third' }),
      ],
    }

    it('names the pending count, asks first, and says how many it approved', async () => {
      h.useQuery.mockReturnValue({
        data: many,
        isPending: false,
        isError: false,
      })
      h.approveAllPending.mockResolvedValue({ approved: 3, pending: 3 })
      render(<ModerationQueue />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve all pending (3)' }),
      )
      expect(
        screen.getByRole('group', {
          name: 'Approve all 3 pending photos? They go on the wall.',
        }),
      ).toBeVisible()
      expect(h.approveAllPending).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
      await vi.waitFor(() =>
        expect(notice()).toHaveTextContent('Approved 3 photos.'),
      )
      // The Pending cards shown, oldest first: nothing the organizer did not see.
      expect(h.approveAllPending).toHaveBeenCalledTimes(1)
      expect(h.approveAllPending).toHaveBeenCalledWith({
        shown: ['wallPost-1', 'wallPost-5', 'wallPost-6'].map((id) => ({
          id,
          ...NO_PHOTO_ID,
        })),
      })
      expect(h.invalidate).toHaveBeenCalledTimes(1)
    })

    it('says when some were skipped, of the count the button named', async () => {
      h.useQuery.mockReturnValue({
        data: many,
        isPending: false,
        isError: false,
      })
      h.approveAllPending.mockResolvedValue({ approved: 2, pending: 3 })
      render(<ModerationQueue />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve all pending (3)' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
      await vi.waitFor(() =>
        expect(notice()).toHaveTextContent(
          'Approved 2 of 3. The others changed meanwhile or took too long; any still pending can be approved again.',
        ),
      )
    })

    it('Cancel approves nothing', () => {
      render(<ModerationQueue />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve all pending (1)' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(h.approveAllPending).not.toHaveBeenCalled()
      expect(
        screen.getByRole('button', { name: 'Approve all pending (1)' }),
      ).toBeVisible()
    })

    it('is offered on the Pending tab only, and only with something pending', () => {
      h.useQuery.mockReturnValue({
        data: { posts: QUEUE.posts.filter((p) => p.status !== 'pending') },
        isPending: false,
        isError: false,
      })
      render(<ModerationQueue />)
      expect(screen.queryByRole('button', { name: /^Approve all/ })).toBeNull()
      cleanup()
      h.useQuery.mockReturnValue({
        data: QUEUE,
        isPending: false,
        isError: false,
      })
      render(<ModerationQueue />)
      fireEvent.click(tab(/^On the wall/))
      expect(screen.queryByRole('button', { name: /^Approve all/ })).toBeNull()
    })

    it('a run in flight survives a tab switch: back on Pending it says so, and a press sends nothing', async () => {
      h.useQuery.mockReturnValue({
        data: many,
        isPending: false,
        isError: false,
      })
      h.approveAllPending.mockReturnValue(new Promise(() => {}))
      render(<ModerationQueue />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve all pending (3)' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
      fireEvent.click(tab(/^On the wall/))
      fireEvent.click(tab(/^Pending/))
      const again = screen.getByRole('button', { name: 'Approving all…' })
      expect(again).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(again)
      expect(screen.queryByRole('button', { name: 'Approve all' })).toBeNull()
      expect(h.approveAllPending).toHaveBeenCalledTimes(1)
    })

    it('a failed run says so and can be pressed again', async () => {
      h.approveAllPending.mockRejectedValueOnce(new Error('offline'))
      render(<ModerationQueue />)
      fireEvent.click(
        screen.getByRole('button', { name: 'Approve all pending (1)' }),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Approve all' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t approve them. Try again.',
      )
      expect(screen.getByRole('button', { name: 'Approve all' })).toBeVisible()
    })
  })
})

describe('the queue holds what is in flight, and where focus goes (§10)', () => {
  const pendingTwo: ModerationQueueData = {
    posts: [
      post({ _id: 'wallPost-1', caption: 'First' }),
      post({
        _id: 'wallPost-5',
        caption: 'Second',
        submittedAt: '2026-10-26T07:40:00Z',
      }),
      post({
        _id: 'wallPost-2',
        status: 'approved',
        caption: 'Up',
        approvedAt: '2026-10-26T08:00:00Z',
      }),
    ],
  }
  const serve = (data: ModerationQueueData) =>
    h.useQuery.mockReturnValue({ data, isPending: false, isError: false })
  const card = (name: string) => screen.getByRole('article', { name })
  const approved = (data: ModerationQueueData, ...ids: string[]) => ({
    posts: data.posts.map((p) =>
      ids.includes(p._id) ? { ...p, status: 'approved' as const } : p,
    ),
  })

  beforeEach(() => {
    for (const fn of [h.invalidate, h.approve, h.approveAllPending]) {
      fn.mockReset()
    }
    serve(pendingTwo)
  })

  it('a card action in flight survives a tab switch: back on the tab, a press sends nothing', () => {
    h.approve.mockReturnValue(new Promise(() => {}))
    render(<ModerationQueue />)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Approve' }),
    )
    fireEvent.click(tab(/^On the wall/))
    fireEvent.click(tab(/^Pending/))
    const busy = within(card('First')).getByRole('button', {
      name: 'Approving…',
    })
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(busy)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Reject' }),
    )
    expect(h.approve).toHaveBeenCalledTimes(1)
    expect(h.reject).not.toHaveBeenCalled()
  })

  it('when the card acted on leaves the tab, focus goes to the card now in its place', async () => {
    h.approve.mockResolvedValue({ status: 'done' })
    const { rerender } = render(<ModerationQueue />)
    const button = within(card('First')).getByRole('button', {
      name: 'Approve',
    })
    button.focus()
    fireEvent.click(button)
    await screen.findByText('Approved · Undo takes it off the wall')
    serve(approved(pendingTwo, 'wallPost-1'))
    rerender(<ModerationQueue />)
    expect(
      within(card('Second')).getByRole('button', { name: 'Approve' }),
    ).toHaveFocus()
  })

  it('when a poll takes the card away before the answer comes, focus still goes to the card now in its place', async () => {
    let answer: (value: { status: string }) => void = () => {}
    h.approve.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { rerender } = render(<ModerationQueue />)
    const button = within(card('First')).getByRole('button', {
      name: 'Approve',
    })
    button.focus()
    fireEvent.click(button)
    // Another organizer's approval arrives with the next poll, first.
    serve(approved(pendingTwo, 'wallPost-1'))
    rerender(<ModerationQueue />)
    // At once, not only when the answer comes (it may take a while).
    expect(
      within(card('Second')).getByRole('button', { name: 'Approve' }),
    ).toHaveFocus()
    await act(async () => answer({ status: 'changed' }))
    // A later poll with the same posts changes nothing.
    rerender(<ModerationQueue />)
    expect(
      within(card('Second')).getByRole('button', { name: 'Approve' }),
    ).toHaveFocus()
  })

  it('two approvals at once, the second card leaving first: focus goes to the card left, then to the tab', async () => {
    const answers: ((value: { status: string }) => void)[] = []
    h.approve.mockImplementation(
      () => new Promise((resolve) => answers.push(resolve)),
    )
    const { rerender } = render(<ModerationQueue />)
    const press = (name: string) => {
      const button = within(card(name)).getByRole('button', {
        name: 'Approve',
      })
      button.focus()
      fireEvent.click(button)
    }
    press('First')
    press('Second')
    // B is answered and leaves first.
    await act(async () => answers[1]({ status: 'done' }))
    serve(approved(pendingTwo, 'wallPost-5'))
    rerender(<ModerationQueue />)
    expect(card('First').querySelector('[data-decision]')).toHaveFocus()
    // Then A.
    await act(async () => answers[0]({ status: 'done' }))
    serve(approved(pendingTwo, 'wallPost-1', 'wallPost-5'))
    rerender(<ModerationQueue />)
    expect(tab(/^Pending/)).toHaveFocus()
  })

  it('goes to the card now at the index of the one that left, not the first', async () => {
    const three: ModerationQueueData = {
      posts: [
        ...pendingTwo.posts,
        post({
          _id: 'wallPost-6',
          caption: 'Third',
          submittedAt: '2026-10-26T07:50:00Z',
        }),
      ],
    }
    serve(three)
    h.approve.mockResolvedValue({ status: 'done' })
    const { rerender } = render(<ModerationQueue />)
    const button = within(card('Second')).getByRole('button', {
      name: 'Approve',
    })
    button.focus()
    fireEvent.click(button)
    await screen.findByText('Approved · Undo takes it off the wall')
    serve(approved(three, 'wallPost-5'))
    rerender(<ModerationQueue />)
    expect(
      within(card('Third')).getByRole('button', { name: 'Approve' }),
    ).toHaveFocus()
  })

  it('a press elsewhere on the page after the action: focus is not pulled back', async () => {
    h.approve.mockResolvedValue({ status: 'done' })
    const { rerender } = render(<ModerationQueue />)
    const button = within(card('First')).getByRole('button', {
      name: 'Approve',
    })
    button.focus()
    fireEvent.click(button)
    await screen.findByText('Approved · Undo takes it off the wall')
    fireEvent.pointerDown(document.body)
    serve(approved(pendingTwo, 'wallPost-1'))
    rerender(<ModerationQueue />)
    expect(document.activeElement).toBe(document.body)
  })

  it('a press on a card’s caption (no control) means focus is not pulled back', async () => {
    const { rerender } = render(<ModerationQueue />)
    const button = within(card('First')).getByRole('button', {
      name: 'Approve',
    })
    button.focus()
    // The press drops focus to the page, as a browser does.
    fireEvent.pointerDown(within(card('First')).getByText('First'))
    button.blur()
    serve(approved(pendingTwo, 'wallPost-5'))
    rerender(<ModerationQueue />)
    expect(document.activeElement).toBe(document.body)
  })

  it('leaves focus alone when it was last outside the queue', async () => {
    h.approve.mockResolvedValue({ status: 'done' })
    const { rerender } = render(<ModerationQueue />)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Approve' }),
    )
    await screen.findByText('Approved · Undo takes it off the wall')
    serve(approved(pendingTwo, 'wallPost-1'))
    rerender(<ModerationQueue />)
    expect(document.activeElement).toBe(document.body)
  })

  it('when the tab empties, focus goes to the tab', async () => {
    serve({ posts: [pendingTwo.posts[0]] })
    h.approve.mockResolvedValue({ status: 'done' })
    const { rerender } = render(<ModerationQueue />)
    const button = within(card('First')).getByRole('button', {
      name: 'Approve',
    })
    button.focus()
    fireEvent.click(button)
    await screen.findByText('Approved · Undo takes it off the wall')
    serve(approved({ posts: [pendingTwo.posts[0]] }, 'wallPost-1'))
    rerender(<ModerationQueue />)
    expect(tab(/^Pending/)).toHaveFocus()
  })

  it('when Approve all empties Pending, focus goes to the tab', async () => {
    h.approveAllPending.mockResolvedValue({ approved: 2, pending: 2 })
    const { rerender } = render(<ModerationQueue />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve all pending (2)' }),
    )
    // Pressed as a browser does: the button pressed has focus.
    const confirm = screen.getByRole('button', { name: 'Approve all' })
    confirm.focus()
    fireEvent.click(confirm)
    await screen.findByText('Approved 2 photos.')
    serve(approved(pendingTwo, 'wallPost-1', 'wallPost-5'))
    rerender(<ModerationQueue />)
    expect(tab(/^Pending/)).toHaveFocus()
  })

  it('leaves focus alone when it was not lost', async () => {
    h.approve.mockResolvedValue({ status: 'done' })
    const { rerender } = render(<ModerationQueue />)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Approve' }),
    )
    await screen.findByText('Approved · Undo takes it off the wall')
    tab(/^Not shown/).focus()
    serve(approved(pendingTwo, 'wallPost-1'))
    rerender(<ModerationQueue />)
    expect(tab(/^Not shown/)).toHaveFocus()
  })
})

describe('closing a confirm when the answer comes hands focus back only if it is still there (§10)', () => {
  const many: ModerationQueueData = {
    posts: [
      post({ _id: 'wallPost-1', caption: 'First' }),
      post({ _id: 'wallPost-5', caption: 'Second' }),
      post({ _id: 'wallPost-6', caption: 'Third' }),
    ],
  }
  const card = (name: string) => screen.getByRole('article', { name })

  beforeEach(() => {
    for (const fn of [h.invalidate, h.deletePost, h.approveAllPending]) {
      fn.mockReset()
    }
    h.useQuery.mockReturnValue({ data: many, isPending: false, isError: false })
  })

  const deleteFailingLater = () => {
    let answer: (value: unknown) => void = () => {}
    h.deletePost.mockReturnValue(
      new Promise((_, reject) => (answer = () => reject(new Error('503')))),
    )
    render(<ModerationQueue />)
    choose(card('First'), 'Delete now')
    const press = within(card('First')).getByRole('button', { name: 'Delete' })
    press.focus()
    fireEvent.click(press)
    return () => act(async () => answer(undefined))
  }

  it('a failed Delete, focus moved on meanwhile: it stays where the organizer put it', async () => {
    const fail = deleteFailingLater()
    tab(/^Not shown/).focus()
    await fail()
    expect(within(card('First')).getByRole('alert')).toHaveTextContent(
      'Couldn’t delete. Try again.',
    )
    expect(tab(/^Not shown/)).toHaveFocus()
  })

  it('a failed Delete, focus still in the confirm: back to Delete now', async () => {
    const fail = deleteFailingLater()
    await fail()
    expect(
      within(card('First')).getByRole('button', { name: 'More actions' }),
    ).toHaveFocus()
  })

  const approveAllPartlyLater = () => {
    let answer: (value: {
      approved: number
      pending: number
    }) => void = () => {}
    h.approveAllPending.mockReturnValue(
      new Promise((resolve) => (answer = resolve)),
    )
    render(<ModerationQueue />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve all pending (3)' }),
    )
    const confirm = screen.getByRole('button', { name: 'Approve all' })
    confirm.focus()
    fireEvent.click(confirm)
    return () => act(async () => answer({ approved: 2, pending: 3 }))
  }

  it('Approve all partly done, focus moved on meanwhile: it stays where the organizer put it', async () => {
    const finish = approveAllPartlyLater()
    const elsewhere = within(card('Third')).getByRole('button', {
      name: 'Reject',
    })
    elsewhere.focus()
    await finish()
    expect(elsewhere).toHaveFocus()
  })

  it('Approve all partly done, focus still in the confirm: back to its button', async () => {
    const finish = approveAllPartlyLater()
    await finish()
    expect(
      screen.getByRole('button', { name: 'Approve all pending (3)' }),
    ).toHaveFocus()
  })
})

describe('a failed card action, held by the queue (§10)', () => {
  const two: ModerationQueueData = {
    posts: [
      post({ _id: 'wallPost-1', caption: 'First' }),
      post({
        _id: 'wallPost-2',
        status: 'approved',
        caption: 'Up',
        approvedAt: '2026-10-26T08:00:00Z',
      }),
    ],
  }
  const card = (name: string) => screen.getByRole('article', { name })

  beforeEach(() => {
    for (const fn of [h.invalidate, h.approve]) fn.mockReset()
    h.useQuery.mockReturnValue({ data: two, isPending: false, isError: false })
  })

  it('a handler that throws leaves the card usable: a second press is sent', async () => {
    const onAction = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('done')
    render(<ModerationQueueView queue={two} onAction={onAction} />)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Approve' }),
    )
    const again = await within(card('First')).findByRole('button', {
      name: 'Approve',
    })
    await vi.waitFor(() => expect(again).not.toHaveAttribute('aria-disabled'))
    fireEvent.click(again)
    await vi.waitFor(() => expect(onAction).toHaveBeenCalledTimes(2))
  })

  it('fails while another tab is open: back on the tab, the card says so', async () => {
    let fail: (error: Error) => void = () => {}
    h.approve.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    render(<ModerationQueue />)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Approve' }),
    )
    fireEvent.click(tab(/^On the wall/))
    await act(async () => fail(new Error('offline')))
    fireEvent.click(tab(/^Pending/))
    expect(within(card('First')).getByRole('alert')).toHaveTextContent(
      'Couldn’t approve. Try again.',
    )
  })

  it('a change of the post’s status clears it', async () => {
    h.approve.mockRejectedValueOnce(new Error('offline'))
    const { rerender } = render(<ModerationQueue />)
    fireEvent.click(
      within(card('First')).getByRole('button', { name: 'Approve' }),
    )
    await within(card('First')).findByRole('alert')
    // Another organizer rejected it meanwhile.
    h.useQuery.mockReturnValue({
      data: {
        posts: two.posts.map((p) =>
          p._id === 'wallPost-1' ? { ...p, status: 'notShown' as const } : p,
        ),
      },
      isPending: false,
      isError: false,
    })
    rerender(<ModerationQueue />)
    fireEvent.click(tab(/^Not shown/))
    expect(within(card('First')).queryByRole('alert')).toBeNull()
  })

  it('a decision seen since clears it, even one that brought the status back', async () => {
    h.remove.mockReset()
    h.remove.mockRejectedValueOnce(new Error('offline'))
    const served = (status: 'approved' | 'notShown', decidedAt: string) =>
      h.useQuery.mockReturnValue({
        data: {
          posts: two.posts.map((p) =>
            p._id === 'wallPost-2' ? { ...p, status, decidedAt } : p,
          ),
        },
        isPending: false,
        isError: false,
      })
    served('approved', '2026-10-26T08:00:00Z')
    const { rerender } = render(<ModerationQueue />)
    fireEvent.click(tab(/^On the wall/))
    fireEvent.click(within(card('Up')).getByRole('button', { name: 'Remove' }))
    expect(await within(card('Up')).findByRole('alert')).toHaveTextContent(
      'Couldn’t remove. Try again.',
    )
    // Another organizer removes it, and a third approves it again.
    served('notShown', '2026-10-26T08:05:00Z')
    rerender(<ModerationQueue />)
    served('approved', '2026-10-26T08:06:00Z')
    rerender(<ModerationQueue />)
    expect(within(card('Up')).queryByRole('alert')).toBeNull()
  })

  it('the next action on the post clears it', async () => {
    h.approve.mockRejectedValueOnce(new Error('offline'))
    h.approve.mockReturnValueOnce(new Promise(() => {}))
    render(<ModerationQueue />)
    const approve = () =>
      fireEvent.click(
        within(card('First')).getByRole('button', { name: /^Approv/ }),
      )
    approve()
    await within(card('First')).findByRole('alert')
    approve()
    await vi.waitFor(() =>
      expect(within(card('First')).queryByRole('alert')).toBeNull(),
    )
  })
})

describe('a post re-created under the same id gets a fresh card (§6.2)', () => {
  const A = post({
    _id: 'wallPost-1',
    caption: 'Original',
    incarnation: {
      createdAt: '2026-10-26T07:30:00Z',
      assetId: 'image-a-10x10-jpg',
    },
  })
  const B = post({
    _id: 'wallPost-1',
    caption: 'Replacement',
    incarnation: {
      createdAt: '2026-10-26T08:59:00Z',
      assetId: 'image-b-10x10-jpg',
    },
  })
  const serve = (p: ModerationPost) =>
    h.useQuery.mockReturnValue({
      data: { posts: [p] },
      isPending: false,
      isError: false,
    })

  beforeEach(() => {
    for (const fn of [h.invalidate, h.approve, h.deletePost]) fn.mockReset()
  })

  it('a Delete confirm open on the deleted post is not open on its replacement, and nothing is sent', () => {
    serve(A)
    const { rerender } = render(<ModerationQueue />)
    const original = screen.getByRole('article', { name: 'Original' })
    choose(original, 'Delete now')
    expect(within(original).getByRole('group')).toBeVisible()
    serve(B)
    rerender(<ModerationQueue />)
    const replacement = screen.getByRole('article', { name: 'Replacement' })
    expect(within(replacement).queryByRole('group')).toBeNull()
    expect(
      within(replacement).queryByRole('button', { name: 'Delete' }),
    ).toBeNull()
    expect(h.deletePost).not.toHaveBeenCalled()
  })

  it('an action in flight on the deleted post does not lock its replacement', () => {
    h.approve.mockReturnValue(new Promise(() => {}))
    serve(A)
    const { rerender } = render(<ModerationQueue />)
    fireEvent.click(
      within(screen.getByRole('article', { name: 'Original' })).getByRole(
        'button',
        { name: 'Approve' },
      ),
    )
    serve(B)
    rerender(<ModerationQueue />)
    const approve = within(
      screen.getByRole('article', { name: 'Replacement' }),
    ).getByRole('button', { name: 'Approve' })
    expect(approve).not.toHaveAttribute('aria-disabled')
  })
})

describe('Undo (§10): the latest decision, reversed, on the same post', () => {
  const SEEN = { createdAt: '2026-10-26T07:29:00Z', assetId: 'image-abc' }
  const OTHER = { createdAt: '2026-10-26T07:39:00Z', assetId: 'image-def' }
  const queue: ModerationQueueData = {
    posts: [
      post({ _id: 'wallPost-1', caption: 'Pending one', incarnation: SEEN }),
      post({
        _id: 'wallPost-9',
        caption: 'Pending two',
        submittedAt: '2026-10-26T07:40:00Z',
        incarnation: OTHER,
      }),
      post({
        _id: 'wallPost-2',
        status: 'approved',
        caption: 'Up',
        incarnation: SEEN,
      }),
      post({
        _id: 'wallPost-3',
        status: 'notShown',
        caption: 'Down',
        incarnation: SEEN,
      }),
    ],
  }
  beforeEach(() => {
    for (const fn of [h.invalidate, h.approve, h.reject, h.remove]) {
      fn.mockReset()
      fn.mockResolvedValue({ status: 'done' })
    }
    h.useQuery.mockReturnValue({
      data: queue,
      isPending: false,
      isError: false,
    })
  })
  const press = (caption: string, name: string) =>
    fireEvent.click(
      within(screen.getByRole('article', { name: caption })).getByRole(
        'button',
        { name },
      ),
    )
  const toast = () => screen.findByText(/ · Undo /)
  const writes = () =>
    [h.approve, h.reject, h.remove].map((fn) => fn.mock.calls.length)

  it.each([
    [
      'Approve from Pending',
      'Pending',
      'Pending one',
      'Approve',
      'wallPost-1',
      'Approved · Undo takes it off the wall',
      'remove',
    ],
    [
      'Reject',
      'Pending',
      'Pending one',
      'Reject',
      'wallPost-1',
      'Rejected · Undo puts it on the wall',
      'approve',
    ],
    [
      'Remove',
      'On the wall',
      'Up',
      'Remove',
      'wallPost-2',
      'Removed · Undo puts it back on the wall',
      'approve',
    ],
    [
      'Approve from Not shown',
      'Not shown',
      'Down',
      'Approve',
      'wallPost-3',
      'Approved · Undo takes it off the wall',
      'remove',
    ],
  ] as const)(
    '%s: the toast says what Undo does, and Undo sends the reverse',
    async (_, tabName, caption, button, id, says, reverseName) => {
      const reverse = reverseName === 'remove' ? h.remove : h.approve
      const from = reverseName === 'remove' ? 'approved' : 'notShown'
      render(<ModerationQueue />)
      fireEvent.click(tab(new RegExp(`^${tabName}`)))
      press(caption, button)
      expect(await toast()).toHaveTextContent(says)
      const before = writes()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      await vi.waitFor(() =>
        expect(reverse).toHaveBeenLastCalledWith({ id, from, shown: SEEN }),
      )
      // Exactly one more write, and it is the reverse.
      const index = reverseName === 'remove' ? 2 : 0
      expect(writes()).toEqual(before.map((n, i) => n + (i === index ? 1 : 0)))
      // An Undo is not itself undoable.
      await screen.findByText(
        reverseName === 'remove'
          ? 'Removed from the wall. It’s in Not shown.'
          : 'Approved. It shows on the wall within a few seconds.',
      )
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    },
  )

  it('only the latest action: Undo targets the second post, not the first', async () => {
    render(<ModerationQueue />)
    press('Pending one', 'Reject')
    await toast()
    press('Pending two', 'Approve')
    expect(await toast()).toHaveTextContent(
      'Approved · Undo takes it off the wall',
    )
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledTimes(1))
    expect(h.remove).toHaveBeenCalledWith({
      id: 'wallPost-9',
      from: 'approved',
      shown: OTHER,
    })
    expect(h.approve).toHaveBeenCalledTimes(1)
  })

  it('says so when someone else decided in between', async () => {
    render(<ModerationQueue />)
    press('Pending one', 'Reject')
    await toast()
    h.approve.mockResolvedValueOnce({ status: 'changed' })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText(
      'Another organizer changed this photo first. Showing it as it is now.',
    )
  })

  it('a failed action offers no Undo, nor of the action before it', async () => {
    h.approve.mockRejectedValueOnce(new Error('down'))
    render(<ModerationQueue />)
    press('Pending one', 'Reject')
    await toast()
    press('Pending two', 'Approve')
    await vi.waitFor(() => expect(h.invalidate).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('is a polite status, Escape dismisses it, and it goes after 8 s unless focused', async () => {
    vi.useFakeTimers()
    render(<ModerationQueue />)
    press('Pending one', 'Reject')
    await act(() => vi.advanceTimersByTimeAsync(0))
    const status = screen.getByText(/ · Undo /).closest('[role="status"]')!
    expect(status).toHaveAttribute('aria-live', 'polite')
    fireEvent.keyDown(status, { key: 'Escape' })
    expect(screen.queryByText(/ · Undo /)).toBeNull()

    press('Pending two', 'Reject')
    await act(() => vi.advanceTimersByTimeAsync(0))
    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(screen.getByText(/ · Undo /)).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'Undo' }).blur())
    await act(() => vi.advanceTimersByTimeAsync(7_900))
    expect(screen.getByText(/ · Undo /)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(screen.queryByText(/ · Undo /)).toBeNull()
  })
})

describe('keyboard shortcuts on the queue (§10)', () => {
  const queue: ModerationQueueData = {
    posts: [
      post({ _id: 'wallPost-1', caption: 'One' }),
      post({
        _id: 'wallPost-5',
        caption: 'Two',
        submittedAt: '2026-10-26T07:40:00Z',
      }),
      post({
        _id: 'wallPost-6',
        caption: 'Three',
        submittedAt: '2026-10-26T07:50:00Z',
      }),
      post({ _id: 'wallPost-7', status: 'approved', caption: 'Up' }),
    ],
  }
  beforeEach(() => {
    for (const fn of [h.invalidate, h.approve, h.reject, h.remove]) {
      fn.mockReset()
      fn.mockResolvedValue({ status: 'done' })
    }
    h.useQuery.mockReturnValue({
      data: queue,
      isPending: false,
      isError: false,
    })
  })
  const card = (name: string) => screen.getByRole('article', { name })
  const photoOf = (name: string) =>
    within(card(name)).getByRole('button', { name: /^Enlarge/ })
  const key = (key: string, init: object = {}) =>
    fireEvent.keyDown(document.activeElement!, { key, ...init })

  it('says the shortcuts', () => {
    render(<ModerationQueue />)
    expect(
      screen.getByText('J/K move · A approve · R reject · U undo'),
    ).toBeInTheDocument()
  })

  it('J/K and the arrow keys move between the cards, from the tab too', () => {
    render(<ModerationQueue />)
    tab(/^Pending/).focus()
    key('j')
    expect(photoOf('One')).toHaveFocus()
    key('J')
    expect(photoOf('Two')).toHaveFocus()
    key('ArrowDown')
    expect(photoOf('Three')).toHaveFocus()
    key('j')
    expect(photoOf('Three')).toHaveFocus()
    key('k')
    expect(photoOf('Two')).toHaveFocus()
    key('ArrowLeft')
    expect(photoOf('One')).toHaveFocus()
    key('ArrowRight')
    expect(photoOf('Two')).toHaveFocus()
    key('ArrowUp')
    expect(photoOf('One')).toHaveFocus()
  })

  it('the tabs keep their own arrow keys', () => {
    render(<ModerationQueue />)
    tab(/^Pending/).focus()
    key('ArrowRight')
    expect(tab(/^On the wall/)).toHaveFocus()
    expect(tab(/^On the wall/)).toHaveAttribute('aria-selected', 'true')
  })

  it('A approves and R rejects the card with focus, and only it', async () => {
    render(<ModerationQueue />)
    photoOf('Two').focus()
    key('a')
    await vi.waitFor(() =>
      expect(h.approve).toHaveBeenCalledWith({
        id: 'wallPost-5',
        from: 'pending',
        shown: NO_PHOTO_ID,
      }),
    )
    within(card('Three')).getByRole('button', { name: 'Reject' }).focus()
    key('R')
    await vi.waitFor(() =>
      expect(h.reject).toHaveBeenCalledWith({
        id: 'wallPost-6',
        shown: NO_PHOTO_ID,
      }),
    )
    expect(h.approve).toHaveBeenCalledTimes(1)
    expect(h.reject).toHaveBeenCalledTimes(1)
  })

  it('A or R outside a card, or with a modifier, does nothing', () => {
    render(<ModerationQueue />)
    tab(/^Pending/).focus()
    key('a')
    key('r')
    photoOf('One').focus()
    key('a', { ctrlKey: true })
    key('a', { metaKey: true })
    key('r', { altKey: true })
    expect(h.approve).not.toHaveBeenCalled()
    expect(h.reject).not.toHaveBeenCalled()
  })

  it('Enter on the photo J lands on opens it large', () => {
    render(<ModerationQueue />)
    tab(/^Pending/).focus()
    key('j')
    fireEvent.click(document.activeElement!) // what Enter does on a button
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('U undoes the latest action', async () => {
    render(<ModerationQueue />)
    photoOf('One').focus()
    key('r')
    await screen.findByText('Rejected · Undo puts it on the wall')
    photoOf('Two').focus()
    key('u')
    await vi.waitFor(() =>
      expect(h.approve).toHaveBeenCalledWith({
        id: 'wallPost-1',
        from: 'notShown',
        shown: NO_PHOTO_ID,
      }),
    )
  })

  it('never fires in a field or an open menu', () => {
    render(<ModerationQueue />)
    // A field: the talk picker's search.
    choose(card('One'), 'Add talk')
    const search = within(card('One')).getByRole('searchbox')
    search.focus()
    for (const k of ['a', 'r', 'j', 'u']) key(k)
    expect(search).toHaveFocus()

    // An open menu.
    fireEvent.click(
      within(card('Two')).getByRole('button', { name: 'More actions' }),
    )
    const item = screen.getAllByRole('menuitem')[0]
    for (const k of ['a', 'r']) fireEvent.keyDown(item, { key: k })
    // Even with focus left on the card while the menu is open.
    // (The menu hides the page from the accessibility tree meanwhile.)
    const behind = document
      .querySelectorAll('article')[1]
      .querySelector('button')!
    for (const k of ['a', 'r']) fireEvent.keyDown(behind, { key: k })
    expect(h.approve).not.toHaveBeenCalled()
    expect(h.reject).not.toHaveBeenCalled()
  })

  it('never fires in a dialog', () => {
    render(<ModerationQueue />)
    // The photo opened large.
    fireEvent.click(photoOf('Three'))
    const dialog = screen.getByRole('dialog')
    const before = document.activeElement
    for (const k of ['a', 'r', 'j', 'k']) fireEvent.keyDown(dialog, { key: k })
    expect(document.activeElement).toBe(before)

    expect(h.approve).not.toHaveBeenCalled()
    expect(h.reject).not.toHaveBeenCalled()
  })
})
