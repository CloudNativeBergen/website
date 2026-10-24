/**
 * MOSAIC and SPOTLIGHT on Screen Mode as a state machine (Photo Wall spec
 * §9, §9.3, #1478): the whole photo, newest approval first, with one post
 * featured — Mosaic's spotlight tile, Spotlight's big post. Pure, like the
 * Pinboard's `board`, and driven the same way by `ScreenBoard`.
 *
 * What is on screen is derived, not stored: the newest posts on the list
 * that are not waiting their turn and whose photo has loaded. The state
 * holds only what time decides: the arrivals' queue, the featured post and
 * since when, and the "new" marks.
 *
 * - **Mosaic** shows {@link MOSAIC_TILES} tiles; the spotlight walks the
 *   {@link MOSAIC_ROTATION} newest every {@link SWAP_EVERY_MS}, and a new
 *   post takes it at once, marked new for {@link NEW_MARK_MS}.
 * - **Spotlight** walks the {@link SPOTLIGHT_ROTATION} newest, one big post
 *   every {@link SWAP_EVERY_MS}, with the next {@link UP_NEXT} on a rail. A
 *   new post goes next in line, marked new while it waits and for its turn.
 *
 * Both let a burst in one post every {@link ARRIVAL_GAP_MS}, drop a removed
 * post at once (a featured one hands over to the next), and keep the last
 * list through failed polls (§9.3).
 */
import {
  screenPostKey,
  type ScreenPost,
  type ScreenView,
} from '@/lib/photo-wall/screen'
import {
  ARRIVAL_GAP_MS,
  NEW_MARK_MS,
  OFFLINE_AFTER_FAILURES,
  PRELOAD_AHEAD,
  SWAP_EVERY_MS,
  onList,
  recordImage,
  retryFailedImages,
  type BoardAction,
  type ImageMemory,
} from './board'

export type StreamLook = 'mosaic' | 'spotlight'

/** Tiles on Mosaic's screen: more than a 1080 px canvas shows, so it is always full. */
export const MOSAIC_TILES = 40
/** Mosaic's spotlight walks this many of the newest posts. */
export const MOSAIC_ROTATION = 6
/** Spotlight's big post walks this many of the newest posts. */
export const SPOTLIGHT_ROTATION = 12
/** Posts on Spotlight's "Up next" rail. */
export const UP_NEXT = 4

export interface StreamState extends ImageMemory {
  look: StreamLook
  /** False until the first successful poll. */
  started: boolean
  closed: boolean
  sponsorStrip: boolean
  /** Every `(id, approvedAt)` this screen has met: not new a second time. */
  seen: ReadonlySet<string>
  /** Arrivals waiting their turn, in approval order. */
  queue: ScreenPost[]
  /** The featured post's key and when it was featured; null with nothing shown. */
  feature: { key: string; at: number } | null
  /** Spotlight: arrivals let in and waiting for their turn as the big post, in order. */
  waiting: string[]
  /** Wears the "new" mark until then, by key. */
  marks: Readonly<Record<string, number>>
  lastArrivalAt: number
  /** Consecutive failed polls. */
  failures: number
}

export function initialStream(look: StreamLook): StreamState {
  return {
    look,
    started: false,
    closed: false,
    sponsorStrip: false,
    list: [],
    images: {},
    imageFailures: {},
    seen: new Set(),
    queue: [],
    feature: null,
    waiting: [],
    marks: {},
    lastArrivalAt: 0,
    failures: 0,
  }
}

/** Three failed polls in a row: the corner dot shows until the next success (§9.3). */
export function isStreamOffline(state: StreamState): boolean {
  return state.failures >= OFFLINE_AFTER_FAILURES
}

const isQueued = (state: StreamState, key: string) =>
  state.queue.some((post) => screenPostKey(post) === key)

/**
 * The posts the screen means to show, newest first: let in, photo not
 * failed. Spotlight keeps every post still waiting for its turn, however
 * many arrived.
 */
function candidates(state: StreamState): ScreenPost[] {
  const limit =
    state.look === 'mosaic'
      ? MOSAIC_TILES
      : SPOTLIGHT_ROTATION + state.waiting.length
  return state.list
    .filter((post) => {
      const key = screenPostKey(post)
      return state.images[key] !== 'failed' && !isQueued(state, key)
    })
    .slice(0, limit)
}

const loaded = (state: StreamState, post: ScreenPost) =>
  state.images[screenPostKey(post)] === 'loaded'

/** What is on screen, newest approval first: the candidates whose photo has loaded. */
export function shownPosts(state: StreamState): ScreenPost[] {
  return candidates(state).filter((post) => loaded(state, post))
}

/** The posts whose photo the screen wants fetched and has no word of yet. */
export function pendingStreamImages(state: StreamState): ScreenPost[] {
  return [...candidates(state), ...state.queue.slice(0, PRELOAD_AHEAD)].filter(
    (post) => !state.images[screenPostKey(post)],
  )
}

/** Nothing to show once the first load is over, and nothing on its way. */
export function streamInvitation(state: StreamState): boolean {
  return (
    state.started &&
    !state.closed &&
    candidates(state).length === 0 &&
    state.queue.length === 0
  )
}

/** The featured post: Mosaic's spotlight tile, Spotlight's big post. */
export function featured(state: StreamState): ScreenPost | null {
  const key = state.feature?.key
  return shownPosts(state).find((post) => screenPostKey(post) === key) ?? null
}

/** Whether the post wears the "new" mark: Spotlight's also while it waits its turn. */
export function isMarkedNew(state: StreamState, post: ScreenPost): boolean {
  const key = screenPostKey(post)
  return key in state.marks || state.waiting.includes(key)
}

/** The rotation the featured post walks: the newest few that are shown. */
function rotation(state: StreamState, shown: ScreenPost[]): ScreenPost[] {
  return shown.slice(
    0,
    state.look === 'mosaic' ? MOSAIC_ROTATION : SPOTLIGHT_ROTATION,
  )
}

/** The post after `key` in the rotation; its first when `key` is not in it. */
function nextInRotation(
  state: StreamState,
  shown: ScreenPost[],
  key: string | undefined,
): ScreenPost | undefined {
  const walk = rotation(state, shown)
  const at = walk.findIndex((post) => screenPostKey(post) === key)
  return walk[(at + 1) % walk.length]
}

/** Spotlight's "Up next": the posts waiting their turn, then the rotation after the big post. */
export function upNext(state: StreamState): ScreenPost[] {
  const shown = shownPosts(state)
  const byKey = new Map(shown.map((post) => [screenPostKey(post), post]))
  const current = state.feature?.key
  const walk = rotation(state, shown)
  const at = walk.findIndex((post) => screenPostKey(post) === current)
  const after = [...walk.slice(at + 1), ...walk.slice(0, Math.max(at, 0))]
  const out: ScreenPost[] = []
  for (const key of state.waiting) {
    const post = byKey.get(key)
    if (post) out.push(post)
  }
  for (const post of after) {
    const key = screenPostKey(post)
    if (key !== current && !state.waiting.includes(key)) out.push(post)
  }
  return out.slice(0, UP_NEXT)
}

/** Everything the clock does at `now`. The same state back when nothing is due. */
function advance(state: StreamState, now: number): StreamState {
  if (!state.started) return state
  let next = state

  // The "new" mark comes off.
  if (Object.values(next.marks).some((until) => now >= until)) {
    next = {
      ...next,
      marks: Object.fromEntries(
        Object.entries(next.marks).filter(([, until]) => now < until),
      ),
    }
  }

  // An arrival: the head of the queue, once loaded, one every ARRIVAL_GAP_MS.
  while (next.queue.length > 0) {
    const head = next.queue[0]
    const key = screenPostKey(head)
    const image = next.images[key]
    if (image === 'failed') {
      next = { ...next, queue: next.queue.slice(1) }
      continue
    }
    if (image !== 'loaded' || now - next.lastArrivalAt < ARRIVAL_GAP_MS) break
    next = { ...next, queue: next.queue.slice(1), lastArrivalAt: now }
    next =
      next.look === 'mosaic'
        ? // Mosaic: the spotlight at once.
          {
            ...next,
            feature: { key, at: now },
            marks: { ...next.marks, [key]: now + NEW_MARK_MS },
          }
        : // Spotlight: next in line.
          { ...next, waiting: [...next.waiting, key] }
    break
  }

  // The featured post: kept for SWAP_EVERY_MS, then the next; a removed or
  // failed one hands over at once.
  const shown = shownPosts(next)
  const shownKeys = new Set(shown.map(screenPostKey))
  if (next.waiting.some((key) => !shownKeys.has(key))) {
    next = {
      ...next,
      waiting: next.waiting.filter((key) => shownKeys.has(key)),
    }
  }
  const current = next.feature
  if (shown.length === 0) {
    if (current) next = { ...next, feature: null }
  } else if (
    !current ||
    !shownKeys.has(current.key) ||
    now - current.at >= SWAP_EVERY_MS
  ) {
    const [first, ...rest] = next.waiting
    if (first) {
      // Spotlight: a waiting arrival's turn, and its mark for that turn.
      next = {
        ...next,
        waiting: rest,
        feature: { key: first, at: now },
        marks: { ...next.marks, [first]: now + NEW_MARK_MS },
      }
    } else {
      const post = nextInRotation(next, shown, current?.key)
      next = { ...next, feature: post && { key: screenPostKey(post), at: now } }
    }
  }

  return next
}

function onPoll(
  previous: StreamState,
  view: ScreenView,
  now: number,
): StreamState {
  const state = retryFailedImages(previous, now)
  // The same answer again: only the clock moves.
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
  let next: StreamState = {
    ...state,
    started: true,
    closed: view.closed,
    sponsorStrip: view.sponsorStrip,
    list: view.posts,
    failures: 0,
    images: onList(state.images, listKeys),
    imageFailures: onList(state.imageFailures, listKeys),
    marks: onList(state.marks, listKeys),
    queue: state.queue.filter((post) => listKeys.has(screenPostKey(post))),
  }

  if (!state.started) {
    // The first load: nothing new; an approval right after it needn't wait.
    return advance(
      { ...next, seen: listKeys, lastArrivalAt: now - ARRIVAL_GAP_MS },
      now,
    )
  }

  // New (id, approvedAt) pairs join the queue in approval order.
  const fresh = view.posts.filter((post) => !state.seen.has(screenPostKey(post)))
  if (fresh.length > 0) {
    fresh.sort(
      (a, b) =>
        a.approvedAt.localeCompare(b.approvedAt) || a._id.localeCompare(b._id),
    )
    const seen = new Set(state.seen)
    for (const post of fresh) seen.add(screenPostKey(post))
    next = { ...next, seen, queue: [...next.queue, ...fresh] }
  }
  return advance(next, now)
}

export function streamReducer(
  state: StreamState,
  action: BoardAction,
): StreamState {
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
