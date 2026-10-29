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

/** What an organizer can decide about a post (§10); Delete is apart. */
export type ModerationAction = 'approve' | 'reject' | 'remove'

/**
 * THE ALLOWED TRANSITIONS (§10): the statuses each decision may start from.
 * The server refuses anything else before any write; the cards offer only
 * these, and Delete, which every status allows.
 */
export const ALLOWED_FROM = {
  approve: ['pending', 'notShown'],
  reject: ['pending'],
  remove: ['approved'],
} as const satisfies Record<ModerationAction, readonly WallPostStatus[]>

/**
 * At most this many posts in one Approve all: the wall's pending cap (§6.3),
 * which the queue shows in full.
 */
export const APPROVE_ALL_MAX = 200

/** Whether `action` may start from `status`. */
export function allowsFrom<A extends ModerationAction>(
  action: A,
  status: WallPostStatus,
): status is (typeof ALLOWED_FROM)[A][number] {
  return (ALLOWED_FROM[action] as readonly WallPostStatus[]).includes(status)
}

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

/**
 * Which post a card shows, beyond its id: a submit that reuses the
 * `uploadId` after a Delete creates a new post under the same id (§6.2).
 * Every card action sends it, and the server refuses (before any write) a
 * post that is not this one.
 */
export interface ShownIncarnation {
  /** The post's `_createdAt`. */
  createdAt: string | null
  /** Its photo's asset id (null for a post without one, or `deleting`). */
  assetId: string | null
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
  incarnation: ShownIncarnation
  /**
   * A trusted poster's post (§6.6): the speaker's name, or the role when
   * the speaker is gone. Absent on every other post.
   */
  autoApprovedBy?: string | null
  /** The tagged talk (Talk photos spec §6.3); null when untagged or gone. */
  talk?: WallPostTalk | null
}

/** A talk as the admin card and its picker show it. */
export interface WallPostTalk {
  _id: string
  title: string
  speakers: string[]
}

/** What `photoWall.moderationQueue` answers: every post of the conference. */
export interface ModerationQueueData {
  posts: ModerationPost[]
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

/** How many posts each tab holds; the Pending one is the live pending count. */
export function countByTab(
  posts: readonly ModerationPost[],
): Record<ModerationTab, number> {
  const counts: Record<ModerationTab, number> = {
    pending: 0,
    onTheWall: 0,
    notShown: 0,
  }
  for (const post of posts) counts[tabOf(post.status)] += 1
  return counts
}

/**
 * The live pending count (§10): the Pending tab's, for the page's summary
 * and the admin nav's Photo Wall badge (P6) alike.
 */
export function pendingOf(queue: ModerationQueueData): number {
  return countByTab(queue.posts).pending
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
 * `object-position` would. The queue read has already centred a missing crop.
 */
export function cropOutline(
  photo: { width: number; height: number },
  crop: WallPostCrop,
): CropOutline {
  const { width, height } = photo
  const side = Math.min(width, height)
  const x = clamp01(crop.x)
  const y = clamp01(crop.y)
  return {
    left: (x * (width - side)) / width,
    top: (y * (height - side)) / height,
    width: side / width,
    height: side / height,
  }
}
