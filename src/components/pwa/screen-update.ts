/**
 * How the Photo Wall's Screen Mode takes a new deploy by itself (Photo Wall
 * spec §9.2): nobody is there to press Reload, or "Try again" on the
 * offline page a failed reload lands on. So it reloads only once its own
 * URL has just answered, and a worker that stays waiting through a reload
 * (wedged) is tried again with a growing wait instead of every few seconds.
 * The attempts are kept in `sessionStorage`, which a reload keeps. Its
 * error boundary reloads the same way (`screenErrorReloads`).
 */
import { isScreenModePath } from '@/lib/photo-wall/screen'

interface Attempt {
  at: number
  count: number
}

/**
 * Attempts in a row kept under `key` in `sessionStorage` (a reload keeps
 * it): the wait before the next is `firstMs`, doubling, at most `maxMs`.
 * Storage blocked or garbled means no record and no wait.
 */
function sessionBackoff(key: string, firstMs: number, maxMs: number) {
  const read = (): Attempt | null => {
    try {
      const value: unknown = JSON.parse(
        window.sessionStorage.getItem(key) ?? 'null',
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
      // No record, then.
    }
    return null
  }
  return {
    /** How long to wait before the next attempt at `now`; 0 when none is recorded. */
    wait(now: number): number {
      const attempt = read()
      if (!attempt) return 0
      const wait = Math.min(firstMs * 2 ** (attempt.count - 1), maxMs)
      return Math.max(0, attempt.at + wait - now)
    },
    record(now: number): void {
      const count = (read()?.count ?? 0) + 1
      try {
        window.sessionStorage.setItem(key, JSON.stringify({ at: now, count }))
      } catch {
        // Without storage the attempts cannot back off; nothing better to do.
      }
    },
    clear(): void {
      try {
        window.sessionStorage.removeItem(key)
      } catch {
        // Nothing recorded, then.
      }
    },
  }
}

/** The first wait after an update attempt; it doubles with each one in a row. */
export const SCREEN_UPDATE_RETRY_MS = 30_000
export const SCREEN_UPDATE_MAX_WAIT_MS = 15 * 60_000

const updateAttempts = sessionBackoff(
  'photo-wall-screen-update',
  SCREEN_UPDATE_RETRY_MS,
  SCREEN_UPDATE_MAX_WAIT_MS,
)
export const waitBeforeScreenUpdate = updateAttempts.wait
export const recordScreenUpdateAttempt = updateAttempts.record
/** The screen opened with no update waiting: the last one took. */
export const clearScreenUpdateAttempts = updateAttempts.clear

/**
 * The first wait before Screen Mode reloads itself out of its error
 * boundary (a read failed while it rendered); doubling, at most 5 minutes.
 */
export const SCREEN_ERROR_RETRY_MS = 10_000
export const SCREEN_ERROR_MAX_WAIT_MS = 5 * 60_000

/** Reloads after a render error; cleared once Screen Mode renders. */
export const screenErrorReloads = sessionBackoff(
  'photo-wall-screen-error',
  SCREEN_ERROR_RETRY_MS,
  SCREEN_ERROR_MAX_WAIT_MS,
)

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

/**
 * Called by Screen Mode on mount (true) and unmount (false). A mount means
 * it rendered: the reloads out of its error boundary start afresh.
 */
export function markScreenMode(shown: boolean | null): void {
  if (shown) screenErrorReloads.clear()
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
