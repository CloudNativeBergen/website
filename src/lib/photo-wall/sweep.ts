import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import { expireWallPost } from './cache'
import { deleteWallAsset, deleteWallPost } from './delete'
import { cronBudget } from './retention'

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
 *    (§6.2), and a photo the purge had to keep because another document
 *    held it (a gallery item deduplicated onto it, §11.1) once that holder
 *    lets go, which no other cleanup notices. EVERY such asset, whatever
 *    its conference: one with a live wall, a purged one, or none. The
 *    query view's references are a first filter only: each candidate is
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

// groq-global: the platform SWEEP looks for every tenant's Wall uploads by
// design (§11.2), whether their wall is live, purged or gone; only asset ids
// are returned, and each is deleted only when no document holds it.
const WALL_UPLOADS = `*[_type == "sanity.imageAsset" && source.name == "photo-wall" && dateTime(_createdAt) < dateTime($before)]`

// groq-global: identical bytes are ONE asset across tenants, so a holder
// may be a document of any tenant. Only whether one exists is asked; no
// document of another tenant is returned.
const NO_HOLDER = `count(*[references(^._id)]) == 0`

/**
 * The orphan candidates: photo-wall assets older than an hour that NO
 * document references in the query view, of any tenant. Held ones are left
 * out HERE, not by the check before the delete: they would otherwise come
 * back first every day, and an ever-growing set of photos kept by gallery
 * items would take the run's time from the real orphans. Read at the API
 * version whose `raw` perspective sees drafts and Content Release versions,
 * so a reference only a draft holds counts as one (`orphaned-asset.ts`).
 * No cap: a candidate is deleted the first run that reaches it, so the list
 * stays short, and the deadline bounds the run.
 */
async function readOrphanCandidates(
  before: string,
  signal: AbortSignal,
): Promise<string[]> {
  const ids = await clientReadUncached
    .withConfig({ apiVersion: COUNT_API_VERSION })
    .fetch<string[]>(
      `${WALL_UPLOADS}[${NO_HOLDER}] | order(_createdAt asc)._id`,
      { before },
      { cache: 'no-store', perspective: 'raw', signal },
    )
  return ids ?? []
}

/**
 * Assets a wallPost written in the last hour holds: what the query view may
 * not show yet (its sync lags). A retried submit of the same bytes reuses an
 * asset older than the hour (asset ids are content hashes), so the asset's
 * age alone does not protect it. Only the post ids come from a query; the
 * posts themselves are read through the doc endpoint, past the lag.
 * ponytail: a post the query view does not list at all an hour on is still
 * missed; Sanity then refuses the delete (strong reference, 409).
 */
async function readRecentlyHeld(
  before: string,
  signal: AbortSignal,
): Promise<Set<string>> {
  const ids = await clientReadUncached
    .withConfig({ apiVersion: COUNT_API_VERSION })
    .fetch<string[]>(
      // groq-global: a reused asset may be held by any tenant's post; only
      // ids are returned.
      `*[_type == "wallPost" && dateTime(_updatedAt) >= dateTime($before)]._id`,
      { before },
      { cache: 'no-store', perspective: 'raw', signal },
    )
  if (!ids?.length) return new Set()
  const posts = await clientReadUncached.getDocuments<{
    photo?: { asset?: { _ref?: string } }
  }>(ids, { signal })
  return new Set(
    posts.flatMap((p) => (p?.photo?.asset?._ref ? [p.photo.asset._ref] : [])),
  )
}

interface StuckRow {
  _id: string
  conferenceId: string | null
  /** Which post this was: a post created anew under the id is not it. */
  createdAt: string | null
  deletingAssetId: string | null
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
    `*[_type == "wallPost" && status == "deleting" && dateTime(_updatedAt) < dateTime($before) && !(_id in path("drafts.**"))] | order(_updatedAt asc){ _id, "conferenceId": conference._ref, "createdAt": _createdAt, deletingAssetId }`,
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
    let talkId: string | null = null
    try {
      const result = await within(
        deleteWallPost({
          conferenceId: post.conferenceId,
          postId: post._id,
          // The post the query found, and no other: a submit retried under
          // the same id after another Delete finished this one is `gone`.
          shown: {
            createdAt: post.createdAt,
            assetId: post.deletingAssetId,
          },
          onRead: (key, talk) => {
            deviceKey = key
            talkId = talk
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
      // The queue, My posts and the talk's photos (§8); the post left the
      // wall when marked.
      expireWallPost(post.conferenceId, deviceKey ?? '', {
        wall: false,
        talks: [talkId],
      })
    }
  }

  if (!budget.within()) {
    report.cutShort = true
    return report
  }
  const orphans = await readOrphanCandidates(before, budget.signal())
  report.orphans = orphans.length
  const recentlyHeld = orphans.length
    ? await readRecentlyHeld(before, budget.signal())
    : new Set<string>()
  for (const assetId of orphans) {
    if (!budget.within()) {
      report.cutShort = true
      return report
    }
    if (recentlyHeld.has(assetId)) {
      console.warn(
        `Photo Wall sweep: kept ${assetId}, held by a post written in the last hour`,
      )
      report.assetsKept += 1
      continue
    }
    const outcome = await deleteWallAsset(assetId, {
      signal: budget.signal(),
    })
    if (outcome === 'deleted') report.assets += 1
    else if (outcome === 'held') report.assetsKept += 1
    else report.assetsFailed += 1
  }
  return report
}
