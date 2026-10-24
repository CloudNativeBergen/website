/**
 * How `/admin/photo-wall` polls the moderation queue (Photo Wall spec §8):
 * every 10 s while the page is visible, and for as long as it is open.
 *
 * NOT `useIdlePolling()`: that hook stops after five minutes without a
 * pointer, key or scroll event, and an organizer's phone in a pocket makes
 * none; the pending count must still be right when it comes out. What keeps
 * this affordable: the procedure resolves the conference from the CACHED
 * tenant read (no live conference read per poll) and the queue itself is a
 * cached read under its tag, so a poll on a warm cache asks Sanity for
 * neither.
 */

export const MODERATION_POLL_MS = 10_000

/** React Query options for `api.photoWall.moderationQueue.useQuery`. */
export const moderationQueuePolling = {
  // A plain number: React Query skips each tick while the page is hidden
  // (`refetchIntervalInBackground` is off by default) and the timer keeps
  // running. A function answering `false` while hidden would CLEAR the timer
  // when a read resolves in the background, and nothing would restart it.
  refetchInterval: MODERATION_POLL_MS,
  // The app turns the focus refetch off; back after more than the 60 s stale
  // time, read at once instead of at the next tick.
  refetchOnWindowFocus: true,
} as const
