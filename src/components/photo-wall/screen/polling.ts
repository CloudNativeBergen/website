/**
 * How `/wall/screen` polls the wall (Photo Wall spec §8, §9.3): every 5 s,
 * ALWAYS, for as long as the page is open — hidden, unfocused, hours
 * untouched. NOT `useIdlePolling()` (five idle minutes stop it; nobody
 * touches a venue screen) and not the Wall page's visible-only interval.
 * What keeps this affordable: `photoWallPublic.screen` reads the CACHED
 * tenant and the cached wall, so a poll on a warm cache asks Sanity for
 * nothing.
 */

export const SCREEN_POLL_MS = 5_000

/** React Query options for `api.photoWallPublic.screen.useQuery`. */
export const screenPolling = {
  refetchInterval: SCREEN_POLL_MS,
  // A hidden or unfocused screen still polls: the interval is not paused.
  refetchIntervalInBackground: true,
  // No extra read on focus: the interval is the only clock.
  refetchOnWindowFocus: false,
  // A failed poll is not retried: the next poll is 5 s away, and each failure
  // is to be counted (§9.3, the offline dot after three).
  retry: false,
} as const
