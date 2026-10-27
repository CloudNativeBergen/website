/**
 * @vitest-environment jsdom
 *
 * The Wall page (Photo Wall spec §8, §9.1): the polling that never stops for
 * an idle phone, the polaroids newest approval first, **Add your photo**
 * only while posting is open, the removal-contact footer, the empty and
 * closed states, and the rule that a Wall Post photo is a plain `<img>` of
 * its Sanity URL, never `next/image` (§5.1, §14).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { WallPagePost, WallPageView } from '@/lib/photo-wall/wall'

const h = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('@/lib/trpc/client', () => ({
  api: { photoWallPublic: { get: { useQuery: h.useQuery } } },
}))

import { WallBoard, WallBoardView } from './WallBoard'
import { WALL_POLL_MS, wallPolling } from './polling'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  h.useQuery.mockReset()
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

const sanity = (id: string) =>
  `https://cdn.sanity.io/images/p/d/${id}-1600x1000.jpg?rect=300,0,1000,1000&w=600&h=600&auto=format`
const post = (
  _id: string,
  fields: Partial<WallPagePost> = {},
): WallPagePost => ({
  _id,
  src: sanity(_id),
  whole: {
    src: `https://cdn.sanity.io/images/p/d/${_id}-1600x1000.jpg?max-h=1000&max-w=1000&auto=format`,
    width: 1600,
    height: 1000,
  },
  caption: null,
  name: null,
  approvedAt: '2026-10-26T07:40:00Z',
  ...fields,
})
const view = (fields: Partial<WallPageView> = {}): WallPageView => ({
  closed: false,
  postingOpen: true,
  look: 'pinboard',
  posts: [],
  ...fields,
})

describe('polling (§8): every 10 s while visible, with no idle stop', () => {
  /** The page's poller as it runs: the server's first answer as initialData. */
  function Poller({ queryFn }: { queryFn: () => Promise<WallPageView> }) {
    useQuery({
      queryKey: ['wall'],
      queryFn,
      initialData: view(),
      ...wallPolling,
    })
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

  const mount = (queryFn = vi.fn(async () => view())) => {
    render(
      <QueryClientProvider client={appQueryClient()}>
        <Poller queryFn={queryFn} />
      </QueryClientProvider>,
    )
    return queryFn
  }

  it('is 10 s', () => {
    expect(WALL_POLL_MS).toBe(10_000)
  })

  it('still polls past five idle minutes: nobody touches a phone left on the wall', async () => {
    const queryFn = mount()
    // The server rendered the first answer: no read at once, under the 60 s
    // stale time, yet the interval still comes.
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(queryFn).toHaveBeenCalledTimes(0)
    await act(() => vi.advanceTimersByTimeAsync(WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1)
    // Not one pointer, key or scroll event in six minutes.
    await act(() => vi.advanceTimersByTimeAsync(6 * 60_000))
    expect(queryFn).toHaveBeenCalledTimes(1 + 36)
    // And the next tick still comes.
    await act(() => vi.advanceTimersByTimeAsync(WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1 + 36 + 1)
  })

  it('pauses while the page is hidden and resumes when it is visible again', async () => {
    const queryFn = mount()
    await act(() => vi.advanceTimersByTimeAsync(2 * WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(2)
    act(() => setVisibility('hidden'))
    await act(() => vi.advanceTimersByTimeAsync(10 * WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(2)
    act(() => setVisibility('visible'))
    await act(() => vi.advanceTimersByTimeAsync(0))
    // Back after more than the stale time: one read at once, then the
    // interval again.
    expect(queryFn).toHaveBeenCalledTimes(3)
    await act(() => vi.advanceTimersByTimeAsync(3 * WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(6)
  })

  it('resumes after the page was hidden while a read was in flight', async () => {
    // A read that resolves while the page is hidden must not end the
    // polling: back within the 60 s stale time, the focus refetch is skipped
    // and nothing re-renders, so only the interval can bring the next read.
    let hold = false
    let release = () => {}
    const queryFn = vi.fn((): Promise<WallPageView> =>
      hold
        ? new Promise((resolve) => {
            release = () => resolve(view())
          })
        : Promise.resolve(view()),
    )
    mount(queryFn)
    hold = true
    await act(() => vi.advanceTimersByTimeAsync(WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1)
    hold = false
    act(() => setVisibility('hidden'))
    await act(async () => release())
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(queryFn).toHaveBeenCalledTimes(1)
    act(() => setVisibility('visible'))
    await act(() => vi.advanceTimersByTimeAsync(3 * WALL_POLL_MS))
    expect(queryFn).toHaveBeenCalledTimes(1 + 3)
  })
})

const LOGO = { title: 'Cloud Native Days Norway' }
const renderView = (v: WallPageView, contactEmail = 'hello@example.no') =>
  render(
    <WallBoardView
      view={v}
      conference={{
        logo: LOGO,
        title: 'Cloud Native Days Norway 2026',
        contactEmail,
      }}
    />,
  )
const addLink = () => screen.queryByRole('link', { name: /Add your photo/ })

describe('WallBoardView (§9.1)', () => {
  it('shows a polaroid per post, newest approval first, with caption and name', () => {
    renderView(
      view({
        posts: [
          post('wallPost-b', { caption: 'Keynote crowd', name: 'Ada' }),
          post('wallPost-a', { caption: 'Doors open' }),
        ],
      }),
    )
    const figures = screen.getAllByRole('figure')
    expect(figures).toHaveLength(2)
    expect(within(figures[0]).getByText('Keynote crowd')).toBeInTheDocument()
    expect(within(figures[0]).getByText('— Ada')).toBeInTheDocument()
    expect(within(figures[1]).getByText('Doors open')).toBeInTheDocument()
    expect(within(figures[1]).queryByText(/^— /)).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Photo Wall' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 photos/)).toBeInTheDocument()
  })

  it('never renders a Wall Post photo through /_next/image (§5.1, §14)', () => {
    const posts = [post('wallPost-1'), post('wallPost-2', { name: 'Bo' })]
    renderView(view({ posts }))
    const srcs = within(screen.getByRole('list', { name: 'Photos' }))
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'))
    // Exactly the Sanity URLs the server cut, untouched.
    expect(srcs).toEqual(posts.map((p) => p.src))
    for (const src of srcs) {
      expect(src).not.toContain('/_next/image')
      expect(src?.startsWith('https://cdn.sanity.io/images/')).toBe(true)
    }
  })

  it('offers Add your photo, to the composer, while posting is open', () => {
    renderView(view({ posts: [post('wallPost-1')] }))
    expect(addLink()).toHaveAttribute('href', '/wall/post')
    expect(screen.queryByRole('link', { name: 'My posts' })).toBeNull()
  })

  it('offers My posts instead of Add your photo while posting is not open', () => {
    renderView(view({ postingOpen: false, posts: [post('wallPost-1')] }))
    expect(addLink()).toBeNull()
    expect(screen.getAllByRole('figure')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'My posts' })).toHaveAttribute(
      'href',
      '/wall/post#my-posts',
    )
  })

  it('names the organizers’ address for a removal request (§9.1)', () => {
    renderView(view({ posts: [post('wallPost-1')] }))
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(
      'In a photo and want it removed? Contact the organizers at hello@example.no.',
    )
    expect(
      within(footer).getByRole('link', { name: 'hello@example.no' }),
    ).toHaveAttribute('href', 'mailto:hello@example.no')
  })

  it('still asks for the organizers without an address', () => {
    renderView(view({ posts: [post('wallPost-1')] }), '')
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'In a photo and want it removed? Contact the organizers.',
    )
  })

  it('says when it shows only the 200 newest (§9.1)', () => {
    const many = Array.from({ length: 200 }, (_, i) => post(`wallPost-${i}`))
    renderView(view({ posts: many }))
    expect(screen.getByText('The 200 newest photos.')).toBeInTheDocument()
    cleanup()
    renderView(view({ posts: many.slice(1) }))
    expect(screen.queryByText('The 200 newest photos.')).toBeNull()
    expect(screen.getByText(/199 photos/)).toBeInTheDocument()
  })

  it('an empty wall says so, and offers Add your photo when open', () => {
    renderView(view())
    expect(screen.getByText('No photos yet.')).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
    expect(addLink()).toBeInTheDocument()
    cleanup()
    renderView(view({ postingOpen: false }))
    expect(screen.getByText('No photos yet.')).toBeInTheDocument()
    expect(addLink()).toBeNull()
  })

  it('a closed wall shows only that it closed (§9.1, §11.1)', () => {
    renderView(view({ closed: true, postingOpen: true }))
    expect(screen.getByText('This wall has closed.')).toBeInTheDocument()
    expect(addLink()).toBeNull()
    expect(screen.queryByText('No photos yet.')).toBeNull()
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})

describe('WallBoardView in Mosaic and Spotlight (§9, #1478)', () => {
  const photos = () =>
    within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('img')

  it('Mosaic shows each whole photo, newest first, with its caption and name over it', () => {
    const posts = [
      post('wallPost-b', { caption: 'Keynote crowd', name: 'Ada' }),
      post('wallPost-a'),
    ]
    renderView(view({ look: 'mosaic', posts }))
    expect(photos().map((img) => img.getAttribute('src'))).toEqual(
      posts.map((p) => p.whole.src),
    )
    const figures = screen.getAllByRole('figure')
    expect(within(figures[0]).getByText('Keynote crowd')).toBeInTheDocument()
    expect(within(figures[0]).getByText('Ada')).toBeInTheDocument()
    expect(figures[1].querySelector('figcaption')).toBeNull()
    // Sized to the photo's own shape, so the whole photo shows.
    expect(photos()[0]).toHaveAttribute('width', '1600')
    expect(photos()[0]).toHaveAttribute('height', '1000')
  })

  it('Mosaic: a panorama keeps its caption to one line and drops the name, so the photo still shows', () => {
    const panorama = post('wallPost-p', {
      caption:
        'Fjord views between talks, and the longest caption a phone allows',
      name: 'Bo',
      whole: {
        src: 'https://cdn.sanity.io/images/p/d/p-2048x320.jpg',
        width: 2048,
        height: 320,
      },
    })
    renderView(
      view({
        look: 'mosaic',
        posts: [panorama, post('wallPost-a', { name: 'Ada' })],
      }),
    )
    const [flat, regular] = screen.getAllByRole('figure')
    expect(within(flat).getByText(/Fjord views/).className).toContain(
      'line-clamp-1',
    )
    expect(within(flat).queryByText('Bo')).toBeNull()
    // As rendered: no display utility next to a clamp, whichever way the
    // className was assembled (it would undo the clamp outside Chromium).
    for (const el of document.querySelectorAll('[class*="line-clamp-"]')) {
      expect(el.className).not.toMatch(
        /(^|\s)(block|inline|inline-block|flex|inline-flex|grid)(\s|$)/,
      )
    }
    // A tile of ordinary shape keeps its name, a 16:9 phone photo too.
    expect(within(regular).getByText('Ada')).toBeInTheDocument()
    cleanup()
    const wide = post('wallPost-w', {
      caption: 'Keynote',
      name: 'Cy',
      whole: {
        src: 'https://cdn.sanity.io/images/p/d/w-1600x900.jpg',
        width: 1600,
        height: 900,
      },
    })
    renderView(view({ look: 'mosaic', posts: [wide] }))
    expect(
      within(screen.getByRole('figure')).getByText('Cy'),
    ).toBeInTheDocument()
  })

  it('Spotlight is a feed: each whole photo, newest first, with the name, the time and the caption', () => {
    const posts = [
      post('wallPost-b', {
        caption: 'Keynote crowd',
        name: 'Ada',
        approvedAt: '2026-10-26T07:52:00Z',
      }),
      post('wallPost-a', { approvedAt: '2026-10-26T07:40:00Z' }),
    ]
    renderView(view({ look: 'spotlight', posts }))
    expect(photos().map((img) => img.getAttribute('src'))).toEqual(
      posts.map((p) => p.whole.src),
    )
    const items = within(
      screen.getByRole('list', { name: 'Photos' }),
    ).getAllByRole('listitem')
    expect(within(items[0]).getByText('Ada')).toBeInTheDocument()
    // Oslo time: 07:52Z is 08:52 on Monday 26 October.
    expect(within(items[0]).getByText('Mon 26 Oct, 08:52')).toBeInTheDocument()
    expect(within(items[0]).getByText('Keynote crowd')).toBeInTheDocument()
    expect(within(items[1]).getByText('Anonymous')).toBeInTheDocument()
  })

  it.each(['mosaic', 'spotlight'] as const)(
    '%s keeps the page around it: the count, Add your photo, the footer, the empty and closed states',
    (look) => {
      renderView(
        view({ look, posts: [post('wallPost-1'), post('wallPost-2')] }),
      )
      expect(screen.getByText(/2 photos/)).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Add your photo' }),
      ).toHaveAttribute('href', '/wall/post')
      expect(screen.getByText(/want it removed/)).toBeInTheDocument()
      cleanup()
      renderView(view({ look, posts: [] }))
      expect(screen.getByText('No photos yet.')).toBeInTheDocument()
      cleanup()
      renderView(view({ look, closed: true, posts: [] }))
      expect(screen.getByText('This wall has closed.')).toBeInTheDocument()
    },
  )
})

describe('WallBoard, connected', () => {
  it('polls photoWallPublic.get from the server’s first answer, visible-only and with no idle stop', () => {
    const initial = view({ posts: [post('wallPost-1')] })
    const polled = view({ posts: [post('wallPost-2'), post('wallPost-1')] })
    h.useQuery.mockReturnValue({ data: polled })
    render(
      <WallBoard
        initial={initial}
        conference={{
          logo: LOGO,
          title: 'CND',
          contactEmail: 'hello@example.no',
        }}
      />,
    )
    expect(h.useQuery).toHaveBeenCalledWith(undefined, {
      refetchInterval: WALL_POLL_MS,
      refetchOnWindowFocus: true,
      initialData: initial,
    })
    // What the poll answered is what shows.
    expect(screen.getAllByRole('figure')).toHaveLength(2)
  })
})
