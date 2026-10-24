import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { sanityStatus } from '@/lib/sanity/status'
import {
  allowsFrom,
  type ModerationAction,
  type ShownIncarnation,
  type WallPostStatus,
} from './moderation'
import { readPhotoWall } from './sanity'
import {
  AGAIN,
  atMostTwice,
  isShown,
  readWallPost,
  sameIncarnation,
} from './wall-post'

/**
 * THE MODERATION ACTIONS (Photo Wall spec §5, §10): Approve, Reject, Remove
 * and Approve all pending. Each is a patch of the post's status and decision
 * times, nothing copied or deleted, guarded with `ifRevisionId` against the
 * live read it was decided from, so two organizers (or an organizer and the
 * contributor) can't interleave. Delete now is `deleteWallPost` (`./delete`).
 * Nothing here expires a cache tag: the caller does, per §8.
 */

export type ModerationResult =
  /** Written. */
  | { status: 'done'; deviceKey: string | null }
  /** Someone else decided first; nothing written. The card refreshes. */
  | { status: 'changed' }
  /** No such post on this wall any more: "This photo was deleted". */
  | { status: 'gone' }

/**
 * Whether the wall is closed by the retention cron (§11.1): Approve refuses
 * once `closedAt` is set, whatever `postingMode` says, so no post reaches a
 * wall whose photos are about to be deleted. Read on the uncached client
 * JUST BEFORE the final commit, past the cron's close. A missing wall
 * counts as closed: nothing can be approved onto it.
 */
async function isWallClosed(conferenceId: string): Promise<boolean> {
  const wall = await readPhotoWall(conferenceId)
  return !wall || wall.closedAt !== null
}

function patchFor(action: ModerationAction, now: string) {
  return action === 'approve'
    ? { status: 'approved', approvedAt: now, decidedAt: now }
    : { status: 'notShown', decidedAt: now }
}

/**
 * Approve, Reject or Remove one post (§10). Refused before any write when the
 * post's status does not allow the action ({@link ALLOWED_FROM}), and for
 * Approve, when it is no longer the status the organizer saw (`from`): an
 * Approve pressed on a Pending card must not approve a post another
 * organizer rejected meanwhile.
 *
 * On a revision conflict, re-read once: gone, or a status the action no
 * longer allows, ends it; otherwise retry once, and ONLY if it is the same
 * post (not a replacement a submit created after a Delete) and the status
 * and `decidedAt` are what the first read found, so no moderation decision
 * happened in between (a marketing untick changes neither).
 *
 * Approve is refused as `changed` when the wall is closed (§11.1), checked
 * just before each commit: the card refreshes, and the admin page says the
 * wall has closed.
 */
export async function moderateWallPost({
  conferenceId,
  postId,
  action,
  from,
  shown,
  onRead,
  now = new Date(),
}: {
  conferenceId: string
  postId: string
  action: ModerationAction
  /** Approve only: the status the card showed. */
  from?: WallPostStatus
  /** The post the card showed: a replacement under the id is `changed`. */
  shown?: ShownIncarnation
  /** Told the device of every post read, before anything is written. */
  onRead?: (deviceKey: string | null) => void
  now?: Date
}): Promise<ModerationResult> {
  const read = async () => {
    const post = await readWallPost(conferenceId, postId)
    if (post) onRead?.(post.deviceKey)
    return post
  }
  const first = await read()
  if (!first) return { status: 'gone' }
  if (
    (shown !== undefined && !isShown(first, shown)) ||
    !allowsFrom(action, first.status) ||
    (from !== undefined && first.status !== from)
  ) {
    return { status: 'changed' }
  }

  const set = patchFor(action, now.toISOString())
  return atMostTwice<ModerationResult>(
    async (attempt) => {
      let post = first
      if (attempt === 1) {
        const again = await read()
        if (!again) return { status: 'gone' }
        if (
          !sameIncarnation(again, first) ||
          again.status !== first.status ||
          again.decidedAt !== first.decidedAt
        ) {
          return { status: 'changed' }
        }
        post = again
      }
      if (action === 'approve' && (await isWallClosed(conferenceId))) {
        return { status: 'changed' }
      }
      try {
        await clientWrite
          .patch(postId)
          .ifRevisionId(post._rev)
          .set(set)
          .commit()
        return { status: 'done', deviceKey: post.deviceKey }
      } catch (error) {
        if (sanityStatus(error) === 404) return { status: 'gone' }
        if (sanityStatus(error) === 409) return AGAIN
        throw error
      }
    },
    () => ({ status: 'changed' }),
  )
}

/** Approve all pending: this many patches at a time (§10). */
export const APPROVE_ALL_CONCURRENCY = 4
/** …and no new one started after this long. */
export const APPROVE_ALL_BUDGET_MS = 30_000

export interface ApproveAllResult {
  /** How many it approved. */
  approved: number
  /** How many of the posts asked for were pending on this wall when pressed. */
  pending: number
  /**
   * The device keys of every post it TRIED, each once: whose My posts may
   * have changed. Not only the acknowledged ones: a patch can commit and
   * still throw, its answer lost.
   */
  deviceKeys: string[]
}

interface PendingRow {
  _id: string
  _rev: string
  _createdAt: string | null
  assetId: string | null
  deviceKey: string | null
}

/** A Pending card as the organizer saw it. */
export type ShownPost = { id: string } & ShownIncarnation

/**
 * Approve all pending (§10), of the posts the organizer was SHOWN: `shown`
 * are the Pending cards on their screen, and only those still pending on
 * this wall, and still the post each card showed (not a replacement a
 * submit created under its id), are approved. A post that arrived after
 * their last poll stays pending: nothing reaches the public wall unseen. (A
 * deliberate narrowing of §10's "the posts pending when pressed".)
 *
 * One guarded patch per post, not a transaction, which is all-or-nothing and
 * would sink a whole batch for one conflicted post. A conflicted post is
 * skipped and stays pending; pressing again picks it up. Four at a time, and
 * none started after the 30 s budget.
 *
 * Nothing is approved on a wall closed by the retention cron (§11.1),
 * checked once, after the read and before the first patch: the run is
 * bounded by its budget, well inside the cron's settle window.
 */
export async function approveAllPending({
  conferenceId,
  shown,
  now = new Date(),
  clock = Date.now,
}: {
  conferenceId: string
  shown: readonly ShownPost[]
  now?: Date
  /** The budget's clock. */
  clock?: () => number
}): Promise<ApproveAllResult> {
  const started = clock()
  const byId = new Map(shown.map((post) => [post.id, post]))
  const read = byId.size
    ? await scopedFetch<PendingRow[]>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "wallPost" && status == "pending" && _id in $ids && !(_id in path("drafts.**"))] | order(submittedAt asc) { _id, _rev, _createdAt, "assetId": photo.asset._ref, deviceKey }`,
        { ids: [...byId.keys()] },
      )
    : []
  // A post that is not the one its card showed is skipped: never written.
  const rows = read.filter((row) => {
    const card = byId.get(row._id)
    return (
      card !== undefined &&
      (row._createdAt ?? null) === card.createdAt &&
      (card.assetId === null || (row.assetId ?? null) === card.assetId)
    )
  })
  if (rows.length && (await isWallClosed(conferenceId))) {
    return { approved: 0, pending: rows.length, deviceKeys: [] }
  }
  const set = patchFor('approve', now.toISOString())
  const deviceKeys = new Set<string>()
  let approved = 0
  let next = 0

  const worker = async () => {
    while (next < rows.length && clock() - started < APPROVE_ALL_BUDGET_MS) {
      const row = rows[next++]
      if (row.deviceKey) deviceKeys.add(row.deviceKey)
      try {
        await clientWrite
          .patch(row._id)
          .ifRevisionId(row._rev)
          .set(set)
          .commit()
      } catch (error) {
        // Changed since the read (409) or gone (404): skipped.
        if (sanityStatus(error) !== 409 && sanityStatus(error) !== 404) {
          console.error(`Approve all could not approve ${row._id}`, error)
        }
        continue
      }
      approved += 1
    }
  }
  await Promise.all(
    Array.from({ length: APPROVE_ALL_CONCURRENCY }, () => worker()),
  )
  return { approved, pending: rows.length, deviceKeys: [...deviceKeys] }
}
