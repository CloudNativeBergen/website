import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import {
  WALL_POST_STATUSES,
  type ShownIncarnation,
  type WallPostStatus,
} from './moderation'

/**
 * One Wall Post as a write decides from it (Photo Wall spec §10, §12): read
 * through the doc endpoint, the latest committed version, never a query that
 * can lag it, so its `_rev` is the one a guarded patch is checked against.
 */
export interface StoredWallPost {
  _id: string
  _rev: string
  /**
   * When this INCARNATION was created: a submit that reuses the `uploadId`
   * after a Delete creates a new document under the same id (§6.2).
   */
  createdAt: string | null
  status: WallPostStatus
  decidedAt: string | null
  deviceKey: string | null
  /** The asset `photo` references, while it does. */
  photoAssetId: string | null
  /** The asset a Delete still has to remove, while `deleting`. */
  deletingAssetId: string | null
}

/** `wallPost-<uploadId>` (§4.2): no comma, dot or path, so one document. */
const WALL_POST_ID = /^wallPost-[a-z0-9-]{1,64}$/

export function isWallPostId(id: unknown): id is string {
  return typeof id === 'string' && WALL_POST_ID.test(id)
}

interface Row {
  _id?: unknown
  _rev?: unknown
  _createdAt?: unknown
  _type?: unknown
  conference?: { _ref?: unknown }
  status?: unknown
  decidedAt?: unknown
  deviceKey?: unknown
  photo?: { asset?: { _ref?: unknown } }
  deletingAssetId?: unknown
}

const text = (value: unknown) =>
  typeof value === 'string' && value ? value : null

/**
 * The post on this conference's wall, or null: no such post, another
 * conference's, or not a Wall Post at all. The same null for each, so a
 * caller can't tell a foreign post from a missing one.
 */
export async function readWallPost(
  conferenceId: string,
  postId: string,
): Promise<StoredWallPost | null> {
  if (!isWallPostId(postId)) return null
  const doc = await clientReadUncached.getDocument<Row>(postId)
  if (
    !doc ||
    // `getDocument('a,b')` reads a list: checked on what came back.
    doc._id !== postId ||
    doc._type !== 'wallPost' ||
    doc.conference?._ref !== conferenceId ||
    typeof doc._rev !== 'string' ||
    !WALL_POST_STATUSES.includes(doc.status as WallPostStatus)
  ) {
    return null
  }
  return {
    _id: postId,
    _rev: doc._rev,
    createdAt: text(doc._createdAt),
    status: doc.status as WallPostStatus,
    decidedAt: text(doc.decidedAt),
    deviceKey: text(doc.deviceKey),
    photoAssetId: text(doc.photo?.asset?._ref),
    deletingAssetId: text(doc.deletingAssetId),
  }
}

/**
 * Whether two reads of one id are the same post, not a replacement a submit
 * created after a Delete: the same creation and the same photo (its asset,
 * or the one a Delete in progress still holds in `deletingAssetId`). Every
 * retry of a guarded write checks it against what the write was decided on.
 */
export function sameIncarnation(a: StoredWallPost, b: StoredWallPost): boolean {
  return (
    a.createdAt === b.createdAt &&
    (a.photoAssetId ?? a.deletingAssetId) ===
      (b.photoAssetId ?? b.deletingAssetId)
  )
}

/**
 * Whether the stored post is the one a card showed: the same creation, and,
 * when the card had a photo, the same one. Checked on the FIRST read, before
 * any write, so a stale card never acts on a replacement it never showed.
 */
export function isShown(post: StoredWallPost, shown: ShownIncarnation) {
  return (
    post.createdAt === shown.createdAt &&
    (shown.assetId === null ||
      (post.photoAssetId ?? post.deletingAssetId) === shown.assetId)
  )
}

/** What a step answers to be run once more ({@link atMostTwice}). */
export const AGAIN = Symbol('again')

/**
 * THE ONE RETRY SHAPE of the Photo Wall's writes (§10, §12: "re-read once
 * and retry", "retried once"): run `step` and, when it answers
 * {@link AGAIN}, run it once more; a second {@link AGAIN} ends in
 * `giveUp()`. `step` is told which attempt it is, so the second can re-read.
 */
export async function atMostTwice<T>(
  step: (attempt: 0 | 1) => Promise<T | typeof AGAIN>,
  giveUp: () => T | Promise<T>,
): Promise<T> {
  for (const attempt of [0, 1] as const) {
    const result = await step(attempt)
    if (result !== AGAIN) return result
  }
  return giveUp()
}
