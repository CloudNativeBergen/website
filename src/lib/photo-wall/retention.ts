import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { COUNT_API_VERSION, isAssetHeld } from '@/lib/sanity/orphaned-asset'
import { deleteManyWithHistory } from '@/lib/sanity/purge'
import { scopedFetch } from '@/lib/sanity/scoped'
import { osloTodayDateString } from '@/lib/time'
import { expireWallPost } from './cache'
import { deleteWallAsset } from './delete'
import { deletionDate, plusDays } from './deletion'

/**
 * THE 30-DAY DELETION (Photo Wall spec §11.1): run daily by the retention
 * cron. Every `photoWall` with `purgedAt` unset whose deletion date (the
 * conference's `endDate` plus 30 days, on the Oslo calendar) is tomorrow or
 * earlier is CLOSED first: `closedAt` set if unset, and its caches expired,
 * so posting, Submit and Approve refuse from then on. A wall whose deletion
 * date is today or earlier and whose `closedAt` is more than
 * {@link CLOSE_SETTLE_MS} old (a submit in flight has finished) is PURGED,
 * {@link POST_DELETE_CHUNK} posts at a time, in two transactions per chunk:
 *
 *  a. MARK every post of the chunk `deleting`, its asset id kept in
 *     `deletingAssetId` and `photo` unset (Delete's own step 1, §12). This
 *     is the durable record of which assets to delete: a crash after it
 *     leaves the ids on the posts, where the next run reads them again. It
 *     matters because identical bytes are ONE asset across tenants, named
 *     after the first uploader (`source.id` may be another conference), so
 *     a post's asset can be found through the post only;
 *  b. DELETE, with their history, the chunk's assets that no document
 *     holds any more (checked on the latest documents of every tenant,
 *     {@link isAssetHeld}) and then the chunk's posts, in one transaction.
 *     An asset a later chunk's post still holds is left to that chunk; one
 *     another tenant's document holds is kept.
 *
 * Then every `photo-wall` asset uploaded under the conference
 * (`source.id`) that nothing holds, and only then `purgedAt`.
 *
 * `closedAt` means "closed to writes", `purgedAt` means "deletion done". A
 * run that stops between any two steps (a crash, the deadline, a refused
 * write) leaves `purgedAt` unset and the next run repeats the purge: the
 * mark of a marked post changes nothing, a delete of a document that is
 * already gone succeeds (Sanity: "considered successful even if the
 * document did not exist"), and an asset another document holds is kept
 * and counted as done, so nothing is lost and nothing is deleted twice.
 * Closing the day before means the purge runs ON the deletion date, after
 * a day in which no write could have landed.
 *
 * Every Sanity request ends after {@link CALL_TIMEOUT_MS}, and at the run's
 * deadline at the latest ({@link cronBudget}); the deadline is checked
 * before each chunk and between holder checks. A chunk the deadline cuts
 * leaves its posts marked and nothing of it deleted, or (an aborted delete
 * that landed anyway) everything: either is a step boundary above.
 */

/** How long after `closedAt` a wall may be purged. */
export const CLOSE_SETTLE_MS = 15 * 60_000

/** Posts per chunk: each chunk is two transactions. */
export const POST_DELETE_CHUNK = 50

/** Assets checked or deleted at the same time. */
export const ASSET_CONCURRENCY = 4

/**
 * The longest any one Sanity request of the cron may take, and never past
 * the run's deadline ({@link cronBudget}). The client's own `timeout` does
 * not bound a read, nor `getDocument`'s retries: only a signal does.
 */
export const CALL_TIMEOUT_MS = 20_000

/**
 * Release versions (`versions.*`) are seen, and written, only from this API
 * version, with the `raw` perspective.
 */
const RELEASES_API = { apiVersion: COUNT_API_VERSION }

/** The cron's time budget: whether there is time left, and a signal per request. */
export interface CronBudget {
  /** False once the deadline has passed, by the clock or by its timer. */
  within(): boolean
  /** A signal that ends a request after {@link CALL_TIMEOUT_MS}, or at the deadline. */
  signal(): AbortSignal
}

/** The budget of a run that must be done by `deadline`. */
export function cronBudget(deadline: Date): CronBudget {
  const run = AbortSignal.timeout(Math.max(0, deadline.getTime() - Date.now()))
  return {
    within: () => !run.aborted && Date.now() < deadline.getTime(),
    signal: () => AbortSignal.any([AbortSignal.timeout(CALL_TIMEOUT_MS), run]),
  }
}

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

/** Every wall with `purgedAt` unset: the retention's and the sweep's. */
export async function readUnpurgedWalls(
  signal: AbortSignal,
): Promise<UnpurgedWall[]> {
  const rows = await clientReadUncached.fetch<UnpurgedWall[]>(
    // groq-global: the platform RETENTION CRON enumerates every tenant's
    // walls by design; each wall's purge below is scoped to its conference.
    `*[_type == "photoWall" && !defined(purgedAt) && !(_id in path("drafts.**"))]{ _id, closedAt, "conferenceId": conference._ref, "endDate": conference->endDate }`,
    {},
    { cache: 'no-store', signal },
  )
  return rows ?? []
}

/**
 * Every Wall Post of the conference with its assets: drafts AND Content
 * Release versions (`versions.*`), which hold a reference to the photo as
 * the post does. The Studio offers no action on a Wall Post, but its
 * version menu ("copy to release") is not one of them; a version left
 * behind would keep the photo after `purgedAt`.
 */
function readPostsToPurge(
  conferenceId: string,
  signal: AbortSignal,
): Promise<PostRow[]> {
  return scopedFetch<PostRow[]>(
    clientReadUncached.withConfig(RELEASES_API),
    { conferenceId },
    `*[_type == "wallPost"]{ _id, "assetId": photo.asset._ref, deletingAssetId, deviceKey }`,
    {},
    { cache: 'no-store', perspective: 'raw', signal },
  )
}

/** Every asset a submit of this conference uploaded (§5), held or not. */
async function readWallAssets(
  conferenceId: string,
  signal: AbortSignal,
): Promise<string[]> {
  const ids = await clientReadUncached.fetch<string[]>(
    // groq-global-scoped: an asset carries no `conference` reference; the
    // submit route stores the conference as `source.id` (§5), filtered here.
    `*[_type == "sanity.imageAsset" && source.name == "photo-wall" && source.id == $conferenceId]._id`,
    { conferenceId },
    { cache: 'no-store', signal },
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

/** Run `work` over `items`, {@link ASSET_CONCURRENCY} at a time, until `go` says stop. */
async function eachAsset(
  items: readonly string[],
  go: () => boolean,
  work: (id: string) => Promise<void>,
): Promise<boolean> {
  let next = 0
  const worker = async () => {
    while (next < items.length && go()) await work(items[next++])
  }
  await Promise.all(Array.from({ length: ASSET_CONCURRENCY }, worker))
  return next >= items.length
}

/**
 * Steps a and b for one chunk. Throws when a transaction is refused or a
 * holder check can't be told: the wall stays unpurged, nothing is lost.
 * Null when the deadline came between the holder checks: the posts stay
 * marked, nothing of the chunk is deleted, and the next run repeats it.
 * Every request ends at the deadline, so a chunk never outlives it.
 */
async function purgeChunk(
  chunk: readonly PostRow[],
  result: Purge,
  budget: CronBudget,
): Promise<string[] | null> {
  const mark = clientWrite.withConfig(RELEASES_API).transaction()
  for (const post of chunk) {
    mark.patch(post._id, (patch) =>
      post.assetId
        ? patch
            .set({ status: 'deleting', deletingAssetId: post.assetId })
            .unset(['photo'])
        : patch.set({ status: 'deleting' }),
    )
  }
  await mark.commit({ signal: budget.signal() })

  const assetIds = [
    ...new Set(
      chunk.flatMap((post) => {
        const id = post.assetId ?? post.deletingAssetId
        return id ? [id] : []
      }),
    ),
  ]
  const free: string[] = []
  let unknown = false
  const reached = await eachAsset(
    assetIds,
    () => !unknown && budget.within(),
    async (assetId) => {
      // The chunk's posts hold nothing now; the view may still show them,
      // so holders are read again through the doc endpoint.
      const held = await isAssetHeld(assetId, { signal: budget.signal() })
      if (held === null) unknown = true
      else if (held) result.assetsKept += 1
      else free.push(assetId)
    },
  )
  // A check cut off by the deadline can't be told either: not a failure.
  if (!budget.within()) return null
  if (unknown) throw new Error('Could not tell whether an asset is held')
  if (!reached) return null

  await deleteManyWithHistory([...free, ...chunk.map((post) => post._id)], {
    signal: budget.signal(),
    ...RELEASES_API,
  })
  result.assets += free.length
  result.posts += chunk.length
  return assetIds
}

/**
 * Steps 3 and 4 for one wall. Every delete is checked against the latest
 * documents, never the query view alone, so a reference the view still
 * shows for a post marked moments ago does not keep its asset, and one a
 * document of another conference holds does.
 */
async function purgeWall(
  wall: UnpurgedWall & { conferenceId: string },
  now: Date,
  budget: CronBudget,
): Promise<Purge> {
  const { conferenceId } = wall
  const result: Purge = { posts: 0, assets: 0, assetsKept: 0, done: false }
  const posts = await readPostsToPurge(conferenceId, budget.signal())
  const deviceKeys = new Set(
    posts.map((p) => p.deviceKey).filter((k): k is string => !!k),
  )
  // Every asset a chunk decided on, so the sweep of uploads below does not
  // count a kept one twice.
  const decided = new Set<string>()
  for (let at = 0; at < posts.length; at += POST_DELETE_CHUNK) {
    if (!budget.within()) return result
    const chunk = posts.slice(at, at + POST_DELETE_CHUNK)
    const ids = await purgeChunk(chunk, result, budget)
    if (!ids) return result
    for (const id of ids) decided.add(id)
  }

  // The conference's own uploads that no post named any more: a crash
  // between a submit's upload and its create (§6.2), or a Delete's step 1
  // whose step 2 never ran.
  const uploads = (await readWallAssets(conferenceId, budget.signal())).filter(
    (id) => !decided.has(id),
  )
  let failed = false
  const reached = await eachAsset(
    uploads,
    () => budget.within() && !failed,
    async (assetId) => {
      const outcome = await deleteWallAsset(assetId, {
        signal: budget.signal(),
      })
      if (outcome === 'deleted') result.assets += 1
      else if (outcome === 'held') result.assetsKept += 1
      else failed = true
    },
  )
  if (failed || !reached || !budget.within()) return result

  await clientWrite
    .patch(wall._id)
    .set({ purgedAt: now.toISOString() })
    .commit({ signal: budget.signal() })
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
  const budget = cronBudget(deadline)
  const today = osloTodayDateString(now)
  const tomorrow = plusDays(today, 1)
  const due = (await readUnpurgedWalls(budget.signal())).flatMap((wall) => {
    const deletesOn = deletionDate(wall.endDate)
    return wall.conferenceId && deletesOn && deletesOn <= tomorrow
      ? [{ ...wall, conferenceId: wall.conferenceId, deletesOn }]
      : []
  })
  report.due = due.length

  for (const wall of due) {
    if (!budget.within()) {
      report.notReached += 1
      continue
    }
    try {
      let { closedAt } = wall
      if (!closedAt) {
        closedAt = now.toISOString()
        await clientWrite
          .patch(wall._id)
          .setIfMissing({ closedAt })
          .commit({ signal: budget.signal() })
        report.closed += 1
        // The wall and the queue (§8): the closed state, and no posts.
        expireWallPost(wall.conferenceId, '', { wall: true })
      }
      const settled = now.getTime() - Date.parse(closedAt) > CLOSE_SETTLE_MS
      if (wall.deletesOn > today || !settled) continue

      const purge = await purgeWall(wall, now, budget)
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
