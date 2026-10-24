/**
 * How `/admin/photo-wall` polls the moderation queue (Photo Wall spec §8):
 * every 10 s while the page is visible, and for as long as it is open.
 *
 * NOT `useIdlePolling()`: that hook stops after five minutes without a
 * pointer, key or scroll event, and an organizer's phone in a pocket makes
 * none; the pending count must still be right when it comes out. The cached
 * read behind the procedure is what keeps this affordable: a poll that finds
 * the tag unexpired costs no Sanity read.
 */

export const MODERATION_POLL_MS = 10_000

const pageVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible'

/** React Query options for `api.photoWall.moderationQueue.useQuery`. */
export const moderationQueuePolling = {
  // The function form: React Query already skips a tick while the tab is
  // hidden, and this says so where the reader looks for it. Back from
  // hidden, the focus refetch reads at once and the interval starts again.
  refetchInterval: () => (pageVisible() ? MODERATION_POLL_MS : false),
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const
