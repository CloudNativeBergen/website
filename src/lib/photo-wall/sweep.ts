import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { expireWallPost } from './cache'
import { deleteWallAsset, deleteWallPost } from './delete'
import { cronBudget, readUnpurgedWalls } from './retention'

/**
 * THE ORPHAN SWEEP (Photo Wall spec §11.2), run by the retention cron after
 * the 30-day deletion, in this order:
 *
 *  - `deleting` posts older than an hour: their Delete is finished
 *    ({@link deleteWallPost}, §12), and their caches expired. FIRST, as the
 *    one a contributor asked for: a long orphan pass must not starve it;
 *  - image assets a submit uploaded (`source.name == 'photo-wall'`, §5),
 *    older than {@link SWEEP_AGE_MS}, that no document of ANY tenant
 *    references: what a crash between the upload and the create left behind
 *    (§6.2). Looked for wall by wall (every wall not yet purged; a purged
 *    wall's assets are gone, and no submit uploads after its close), with
 *    the query view's references as a first filter only: each candidate is
 *    checked again against every tenant's latest documents just before its
 *    delete ({@link deleteWallAsset}), since the view lags.
 *
 * The hour is what keeps a submit in flight safe: its asset is unreferenced
 * between the upload and the create, for seconds. An asset of a submit in
 * flight for over an hour would be swept, and its create would then be
 * refused by Sanity (a strong reference to a missing document) and the
 * phone told to try again; accepted.
 */

/** How old an orphan asset or a stuck `deleting` post must be. */
export const SWEEP_AGE_MS = 60 * 60_000

/**
 * The longest one stuck delete's finish may take. `deleteWallPost` takes no
 * signal, so the sweep bounds each call from outside: it is not started
 * with less than this left, and is given up on after it.
 */
export const STUCK_FINISH_MS = 30_000

const CUT_OFF = Symbol('cut off')

/**
 * `work`, or {@link CUT_OFF} once `ms` have passed. The call itself is not
 * stopped (nothing can stop it): a stuck delete resumes from its
 * `deletingAssetId`, so one still running, or cut off half done, is
 * finished by a later sweep.
 */
async function within<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | typeof CUT_OFF> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cutOff = new Promise<typeof CUT_OFF>((resolve) => {
    timer = setTimeout(() => resolve(CUT_OFF), ms)
  })
  try {
    return await Promise.race([work, cutOff])
  } finally {
    clearTimeout(timer)
  }
}

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
  /** …given up on after {@link STUCK_FINISH_MS}: unknown, tried again next run. */
  finishCutOff: number
  /** True when the deadline cut the sweep short. */
  cutShort: boolean
}

// groq-global-scoped: an asset carries no `conference` reference; the
// submit route stores the conference as `source.id` (§5), filtered here.
const WALL_UPLOADS = `*[_type == "sanity.imageAsset" && source.name == "photo-wall" && source.id == $conferenceId && dateTime(_createdAt) < dateTime($before)]`

// groq-global: identical bytes are ONE asset across tenants, so a holder
// may be a document of any tenant. Only whether one exists is asked; no
// document of another tenant is returned.
const NO_HOLDER = `count(*[references(^._id)]) == 0`

/**
 * The orphan candidates of one conference: its photo-wall assets older than
 * an hour that NO document references in the query view, of any tenant: an
 * asset only another tenant's document holds would otherwise come back,
 * be kept by the check before the delete, and come back first every day.
 * Read at the API version whose `raw` perspective sees drafts and Content
 * Release versions, so a reference only a draft holds counts as one
 * (`orphaned-asset.ts`). No cap: the deadline bounds the run instead.
 */
async function readOrphanCandidates(
  conferenceId: string,
  before: string,
  signal: AbortSignal,
): Promise<string[]> {
  const ids = await clientReadUncached
    .withConfig({ apiVersion: COUNT_API_VERSION })
    .fetch<string[]>(
      `${WALL_UPLOADS}[${NO_HOLDER}] | order(_createdAt asc)._id`,
      { conferenceId, before },
      { cache: 'no-store', perspective: 'raw', signal },
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
async function readStuckDeletes(
  before: string,
  signal: AbortSignal,
): Promise<StuckRow[]> {
  const rows = await clientReadUncached.fetch<StuckRow[]>(
    // groq-global: the platform SWEEP finishes every tenant's stuck deletes
    // by design; each is deleted through its own conference.
    `*[_type == "wallPost" && status == "deleting" && dateTime(_updatedAt) < dateTime($before) && !(_id in path("drafts.**"))] | order(_updatedAt asc){ _id, "conferenceId": conference._ref }`,
    { before },
    { cache: 'no-store', signal },
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
    finishCutOff: 0,
    cutShort: false,
  }
  const budget = cronBudget(deadline)
  const before = new Date(now.getTime() - SWEEP_AGE_MS).toISOString()

  const stuck = await readStuckDeletes(before, budget.signal())
  report.stuck = stuck.length
  for (const post of stuck) {
    // Not started without the time to finish it: a call cut off by the
    // function's end would leave nothing to report.
    if (!budget.within() || deadline.getTime() - Date.now() < STUCK_FINISH_MS) {
      report.cutShort = true
      return report
    }
    if (!post.conferenceId) {
      report.finishFailed += 1
      continue
    }
    let deviceKey: string | null = null
    try {
      const result = await within(
        deleteWallPost({
          conferenceId: post.conferenceId,
          postId: post._id,
          onRead: (key) => {
            deviceKey = key
          },
        }),
        STUCK_FINISH_MS,
      )
      if (result === CUT_OFF) {
        console.error(
          `Photo Wall sweep: finishing ${post._id} took over ${STUCK_FINISH_MS} ms; tried again next run`,
        )
        report.finishCutOff += 1
      } else if (result.status === 'failed') report.finishFailed += 1
      else report.finished += 1
    } catch (error) {
      console.error(`Photo Wall sweep: could not finish ${post._id}`, error)
      report.finishFailed += 1
    } finally {
      // The queue and My posts (§8); the post left the wall when marked.
      expireWallPost(post.conferenceId, deviceKey ?? '', { wall: false })
    }
  }

  for (const wall of await readUnpurgedWalls(budget.signal())) {
    if (!wall.conferenceId) continue
    if (!budget.within()) {
      report.cutShort = true
      return report
    }
    const orphans = await readOrphanCandidates(
      wall.conferenceId,
      before,
      budget.signal(),
    )
    report.orphans += orphans.length
    for (const assetId of orphans) {
      if (!budget.within()) {
        report.cutShort = true
        return report
      }
      const outcome = await deleteWallAsset(assetId, {
        signal: budget.signal(),
      })
      if (outcome === 'deleted') report.assets += 1
      else if (outcome === 'held') report.assetsKept += 1
      else report.assetsFailed += 1
    }
  }
  return report
}
