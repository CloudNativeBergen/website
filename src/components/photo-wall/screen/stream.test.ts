/**
 * Mosaic and Spotlight on Screen Mode as a state machine (Photo Wall spec
 * §9.2, §9.3, #1478): the whole photo, idle pacing of 6 s, a burst let in
 * one post every 2.5 s, a 6 s "new" mark, removal at once. Mosaic gives a
 * new post the spotlight tile at once; Spotlight puts it next in line.
 */
import { describe, expect, it } from 'vitest'
import type { ScreenPost, ScreenView } from '@/lib/photo-wall/screen'
import {
  ARRIVAL_GAP_MS,
  NEW_MARK_MS,
  OFFLINE_AFTER_FAILURES,
  SWAP_EVERY_MS,
} from './board'
import {
  MOSAIC_ROTATION,
  MOSAIC_TILES,
  SPOTLIGHT_ROTATION,
  featured,
  initialStream,
  isMarkedNew,
  isStreamOffline,
  pendingStreamImages,
  shownPosts,
  streamInvitation,
  streamReducer,
  upNext,
  type StreamLook,
  type StreamState,
} from './stream'

const T0 = Date.parse('2026-10-26T09:00:00Z')
const at = (minutes: number) =>
  new Date(Date.parse('2026-10-26T07:00:00Z') + minutes * 60_000).toISOString()
const post = (n: number, fields: Partial<ScreenPost> = {}): ScreenPost => ({
  _id: `wallPost-${n}`,
  src: `https://cdn.sanity.io/images/p/d/${n}.jpg?rect=0,0,1000,1000`,
  whole: {
    src: `https://cdn.sanity.io/images/p/d/${n}.jpg?w=1400`,
    width: 1600,
    height: 1000,
  },
  caption: null,
  name: null,
  approvedAt: at(n),
  ...fields,
})
/** Posts `from`…`from + count - 1`, newest approval first, as the server answers. */
const posts = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => post(from + count - 1 - i))
const view = (list: ScreenPost[], fields: Partial<ScreenView> = {}) => ({
  closed: false,
  sponsorStrip: false,
  look: 'mosaic' as const,
  posts: list,
  ...fields,
})
const keyOf = (p: ScreenPost) => `${p._id}@${p.approvedAt}`

const poll = (s: StreamState, list: ScreenPost[], now: number, f = {}) =>
  streamReducer(s, { type: 'poll', view: view(list, f), now })
const tick = (s: StreamState, now: number) =>
  streamReducer(s, { type: 'tick', now })
const loadAll = (s: StreamState, now: number) =>
  pendingStreamImages(s).reduce(
    (state, p) =>
      streamReducer(state, { type: 'imageLoaded', key: keyOf(p), now }),
    s,
  )
/** Ticks every 100 ms from `from` (exclusive) to `to` (inclusive), loading what is asked for. */
const run = (s: StreamState, from: number, to: number) => {
  let state = s
  for (let now = from + 100; now <= to; now += 100) {
    state = loadAll(tick(state, now), now)
  }
  return state
}
const ids = (list: ScreenPost[]) => list.map((p) => p._id)
const featuredId = (s: StreamState) => featured(s)?._id ?? null

function started(look: StreamLook, count: number, now = T0) {
  return loadAll(poll(initialStream(look), posts(count), now), now)
}

describe('first load', () => {
  it('Mosaic shows the newest tiles once their photos load, the newest in the spotlight, none marked new', () => {
    let s = poll(initialStream('mosaic'), posts(60), T0)
    expect(shownPosts(s)).toEqual([])
    expect(ids(pendingStreamImages(s))).toEqual(
      ids(posts(60).slice(0, MOSAIC_TILES)),
    )
    s = loadAll(s, T0)
    expect(ids(shownPosts(s))).toEqual(ids(posts(60).slice(0, MOSAIC_TILES)))
    expect(featuredId(s)).toBe('wallPost-60')
    expect(shownPosts(s).some((p) => isMarkedNew(s, p))).toBe(false)
  })
})

describe('Mosaic spotlight', () => {
  it('walks the 6 newest, one every 6 s, and starts again', () => {
    let s = started('mosaic', 20)
    const walk: (string | null)[] = [featuredId(s)]
    for (let i = 1; i <= MOSAIC_ROTATION; i++) {
      s = run(s, T0 + (i - 1) * SWAP_EVERY_MS, T0 + i * SWAP_EVERY_MS)
      walk.push(featuredId(s))
    }
    expect(walk).toEqual([
      'wallPost-20',
      'wallPost-19',
      'wallPost-18',
      'wallPost-17',
      'wallPost-16',
      'wallPost-15',
      'wallPost-20',
    ])
  })

  it('holds the spotlight for 6 s', () => {
    const s = run(started('mosaic', 20), T0, T0 + SWAP_EVERY_MS - 100)
    expect(featuredId(s)).toBe('wallPost-20')
  })

  it('gives a new post the spotlight at once, marked new for 6 s, then walks on', () => {
    let s = run(started('mosaic', 20), T0, T0 + 3_000)
    expect(featuredId(s)).toBe('wallPost-20')
    s = poll(s, posts(21), T0 + 3_000)
    s = loadAll(s, T0 + 3_000)
    expect(featuredId(s)).toBe('wallPost-21')
    expect(ids(shownPosts(s))[0]).toBe('wallPost-21')
    expect(isMarkedNew(s, post(21))).toBe(true)
    s = run(s, T0 + 3_000, T0 + 3_000 + NEW_MARK_MS - 100)
    expect(featuredId(s)).toBe('wallPost-21')
    expect(isMarkedNew(s, post(21))).toBe(true)
    s = run(s, T0 + 3_000 + NEW_MARK_MS - 100, T0 + 3_000 + NEW_MARK_MS)
    expect(isMarkedNew(s, post(21))).toBe(false)
    expect(featuredId(s)).toBe('wallPost-20')
  })

  it('lets a burst in one post every 2.5 s, in approval order, each taking the spotlight', () => {
    let s = started('mosaic', 20)
    s = loadAll(poll(s, posts(23), T0 + 1_000), T0 + 1_000)
    expect(featuredId(s)).toBe('wallPost-21')
    // The rest wait their turn, off the screen.
    expect(ids(shownPosts(s))).not.toContain('wallPost-22')
    s = run(s, T0 + 1_000, T0 + 1_000 + ARRIVAL_GAP_MS - 100)
    expect(featuredId(s)).toBe('wallPost-21')
    s = run(s, T0 + 1_000 + ARRIVAL_GAP_MS - 100, T0 + 1_000 + ARRIVAL_GAP_MS)
    expect(featuredId(s)).toBe('wallPost-22')
    s = run(s, T0 + 1_000 + ARRIVAL_GAP_MS, T0 + 1_000 + 2 * ARRIVAL_GAP_MS)
    expect(featuredId(s)).toBe('wallPost-23')
    expect(ids(shownPosts(s)).slice(0, 3)).toEqual([
      'wallPost-23',
      'wallPost-22',
      'wallPost-21',
    ])
  })

  it('a post removed and approved again is new again', () => {
    let s = started('mosaic', 5)
    const again = post(3, { approvedAt: at(99) })
    s = poll(s, [again, ...posts(5).filter((p) => p._id !== 'wallPost-3')], T0 + 1_000)
    s = loadAll(s, T0 + 1_000)
    expect(featuredId(s)).toBe('wallPost-3')
    expect(isMarkedNew(s, again)).toBe(true)
  })
})

describe('removal: at once, on both looks', () => {
  it('Mosaic: a removed tile leaves, and the next post fills in', () => {
    let s = started('mosaic', 50)
    const list = posts(50).filter((p) => p._id !== 'wallPost-30')
    s = poll(s, list, T0 + 1_000)
    expect(ids(shownPosts(s))).not.toContain('wallPost-30')
    s = loadAll(s, T0 + 1_000)
    expect(ids(shownPosts(s))).toEqual(ids(list.slice(0, MOSAIC_TILES)))
  })

  it('Mosaic: a removed spotlight hands over at once', () => {
    let s = started('mosaic', 20)
    expect(featuredId(s)).toBe('wallPost-20')
    s = poll(s, posts(19), T0 + 1_000)
    expect(featuredId(s)).toBe('wallPost-19')
  })

  it('Spotlight: a removed big post hands over at once; a removed waiting post drops out of Up next', () => {
    let s = started('spotlight', 20)
    s = loadAll(poll(s, posts(21), T0 + 1_000), T0 + 1_000)
    expect(ids(upNext(s))[0]).toBe('wallPost-21')
    s = poll(s, posts(20), T0 + 2_000)
    expect(ids(upNext(s))).not.toContain('wallPost-21')
    expect(featuredId(s)).toBe('wallPost-20')
    s = poll(
      s,
      posts(20).filter((p) => p._id !== 'wallPost-20'),
      T0 + 3_000,
    )
    expect(featuredId(s)).toBe('wallPost-19')
  })

  it('a queued arrival that is removed does not hold up the next one', () => {
    let s = started('mosaic', 20)
    s = loadAll(poll(s, posts(23), T0 + 500), T0 + 500)
    expect(featuredId(s)).toBe('wallPost-21')
    s = poll(
      s,
      posts(23).filter((p) => p._id !== 'wallPost-22'),
      T0 + 1_000,
    )
    s = run(s, T0 + 1_000, T0 + 500 + ARRIVAL_GAP_MS)
    expect(featuredId(s)).toBe('wallPost-23')
  })

  it('a queued arrival that is removed never shows', () => {
    let s = started('mosaic', 20)
    s = loadAll(poll(s, posts(22), T0 + 1_000), T0 + 1_000)
    s = poll(s, posts(21), T0 + 1_500)
    s = run(s, T0 + 1_500, T0 + 10_000)
    expect(ids(shownPosts(s))).not.toContain('wallPost-22')
  })
})

describe('Spotlight', () => {
  it('walks the 12 newest, one big post every 6 s, with the next 4 on the rail', () => {
    let s = started('spotlight', 30)
    expect(ids(shownPosts(s))).toHaveLength(SPOTLIGHT_ROTATION)
    expect(featuredId(s)).toBe('wallPost-30')
    expect(ids(upNext(s))).toEqual([
      'wallPost-29',
      'wallPost-28',
      'wallPost-27',
      'wallPost-26',
    ])
    s = run(s, T0, T0 + SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-29')
    s = run(s, T0 + SWAP_EVERY_MS, T0 + 11 * SWAP_EVERY_MS)
    // The twelfth newest, with the newest next on the rail.
    expect(featuredId(s)).toBe('wallPost-19')
    expect(ids(upNext(s))[0]).toBe('wallPost-30')
    s = run(s, T0 + 11 * SWAP_EVERY_MS, T0 + 12 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-30')
  })

  it('puts a new post next in line: first on Up next, marked new, big when the current turn ends', () => {
    let s = run(started('spotlight', 20), T0, T0 + 2_000)
    s = loadAll(poll(s, posts(21), T0 + 2_000), T0 + 2_000)
    expect(featuredId(s)).toBe('wallPost-20')
    expect(ids(upNext(s))[0]).toBe('wallPost-21')
    expect(isMarkedNew(s, post(21))).toBe(true)
    s = run(s, T0 + 2_000, T0 + SWAP_EVERY_MS - 100)
    expect(featuredId(s)).toBe('wallPost-20')
    s = run(s, T0 + SWAP_EVERY_MS - 100, T0 + SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-21')
    // Marked new for its whole turn.
    s = run(s, T0 + SWAP_EVERY_MS, T0 + 2 * SWAP_EVERY_MS - 100)
    expect(isMarkedNew(s, post(21))).toBe(true)
    s = run(s, T0 + 2 * SWAP_EVERY_MS - 100, T0 + 2 * SWAP_EVERY_MS)
    expect(isMarkedNew(s, post(21))).toBe(false)
    // Then the walk goes on from the newest.
    expect(featuredId(s)).toBe('wallPost-20')
  })

  it('a burst waits its turns in approval order', () => {
    let s = started('spotlight', 20)
    s = loadAll(poll(s, posts(23), T0 + 500), T0 + 500)
    s = run(s, T0 + 500, T0 + 500 + 2 * ARRIVAL_GAP_MS)
    expect(featuredId(s)).toBe('wallPost-20')
    expect(ids(upNext(s)).slice(0, 3)).toEqual([
      'wallPost-21',
      'wallPost-22',
      'wallPost-23',
    ])
    s = run(s, T0 + 500 + 2 * ARRIVAL_GAP_MS, T0 + SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-21')
    s = run(s, T0 + SWAP_EVERY_MS, T0 + 2 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-22')
  })
})

describe('images and flaky Wi-Fi (§9.2, §9.3)', () => {
  it('shows a post only once its photo has loaded, and skips one that fails', () => {
    let s = poll(initialStream('mosaic'), posts(3), T0)
    s = streamReducer(s, { type: 'imageFailed', key: keyOf(post(3)), now: T0 })
    s = loadAll(s, T0)
    expect(ids(shownPosts(s))).toEqual(['wallPost-2', 'wallPost-1'])
    expect(featuredId(s)).toBe('wallPost-2')
  })

  it('a failed photo gives its tile to the next post', () => {
    let s = poll(initialStream('mosaic'), posts(MOSAIC_TILES + 1), T0)
    s = streamReducer(s, { type: 'imageFailed', key: keyOf(post(5)), now: T0 })
    s = loadAll(s, T0)
    expect(ids(shownPosts(s))).toHaveLength(MOSAIC_TILES)
    expect(ids(shownPosts(s))).toContain('wallPost-1')
    expect(ids(shownPosts(s))).not.toContain('wallPost-5')
  })

  it('an arrival whose photo fails is skipped', () => {
    let s = started('mosaic', 5)
    s = poll(s, posts(6), T0 + 1_000)
    s = streamReducer(s, {
      type: 'imageFailed',
      key: keyOf(post(6)),
      now: T0 + 1_000,
    })
    expect(s.queue).toEqual([])
    expect(featuredId(s)).toBe('wallPost-5')
  })

  it('keeps the list through failed polls, the offline dot after 3, gone on the next success', () => {
    let s = started('spotlight', 5)
    for (let i = 1; i <= OFFLINE_AFTER_FAILURES; i++) {
      expect(isStreamOffline(s)).toBe(false)
      s = streamReducer(s, { type: 'pollFailed', now: T0 + i * 5_000 })
    }
    expect(isStreamOffline(s)).toBe(true)
    expect(ids(shownPosts(s))).toHaveLength(5)
    s = poll(s, posts(5), T0 + 20_000)
    expect(isStreamOffline(s)).toBe(false)
  })
})

describe('empty and closed', () => {
  it('invites with the QR when the wall is empty, and not while photos load', () => {
    expect(streamInvitation(poll(initialStream('mosaic'), [], T0))).toBe(true)
    expect(streamInvitation(poll(initialStream('mosaic'), posts(2), T0))).toBe(
      false,
    )
    expect(streamInvitation(initialStream('mosaic'))).toBe(false)
  })

  it('a closed wall invites nobody', () => {
    const s = poll(initialStream('spotlight'), [], T0, { closed: true })
    expect(s.closed).toBe(true)
    expect(streamInvitation(s)).toBe(false)
  })
})
