/**
 * @vitest-environment jsdom
 *
 * Screen Mode, connected (Photo Wall spec §8, §9.2–§9.4, §14): the real
 * React Query poll of `photoWallPublic.screen` (only the tRPC hook is
 * replaced, by `useQuery` over a test answer) driving the pinboard through
 * the board's clock, with fake timers and not one interaction. The images
 * are what the test says the browser reported.
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
import { onlineManager } from '@tanstack/react-query'
import { TRPCProvider } from '@/components/providers/TRPCProvider'
import type { ScreenPost, ScreenView } from '@/lib/photo-wall/screen'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

/**
 * The server, behind the REAL tRPC client and React Query: what
 * `photoWallPublic.screen` answers next. A rejection is a network failure
 * (`fetch` rejects); a promise that never settles is a hung request, which
 * only an abort ends, as in a browser.
 */
const h = vi.hoisted(() => ({
  queryFn: vi.fn<() => Promise<unknown>>(),
}))
// `qrcode` draws on a canvas jsdom does not have.
vi.mock('@/components/feedback/useFeedbackQrPng', () => ({
  useFeedbackQrPng: () => ({ src: 'data:image/png;base64,qr', failed: false }),
}))

const screenFetch = vi.fn(
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://localhost')
    const procedures = decodeURIComponent(
      url.pathname.slice('/api/trpc/'.length),
    ).split(',')
    if (procedures.some((p) => p !== 'photoWallPublic.screen')) {
      throw new Error(`unexpected procedure ${procedures.join(',')}`)
    }
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal
      if (signal?.aborted) return reject(signal.reason)
      signal?.addEventListener('abort', () => reject(signal.reason))
      h.queryFn().then((data) => {
        const result = { result: { data } }
        const body = url.searchParams.has('batch')
          ? procedures.map(() => result)
          : result
        resolve(
          new Response(JSON.stringify(body), {
            headers: { 'content-type': 'application/json' },
          }),
        )
      }, reject)
    })
  },
)

import { ScreenMode } from './ScreenBoard'
import { SCREEN_POLL_MS, SCREEN_POLL_TIMEOUT_MS } from './polling'
import {
  ARRIVAL_GAP_MS,
  IMAGE_RETRY_MS,
  LEAVE_MS,
  NEW_MARK_MS,
  SWAP_EVERY_MS,
} from './board'
import { IMAGE_LOAD_DEADLINE_MS } from './ScreenLayout'

const at = (minutes: number) =>
  new Date(Date.parse('2026-10-26T07:00:00Z') + minutes * 60_000).toISOString()
const post = (n: number, fields: Partial<ScreenPost> = {}): ScreenPost => ({
  _id: `wallPost-${n}`,
  src: `https://cdn.sanity.io/images/p/d/${n}-1600x1000.jpg?rect=300,0,1000,1000&w=600&h=600&auto=format`,
  caption: n % 3 === 0 ? `Caption ${n}` : null,
  name: n % 2 === 0 ? `Name ${n}` : null,
  approvedAt: at(n),
  ...fields,
})
const posts = (count: number) =>
  Array.from({ length: count }, (_, i) => post(count - i))
const view = (
  list: ScreenPost[],
  fields: Partial<ScreenView> = {},
): ScreenView => ({
  closed: false,
  sponsorStrip: false,
  posts: list,
  ...fields,
})

const SPONSOR: ConferenceSponsor = {
  _sfcId: 'sfc-1',
  sponsor: {
    _id: 'sponsor-1',
    name: 'Acme',
    website: 'https://acme.example',
    logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
  },
  tier: { _id: 'tier-1', title: 'Gold', tagline: 'Gold sponsor' },
}
const TIERLESS = {
  ...SPONSOR,
  _sfcId: 'sfc-2',
  sponsor: { ...SPONSOR.sponsor, _id: 'sponsor-2', name: 'Nobody' },
  tier: null,
} as unknown as ConferenceSponsor

const conference = (sponsors: ConferenceSponsor[] = []) => ({
  logo: { title: 'Cloud Native Days Norway' },
  postUrl: 'https://2026.example.no/wall/post',
  sponsors,
})

/** Rendered in the app's own provider: its query defaults and tRPC client. */
function mount(initial: ScreenView, sponsors: ConferenceSponsor[] = []) {
  h.queryFn.mockResolvedValue(initial)
  render(
    <TRPCProvider>
      <ScreenMode initial={initial} conference={conference(sponsors)} />
    </TRPCProvider>,
  )
}

/** Every image the board asked for has loaded. */
const loadImages = () =>
  act(() => {
    for (const img of document.querySelectorAll('img[data-preload]')) {
      fireEvent.load(img)
    }
  })
const failImage = (id: string) =>
  act(() => {
    fireEvent.error(document.querySelector(`img[data-preload="${id}"]`)!)
  })
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
/** The next poll, settled, plus the board's clock. */
const nextPoll = () => advance(SCREEN_POLL_MS + 110)

const cards = () => screen.queryAllByTestId('wall-card')
const shown = () =>
  cards()
    .filter((c) => !c.hasAttribute('data-leaving'))
    .map((c) => c.getAttribute('data-post'))
const fresh = () =>
  cards()
    .filter((c) => c.hasAttribute('data-new'))
    .map((c) => c.getAttribute('data-post'))
const offlineDot = () => screen.queryByRole('status', { name: 'Offline' })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-26T09:00:00Z'))
  h.queryFn.mockReset()
  screenFetch.mockClear()
  vi.stubGlobal('fetch', screenFetch)
  // The tRPC logger reports every failed poll; these tests fail polls on purpose.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  onlineManager.setOnline(true)
  vi.useRealTimers()
})

describe('ScreenMode, untouched for hours (§8, §9.2)', () => {
  it('shows the first 17 only once their images have loaded, with no new mark', async () => {
    mount(view(posts(24)))
    await advance(0)
    expect(cards()).toHaveLength(0)
    expect(document.querySelectorAll('img[data-preload]')).toHaveLength(17)
    loadImages()
    await advance(100)
    expect(shown()).toHaveLength(17)
    expect(shown()).toEqual(
      posts(24)
        .slice(0, 17)
        .map((p) => p._id),
    )
    expect(fresh()).toEqual([])
    // Every photo is a plain <img> of its Sanity URL, never /_next/image (§5.1).
    for (const card of cards()) {
      const src = within(card).getByRole('img').getAttribute('src')
      expect(src?.startsWith('https://cdn.sanity.io/images/')).toBe(true)
      expect(src).not.toContain('/_next/image')
    }
    expect(screen.getByRole('img', { name: /QR code for/ })).toBeInTheDocument()
    expect(screen.getByText('2026.example.no/wall/post')).toBeInTheDocument()
  })

  it('past five idle minutes, an approval still arrives within a poll and a removal still leaves', async () => {
    mount(view(posts(17)))
    await advance(0)
    loadImages()
    await advance(100)
    expect(shown()).toHaveLength(17)
    // Six minutes with no pointer, key, scroll, focus or visibility change.
    await advance(6 * 60_000)
    expect(h.queryFn.mock.calls.length).toBeGreaterThanOrEqual(72)
    expect(shown()).toHaveLength(17)
    // Now an organizer approves wallPost-30 and removes wallPost-3.
    const next = view([
      post(30),
      ...posts(17).filter((p) => p._id !== 'wallPost-3'),
    ])
    h.queryFn.mockResolvedValue(next)
    await nextPoll()
    // The removal left at once...
    expect(shown()).not.toContain('wallPost-3')
    expect(
      cards().find((c) => c.getAttribute('data-post') === 'wallPost-3'),
    ).toHaveAttribute('data-leaving')
    // ...and the arrival waits for its image.
    expect(shown()).not.toContain('wallPost-30')
    loadImages()
    await advance(100)
    expect(fresh()).toEqual(['wallPost-30'])
    expect(shown()).toContain('wallPost-30')
    await advance(LEAVE_MS)
    expect(
      cards().find((c) => c.getAttribute('data-post') === 'wallPost-3'),
    ).toBeUndefined()
    await advance(NEW_MARK_MS)
    expect(fresh()).toEqual([])
    expect(shown()).toContain('wallPost-30')
  })

  it('a removed and re-approved post arrives again, as new', async () => {
    mount(view(posts(17)))
    await advance(0)
    loadImages()
    await advance(100)
    h.queryFn.mockResolvedValue(
      view(posts(17).filter((p) => p._id !== 'wallPost-9')),
    )
    await nextPoll()
    await advance(LEAVE_MS)
    expect(shown()).not.toContain('wallPost-9')
    h.queryFn.mockResolvedValue(
      view([
        post(9, { approvedAt: at(40) }),
        ...posts(17).filter((p) => p._id !== 'wallPost-9'),
      ]),
    )
    await nextPoll()
    loadImages()
    await advance(100)
    expect(fresh()).toEqual(['wallPost-9'])
  })

  it('a burst arrives one post every 2.5 s, in approval order', async () => {
    mount(view(posts(17)))
    await advance(0)
    loadImages()
    await advance(100)
    h.queryFn.mockResolvedValue(view([post(32), post(31), ...posts(17)]))
    await nextPoll()
    loadImages()
    await advance(100)
    expect(fresh()).toEqual(['wallPost-31'])
    await advance(ARRIVAL_GAP_MS)
    expect(fresh().sort()).toEqual(['wallPost-31', 'wallPost-32'])
  })

  it('skips a post whose image fails to load', async () => {
    mount(view(posts(17)))
    await advance(0)
    loadImages()
    await advance(100)
    h.queryFn.mockResolvedValue(view([post(31), post(30), ...posts(17)]))
    await nextPoll()
    failImage('wallPost-30')
    loadImages()
    await advance(100)
    expect(shown()).not.toContain('wallPost-30')
    expect(fresh()).toEqual(['wallPost-31'])
  })
})

describe('flaky Wi-Fi (§9.3)', () => {
  it('keeps the last list, shows the offline dot after 3 failed polls, and catches up a removal when back', async () => {
    mount(view(posts(17)))
    await advance(0)
    loadImages()
    await advance(100)
    h.queryFn.mockRejectedValue(new Error('offline'))
    await nextPoll()
    await nextPoll()
    expect(offlineDot()).toBeNull()
    expect(shown()).toHaveLength(17)
    await nextPoll()
    expect(offlineDot()).toBeInTheDocument()
    expect(shown()).toHaveLength(17)
    // Removed while offline; the next successful poll is the whole list.
    h.queryFn.mockResolvedValue(
      view(posts(17).filter((p) => p._id !== 'wallPost-5')),
    )
    await nextPoll()
    expect(offlineDot()).toBeNull()
    expect(shown()).not.toContain('wallPost-5')
    await advance(LEAVE_MS)
    expect(shown()).toHaveLength(16)
  })

  it('with the browser reporting offline, still polls: the dot after 3 failures, gone when back with a removal caught up', async () => {
    mount(view(posts(17)))
    await advance(0)
    loadImages()
    await advance(100)
    // The laptop's Wi-Fi goes off: the browser says offline and fetch fails.
    h.queryFn.mockRejectedValue(new TypeError('Failed to fetch'))
    act(() => onlineManager.setOnline(false))
    const before = screenFetch.mock.calls.length
    await nextPoll()
    await nextPoll()
    expect(offlineDot()).toBeNull()
    await nextPoll()
    expect(screenFetch.mock.calls.length - before).toBe(3)
    expect(offlineDot()).toBeInTheDocument()
    expect(shown()).toHaveLength(17)
    // Back on, and wallPost-5 was removed meanwhile.
    h.queryFn.mockResolvedValue(
      view(posts(17).filter((p) => p._id !== 'wallPost-5')),
    )
    act(() => onlineManager.setOnline(true))
    await nextPoll()
    expect(offlineDot()).toBeNull()
    expect(shown()).not.toContain('wallPost-5')
  })

  it('a poll that never answers is given up and polling goes on: the dot after 3, gone on the next answer', async () => {
    mount(view(posts(17)))
    // The venue Wi-Fi takes every request from now on and never answers.
    h.queryFn.mockImplementation(() => new Promise(() => {}))
    loadImages()
    const calls = () => screenFetch.mock.calls.length
    // React Query restarts its interval whenever the query changes state, so
    // a hung poll's cycle is the poll interval plus the time to give up.
    await advance(SCREEN_POLL_MS + 10)
    expect(calls()).toBe(1)
    await advance(SCREEN_POLL_TIMEOUT_MS)
    expect(screenFetch.mock.calls[0][1]?.signal?.aborted).toBe(true)
    await advance(SCREEN_POLL_MS)
    expect(calls()).toBe(2)
    await advance(SCREEN_POLL_TIMEOUT_MS + SCREEN_POLL_MS)
    expect(calls()).toBe(3)
    expect(offlineDot()).toBeNull()
    await advance(SCREEN_POLL_TIMEOUT_MS)
    expect(offlineDot()).toBeInTheDocument()
    expect(shown()).toHaveLength(17)
    // Every hung request was aborted, not left open.
    expect(
      screenFetch.mock.calls.map(([, init]) => init?.signal?.aborted),
    ).toEqual([true, true, true])
    h.queryFn.mockResolvedValue(view(posts(17)))
    await nextPoll()
    expect(offlineDot()).toBeNull()
  })
})

describe('images that misbehave (§9.2)', () => {
  it('an image already loaded before React attached (server-rendered, cached) counts as loaded', async () => {
    const complete = vi
      .spyOn(HTMLImageElement.prototype, 'complete', 'get')
      .mockReturnValue(true)
    const width = vi
      .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
      .mockReturnValue(600)
    mount(view(posts(5)))
    await advance(100)
    expect(shown()).toHaveLength(5)
    complete.mockRestore()
    width.mockRestore()
  })

  it('an image whose load never reports is given up and blocks nothing behind it', async () => {
    const first = posts(20)
    mount(view(first))
    await advance(0)
    // Every first-load image reports but the newest one's.
    act(() => {
      for (const img of document.querySelectorAll('img[data-preload]')) {
        if (img.getAttribute('data-preload') !== 'wallPost-20') {
          fireEvent.load(img)
        }
      }
    })
    await advance(100)
    expect(shown()).toHaveLength(16)
    h.queryFn.mockResolvedValue(view([post(30), ...first]))
    await nextPoll()
    // The stuck one is given up; the arrival behind it is asked for and comes in.
    await advance(IMAGE_LOAD_DEADLINE_MS - SCREEN_POLL_MS)
    expect(document.querySelector('img[data-preload="wallPost-20"]')).toBeNull()
    loadImages()
    await advance(100)
    expect(fresh()).toEqual(['wallPost-30'])
    // And the board still swaps when idle.
    loadImages()
    const board = shown()
    await advance(2 * SWAP_EVERY_MS)
    loadImages()
    await advance(SWAP_EVERY_MS)
    expect(shown()).not.toEqual(board)
  })

  it('a blip during the first load: every image failed shows the QR, then they are retried and the board fills', async () => {
    mount(view(posts(3)))
    await advance(0)
    for (const id of ['wallPost-1', 'wallPost-2', 'wallPost-3']) failImage(id)
    await advance(100)
    expect(cards()).toHaveLength(0)
    // Not a blank board: the large QR invites, without claiming the wall is empty.
    expect(screen.getByRole('img', { name: /QR code for/ })).toBeInTheDocument()
    expect(screen.getByTestId('screen-invitation')).toBeInTheDocument()
    expect(screen.queryByText('Be the first on the wall')).toBeNull()
    // The Wi-Fi is back: a later successful poll retries them.
    await advance(IMAGE_RETRY_MS)
    await nextPoll()
    expect(document.querySelectorAll('img[data-preload]')).toHaveLength(3)
    loadImages()
    await advance(100)
    expect(shown()).toHaveLength(3)
    expect(screen.queryByTestId('screen-invitation')).toBeNull()
  })
})

describe('the display stays awake (§9.2)', () => {
  it('takes the wake lock again when the browser releases it while visible', async () => {
    const sentinels: EventTarget[] = []
    const request = vi.fn(async () => {
      const sentinel = Object.assign(new EventTarget(), {
        release: vi.fn(async () => {}),
      })
      sentinels.push(sentinel)
      return sentinel
    })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    try {
      mount(view(posts(3)))
      await advance(0)
      expect(request).toHaveBeenCalledTimes(1)
      // The system lets it go (low battery, a power setting) with the page visible.
      act(() => {
        sentinels[0].dispatchEvent(new Event('release'))
      })
      await advance(0)
      expect(request).toHaveBeenCalledTimes(2)
    } finally {
      Reflect.deleteProperty(navigator, 'wakeLock')
    }
  })
})

describe('sponsor strip, empty and closed (§9.2, §9.4)', () => {
  it('shows the strip while the switch is on and a public sponsor exists', async () => {
    mount(view(posts(3)), [SPONSOR, TIERLESS])
    await advance(0)
    expect(screen.queryByRole('marquee')).toBeNull()
    h.queryFn.mockResolvedValue(view(posts(3), { sponsorStrip: true }))
    await nextPoll()
    const strip = screen.getByRole('marquee')
    expect(within(strip).getAllByLabelText('Acme').length).toBeGreaterThan(0)
    expect(within(strip).queryByLabelText('Nobody')).toBeNull()
    h.queryFn.mockResolvedValue(view(posts(3), { sponsorStrip: false }))
    await nextPoll()
    expect(screen.queryByRole('marquee')).toBeNull()
  })

  it('makes no room for a strip with the switch on but no public-tier sponsor', async () => {
    mount(view(posts(3), { sponsorStrip: true }), [TIERLESS])
    await advance(0)
    expect(screen.queryByTestId('screen-strip')).toBeNull()
  })

  it('makes room for it with a public-tier sponsor (control)', async () => {
    mount(view(posts(3), { sponsorStrip: true }), [SPONSOR, TIERLESS])
    await advance(0)
    expect(screen.getByTestId('screen-strip')).toBeInTheDocument()
  })

  it('an empty wall invites with a large QR', async () => {
    mount(view([]))
    await advance(0)
    expect(screen.getByText('Be the first on the wall')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /QR code for/ })).toBeInTheDocument()
  })

  it('a closed wall shows only that it closed', async () => {
    // A public sponsor and the switch on: only the closed state keeps the strip off.
    mount(view(posts(3), { sponsorStrip: true }), [SPONSOR])
    await advance(0)
    loadImages()
    await advance(100)
    expect(shown()).toHaveLength(3)
    h.queryFn.mockResolvedValue(view([], { closed: true, sponsorStrip: true }))
    await nextPoll()
    await advance(LEAVE_MS)
    expect(screen.getByText('This wall has closed.')).toBeInTheDocument()
    expect(cards()).toHaveLength(0)
    expect(screen.queryByRole('marquee')).toBeNull()
    expect(screen.queryByTestId('screen-strip')).toBeNull()
    expect(screen.queryByRole('img', { name: /QR code for/ })).toBeNull()
  })
})
