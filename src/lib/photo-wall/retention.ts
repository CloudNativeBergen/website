import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { deleteManyWithHistory } from '@/lib/sanity/purge'
import { scopedFetch } from '@/lib/sanity/scoped'
import { osloTodayDateString } from '@/lib/time'
import { expireWallPost } from './cache'
import { deleteWallAsset } from './delete'
import { deletionDate } from './deletion'

/**
 * THE 30-DAY DELETION (Photo Wall spec §11.1): run daily by the retention
 * cron. Every `photoWall` with `purgedAt` unset whose deletion date (the
 * conference's `endDate` plus 30 days, on the Oslo calendar) is tomorrow or
 * earlier is CLOSED first: `closedAt` set if unset, and its caches expired,
 * so posting, Submit and Approve refuse from then on. A wall whose deletion
 * date is today or earlier and whose `closedAt` is more than
 * {@link CLOSE_SETTLE_MS} old (a submit in flight has finished) is PURGED:
 * every Wall Post of the conference is read with its asset id and
 * `deletingAssetId`, the posts are deleted with their history, then every
 * asset they referenced and every `photo-wall` asset of the conference that
 * no document holds, and only then is `purgedAt` set.
 *
 * `closedAt` means "closed to writes", `purgedAt` means "deletion done". A
 * run that stops between any two steps (a crash, the deadline, a refused
 * write) leaves `purgedAt` unset and the next run repeats the purge: a
 * delete of a document that is already gone is a no-op, and an asset
 * another document holds is kept and counted as done, so nothing is lost
 * and nothing is deleted twice. Closing the day before means the purge runs
 * ON the deletion date, after a day in which no write could have landed.
 */

/** How long after `closedAt` a wall may be purged. */
export const CLOSE_SETTLE_MS = 15 * 60_000

/** Posts deleted per transaction. */
export const POST_DELETE_CHUNK = 50

/** Assets deleted at the same time. */
export const ASSET_CONCURRENCY = 4

export interface RetentionReport {
  /** Walls with `purgedAt` unset whose deletion date is tomorrow or earlier. */
  due: number
  /** Walls this run set `closedAt` on. */
  closed: number
  /** Walls this run set `purgedAt` on. */
  purged: number
  /** Posts this run deleted. */
  posts: number
  /** Assets this run deleted. */
  assets: number
  /** Assets kept because another document holds them. */
  assetsKept: number
  /** The ids of walls whose purge did not finish; the next run goes on. */
  unfinished: string[]
  /** Walls not reached before the deadline. */
  notReached: number
}

/** A wall the cron may still have work on, with what decides whether. */
export interface UnpurgedWall {
  _id: string
  closedAt: string | null
  conferenceId: string | null
  endDate: string | null
}

interface PostRow {
  _id: string
  assetId: string | null
  deletingAssetId: string | null
  deviceKey: string | null
}

/** `date` plus `days`, on the calendar. */
function plusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Every wall with `purgedAt` unset: the retention's and the sweep's. */
export async function readUnpurgedWalls(): Promise<UnpurgedWall[]> {
  const rows = await clientReadUncached.fetch<UnpurgedWall[]>(
    // groq-global: the platform RETENTION CRON enumerates every tenant's
    // walls by design; each wall's purge below is scoped to its conference.
    `*[_type == "photoWall" && !defined(purgedAt) && !(_id in path("drafts.**"))]{ _id, closedAt, "conferenceId": conference._ref, "endDate": conference->endDate }`,
    {},
    { cache: 'no-store' },
  )
  return rows ?? []
}

/** Every Wall Post of the conference, drafts included, with its assets. */
function readPostsToPurge(conferenceId: string): Promise<PostRow[]> {
  return scopedFetch<PostRow[]>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "wallPost"]{ _id, "assetId": photo.asset._ref, deletingAssetId, deviceKey }`,
  )
}

/** Every asset a submit of this conference uploaded (§5), held or not. */
async function readWallAssets(conferenceId: string): Promise<string[]> {
  const ids = await clientReadUncached.fetch<string[]>(
    // groq-global-scoped: an asset carries no `conference` reference; the
    // submit route stores the conference as `source.id` (§5), filtered here.
    `*[_type == "sanity.imageAsset" && source.name == "photo-wall" && source.id == $conferenceId]._id`,
    { conferenceId },
    { cache: 'no-store' },
  )
  return ids ?? []
}

interface Purge {
  posts: number
  assets: number
  assetsKept: number
  /** False when a step did not finish: `purgedAt` stays unset. */
  done: boolean
}

/**
 * Step 3 and 4 for one wall. Every delete is checked against the latest
 * documents, never the query view alone ({@link deleteWallAsset}), so a
 * reference the view still shows for a post deleted moments ago does not
 * keep its asset, and one a document of another conference holds does.
 */
async function purgeWall(
  wall: UnpurgedWall & { conferenceId: string },
  now: Date,
  withinDeadline: () => boolean,
): Promise<Purge> {
  const { conferenceId } = wall
  const result: Purge = { posts: 0, assets: 0, assetsKept: 0, done: false }
  const posts = await readPostsToPurge(conferenceId)
  const deviceKeys = new Set(
    posts.map((p) => p.deviceKey).filter((k): k is string => !!k),
  )
  // Posts first: a post's strong reference would refuse its asset's delete.
  for (let at = 0; at < posts.length; at += POST_DELETE_CHUNK) {
    if (!withinDeadline()) return result
    const chunk = posts.slice(at, at + POST_DELETE_CHUNK)
    await deleteManyWithHistory(chunk.map((p) => p._id))
    result.posts += chunk.length
  }

  const assetIds = new Set<string>()
  for (const post of posts) {
    if (post.assetId) assetIds.add(post.assetId)
    if (post.deletingAssetId) assetIds.add(post.deletingAssetId)
  }
  for (const id of await readWallAssets(conferenceId)) assetIds.add(id)
  const queue = [...assetIds]
  let failed = false
  let next = 0
  const worker = async () => {
    while (next < queue.length && withinDeadline()) {
      const assetId = queue[next++]
      const outcome = await deleteWallAsset(assetId)
      if (outcome === 'deleted') result.assets += 1
      else if (outcome === 'held') result.assetsKept += 1
      else failed = true
    }
  }
  await Promise.all(Array.from({ length: ASSET_CONCURRENCY }, worker))
  if (failed || next < queue.length) return result

  await clientWrite
    .patch(wall._id)
    .set({ purgedAt: now.toISOString() })
    .commit()
  result.done = true
  // The wall, the queue and the My posts of every device (§8).
  for (const key of deviceKeys.size ? deviceKeys : ['']) {
    expireWallPost(conferenceId, key, { wall: true })
  }
  return result
}

/**
 * Close every wall due to close, purge every wall due to purge, until
 * `deadline`. One wall's failure is logged and the next wall goes on; a
 * failed read of the walls themselves throws, so the cron answers 500.
 */
export async function runPhotoWallRetention({
  now,
  deadline,
}: {
  now: Date
  deadline: Date
}): Promise<RetentionReport> {
  const report: RetentionReport = {
    due: 0,
    closed: 0,
    purged: 0,
    posts: 0,
    assets: 0,
    assetsKept: 0,
    unfinished: [],
    notReached: 0,
  }
  const withinDeadline = () => Date.now() < deadline.getTime()
  const today = osloTodayDateString(now)
  const tomorrow = plusDays(today, 1)
  const due = (await readUnpurgedWalls()).flatMap((wall) => {
    const deletesOn = deletionDate(wall.endDate)
    return wall.conferenceId && deletesOn && deletesOn <= tomorrow
      ? [{ ...wall, conferenceId: wall.conferenceId, deletesOn }]
      : []
  })
  report.due = due.length

  for (const wall of due) {
    if (!withinDeadline()) {
      report.notReached += 1
      continue
    }
    try {
      let { closedAt } = wall
      if (!closedAt) {
        closedAt = now.toISOString()
        await clientWrite.patch(wall._id).setIfMissing({ closedAt }).commit()
        report.closed += 1
        // The wall and the queue (§8): the closed state, and no posts.
        expireWallPost(wall.conferenceId, '', { wall: true })
      }
      const settled = now.getTime() - Date.parse(closedAt) > CLOSE_SETTLE_MS
      if (wall.deletesOn > today || !settled) continue

      const purge = await purgeWall(wall, now, withinDeadline)
      report.posts += purge.posts
      report.assets += purge.assets
      report.assetsKept += purge.assetsKept
      if (purge.done) report.purged += 1
      else report.unfinished.push(wall._id)
    } catch (error) {
      console.error(`Photo Wall retention: ${wall._id} did not finish`, error)
      report.unfinished.push(wall._id)
    }
  }
  return report
}
