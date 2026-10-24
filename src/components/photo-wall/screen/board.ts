/**
 * THE PINBOARD of Screen Mode as a state machine (Photo Wall spec §9.2,
 * §9.3): 17 slots, a queue of arrivals, the images that have loaded, and
 * the clock as an argument. Pure, so every rule is checked at exact
 * instants; `ScreenBoard` drives it with the polls, the `<img>` events and
 * a heartbeat tick.
 *
 * A post is known by `(id, approvedAt)` ({@link screenPostKey}): the same
 * post removed and approved again is new again.
 */
import {
  screenPostKey,
  type ScreenPost,
  type ScreenView,
} from '@/lib/photo-wall/screen'

/** Polaroids on the board; the QR polaroid takes the 18th place (§9.2). */
export const SCREEN_SLOTS = 17
/** How long an arrival wears its "new" mark. */
export const NEW_MARK_MS = 6_000
/** A burst is let in one post at a time, this far apart, in approval order. */
export const ARRIVAL_GAP_MS = 2_500
/** Idle: one card swaps to a post from the rest of the list this often. */
export const SWAP_EVERY_MS = 6_000
/** A removed card's fade; it is gone from its slot after this. */
export const LEAVE_MS = 300
/** Consecutive failed polls before the offline dot shows (§9.3). */
export const OFFLINE_AFTER_FAILURES = 3
/** How many queued arrivals have their image fetched ahead of their turn. */
export const PRELOAD_AHEAD = 3
/**
 * A failed image is tried again by the first successful poll this long
 * after it failed, the wait doubling with each failure up to
 * {@link IMAGE_RETRY_MAX_MS}: a Wi-Fi blip during the first load must not
 * leave the board without its photos for the rest of the day.
 */
export const IMAGE_RETRY_MS = 30_000
export const IMAGE_RETRY_MAX_MS = 5 * 60_000

export interface ScreenCard {
  key: string
  post: ScreenPost
  /** Stacking: arrivals go on top of what they drop onto; the rest sit at 0. */
  z: number
  /** Wears the "new" mark until then; null for the first load, a refill or a swap. */
  newUntil: number | null
  /** When it took its slot: the longest shown is the one an idle swap replaces. */
  shownAt: number
  /** Missing from the list since then; gone from the slot {@link LEAVE_MS} later. */
  leavingAt: number | null
}

interface Queued {
  post: ScreenPost
  /** Part of the first load: no gap, no "new" mark. */
  initial: boolean
}

/** What a screen remembers of the images it asked the browser to fetch. */
export interface ImageMemory {
  /** The latest successful answer, newest approval first. */
  list: ScreenPost[]
  /** What the browser reported of an image it was asked to fetch. */
  images: Readonly<Record<string, 'loaded' | 'failed'>>
  /** When each image last failed and how often in a row: when to try it again. */
  imageFailures: Readonly<Record<string, { at: number; count: number }>>
}

export interface BoardState extends ImageMemory {
  /** False until the first successful poll. */
  started: boolean
  closed: boolean
  sponsorStrip: boolean
  /** The 17 places on the board, by position; null is an empty slot. */
  slots: (ScreenCard | null)[]
  /** Every `(id, approvedAt)` this screen has met: not new a second time. */
  seen: ReadonlySet<string>
  /** Arrivals waiting their turn, in approval order. */
  queue: Queued[]
  /** Where the idle swap is in the rest of the list. */
  cursor: number
  lastArrivalAt: number
  lastSwapAt: number
  nextZ: number
  /** Consecutive failed polls. */
  failures: number
}

export type BoardAction =
  | { type: 'poll'; view: ScreenView; now: number }
  | { type: 'pollFailed'; now: number }
  | { type: 'imageLoaded'; key: string; now: number }
  | { type: 'imageFailed'; key: string; now: number }
  | { type: 'tick'; now: number }

export function initialBoard(): BoardState {
  return {
    started: false,
    closed: false,
    sponsorStrip: false,
    list: [],
    slots: Array.from({ length: SCREEN_SLOTS }, () => null),
    seen: new Set(),
    queue: [],
    images: {},
    imageFailures: {},
    cursor: 0,
    lastArrivalAt: 0,
    lastSwapAt: 0,
    nextZ: 1,
    failures: 0,
  }
}

/** Three failed polls in a row: the corner dot shows until the next success (§9.3). */
export function isOffline(state: BoardState): boolean {
  return state.failures >= OFFLINE_AFTER_FAILURES
}

/**
 * Nothing to pin up once the first load is over: an empty wall, or one
 * whose every photo failed to load (the screen shows the QR invitation, not
 * a blank board, until a retry lands).
 */
export function showsInvitation(state: BoardState): boolean {
  return (
    state.started &&
    !state.closed &&
    state.slots.every((c) => c === null) &&
    !state.queue.some((q) => q.initial)
  )
}

/**
 * The rest of the list (§9.2): posts not on the board and not queued, whose
 * image has not failed, newest first. Where a removed card's slot refills
 * from and where the idle swap picks from.
 */
function rest(state: BoardState): ScreenPost[] {
  const held = new Set<string>()
  for (const card of state.slots) if (card) held.add(card.key)
  for (const { post } of state.queue) held.add(screenPostKey(post))
  return state.list.filter((post) => {
    const key = screenPostKey(post)
    return !held.has(key) && state.images[key] !== 'failed'
  })
}

function swapCandidate(state: BoardState, candidates: ScreenPost[]) {
  return candidates.length === 0
    ? undefined
    : candidates[state.cursor % candidates.length]
}

/**
 * The posts whose image the screen wants fetched now, in order: the first
 * load as a whole, otherwise the next {@link PRELOAD_AHEAD} arrivals, and
 * with nothing queued a refill for every empty slot and the next swap.
 */
function wanted(state: BoardState): ScreenPost[] {
  if (state.queue.length > 0) {
    const initial = state.queue.filter((q) => q.initial)
    return (
      initial.length > 0 ? initial : state.queue.slice(0, PRELOAD_AHEAD)
    ).map((q) => q.post)
  }
  const candidates = rest(state)
  // Enough to fill every empty slot at once (after a retry, the whole board).
  const free = state.slots.filter((c) => c === null).length
  const out = candidates.slice(0, Math.max(1, free))
  const swap = swapCandidate(state, candidates)
  if (swap && !out.includes(swap)) out.push(swap)
  return out
}

/** The wanted posts whose image has neither loaded nor failed: render these hidden. */
export function pendingImages(state: BoardState): ScreenPost[] {
  return wanted(state).filter((post) => !state.images[screenPostKey(post)])
}

const loaded = (state: BoardState, post: ScreenPost) =>
  state.images[screenPostKey(post)] === 'loaded'

const card = (
  post: ScreenPost,
  now: number,
  z: number,
  newUntil: number | null,
): ScreenCard => ({
  key: screenPostKey(post),
  post,
  z,
  newUntil,
  shownAt: now,
  leavingAt: null,
})

/** The slot an arrival drops onto: a free one, else the oldest approval's; -1 when every card is leaving. */
function arrivalSlot(slots: (ScreenCard | null)[]): number {
  const free = slots.indexOf(null)
  if (free !== -1) return free
  let oldest = -1
  for (let i = 0; i < slots.length; i++) {
    const c = slots[i]
    if (!c || c.leavingAt !== null) continue
    if (
      oldest === -1 ||
      c.post.approvedAt < slots[oldest]!.post.approvedAt ||
      (c.post.approvedAt === slots[oldest]!.post.approvedAt &&
        c.post._id < slots[oldest]!.post._id)
    ) {
      oldest = i
    }
  }
  return oldest
}

/** The card an idle swap replaces: the longest shown that is not new. */
function swapSlot(slots: (ScreenCard | null)[], now: number): number {
  let longest = -1
  for (let i = 0; i < slots.length; i++) {
    const c = slots[i]
    if (!c || c.leavingAt !== null || (c.newUntil !== null && now < c.newUntil))
      continue
    if (longest === -1 || c.shownAt < slots[longest]!.shownAt) longest = i
  }
  return longest
}

/** Everything the clock does at `now`. The same state back when nothing is due. */
function advance(state: BoardState, now: number): BoardState {
  if (!state.started) return state
  let next = state

  // A removed card is gone from its slot once its fade is over.
  const left = (c: ScreenCard | null) =>
    c !== null && c.leavingAt !== null && now - c.leavingAt >= LEAVE_MS
  if (next.slots.some(left)) {
    next = { ...next, slots: next.slots.map((c) => (left(c) ? null : c)) }
  }

  // The "new" mark comes off.
  const marked = (c: ScreenCard | null) =>
    c !== null && c.newUntil !== null && now >= c.newUntil
  if (next.slots.some(marked)) {
    next = {
      ...next,
      slots: next.slots.map((c) => (marked(c) ? { ...c!, newUntil: null } : c)),
    }
  }

  // The first load: every loaded post of it takes a slot, no gap, no mark.
  if (next.queue.some((q) => q.initial)) {
    const slots = [...next.slots]
    const queue: Queued[] = []
    let placed = false
    for (const q of next.queue) {
      const free = slots.indexOf(null)
      if (q.initial && loaded(next, q.post) && free !== -1) {
        slots[free] = card(q.post, now, 0, null)
        placed = true
      } else if (q.initial && next.images[screenPostKey(q.post)] === 'failed') {
        placed = true
      } else {
        queue.push(q)
      }
    }
    if (placed) next = { ...next, slots, queue }
  }

  // An arrival: the head of the queue, once loaded, one every ARRIVAL_GAP_MS.
  while (next.queue.length > 0 && !next.queue[0].initial) {
    const head = next.queue[0].post
    const image = next.images[screenPostKey(head)]
    if (image === 'failed') {
      // Skipped (§9.2).
      next = { ...next, queue: next.queue.slice(1) }
      continue
    }
    if (image !== 'loaded' || now - next.lastArrivalAt < ARRIVAL_GAP_MS) break
    const slot = arrivalSlot(next.slots)
    // Every card is leaving (a reconnect replaced them all): wait for a slot.
    if (slot === -1) break
    const slots = [...next.slots]
    slots[slot] = card(head, now, next.nextZ, now + NEW_MARK_MS)
    next = {
      ...next,
      slots,
      queue: next.queue.slice(1),
      nextZ: next.nextZ + 1,
      lastArrivalAt: now,
    }
    break
  }

  // Empty slots refill from the rest of the list, newest first.
  if (next.slots.includes(null)) {
    const candidates = rest(next).filter((post) => loaded(next, post))
    if (candidates.length > 0) {
      const slots = [...next.slots]
      for (const post of candidates) {
        const free = slots.indexOf(null)
        if (free === -1) break
        slots[free] = card(post, now, 0, null)
      }
      next = { ...next, slots }
    }
  }

  // Idle: one card swaps to a post from the rest of the list.
  if (
    next.queue.length === 0 &&
    now - Math.max(next.lastSwapAt, next.lastArrivalAt) >= SWAP_EVERY_MS
  ) {
    const candidate = swapCandidate(next, rest(next))
    const slot = swapSlot(next.slots, now)
    if (candidate && loaded(next, candidate) && slot !== -1) {
      const slots = [...next.slots]
      slots[slot] = card(candidate, now, 0, null)
      next = { ...next, slots, cursor: next.cursor + 1, lastSwapAt: now }
    }
  }

  return next
}

/** The wait before a failed image is tried again, by how often it failed in a row. */
export function imageRetryDelay(count: number): number {
  return Math.min(IMAGE_RETRY_MS * 2 ** (count - 1), IMAGE_RETRY_MAX_MS)
}

/**
 * A successful poll means the network is back: forget the failures whose
 * wait is over, so those images are asked for again. The failure count
 * stays until one loads.
 */
export function retryFailedImages<S extends ImageMemory>(
  state: S,
  now: number,
): S {
  const due = Object.entries(state.imageFailures)
    .filter(
      ([key, { at, count }]) =>
        state.images[key] === 'failed' && now - at >= imageRetryDelay(count),
    )
    .map(([key]) => key)
  if (due.length === 0) return state
  const images = { ...state.images }
  for (const key of due) delete images[key]
  return { ...state, images }
}

/** Only what is said of the posts still on the list. */
export function onList<T>(
  record: Readonly<Record<string, T>>,
  keys: Set<string>,
) {
  return Object.keys(record).some((key) => !keys.has(key))
    ? Object.fromEntries(
        Object.entries(record).filter(([key]) => keys.has(key)),
      )
    : record
}

function onPoll(
  previous: BoardState,
  view: ScreenView,
  now: number,
): BoardState {
  const state = retryFailedImages(previous, now)
  // The same answer again (React Query hands back the same array for an
  // identical answer): only the clock moves. Most polls of a quiet wall.
  if (
    state.started &&
    view.posts === state.list &&
    view.closed === state.closed &&
    view.sponsorStrip === state.sponsorStrip &&
    state.failures === 0
  ) {
    return advance(state, now)
  }
  const listKeys = new Set(view.posts.map(screenPostKey))
  let next: BoardState = {
    ...state,
    started: true,
    closed: view.closed,
    sponsorStrip: view.sponsorStrip,
    list: view.posts,
    failures: 0,
    // Forget what the browser said of images no longer on the list.
    images: onList(state.images, listKeys),
    imageFailures: onList(state.imageFailures, listKeys),
  }

  if (!state.started) {
    // The first load: the newest 17, nothing marked new; the rest is the archive.
    next = {
      ...next,
      seen: listKeys,
      queue: view.posts
        .slice(0, SCREEN_SLOTS)
        .map((post) => ({ post, initial: true })),
      // The first load is no burst: an approval right after it needn't wait.
      lastArrivalAt: now - ARRIVAL_GAP_MS,
      lastSwapAt: now,
    }
    return advance(next, now)
  }

  // Removals leave at once (§9.2), from the board and from the queue.
  if (
    next.slots.some((c) => c && c.leavingAt === null && !listKeys.has(c.key))
  ) {
    next = {
      ...next,
      slots: next.slots.map((c) =>
        c && c.leavingAt === null && !listKeys.has(c.key)
          ? { ...c, leavingAt: now }
          : c,
      ),
    }
  }
  if (next.queue.some((q) => !listKeys.has(screenPostKey(q.post)))) {
    next = {
      ...next,
      queue: next.queue.filter((q) => listKeys.has(screenPostKey(q.post))),
    }
  }

  // New (id, approvedAt) pairs join the queue in approval order.
  const fresh = view.posts.filter(
    (post) => !state.seen.has(screenPostKey(post)),
  )
  if (fresh.length > 0) {
    fresh.sort(
      (a, b) =>
        a.approvedAt.localeCompare(b.approvedAt) || a._id.localeCompare(b._id),
    )
    const seen = new Set(state.seen)
    for (const post of fresh) seen.add(screenPostKey(post))
    next = {
      ...next,
      seen,
      queue: [
        ...next.queue,
        ...fresh.map((post) => ({ post, initial: false })),
      ],
    }
  }

  return advance(next, now)
}

/**
 * What the browser said of an image, for a post still on the list; the
 * same state back when it changes nothing. A load forgets the failures, a
 * failure counts one more.
 */
export function recordImage<S extends ImageMemory>(
  state: S,
  action: { type: 'imageLoaded' | 'imageFailed'; key: string; now: number },
): S {
  const known = state.list.some((p) => screenPostKey(p) === action.key)
  if (!known) return state
  const result = action.type === 'imageLoaded' ? 'loaded' : 'failed'
  if (state.images[action.key] === result) return state
  const imageFailures = { ...state.imageFailures }
  if (result === 'loaded') {
    delete imageFailures[action.key]
  } else {
    const count = (imageFailures[action.key]?.count ?? 0) + 1
    imageFailures[action.key] = { at: action.now, count }
  }
  return {
    ...state,
    images: { ...state.images, [action.key]: result },
    imageFailures,
  }
}

export function boardReducer(
  state: BoardState,
  action: BoardAction,
): BoardState {
  switch (action.type) {
    case 'poll':
      return onPoll(state, action.view, action.now)
    case 'pollFailed':
      return advance({ ...state, failures: state.failures + 1 }, action.now)
    case 'imageLoaded':
    case 'imageFailed': {
      const next = recordImage(state, action)
      return next === state ? state : advance(next, action.now)
    }
    case 'tick':
      return advance(state, action.now)
  }
}
