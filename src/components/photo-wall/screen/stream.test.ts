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
  IMAGE_RETRY_MS,
  NEW_MARK_MS,
  OFFLINE_AFTER_FAILURES,
  SWAP_EVERY_MS,
} from './board'
import {
  MOSAIC_ROTATION,
  MOSAIC_TILES,
  PRELOAD_AT_ONCE,
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
/** Every photo the screen asks for loads, a batch at a time, as a browser with them cached would. */
const loadAll = (s: StreamState, now: number) => {
  let state = s
  for (
    let batch = pendingStreamImages(state);
    batch.length > 0;
    batch = pendingStreamImages(state)
  ) {
    state = batch.reduce(
      (st, p) => streamReducer(st, { type: 'imageLoaded', key: keyOf(p), now }),
      state,
    )
  }
  return state
}
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
    // The newest first, a few at a time.
    expect(ids(pendingStreamImages(s))).toEqual(
      ids(posts(60).slice(0, PRELOAD_AT_ONCE)),
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
    // On from the post it interrupted, not from the top.
    expect(featuredId(s)).toBe('wallPost-19')
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
    s = poll(
      s,
      [again, ...posts(5).filter((p) => p._id !== 'wallPost-3')],
      T0 + 1_000,
    )
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
    // Then the walk goes on after the post it followed, not from the top.
    expect(featuredId(s)).toBe('wallPost-19')
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

describe('round-1 adversarial findings', () => {
  const failAll = (s: StreamState, now: number) =>
    pendingStreamImages(s).reduce(
      (state, p) =>
        streamReducer(state, { type: 'imageFailed', key: keyOf(p), now }),
      s,
    )

  it.each(['mosaic', 'spotlight'] as const)(
    '%s keeps the invitation while photos that all failed are tried again',
    (look) => {
      let s = failAll(poll(initialStream(look), posts(5), T0), T0)
      expect(streamInvitation(s)).toBe(true)
      s = poll(s, posts(5), T0 + IMAGE_RETRY_MS)
      // Asked for again, nothing loaded yet: still the invitation.
      expect(pendingStreamImages(s)).toHaveLength(5)
      expect(streamInvitation(s)).toBe(true)
      s = loadAll(s, T0 + IMAGE_RETRY_MS)
      expect(streamInvitation(s)).toBe(false)
    },
  )

  it('Spotlight: a steady trickle of approvals does not starve the rest of the walk', () => {
    let s = started('spotlight', 30)
    const featuredIds = new Set<string>()
    let now = T0
    let newest = 30
    // One approval every 12 s for 5 minutes.
    for (let step = 0; step < 25; step++) {
      newest += 1
      s = loadAll(poll(s, posts(newest), now), now)
      s = run(s, now, now + 12_000)
      now += 12_000
      featuredIds.add(featuredId(s)!)
    }
    // Older posts got turns between the arrivals, not just the one it interrupted.
    const old = [...featuredIds].filter((id) => Number(id.split('-')[1]) <= 30)
    expect(old.length).toBeGreaterThan(3)
  })

  it('Spotlight: after a burst, the walk resumes after the post the burst interrupted', () => {
    // 20 is big; 21 and 22 arrive and wait their turns.
    let s = started('spotlight', 20)
    s = loadAll(poll(s, posts(22), T0 + 500), T0 + 500)
    s = run(s, T0 + 500, T0 + SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-21')
    s = run(s, T0 + SWAP_EVERY_MS, T0 + 2 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-22')
    // Not 20 again: on to the post after it.
    s = run(s, T0 + 2 * SWAP_EVERY_MS, T0 + 3 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-19')
  })

  it('asks the browser for at most a few photos at once', () => {
    const s = poll(initialStream('mosaic'), posts(60), T0)
    expect(pendingStreamImages(s)).toHaveLength(PRELOAD_AT_ONCE)
  })
})

describe('round-2 adversarial findings', () => {
  it.each(['mosaic', 'spotlight'] as const)(
    '%s: a removed featured post hands over to the next, not the newest',
    (look) => {
      let s = started(look, 4)
      s = run(s, T0, T0 + 2 * SWAP_EVERY_MS)
      expect(featuredId(s)).toBe('wallPost-2')
      s = poll(
        s,
        posts(4).filter((p) => p._id !== 'wallPost-2'),
        T0 + 2 * SWAP_EVERY_MS + 1_000,
      )
      expect(featuredId(s)).toBe('wallPost-1')
    },
  )

  it('Spotlight: Up next always lists the post that is big next', () => {
    // Two posts: A loaded, then B arrives and waits; when B is big, A is next.
    let s = started('spotlight', 1)
    s = loadAll(poll(s, posts(2), T0 + 1_000), T0 + 1_000)
    s = run(s, T0 + 1_000, T0 + SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-2')
    expect(ids(upNext(s))).toEqual(['wallPost-1'])
    // And in general: the head of Up next is what the next turn shows.
    let t = started('spotlight', 20)
    let now = T0
    for (let turn = 0; turn < 30; turn++) {
      if (turn % 4 === 1) {
        t = loadAll(poll(t, posts(21 + turn), now), now)
      }
      const head = upNext(t)[0]?._id
      t = run(t, now, now + SWAP_EVERY_MS)
      now += SWAP_EVERY_MS
      expect(featuredId(t)).toBe(head)
    }
  })
})

describe('round-2 state findings', () => {
  it.each(['mosaic', 'spotlight'] as const)(
    '%s keeps the invitation while the first approval’s photo loads',
    (look) => {
      let s = poll(initialStream(look), [], T0)
      expect(streamInvitation(s)).toBe(true)
      s = poll(s, [post(1)], T0 + 5_000)
      expect(shownPosts(s)).toHaveLength(0)
      expect(streamInvitation(s)).toBe(true)
      s = loadAll(s, T0 + 5_000)
      expect(streamInvitation(s)).toBe(false)
      expect(featuredId(s)).toBe('wallPost-1')
    },
  )

  it('Mosaic: a post that slides in from below the 200 is not a new arrival', () => {
    // 201 approved; the screen sees the newest 200 (2…201).
    let s = loadAll(poll(initialStream('mosaic'), posts(200, 2), T0), T0)
    expect(featuredId(s)).toBe('wallPost-201')
    // 150 removed: post 1 enters the answer at the bottom.
    const list = [
      ...posts(200, 2).filter((p) => p._id !== 'wallPost-150'),
      post(1),
    ]
    s = loadAll(poll(s, list, T0 + 1_000), T0 + 1_000)
    expect(s.queue).toEqual([])
    expect(isMarkedNew(s, post(1))).toBe(false)
    s = run(s, T0 + 1_000, T0 + SWAP_EVERY_MS - 100)
    // The spotlight's turn is not cut short.
    expect(featuredId(s)).toBe('wallPost-201')
  })

  it('Spotlight: after an arrival, a removed interrupted post still resumes the walk where it stood', () => {
    let s = started('spotlight', 12)
    s = run(s, T0, T0 + 2 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-10')
    s = loadAll(
      poll(s, posts(13), T0 + 2 * SWAP_EVERY_MS + 500),
      T0 + 2 * SWAP_EVERY_MS + 500,
    )
    s = run(s, T0 + 2 * SWAP_EVERY_MS + 500, T0 + 3 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-13')
    s = poll(
      s,
      posts(13).filter((p) => p._id !== 'wallPost-10'),
      T0 + 3 * SWAP_EVERY_MS + 1_000,
    )
    expect(ids(upNext(s))[0]).toBe('wallPost-9')
    s = run(s, T0 + 3 * SWAP_EVERY_MS + 1_000, T0 + 4 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-9')
  })
})

describe('round-2 UI findings', () => {
  it.each(['mosaic', 'spotlight'] as const)(
    '%s features the newest post first, whatever order the photos load in',
    (look) => {
      let s = poll(initialStream(look), posts(10), T0)
      // The oldest asked-for photos report first, the newest last.
      for (const p of [...pendingStreamImages(s)].reverse()) {
        s = streamReducer(s, { type: 'imageLoaded', key: keyOf(p), now: T0 })
        if (p._id !== 'wallPost-10') expect(featuredId(s)).toBeNull()
      }
      expect(featuredId(s)).toBe('wallPost-10')
    },
  )

  it('a newest photo that fails hands the first feature to the next newest', () => {
    let s = poll(initialStream('spotlight'), posts(3), T0)
    s = streamReducer(s, { type: 'imageLoaded', key: keyOf(post(1)), now: T0 })
    s = streamReducer(s, { type: 'imageLoaded', key: keyOf(post(2)), now: T0 })
    expect(featuredId(s)).toBeNull()
    s = streamReducer(s, { type: 'imageFailed', key: keyOf(post(3)), now: T0 })
    expect(featuredId(s)).toBe('wallPost-2')
  })
})

describe('round-3 adversarial findings', () => {
  it.each([
    ['spotlight', SPOTLIGHT_ROTATION],
    ['mosaic', MOSAIC_TILES],
  ] as const)(
    '%s keeps a loaded photo on screen while the failed newer ones are tried again',
    (look, cap) => {
      // cap + 1 posts: the newest `cap` fail, the oldest loads.
      let s = poll(initialStream(look), posts(cap + 1), T0)
      for (
        let batch = pendingStreamImages(s);
        batch.length > 0;
        batch = pendingStreamImages(s)
      ) {
        s = batch.reduce(
          (st, p) =>
            streamReducer(st, {
              type: p._id === 'wallPost-1' ? 'imageLoaded' : 'imageFailed',
              key: keyOf(p),
              now: T0,
            }),
          s,
        )
      }
      expect(featuredId(s)).toBe('wallPost-1')
      s = poll(s, posts(cap + 1), T0 + IMAGE_RETRY_MS)
      // The retries are asked for; the working photo stays meanwhile.
      expect(pendingStreamImages(s).length).toBeGreaterThan(0)
      expect(ids(shownPosts(s))).toEqual(['wallPost-1'])
      expect(featuredId(s)).toBe('wallPost-1')
      expect(streamInvitation(s)).toBe(false)
    },
  )
})

describe('round-4 adversarial findings', () => {
  it('Spotlight: photos that recover never push a waiting arrival out of its turn', () => {
    let s = started('spotlight', 1)
    let now = T0 + 5_000
    // 25 approvals at once; the older 12 load, the newer 13 fail.
    s = poll(s, posts(26), now)
    const result = (p: ScreenPost) =>
      Number(p._id.split('-')[1]) <= 13 ? 'imageLoaded' : 'imageFailed'
    const settle = (st: StreamState, at: number) => {
      let state = st
      for (
        let b = pendingStreamImages(state);
        b.length > 0;
        b = pendingStreamImages(state)
      ) {
        state = b.reduce(
          (x, p) =>
            streamReducer(x, { type: result(p), key: keyOf(p), now: at }),
          state,
        )
      }
      return state
    }
    s = settle(s, now)
    for (; now < T0 + 65_000; now += 100) s = settle(tick(s, now), now)
    const waitingBefore = [...s.waiting]
    expect(waitingBefore.length).toBeGreaterThan(0)
    // A successful poll retries the failed photos; this time they all load.
    s = loadAll(poll(s, posts(26), now), now)
    const seenFeatured = new Set<string>()
    for (let turn = 0; turn < 40; turn++) {
      s = run(s, now, now + SWAP_EVERY_MS)
      now += SWAP_EVERY_MS
      const post = featured(s)
      if (post) seenFeatured.add(keyOf(post))
    }
    for (const key of waitingBefore) expect(seenFeatured).toContain(key)
  })
})

describe('round-5 adversarial findings', () => {
  it('Spotlight: after two quick arrivals, Up next is exactly the next four big posts, with no repeat', () => {
    let s = started('spotlight', 12)
    s = run(s, T0, T0 + 11 * SWAP_EVERY_MS)
    expect(featuredId(s)).toBe('wallPost-1')
    let now = T0 + 11 * SWAP_EVERY_MS
    s = loadAll(poll(s, posts(13), now + 500), now + 500) // F
    s = run(s, now + 500, now + SWAP_EVERY_MS)
    now += SWAP_EVERY_MS
    expect(featuredId(s)).toBe('wallPost-13')
    s = loadAll(poll(s, posts(14), now + 500), now + 500) // W
    const promised = ids(upNext(s))
    expect(promised).toHaveLength(4)
    const actual: string[] = []
    for (let turn = 1; turn <= 4; turn++) {
      s = run(s, now, now + SWAP_EVERY_MS)
      now += SWAP_EVERY_MS
      actual.push(featuredId(s)!)
    }
    expect(actual).toEqual(promised)
    expect(actual).not.toContain('wallPost-13')
  })

  it('Spotlight: with arrivals now and then, Up next always names the next four turns', () => {
    let s = started('spotlight', 20)
    let now = T0
    let newest = 20
    for (let step = 0; step < 40; step++) {
      if (step % 5 === 2) {
        newest += 1
        s = loadAll(poll(s, posts(newest), now + 100), now + 100)
      }
      const promised = ids(upNext(s))
      // The next four turns, with nothing approved meanwhile.
      let t = s
      let at = now
      const actual: string[] = []
      for (let turn = 0; turn < promised.length; turn++) {
        t = run(t, at, at + SWAP_EVERY_MS)
        at += SWAP_EVERY_MS
        actual.push(featuredId(t)!)
      }
      expect(actual).toEqual(promised)
      s = run(s, now, now + SWAP_EVERY_MS)
      now += SWAP_EVERY_MS
    }
  })

  it('Mosaic never shows more than 40 tiles', () => {
    let s = started('mosaic', 60)
    s = loadAll(poll(s, posts(61), T0 + 1_000), T0 + 1_000)
    s = run(s, T0 + 1_000, T0 + 20 * SWAP_EVERY_MS)
    expect(shownPosts(s)).toHaveLength(MOSAIC_TILES)
  })
})

describe('round-7 adversarial findings', () => {
  it('Mosaic: a removal in the same poll as an arrival leaves the walk’s next post its place', () => {
    let s = started('mosaic', 10)
    let now = T0 + 1_000
    // A burst of two: 11 takes the spotlight, 12 waits out the gap.
    s = loadAll(poll(s, posts(12), now), now)
    expect(ids(s.queue)).toEqual(['wallPost-12'])
    expect(featuredId(s)).toBe('wallPost-11')
    const next = walkNext(s)
    now += ARRIVAL_GAP_MS
    // One poll removes 11 and lets 12 in.
    s = poll(
      s,
      posts(12).filter((p) => p._id !== 'wallPost-11'),
      now,
    )
    expect(featuredId(s)).toBe('wallPost-12')
    // Nothing was featured but 12: the walk's next is still next.
    s = run(s, now, now + SWAP_EVERY_MS)
    expect(featuredId(s)).toBe(next)
  })
})

/** The post the Mosaic walk features after the current turn, nothing happening meanwhile. */
function walkNext(s: StreamState): string {
  const at = s.feature!.at
  return featuredId(run(s, at, at + SWAP_EVERY_MS))!
}
