/**
 * How `/wall/screen` polls the wall (Photo Wall spec §8, §9.3): every 5 s,
 * ALWAYS, for as long as the page is open — hidden, unfocused, hours
 * untouched, offline. NOT `useIdlePolling()` (five idle minutes stop it;
 * nobody touches a venue screen) and not the Wall page's visible-only
 * interval. What keeps this affordable: `photoWallPublic.screen` reads the
 * CACHED tenant and the cached wall, so a poll on a warm cache asks Sanity
 * for nothing.
 */
import { useQuery } from '@tanstack/react-query'
import { getQueryKey } from '@trpc/react-query'
import type { ScreenView } from '@/lib/photo-wall/screen'
import { api } from '@/lib/trpc/client'

export const SCREEN_POLL_MS = 5_000
/**
 * A poll unanswered this long is aborted and counts as failed, before the
 * next one is due: a request the venue Wi-Fi swallows would otherwise hold
 * the query, every later tick would join it, and the screen would stop
 * polling with no offline dot.
 */
export const SCREEN_POLL_TIMEOUT_MS = 4_000

/** React Query options for the screen's poll. */
export const screenPolling = {
  refetchInterval: SCREEN_POLL_MS,
  // A hidden or unfocused screen still polls: the interval is not paused.
  refetchIntervalInBackground: true,
  // No extra read on focus: the interval is the only clock.
  refetchOnWindowFocus: false,
  // A failed poll is not retried: the next poll is 5 s away, and each failure
  // is to be counted (§9.3, the offline dot after three).
  retry: false,
  // Polls while the browser says it is offline: React Query's default pauses
  // the fetch then, which counts no failure and never shows the dot (§9.3).
  networkMode: 'always',
} as const

/**
 * Screen Mode's poll of `photoWallPublic.screen`, starting from the server's
 * answer. Through the tRPC client rather than the generated hook, so each
 * request carries a signal that gives it up after
 * {@link SCREEN_POLL_TIMEOUT_MS} (the hook passes React Query's signal or
 * none, never its own); unbatched, so an abort ends this request alone.
 */
export function useScreenPoll(initial: ScreenView) {
  const { client } = api.useUtils()
  return useQuery({
    queryKey: getQueryKey(api.photoWallPublic.screen, undefined, 'query'),
    queryFn: ({ signal }) => {
      const controller = new AbortController()
      const giveUp = () => controller.abort(signal.reason)
      signal.addEventListener('abort', giveUp)
      const timer = setTimeout(
        () => controller.abort(new Error('The poll timed out')),
        SCREEN_POLL_TIMEOUT_MS,
      )
      return client.photoWallPublic.screen
        .query(undefined, {
          signal: controller.signal,
          context: { skipBatch: true },
        })
        .finally(() => {
          clearTimeout(timer)
          signal.removeEventListener('abort', giveUp)
        })
    },
    ...screenPolling,
    initialData: initial,
  })
}
