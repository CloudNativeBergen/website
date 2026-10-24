/**
 * THE MODERATION QUEUE as the admin page reads it (Photo Wall spec §8, §10).
 * Pure: the shapes the queue procedure answers with, and the arithmetic the
 * cards and tabs need. Safe to import on the client.
 */

/** A Wall Post's status (§4.2). `deleting` marks a Delete in progress (§12). */
export const WALL_POST_STATUSES = [
  'pending',
  'approved',
  'notShown',
  'deleting',
] as const
export type WallPostStatus = (typeof WALL_POST_STATUSES)[number]

/**
 * The square crop's position on the whole photo, CSS `object-position`
 * semantics: each 0–1, where 0 is the left/top edge and 1 the right/bottom.
 */
export interface WallPostCrop {
  x: number
  y: number
}

/** The whole photo as the admin card shows it (§5.1): about 1200 px, `fit=max`. */
export interface ModerationPhoto {
  url: string
  width: number
  height: number
}

/** One Wall Post on the admin page (§10). */
export interface ModerationPost {
  _id: string
  status: WallPostStatus
  /** Null for a `deleting` post, whose card shows no image (§8, §12). */
  photo: ModerationPhoto | null
  crop: WallPostCrop
  caption: string | null
  name: string | null
  marketingConsent: boolean
  submittedAt: string | null
  approvedAt: string | null
  decidedAt: string | null
}

export interface ModerationQueue {
  posts: ModerationPost[]
  pendingCount: number
}

/** The admin page's tabs (§10). */
export const MODERATION_TABS = ['pending', 'onTheWall', 'notShown'] as const
export type ModerationTab = (typeof MODERATION_TABS)[number]

export const MODERATION_TAB_LABELS: Record<ModerationTab, string> = {
  pending: 'Pending',
  onTheWall: 'On the wall',
  notShown: 'Not shown',
}

/** Which tab a post sits on: a `deleting` post in Not shown (§4.2). */
export function tabOf(status: WallPostStatus): ModerationTab {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'approved':
      return 'onTheWall'
    case 'notShown':
    case 'deleting':
      return 'notShown'
  }
}

const time = (value: string | null) => (value ? Date.parse(value) : 0)

/**
 * The posts of one tab, in the order an organizer reads them. Pending is
 * OLDEST first: a queue, so the card under the thumb stays put while new
 * posts join at the end (the live count says they did). On the wall is the
 * newest approval first, the wall's own order. Not shown is the latest
 * decision first; a `deleting` post has no decision and sorts by its
 * submission.
 */
export function postsInTab(
  posts: readonly ModerationPost[],
  tab: ModerationTab,
): ModerationPost[] {
  const own = posts.filter((p) => tabOf(p.status) === tab)
  switch (tab) {
    case 'pending':
      return own.sort((a, b) => time(a.submittedAt) - time(b.submittedAt))
    case 'onTheWall':
      return own.sort((a, b) => time(b.approvedAt) - time(a.approvedAt))
    case 'notShown':
      return own.sort(
        (a, b) =>
          time(b.decidedAt ?? b.submittedAt) -
          time(a.decidedAt ?? a.submittedAt),
      )
  }
}

/** The outline's box as fractions (0–1) of the whole photo. */
export interface CropOutline {
  left: number
  top: number
  width: number
  height: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/**
 * Where the square crop sits on the whole photo (§4.2): its side is the
 * photo's short edge, and `crop` places it along the long edge as CSS
 * `object-position` would. A missing crop is centred.
 */
export function cropOutline(
  photo: { width: number; height: number },
  crop: WallPostCrop | null | undefined,
): CropOutline {
  const { width, height } = photo
  const side = Math.min(width, height)
  const x = clamp01(crop?.x ?? 0.5)
  const y = clamp01(crop?.y ?? 0.5)
  return {
    left: (x * (width - side)) / width,
    top: (y * (height - side)) / height,
    width: side / width,
    height: side / height,
  }
}
