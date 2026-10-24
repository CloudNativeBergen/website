/**
 * The pinboard of Screen Mode as a state machine (Photo Wall spec §9.2,
 * §9.3): what a poll, a loaded image and the clock do to the 17 slots. Time
 * is an argument, so every rule is checked at exact instants.
 */
import { describe, expect, it } from 'vitest'
import type { ScreenPost, ScreenView } from '@/lib/photo-wall/screen'
import {
  ARRIVAL_GAP_MS,
  LEAVE_MS,
  NEW_MARK_MS,
  OFFLINE_AFTER_FAILURES,
  SCREEN_SLOTS,
  SWAP_EVERY_MS,
  type BoardState,
  boardReducer,
  initialBoard,
  isOffline,
  pendingImages,
} from './board'

const T0 = Date.parse('2026-10-26T09:00:00Z')
/** Minutes after the first day's 07:00Z: the approval times of the fixture. */
const at = (minutes: number) =>
  new Date(Date.parse('2026-10-26T07:00:00Z') + minutes * 60_000).toISOString()

const post = (n: number, fields: Partial<ScreenPost> = {}): ScreenPost => ({
  _id: `wallPost-${n}`,
  src: `https://cdn.sanity.io/images/p/d/${n}.jpg`,
  caption: null,
  name: null,
  approvedAt: at(n),
  ...fields,
})
/** `count` posts, newest approval first, as the server answers. */
const posts = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => post(from + count - 1 - i))
const view = (list: ScreenPost[], fields: Partial<ScreenView> = {}) => ({
  closed: false,
  sponsorStrip: false,
  posts: list,
  ...fields,
})

const poll = (s: BoardState, list: ScreenPost[], now: number, f = {}) =>
  boardReducer(s, { type: 'poll', view: view(list, f), now })
const failed = (s: BoardState, now: number) =>
  boardReducer(s, { type: 'pollFailed', now })
const tick = (s: BoardState, now: number) =>
  boardReducer(s, { type: 'tick', now })
/** Every pending image loads, as a browser with the photos cached would. */
const loadAll = (s: BoardState, now: number) =>
  pendingImages(s).reduce(
    (state, p) =>
      boardReducer(state, { type: 'imageLoaded', key: keyOf(p), now }),
    s,
  )
const keyOf = (p: ScreenPost) => `${p._id}@${p.approvedAt}`
/** Ticks every 100 ms from `from` (exclusive) to `to` (inclusive). */
const advance = (s: BoardState, from: number, to: number) => {
  let state = s
  for (let now = from + 100; now <= to; now += 100) state = tick(state, now)
  return state
}
const shownIds = (s: BoardState) =>
  s.slots.map((c) => (c && c.leavingAt === null ? c.post._id : null))
/** The ids wearing the new mark, sorted: slot order says nothing about it. */
const newIds = (s: BoardState) =>
  s.slots
    .filter((c) => c !== null && c.newUntil !== null)
    .map((c) => c!.post._id)
    .sort()

/**
 * A board that has started with `count` posts, every image loaded: the 17
 * on the board and then what the board asks for next (a refill, a swap).
 */
function started(count: number, now = T0) {
  let s = poll(initialBoard(), posts(count), now)
  s = loadAll(s, now)
  s = tick(s, now)
  return loadAll(s, now)
}

describe('first load (§9.2)', () => {
  it('shows the newest 17 of the list, each once its image has loaded, with no new mark', () => {
    let s = poll(initialBoard(), posts(24), T0)
    // Nothing shows before an image has loaded.
    expect(s.slots.every((c) => c === null)).toBe(true)
    // The 17 newest are wanted first.
    expect(pendingImages(s).map((p) => p._id)).toEqual(
      posts(24)
        .slice(0, SCREEN_SLOTS)
        .map((p) => p._id),
    )
    s = loadAll(s, T0)
    s = tick(s, T0)
    expect(shownIds(s).filter(Boolean)).toHaveLength(SCREEN_SLOTS)
    expect(shownIds(s)).toEqual(
      posts(24)
        .slice(0, SCREEN_SLOTS)
        .map((p) => p._id),
    )
    expect(newIds(s)).toEqual([])
  })

  it('shows fewer than 17 when there are fewer, and none when the wall is empty', () => {
    const s = started(5)
    expect(shownIds(s).filter(Boolean)).toHaveLength(5)
    expect(s.slots).toHaveLength(SCREEN_SLOTS)
    const empty = poll(initialBoard(), [], T0)
    expect(empty.started).toBe(true)
    expect(shownIds(empty).filter(Boolean)).toEqual([])
  })

  it('skips a post whose image fails to load; the next of the list takes its place', () => {
    let s = poll(initialBoard(), posts(20), T0)
    const [head, ...rest] = pendingImages(s)
    s = boardReducer(s, { type: 'imageFailed', key: keyOf(head), now: T0 })
    for (const p of rest) {
      s = boardReducer(s, { type: 'imageLoaded', key: keyOf(p), now: T0 })
    }
    s = tick(s, T0)
    expect(shownIds(s)).not.toContain(head._id)
    // The 18th newest is wanted now, and shows once loaded.
    expect(pendingImages(s).map((p) => p._id)).toContain('wallPost-3')
    s = loadAll(s, T0)
    s = tick(s, T0)
    expect(shownIds(s).filter(Boolean)).toHaveLength(SCREEN_SLOTS)
    expect(shownIds(s)).toContain('wallPost-3')
  })
})

describe('arrivals (§9.2)', () => {
  it('a new (id, approvedAt) drops in on top of the oldest card, once loaded, with a 6 s new mark', () => {
    let s = started(17)
    const fresh = post(30)
    s = poll(s, [fresh, ...posts(17)], T0 + 5_000)
    expect(pendingImages(s).map((p) => p._id)).toContain(fresh._id)
    // Not shown until its image has loaded.
    s = tick(s, T0 + 5_500)
    expect(shownIds(s)).not.toContain(fresh._id)
    s = loadAll(s, T0 + 6_000)
    s = tick(s, T0 + 6_000)
    const slot = s.slots.findIndex((c) => c?.post._id === fresh._id)
    // The oldest approval was wallPost-1, in the last slot.
    expect(slot).toBe(16)
    expect(shownIds(s)).not.toContain('wallPost-1')
    expect(newIds(s)).toEqual([fresh._id])
    expect(s.slots[slot]!.z).toBeGreaterThan(
      Math.max(...s.slots.filter((c) => c !== null).map((c) => c!.z)) - 1,
    )
    s = advance(s, T0 + 6_000, T0 + 6_000 + NEW_MARK_MS - 100)
    expect(newIds(s)).toEqual([fresh._id])
    s = tick(s, T0 + 6_000 + NEW_MARK_MS)
    expect(newIds(s)).toEqual([])
    expect(shownIds(s)).toContain(fresh._id)
  })

  it('lets a burst in one post every 2.5 s, in approval order', () => {
    let s = started(17)
    const burst = [post(33), post(32), post(31)]
    s = poll(s, [...burst, ...posts(17)], T0 + 5_000)
    s = loadAll(s, T0 + 5_000)
    s = tick(s, T0 + 5_000)
    expect(newIds(s)).toEqual(['wallPost-31'])
    s = advance(s, T0 + 5_000, T0 + 5_000 + ARRIVAL_GAP_MS - 100)
    expect(shownIds(s)).not.toContain('wallPost-32')
    s = tick(s, T0 + 5_000 + ARRIVAL_GAP_MS)
    expect(newIds(s)).toEqual(['wallPost-31', 'wallPost-32'])
    s = tick(s, T0 + 5_000 + 2 * ARRIVAL_GAP_MS)
    expect(newIds(s)).toEqual(['wallPost-31', 'wallPost-32', 'wallPost-33'])
    // The three oldest left, newest arrival on top.
    expect(shownIds(s)).not.toContain('wallPost-1')
    expect(shownIds(s)).not.toContain('wallPost-2')
    expect(shownIds(s)).not.toContain('wallPost-3')
    const z = (id: string) => s.slots.find((c) => c?.post._id === id)!.z
    expect(z('wallPost-33')).toBeGreaterThan(z('wallPost-32'))
    expect(z('wallPost-32')).toBeGreaterThan(z('wallPost-31'))
  })

  it('a post already seen does not arrive again on the next poll', () => {
    let s = started(17)
    const fresh = post(30)
    s = poll(s, [fresh, ...posts(17)], T0 + 5_000)
    s = loadAll(s, T0 + 5_000)
    s = tick(s, T0 + 5_000)
    s = tick(s, T0 + 5_000 + NEW_MARK_MS)
    expect(newIds(s)).toEqual([])
    s = poll(s, [fresh, ...posts(17)], T0 + 10_000)
    s = advance(s, T0 + 10_000, T0 + 13_000)
    expect(newIds(s)).toEqual([])
    expect(s.queue).toEqual([])
  })

  it('a removed and re-approved post arrives again: the key is (id, approvedAt)', () => {
    let s = started(17)
    // Removed: wallPost-9 leaves.
    s = poll(
      s,
      posts(17).filter((p) => p._id !== 'wallPost-9'),
      T0 + 5_000,
    )
    s = advance(s, T0 + 5_000, T0 + 5_000 + LEAVE_MS)
    expect(shownIds(s)).not.toContain('wallPost-9')
    // Approved again, later.
    const again = post(9, { approvedAt: at(40) })
    s = poll(
      s,
      [again, ...posts(17).filter((p) => p._id !== 'wallPost-9')],
      T0 + 10_000,
    )
    s = loadAll(s, T0 + 10_000)
    s = tick(s, T0 + 10_000)
    expect(newIds(s)).toEqual(['wallPost-9'])
  })

  it('a post that arrives while fewer than 17 show takes a free slot, replacing nothing', () => {
    let s = started(5)
    s = poll(s, [post(30), ...posts(5)], T0 + 5_000)
    s = loadAll(s, T0 + 5_000)
    s = tick(s, T0 + 5_000)
    expect(shownIds(s).filter(Boolean)).toHaveLength(6)
    expect(newIds(s)).toEqual(['wallPost-30'])
  })
})

describe('removal (§9.2)', () => {
  it('a card missing from the list leaves at once and is gone after the fade; the slot refills from the rest', () => {
    let s = started(24)
    const gone = shownIds(s)[3]!
    s = poll(
      s,
      posts(24).filter((p) => p._id !== gone),
      T0 + 5_000,
    )
    s = loadAll(s, T0 + 5_000)
    const leaving = s.slots[3]!
    expect(leaving.post._id).toBe(gone)
    expect(leaving.leavingAt).toBe(T0 + 5_000)
    expect(shownIds(s)[3]).toBeNull()
    s = advance(s, T0 + 5_000, T0 + 5_000 + LEAVE_MS - 100)
    expect(s.slots[3]?.post._id).toBe(gone)
    s = tick(s, T0 + 5_000 + LEAVE_MS)
    // Refilled from the rest: the newest post not on the board.
    expect(s.slots[3]?.post._id).toBe('wallPost-7')
    expect(s.slots[3]?.newUntil).toBeNull()
    expect(shownIds(s)).not.toContain(gone)
  })

  it('a removed post still waiting in the queue never shows', () => {
    let s = started(17)
    s = poll(s, [post(31), post(30), ...posts(17)], T0 + 5_000)
    s = loadAll(s, T0 + 5_000)
    s = tick(s, T0 + 5_000)
    expect(newIds(s)).toEqual(['wallPost-30'])
    // 31 is removed before its turn.
    s = poll(s, [post(30), ...posts(17)], T0 + 6_000)
    s = advance(s, T0 + 6_000, T0 + 12_000)
    expect(shownIds(s)).not.toContain('wallPost-31')
    expect(s.queue).toEqual([])
  })

  it('with nothing in the rest, the slot stays empty', () => {
    let s = started(3)
    s = poll(s, posts(2), T0 + 5_000)
    s = advance(s, T0 + 5_000, T0 + 6_000)
    expect(shownIds(s).filter(Boolean)).toHaveLength(2)
  })
})

describe('idle swap (§9.2)', () => {
  it('every 6 s one card, the longest shown, swaps to a post from the rest when there are more than 17', () => {
    let s = started(24)
    const before = shownIds(s)
    s = advance(s, T0, T0 + SWAP_EVERY_MS - 100)
    expect(shownIds(s)).toEqual(before)
    s = tick(s, T0 + SWAP_EVERY_MS)
    const after = shownIds(s)
    const changed = after.filter((id, i) => id !== before[i])
    expect(changed).toHaveLength(1)
    expect(before).not.toContain(changed[0])
    // The swapped-in card wears no new mark.
    expect(newIds(s)).toEqual([])
    s = loadAll(s, T0 + SWAP_EVERY_MS)
    s = tick(s, T0 + 2 * SWAP_EVERY_MS)
    expect(shownIds(s).filter((id, i) => id !== after[i])).toHaveLength(1)
  })

  it('never swaps with 17 or fewer posts', () => {
    let s = started(17)
    const before = shownIds(s)
    s = advance(s, T0, T0 + 5 * SWAP_EVERY_MS)
    expect(shownIds(s)).toEqual(before)
  })

  it('waits while a burst is arriving, and does not swap out a new card', () => {
    let s = started(24)
    s = poll(s, [post(31), post(30), ...posts(24)], T0 + 1_000)
    s = loadAll(s, T0 + 1_000)
    s = tick(s, T0 + 1_000)
    expect(newIds(s)).toEqual(['wallPost-30'])
    const before = shownIds(s)
    // 6 s after the start: the queue still holds 31, so no swap.
    s = advance(s, T0 + 1_000, T0 + 1_000 + ARRIVAL_GAP_MS - 100)
    expect(shownIds(s)).toEqual(before)
    s = tick(s, T0 + 1_000 + ARRIVAL_GAP_MS)
    expect(newIds(s)).toEqual(['wallPost-30', 'wallPost-31'])
    const afterBurst = shownIds(s)
    s = advance(
      s,
      T0 + 1_000 + ARRIVAL_GAP_MS,
      T0 + 1_000 + ARRIVAL_GAP_MS + SWAP_EVERY_MS,
    )
    const swapped = shownIds(s).filter((id, i) => id !== afterBurst[i])
    expect(swapped).toHaveLength(1)
    expect(shownIds(s)).toContain('wallPost-30')
    expect(shownIds(s)).toContain('wallPost-31')
  })
})

describe('flaky Wi-Fi (§9.3)', () => {
  it('keeps the last list through failed polls and marks offline after 3 in a row', () => {
    let s = started(20)
    const before = shownIds(s)
    for (let i = 1; i <= OFFLINE_AFTER_FAILURES; i++) {
      s = failed(s, T0 + i * 1_000)
      expect(isOffline(s)).toBe(i >= OFFLINE_AFTER_FAILURES)
    }
    expect(s.list.map((p) => p._id)).toEqual(posts(20).map((p) => p._id))
    expect(shownIds(s)).toEqual(before)
    // Still cycling.
    s = advance(s, T0, T0 + SWAP_EVERY_MS)
    expect(shownIds(s)).not.toEqual(before)
    // Back: the dot goes on the next success.
    s = poll(s, posts(20), T0 + 20_000)
    expect(isOffline(s)).toBe(false)
  })

  it('a success in between resets the count', () => {
    let s = started(5)
    s = failed(s, T0 + 5_000)
    s = failed(s, T0 + 10_000)
    s = poll(s, posts(5), T0 + 15_000)
    s = failed(s, T0 + 20_000)
    s = failed(s, T0 + 25_000)
    expect(isOffline(s)).toBe(false)
    s = failed(s, T0 + 30_000)
    expect(isOffline(s)).toBe(true)
  })

  it('offline then online: the whole list catches up, a removal leaves and approvals arrive as a burst', () => {
    let s = started(17)
    s = failed(s, T0 + 5_000)
    s = failed(s, T0 + 10_000)
    s = failed(s, T0 + 15_000)
    expect(isOffline(s)).toBe(true)
    // Meanwhile: wallPost-4 removed, 30 and 31 approved.
    s = poll(
      s,
      [post(31), post(30), ...posts(17).filter((p) => p._id !== 'wallPost-4')],
      T0 + 20_000,
    )
    expect(s.slots.find((c) => c?.post._id === 'wallPost-4')?.leavingAt).toBe(
      T0 + 20_000,
    )
    s = loadAll(s, T0 + 20_000)
    s = tick(s, T0 + 20_000)
    expect(newIds(s)).toEqual(['wallPost-30'])
    s = advance(s, T0 + 20_000, T0 + 20_000 + ARRIVAL_GAP_MS)
    expect(newIds(s)).toEqual(['wallPost-30', 'wallPost-31'])
    expect(shownIds(s)).not.toContain('wallPost-4')
  })
})

describe('closed wall and settings (§9.2, §9.4)', () => {
  it('reads the Sponsor strip switch from every poll', () => {
    let s = started(3)
    expect(s.sponsorStrip).toBe(false)
    s = poll(s, posts(3), T0 + 5_000, { sponsorStrip: true })
    expect(s.sponsorStrip).toBe(true)
  })

  it('a closed wall shows nothing but that it closed', () => {
    let s = started(5)
    s = poll(s, [], T0 + 5_000, { closed: true })
    expect(s.closed).toBe(true)
    s = advance(s, T0 + 5_000, T0 + 5_000 + LEAVE_MS)
    expect(shownIds(s).filter(Boolean)).toEqual([])
  })
})

describe('the clock', () => {
  it('a tick with nothing due returns the same state', () => {
    const s = started(10)
    expect(tick(s, T0 + 100)).toBe(s)
    expect(tick(s, T0 + 1_000)).toBe(s)
  })

  it('an unknown image key changes nothing', () => {
    const s = started(10)
    expect(
      boardReducer(s, { type: 'imageLoaded', key: 'nope', now: T0 + 100 }),
    ).toBe(s)
  })
})
