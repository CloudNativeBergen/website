/**
 * How `/wall` polls the wall (Photo Wall spec §8): every 10 s while the page
 * is visible, and for as long as it is open.
 *
 * NOT `useIdlePolling()`: that hook stops after five minutes without a
 * pointer, key or scroll event, and a phone left open on the wall makes
 * none. What keeps this affordable: `wall.get` reads the CACHED tenant and
 * the cached wall, so a poll on a warm cache asks Sanity for nothing.
 */

export const WALL_POLL_MS = 10_000

/** React Query options for `api.wall.get.useQuery`. */
export const wallPolling = {
  // A plain number: React Query skips each tick while the page is hidden
  // (`refetchIntervalInBackground` is off by default) and the timer keeps
  // running. A function answering `false` while hidden would CLEAR the timer
  // when a read resolves in the background, and nothing would restart it.
  refetchInterval: WALL_POLL_MS,
  // The app turns the focus refetch off; back after more than the 60 s stale
  // time, read at once instead of at the next tick.
  refetchOnWindowFocus: true,
} as const
