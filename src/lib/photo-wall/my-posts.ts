/**
 * MY POSTS as the phone that posted them reads them (Photo Wall spec §8,
 * §12). Pure: the shape `getMyPosts` caches and the composer polls, and the
 * words each status is shown with. Safe to import on the client.
 */
import type { WallPostStatus } from './moderation'

/** The My posts square, in px: about 600 wide on a phone (§5.1). */
export const MY_POSTS_PHOTO_PX = 600

/** One of this phone's posts as its My posts card shows it (§12). */
export interface MyPost {
  _id: string
  status: WallPostStatus
  /**
   * The square as a Sanity URL, cut by `rect=` from the crop (§5.1); null
   * for a `deleting` post, which shows no photo (§12).
   */
  src: string | null
  caption: string | null
  name: string | null
  marketingConsent: boolean
  submittedAt: string | null
}

/**
 * How the contributor's Delete ended (§12): the post and its asset are gone;
 * not finished, the post left `deleting` (press again); or no such post of
 * this device on this wall.
 */
export type MyPostDeletionStatus = 'deleted' | 'failed' | 'gone'

/**
 * How the Marketing switch ended (§12): written; conflicted twice, nothing
 * written (the card refreshes); or no such post of this device on this wall.
 */
export type MyPostMarketingStatus = 'done' | 'changed' | 'gone'

/** What the card says of each status (§12). */
export const MY_POST_STATUS_LABELS: Record<WallPostStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'On the wall',
  notShown: 'Not shown',
  deleting: 'Couldn’t delete. Try again.',
}
