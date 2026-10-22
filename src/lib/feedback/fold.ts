/**
 * THE FOLD (speaker feedback spec §12.2, §12.3, #1438). A talk's Feedback
 * Responses are turned into per-talk totals (`talk.feedbackFolded`) and
 * deleted: 24 months after its conference ended (the daily cron below), or
 * early when the talk's last non-erased speaker is erased
 * (`src/lib/speaker/erasure.ts`).
 *
 * - **In chunks, each atomic.** At most {@link FOLD_CHUNK_SIZE} responses per
 *   transaction. On the published talk and every writable version: `set` the
 *   ABSOLUTE totals (the published talk's `feedbackFolded`, 0 where absent,
 *   plus this chunk's colours) and `foldedAt`, and unset `feedbackCode`, each
 *   patch guarded by its document's `ifRevisionId`. Never `inc`: on a missing
 *   field it does nothing. For each response, a no-op patch guarded by its
 *   revision, then its delete: a response removed or re-coloured since the
 *   read fails the guard, so it is never counted with a colour it no longer
 *   has.
 * - **Any failed guard aborts the whole chunk**, which is read and planned
 *   again ({@link MAX_RETRIES} times). A crash between chunks leaves only
 *   unfolded responses: nothing is counted twice or lost.
 * - **A version Sanity locks** (a release that is not `active`), or releases
 *   that cannot be listed, hold the talk: patching a locked version fails the
 *   whole transaction every time, and leaving it out would let publishing it
 *   bring the code and the old totals back. The talk is tried again on the
 *   next run (F8's rule for the summary claim).
 * - Which responses count is the totals' rule (§4.3, `./totals.ts`): the
 *   talk's published responses of the talk's own conference, hidden ones
 *   included. So the combined counts are the same before and after.
 */
import 'server-only'
import { scopedFetch } from '@/lib/sanity/scoped'
import { clientReadUncached } from '@/lib/sanity/client'
import { expireFeedbackCodeIndex } from './cache'
import type { FeedbackColour } from './colour'
import { LIVE_RESPONSES, PUBLISHED_ONLY, versionsClient } from './sanity'
import {
  MAX_RETRIES,
  isRetryable,
  lockRevision,
  readTalkVersions,
  requestCap,
  sweepFoldedTalkVersions,
  type FoldedCounts,
  type TalkDoc,
  type VersionsClient,
} from './talk-versions'
import { countColours, storedCount } from './totals'

/** Responses per transaction (§12.2). */
export const FOLD_CHUNK_SIZE = 100

/** Months after the conference ends that responses are kept (§8, §12.2). */
export const FOLD_AFTER_MONTHS = 24

/** Each Sanity request of a fold ends after this long, at the latest. */
const REQUEST_TIMEOUT_MS = 5_000

/** The cron run's one cross-tenant read of the candidates. */
const SELECTION_TIMEOUT_MS = 30_000

/**
 * Rounds of listing ids GROQ still shows for responses that are gone, beyond
 * the first, before a plan gives up for this run (reported as `late`).
 */
const MAX_LAG_ROUNDS = 2

/**
 * The worst case of one chunk and the sweep after it, in sequential
 * requests of at most {@link REQUEST_TIMEOUT_MS}: the version read (two
 * rounds), up to 1 + {@link MAX_LAG_ROUNDS} rounds of an id list and a
 * response read (6), the commit (1); the sweep's at most 4 version reads of
 * two rounds each and 3 commits (11). 20 rounds. No chunk starts with less
 * than this left before the deadline, so the run ends inside its budget. The
 * cron's eligibility check adds one read (21).
 */
export const CHUNK_BUDGET_MS = 21 * REQUEST_TIMEOUT_MS

/**
 * A caller's check that a talk, read now, may still be folded: `false`
 * refuses; `{ guard }` names another document the check read, whose
 * revision then guards the chunk's commit too (a no-op patch, see
 * `lockRevision`), so a change to it between the check and the commit fails
 * the chunk and the check is asked again.
 */
export type Eligibility = (
  talk: TalkDoc,
) => Promise<boolean | { guard: { id: string; rev: string } }>

export interface FoldOutcome {
  /**
   * - `folded`: every response the talk had is folded.
   * - `nothing`: the talk had no response to fold (or no longer exists).
   * - `held`: a version is locked in a release, or releases could not be
   *   listed; nothing more is folded until a later run.
   * - `late`: the deadline came between chunks; a later run goes on.
   * - `ineligible`: the caller's `eligible` check refused the talk as it
   *   reads now (it stopped qualifying since it was selected).
   */
  status: 'folded' | 'nothing' | 'held' | 'late' | 'ineligible'
  /** Responses folded by this call (chunks that committed). */
  responses: number
}

/**
 * A fold that stopped part-way: the chunks before it committed and stay
 * folded (`responses` of them), the rest wait for a re-run. The message is
 * the cause's.
 */
export class FoldError extends Error {
  constructor(
    readonly talkId: string,
    /** Responses folded before the failure. */
    readonly responses: number,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'FoldError'
  }
}

interface ResponseDoc {
  _id: string
  _rev: string
  _type?: string
  colour?: unknown
  talk?: { _ref?: string }
  conference?: { _ref?: string }
}

/**
 * Fold every response of `talkId`, chunk by chunk. Throws when a chunk keeps
 * losing its guards past {@link MAX_RETRIES} re-plans, or on any other
 * failed request; the chunks before it have committed and stay folded.
 *
 * Whenever a chunk committed, the post-commit sweep (§4.2) runs before this
 * returns or throws, with its own request cap: a talk whose last chunk is
 * folded is never selected again, so a version created during that commit
 * would otherwise keep the code and the old totals for good.
 */
export async function foldTalkFeedback(
  talkId: string,
  {
    now,
    deadline,
    eligible,
  }: {
    now: Date
    /**
     * No chunk starts unless its worst case and the sweep's
     * ({@link CHUNK_BUDGET_MS}) end before this.
     */
    deadline?: Date
    /**
     * Whether the talk, as the doc endpoint has it now, still qualifies:
     * asked before every chunk, on the same read whose revision guards that
     * chunk's commit, so a change after the check fails the commit and is
     * asked about again. The candidates were selected minutes ago.
     */
    eligible?: Eligibility
  },
): Promise<FoldOutcome> {
  const client = versionsClient()
  let responses = 0
  // A commit was sent: it may have landed although its reply failed.
  let commitSent = false
  // Folded or found gone: GROQ can list them for about a second after the
  // delete, and they must not end the fold early or be read again.
  const settledIds = new Set<string>()
  const result = (status: FoldOutcome['status']): FoldOutcome => ({
    status,
    responses,
  })

  try {
    for (;;) {
      let attempt = 0
      for (;;) {
        if (deadline && Date.now() + CHUNK_BUDGET_MS > deadline.getTime()) {
          return result('late')
        }
        const plan = await planChunk(
          client,
          talkId,
          settledIds,
          eligible,
        ).catch((error: unknown) => {
          throw new FoldError(talkId, responses, error)
        })
        if (plan.status !== 'chunk') {
          return result(
            plan.status === 'held' ||
              plan.status === 'late' ||
              plan.status === 'ineligible'
              ? plan.status
              : responses > 0
                ? 'folded'
                : 'nothing',
          )
        }
        commitSent = true
        try {
          await plan.commit(now)
        } catch (error) {
          if (!isRetryable(error) || attempt >= MAX_RETRIES) {
            throw new FoldError(talkId, responses, error)
          }
          attempt++
          continue
        }
        responses += plan.ids.length
        for (const id of plan.ids) settledIds.add(id)
        break
      }
    }
  } finally {
    // After any commit, including one whose reply failed: it may have
    // landed, and a talk whose last response it folded is never selected
    // again. The sweep never throws, and stops after one read when there is
    // nothing folded to mirror.
    if (commitSent) {
      await sweepFoldedTalkVersions(client, talkId, {
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      })
    }
  }
}

/**
 * The post-commit sweep (§4.2) for a talk whose code a write outside the
 * fold just unset (speaker erasure, §12.3): every version ends without the
 * code, whether or not anything is folded. Never throws.
 */
export async function sweepUnsetFeedbackCode(talkId: string): Promise<void> {
  await sweepFoldedTalkVersions(versionsClient(), talkId, {
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  })
}

type Plan =
  | { status: 'none' | 'held' | 'late' | 'ineligible' }
  | {
      status: 'chunk'
      ids: string[]
      commit: (now: Date) => Promise<unknown>
    }

/**
 * Read the talk, its versions and the next chunk of its responses, all
 * through the doc endpoint for the revisions a guard uses; GROQ only lists
 * the ids.
 */
async function planChunk(
  client: VersionsClient,
  talkId: string,
  /** Folded or found gone this run: never listed again. */
  settledIds: Set<string>,
  eligible: Eligibility | undefined,
): Promise<Plan> {
  const requestTimeoutMs = REQUEST_TIMEOUT_MS
  const { published, versions, locked, releasesListed } =
    await readTalkVersions(client, talkId, { requestTimeoutMs })
  const conferenceId = published?.conference?._ref
  if (!published || published._type !== 'talk' || !conferenceId) {
    return { status: 'none' }
  }
  const verdict = eligible ? await eligible(published) : true
  if (!verdict) return { status: 'ineligible' }
  const guard = typeof verdict === 'object' ? verdict.guard : undefined
  for (let round = 0; ; round++) {
    if (round > MAX_LAG_ROUNDS) return { status: 'late' }
    const ids =
      (await scopedFetch<string[] | null>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "feedbackResponse" && talk._ref == $talkId && ${PUBLISHED_ONLY} && !(_id in $settled)] | order(_id asc)[0...${FOLD_CHUNK_SIZE}]._id`,
        { talkId, settled: [...settledIds] },
        { cache: 'no-store', ...requestCap(requestTimeoutMs) },
      )) ?? []
    if (ids.length === 0) return { status: 'none' }
    if (!releasesListed || locked.length > 0) {
      console.error(
        `[feedback] fold of ${talkId} waits: ${
          releasesListed
            ? 'a version is in a release that is not active'
            : 'could not list releases'
        }`,
      )
      return { status: 'held' }
    }
    const found = await client.getDocuments<ResponseDoc>(
      ids,
      requestCap(requestTimeoutMs),
    )
    const chunk = found.filter(
      (r): r is NonNullable<(typeof found)[number]> =>
        !!r &&
        r._type === 'feedbackResponse' &&
        r.talk?._ref === talkId &&
        r.conference?._ref === conferenceId,
    )
    // Listed by a lagging GROQ but gone (or changed talk): not ours to fold.
    for (const id of ids) {
      if (!chunk.some((r) => r._id === id)) settledIds.add(id)
    }
    if (chunk.length === 0) continue

    return {
      status: 'chunk',
      ids: chunk.map((r) => r._id),
      commit: (now) => {
        const totals = addCounts(
          published.feedbackFolded,
          countColours(chunk),
          now,
        )
        const tx = client.transaction()
        for (const doc of [published, ...versions]) {
          tx.patch(doc._id, (p) =>
            p
              .ifRevisionId(doc._rev)
              .set({ feedbackFolded: totals })
              .unset(['feedbackCode']),
          )
        }
        if (guard) tx.patch(guard.id, (p) => lockRevision(p, guard.rev))
        for (const r of chunk) {
          tx.patch(r._id, (p) => lockRevision(p, r._rev))
          tx.delete(r._id)
        }
        return tx.commit(requestCap(requestTimeoutMs))
      },
    }
  }
}

/** The published talk's folded totals plus this chunk, as absolute values. */
function addCounts(
  before: FoldedCounts | null | undefined,
  chunk: Record<FeedbackColour, number>,
  now: Date,
) {
  return {
    greenCount: storedCount(before?.greenCount) + chunk.green,
    yellowCount: storedCount(before?.yellowCount) + chunk.yellow,
    redCount: storedCount(before?.redCount) + chunk.red,
    foldedAt: now.toISOString(),
  }
}

// --- the daily cron -------------------------------------------------------

/**
 * The newest conference end date that is past the retention: `now` less
 * {@link FOLD_AFTER_MONTHS} calendar months, as a `YYYY-MM-DD` date, the
 * shape of `conference.endDate`. A conference ending on it is not folded yet.
 */
export function foldCutoff(now: Date): string {
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() - FOLD_AFTER_MONTHS)
  return d.toISOString().slice(0, 10)
}

// groq-global: platform CRON SWEEP. Retention is owed per talk across every tenant; each talk is then folded in its OWN conference's scope.
export const FOLD_CANDIDATES = `*[_type == "talk" && ${PUBLISHED_ONLY} && conference->endDate < $cutoff && count(${LIVE_RESPONSES}) > 0]{ _id, "conferenceId": conference._ref }`

/**
 * The cron's eligibility: the talk's conference as it reads NOW (the talk
 * may have moved, or the end date been corrected, since the selection)
 * ended before the cutoff. The conference's revision then guards the chunk:
 * an end date corrected between this read and the commit fails it. That
 * guard writes the conference (an unset of a field no document has, so no
 * schema field of the append-only `conference` type changes), which moves its
 * `_rev` and `_updatedAt`; this project has no Sanity webhook (`npx sanity
 * hook list`, 2026-10-21), so nothing is revalidated by it, and it happens
 * only on a fold day of a conference more than two years old.
 */
async function pastRetention(
  talk: TalkDoc,
  cutoff: string,
): Promise<false | { guard: { id: string; rev: string } }> {
  const conferenceId = talk.conference?._ref
  if (!conferenceId) return false
  const conference = await versionsClient().getDocument<{
    _id: string
    _rev: string
    _type?: string
    endDate?: unknown
  }>(conferenceId, requestCap(REQUEST_TIMEOUT_MS))
  // No revision, no guard: then it is not folded.
  return conference?._type === 'conference' &&
    typeof conference._rev === 'string' &&
    typeof conference.endDate === 'string' &&
    conference.endDate < cutoff
    ? { guard: { id: conference._id, rev: conference._rev } }
    : false
}

export interface FoldReport {
  /** Talks the candidates query returned. */
  candidates: number
  /** Talks whose responses are now all folded. */
  folded: number
  /** Responses folded this run. */
  responses: number
  /** Talks held by a locked release version, or unlistable releases. */
  held: number
  /** Talks whose fold threw; the next run tries again. */
  failed: number
  /** Talks no longer past the retention as the fold read them. */
  ineligible: number
  /** Talks not reached, or cut off, before the deadline. */
  notReached: number
}

/**
 * Fold every talk past the retention (§12.2), talk by talk. Never throws for
 * one talk: it is logged, and the next goes on. After a talk folded anything
 * its conference's Feedback Code index is expired at once (§5.1): the fold
 * unset its code.
 */
export async function foldExpiredFeedback({
  now,
  deadline,
}: {
  now: Date
  deadline?: Date
}): Promise<FoldReport> {
  const cutoff = foldCutoff(now)
  const rows =
    (await clientReadUncached.fetch<
      { _id: string; conferenceId: string | null }[] | null
    >(
      FOLD_CANDIDATES,
      { cutoff },
      { cache: 'no-store', ...requestCap(SELECTION_TIMEOUT_MS) },
    )) ?? []
  const report: FoldReport = {
    candidates: rows.length,
    folded: 0,
    responses: 0,
    held: 0,
    failed: 0,
    ineligible: 0,
    notReached: 0,
  }
  for (const row of rows) {
    if (deadline && Date.now() >= deadline.getTime()) {
      report.notReached++
      continue
    }
    try {
      const outcome = await foldTalkFeedback(row._id, {
        now,
        deadline,
        eligible: (talk) => pastRetention(talk, cutoff),
      })
      report.responses += outcome.responses
      if (outcome.status === 'folded') report.folded++
      if (outcome.status === 'held') {
        report.held++
        // Every run it holds: its responses are past the retention.
        console.error(
          `[feedback] RETENTION OVERDUE: the responses of talk ${row._id} are past 24 months, but a version waits in a release that is not active (or releases could not be listed); publish or archive the release so the fold can run`,
        )
      }
      if (outcome.status === 'late') report.notReached++
      if (outcome.status === 'ineligible') report.ineligible++
      if (outcome.responses > 0 && row.conferenceId) {
        expireFeedbackCodeIndex(row.conferenceId)
      }
    } catch (error) {
      report.failed++
      if (error instanceof FoldError) report.responses += error.responses
      console.error(`[feedback] fold of ${row._id} failed`, error)
      // Its chunks before the failure committed, and unset the code.
      if (row.conferenceId) expireFeedbackCodeIndex(row.conferenceId)
    }
  }
  return report
}
