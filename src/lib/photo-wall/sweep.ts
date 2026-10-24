import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { expireWallPost } from './cache'
import { deleteWallAsset, deleteWallPost } from './delete'
import { readUnpurgedWalls } from './retention'

/**
 * THE ORPHAN SWEEP (Photo Wall spec §11.2), run by the retention cron after
 * the 30-day deletion:
 *
 *  - image assets a submit uploaded (`source.name == 'photo-wall'`, §5),
 *    older than {@link SWEEP_AGE_MS}, that no document references: what a
 *    crash between the upload and the create left behind (§6.2). Looked for
 *    wall by wall (every wall not yet purged; a purged wall's assets are
 *    gone, and no submit uploads after its close), with the query view's
 *    references of that conference as a first filter only: each candidate
 *    is checked again against every tenant's latest documents just before
 *    its delete ({@link deleteWallAsset}), since the view lags, and the same
 *    bytes from any tenant are ONE asset that a document of theirs may hold;
 *  - `deleting` posts older than an hour: their Delete is finished
 *    ({@link deleteWallPost}, §12), and their caches expired.
 *
 * The hour is what keeps a submit in flight safe: its asset is unreferenced
 * between the upload and the create, for seconds. An asset of a submit in
 * flight for over an hour would be swept, and its create would then be
 * refused by Sanity (a strong reference to a missing document) and the
 * phone told to try again; accepted.
 */

/** How old an orphan asset or a stuck `deleting` post must be. */
export const SWEEP_AGE_MS = 60 * 60_000

export interface SweepReport {
  /** Orphan assets the query found. */
  orphans: number
  /** …deleted. */
  assets: number
  /** …kept: a document held them after all. */
  assetsKept: number
  /** …not deleted; tried again next run. */
  assetsFailed: number
  /** Stuck `deleting` posts the query found. */
  stuck: number
  /** …finished. */
  finished: number
  /** …not finished; tried again next run. */
  finishFailed: number
  /** True when the deadline cut the sweep short. */
  cutShort: boolean
}

/**
 * The orphan candidates of one conference: its photo-wall assets older than
 * an hour that no document OF THE CONFERENCE references in the query view.
 * Read at the API version whose `raw` perspective sees drafts and Content
 * Release versions, so a reference only a draft holds counts as one
 * (`orphaned-asset.ts`). One another tenant's document holds passes this
 * filter and is kept by the check before the delete. No cap: such kept
 * candidates would fill a cap every day and starve newer orphans; the
 * deadline bounds the run instead.
 */
async function readOrphanCandidates(
  conferenceId: string,
  before: string,
): Promise<string[]> {
  const ids = await clientReadUncached
    .withConfig({ apiVersion: COUNT_API_VERSION })
    .fetch<string[]>(
      // groq-global-scoped: an asset carries no `conference` reference; the
      // submit route stores the conference as `source.id` (§5), filtered here.
      `*[_type == "sanity.imageAsset" && source.name == "photo-wall" && source.id == $conferenceId && dateTime(_createdAt) < dateTime($before) && count(*[conference._ref == $conferenceId && references(^._id)]) == 0] | order(_createdAt asc)._id`,
      { conferenceId, before },
      { cache: 'no-store', perspective: 'raw' },
    )
  return ids ?? []
}

interface StuckRow {
  _id: string
  conferenceId: string | null
}

/**
 * Posts a Delete left `deleting` more than an hour ago (its mark is the last
 * write). No cap, for the same reason as the candidates: a post whose
 * finish keeps failing would otherwise hold a slot every day.
 */
async function readStuckDeletes(before: string): Promise<StuckRow[]> {
  const rows = await clientReadUncached.fetch<StuckRow[]>(
    // groq-global: the platform SWEEP finishes every tenant's stuck deletes
    // by design; each is deleted through its own conference.
    `*[_type == "wallPost" && status == "deleting" && dateTime(_updatedAt) < dateTime($before) && !(_id in path("drafts.**"))] | order(_updatedAt asc){ _id, "conferenceId": conference._ref }`,
    { before },
    { cache: 'no-store' },
  )
  return rows ?? []
}

/**
 * Sweep until `deadline`. A failed read of either list throws (the cron
 * answers 500); a failed delete is counted and the sweep goes on.
 */
export async function sweepPhotoWall({
  now,
  deadline,
}: {
  now: Date
  deadline: Date
}): Promise<SweepReport> {
  const report: SweepReport = {
    orphans: 0,
    assets: 0,
    assetsKept: 0,
    assetsFailed: 0,
    stuck: 0,
    finished: 0,
    finishFailed: 0,
    cutShort: false,
  }
  const withinDeadline = () => Date.now() < deadline.getTime()
  const before = new Date(now.getTime() - SWEEP_AGE_MS).toISOString()

  for (const wall of await readUnpurgedWalls()) {
    if (!wall.conferenceId) continue
    const orphans = await readOrphanCandidates(wall.conferenceId, before)
    report.orphans += orphans.length
    for (const assetId of orphans) {
      if (!withinDeadline()) {
        report.cutShort = true
        return report
      }
      const outcome = await deleteWallAsset(assetId)
      if (outcome === 'deleted') report.assets += 1
      else if (outcome === 'held') report.assetsKept += 1
      else report.assetsFailed += 1
    }
  }

  const stuck = await readStuckDeletes(before)
  report.stuck = stuck.length
  for (const post of stuck) {
    if (!withinDeadline()) {
      report.cutShort = true
      return report
    }
    if (!post.conferenceId) {
      report.finishFailed += 1
      continue
    }
    let deviceKey: string | null = null
    try {
      const result = await deleteWallPost({
        conferenceId: post.conferenceId,
        postId: post._id,
        onRead: (key) => {
          deviceKey = key
        },
      })
      if (result.status === 'failed') report.finishFailed += 1
      else report.finished += 1
    } catch (error) {
      console.error(`Photo Wall sweep: could not finish ${post._id}`, error)
      report.finishFailed += 1
    } finally {
      // The queue and My posts (§8); the post left the wall when marked.
      expireWallPost(post.conferenceId, deviceKey ?? '', { wall: false })
    }
  }
  return report
}
