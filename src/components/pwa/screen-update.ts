/**
 * How the Photo Wall's Screen Mode takes a new deploy by itself (Photo Wall
 * spec §9.2): nobody is there to press Reload, or "Try again" on the
 * offline page a failed reload lands on. So it reloads only once its own
 * URL has just answered, and a worker that stays waiting through a reload
 * (wedged) is tried again with a growing wait instead of every few seconds.
 * The attempts are kept in `sessionStorage`, which a reload keeps.
 */
import { isScreenModePath } from '@/lib/photo-wall/screen'

/** The first wait after an attempt; it doubles with each one in a row. */
export const SCREEN_UPDATE_RETRY_MS = 30_000
export const SCREEN_UPDATE_MAX_WAIT_MS = 15 * 60_000

const ATTEMPT_KEY = 'photo-wall-screen-update'

interface Attempt {
  at: number
  count: number
}

function readAttempt(): Attempt | null {
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(ATTEMPT_KEY) ?? 'null',
    )
    if (
      value &&
      typeof value === 'object' &&
      'at' in value &&
      'count' in value &&
      typeof value.at === 'number' &&
      typeof value.count === 'number'
    ) {
      return { at: value.at, count: value.count }
    }
  } catch {
    // Storage blocked or garbled: no record, no wait.
  }
  return null
}

/** How long to wait before the next attempt at `now`; 0 when none is recorded. */
export function waitBeforeScreenUpdate(now: number): number {
  const attempt = readAttempt()
  if (!attempt) return 0
  const wait = Math.min(
    SCREEN_UPDATE_RETRY_MS * 2 ** (attempt.count - 1),
    SCREEN_UPDATE_MAX_WAIT_MS,
  )
  return Math.max(0, attempt.at + wait - now)
}

export function recordScreenUpdateAttempt(now: number): void {
  const count = (readAttempt()?.count ?? 0) + 1
  try {
    window.sessionStorage.setItem(
      ATTEMPT_KEY,
      JSON.stringify({ at: now, count }),
    )
  } catch {
    // Without storage a wedged worker can loop; nothing better to do.
  }
}

/** The screen opened with no update waiting: the last one took. */
export function clearScreenUpdateAttempts(): void {
  try {
    window.sessionStorage.removeItem(ATTEMPT_KEY)
  } catch {
    // Nothing recorded, then.
  }
}

/** A probe unanswered this long counts as unreachable (a stalled connection). */
export const SCREEN_PROBE_TIMEOUT_MS = 10_000

/** Does the screen's own URL answer now? A reload that cannot would strand it. */
export async function screenIsReachable(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCREEN_PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(window.location.href, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether Screen Mode is showing, as the screen page reports it (it mounts
 * and unmounts with client-side navigation, which the root layout's
 * registrar cannot see), or null until it has said: then the path decides.
 */
let screenModeShown: boolean | null = null
const screenModeListeners = new Set<() => void>()

/** Called by Screen Mode on mount (true) and unmount (false). */
export function markScreenMode(shown: boolean | null): void {
  if (screenModeShown === shown) return
  screenModeShown = shown
  for (const listener of screenModeListeners) listener()
}

export function onScreenModeChange(listener: () => void): () => void {
  screenModeListeners.add(listener)
  return () => {
    screenModeListeners.delete(listener)
  }
}

/** Is this Screen Mode now? Asked at the moment of acting, never cached. */
export function inScreenMode(): boolean {
  return screenModeShown ?? isScreenModePath(window.location.pathname)
}
