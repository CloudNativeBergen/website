import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { isAssetHeld } from '@/lib/sanity/orphaned-asset'
import { deleteWithHistory } from '@/lib/sanity/purge'
import type { ShownIncarnation } from './moderation'
import { sanityStatus } from '@/lib/sanity/status'
import {
  AGAIN,
  atMostTwice,
  isShown,
  readWallPost,
  sameIncarnation,
  type StoredWallPost,
} from './wall-post'

/**
 * DELETE A WALL POST FOR GOOD (Photo Wall spec §12): the organizer's Delete
 * now (§10) and the contributor's Delete (M6) both call this. Three steps:
 *
 *  1. a revision-guarded patch to `deleting` that unsets `photo` and keeps
 *     the asset id in `deletingAssetId` (a plain string, so it does not hold
 *     the asset). On a conflict, re-read once and retry: Delete accepts every
 *     status. The post leaves the wall, and stops referencing its asset;
 *  2. delete the asset with its history, retried once. "Still referenced",
 *     by any document in any tenant, counts as done: identical bytes give one
 *     shared asset, so another post or a sponsor logo may hold it;
 *  3. delete the post with its history.
 *
 * A failed step 2 or 3 leaves the post `deleting`, and calling this again
 * resumes from `deletingAssetId`. It NEVER expires a cache tag: each caller
 * does, per §8, from what the answer says was written.
 */

export type WallPostDeletion =
  /** The post and (unless still referenced) its asset are gone. */
  | { status: 'deleted'; deviceKey: string | null }
  /**
   * Not finished: the post is `deleting` when `marked` (step 1 committed now
   * or before), else unchanged (step 1 conflicted twice). Try again.
   */
  | { status: 'failed'; deviceKey: string | null; marked: boolean }
  /** No such post on this conference's wall (or not this device's). */
  | { status: 'gone' }

/**
 * @param deviceKey - when given (the contributor's Delete), the post must be
 *   this device's; another device's post is `gone`, as a missing one is.
 */
export async function deleteWallPost({
  conferenceId,
  postId,
  deviceKey,
  shown,
  onRead,
}: {
  conferenceId: string
  postId: string
  deviceKey?: string
  /** The post the card showed: a replacement under the id is `gone`. */
  shown?: ShownIncarnation
  /** Told the device of every post read, before anything is written. */
  onRead?: (deviceKey: string | null) => void
}): Promise<WallPostDeletion> {
  const read = async () => {
    const post = await readWallPost(conferenceId, postId)
    if (!post || (deviceKey !== undefined && post.deviceKey !== deviceKey)) {
      return null
    }
    onRead?.(post.deviceKey)
    return post
  }

  const first = await read()
  if (!first || (shown !== undefined && !isShown(first, shown))) {
    return { status: 'gone' }
  }

  const marked = await markDeleting(first, read)
  if (marked === 'gone') return { status: 'gone' }
  if (marked === 'conflict') {
    return { status: 'failed', deviceKey: first.deviceKey, marked: false }
  }

  const failed = {
    status: 'failed',
    deviceKey: marked.deviceKey,
    marked: true,
  } as const
  if (
    (await deleteWallAsset(marked.assetId, { except: postId })) === 'failed'
  ) {
    return failed
  }
  // Step 3, guarded by the revision marked `deleting`: never a post a submit
  // created anew under the id after another Delete finished this one.
  try {
    await deleteWithHistory(postId, { ifRevisionId: marked.rev })
  } catch (error) {
    if (sanityStatus(error) === 404 || sanityStatus(error) === 409) {
      const now = await read()
      // Gone, or replaced: this post was deleted (by another Delete).
      if (!now || !sameIncarnation(now, first)) {
        return { status: 'deleted', deviceKey: marked.deviceKey }
      }
    }
    console.error(`Could not delete Wall Post ${postId}`, error)
    return failed
  }
  return { status: 'deleted', deviceKey: marked.deviceKey }
}

/**
 * Step 1: the post as `deleting`, and the asset step 2 has to remove. A post
 * already `deleting` is not patched again: its `deletingAssetId` is the asset.
 * On a conflict, re-read once and retry, whatever the status is now.
 */
function markDeleting(
  first: StoredWallPost,
  read: () => Promise<StoredWallPost | null>,
): Promise<Marked | 'gone' | 'conflict'> {
  return atMostTwice<Marked | 'gone' | 'conflict'>(
    async (attempt) => {
      const post = attempt === 0 ? first : await read()
      // Gone, or a replacement a submit created after a Delete: not this one.
      if (!post || !sameIncarnation(post, first)) return 'gone'
      if (post.status === 'deleting') {
        return {
          assetId: post.deletingAssetId,
          deviceKey: post.deviceKey,
          rev: post._rev,
        }
      }
      const assetId = post.photoAssetId
      try {
        const committed = await clientWrite
          .patch(post._id)
          .ifRevisionId(post._rev)
          .set(
            assetId
              ? { status: 'deleting', deletingAssetId: assetId }
              : { status: 'deleting' },
          )
          .unset(['photo'])
          .commit()
        return { assetId, deviceKey: post.deviceKey, rev: committed._rev }
      } catch (error) {
        if (sanityStatus(error) === 404) return 'gone'
        if (sanityStatus(error) === 409) return AGAIN
        throw error
      }
    },
    () => 'conflict',
  )
}

interface Marked {
  assetId: string | null
  deviceKey: string | null
  /** The revision marked `deleting`, which step 3 deletes and no other. */
  rev: string
}

/**
 * Step 2, and the retention cron's asset step (§11.1). True when the asset
 * is gone or still held by another document.
 *
 * "Held" is checked on the latest committed documents ({@link isAssetHeld}),
 * leaving out `except` (the post being deleted, if any): the query view can
 * still show a reference that is gone, this post's own or another post's
 * whose Delete unset it moments ago, and two such posts would each keep the
 * asset for the other and leave it with no `deleting` marker to retry from.
 * A refused delete is never taken at its word either (Sanity answers 409
 * for a held asset and for a contended transaction): held is checked again.
 * Not held means the delete failed, retried once; after a second failure,
 * or when "held" can't be told, false: the post stays `deleting` with its
 * `deletingAssetId`, or the cron leaves the wall unpurged.
 */
/** Gone (or never there), kept for a document that holds it, or not done. */
export type WallAssetOutcome = 'deleted' | 'held' | 'failed'

export async function deleteWallAsset(
  assetId: string | null,
  { except }: { except?: string } = {},
): Promise<WallAssetOutcome> {
  if (!assetId) return 'deleted'
  const held = () => isAssetHeld(assetId, { except })
  return atMostTwice<WallAssetOutcome>(
    async () => {
      const holds = await held()
      // Held by another post, or by any document of any tenant: done.
      if (holds) return 'held'
      if (holds === false) {
        try {
          await deleteWithHistory(assetId)
          return 'deleted'
        } catch (error) {
          console.error(`Could not delete Wall Post asset ${assetId}`, error)
        }
      }
      return AGAIN
    },
    // Refused twice: done only if a holder explains it.
    async () => ((await held()) === true ? 'held' : 'failed'),
  )
}
