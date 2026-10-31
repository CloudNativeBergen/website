import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { PUBLISHED_ONLY, versionsClient } from '@/lib/feedback/sanity'
import {
  lockRevision,
  readTalkVersions,
  type TalkDoc as VersionedTalk,
} from '@/lib/feedback/talk-versions'
import {
  osloMonthsCutoff,
  REVIEW_RETENTION_MONTHS,
} from '@/lib/retention/cutoffs'
import { summarizeReviews, type ReviewSummary } from './summary'

/**
 * Folds the reviews of conferences that ended more than
 * {@link REVIEW_RETENTION_MONTHS} months ago (Oslo date) into
 * `talk.reviewSummary`, then deletes them.
 *
 * Per conference, ONE transaction: set the summary on the published talk and
 * every writable version (draft, active releases), each guarded by
 * `ifRevisionId`; guard every review by its revision; then delete the
 * reviews. A concurrent edit fails the guard and the whole transaction, so a
 * review is never deleted without being counted, and never counted twice: the
 * summary is absolute (folded base + these reviews). A talk with a locked
 * release version, or whose releases cannot be listed, is skipped until a
 * later run, as in `src/lib/feedback/fold.ts`.
 *
 * Draft reviews are deleted with the rest but are not counted.
 *
 * At most about {@link MAX_REVIEWS_PER_RUN} reviews per run (whole talks
 * only), so the one transaction stays the size of a feedback-fold chunk. A
 * failing conference is logged and skipped.
 */
const MAX_REVIEWS_PER_RUN = 100

// groq-global-scoped: parent-keyed — `proposal->conference._ref == ^._id`
// bounds the count to reviews of the ENCLOSING conference's talks.
const HAS_REVIEWS = `count(*[_type == "review" && proposal->conference._ref == ^._id]) > 0`

type TalkDoc = VersionedTalk & { reviewSummary?: ReviewSummary | null }

export interface ReviewDoc {
  _id: string
  _rev: string
  talk: string
  score?: { content: number; relevance: number; speaker: number } | null
}

const isDraftReview = (r: ReviewDoc) =>
  r._id.startsWith('drafts.') || r._id.startsWith('versions.')

/** Pure: reviews grouped by talk, whole talks only, within `budget`. */
export function pickReviewBatch(
  reviews: ReviewDoc[],
  budget: number,
): Map<string, ReviewDoc[]> {
  const byTalk = new Map<string, ReviewDoc[]>()
  for (const r of reviews) {
    byTalk.set(r.talk, [...(byTalk.get(r.talk) ?? []), r])
  }
  const batch = new Map<string, ReviewDoc[]>()
  let size = 0
  for (const [talkId, own] of byTalk) {
    if (size > 0 && size + own.length > budget) break
    batch.set(talkId, own)
    size += own.length
  }
  return batch
}

/** Pure: the summary to store, counting published reviews only. */
export function foldSummary(
  published: TalkDoc,
  reviews: ReviewDoc[],
  now: Date,
): ReviewSummary {
  return {
    ...summarizeReviews(
      reviews.filter((r) => !isDraftReview(r)),
      published.reviewSummary,
    ),
    foldedAt: now.toISOString(),
  }
}

export async function foldExpiredReviews(
  dryRun = false,
): Promise<{ talks: number; deleted: number }> {
  const cutoff = osloMonthsCutoff(REVIEW_RETENTION_MONTHS)
  const conferences =
    (await clientReadUncached.fetch<{ _id: string }[]>(
      // groq-global: platform RETENTION CRON — enumerates every tenant's
      // conferences past the review horizon that still have reviews; each
      // fold below is scoped to that one conference.
      `*[_type == "conference" && defined(endDate) && endDate < $cutoff && ${HAS_REVIEWS}]{ _id }`,
      { cutoff },
      { cache: 'no-store' },
    )) ?? []

  const client = versionsClient()
  const result = { talks: 0, deleted: 0 }
  for (const { _id: conferenceId } of conferences) {
    const budget = MAX_REVIEWS_PER_RUN - result.deleted
    if (budget <= 0) break
    try {
      const talkIds =
        (await scopedFetch<string[]>(
          clientReadUncached,
          { conferenceId },
          `*[_type == "talk" && ${PUBLISHED_ONLY}]._id`,
          {},
          { cache: 'no-store' },
        )) ?? []
      if (talkIds.length === 0) continue
      const reviews =
        (await clientReadUncached.fetch<ReviewDoc[]>(
          // groq-global-scoped: `$talkIds` is the id set of ONE conference's
          // talks, read via the scopedFetch above.
          `*[_type == "review" && proposal._ref in $talkIds]{ _id, _rev, "talk": proposal._ref, score }`,
          { talkIds },
          { cache: 'no-store', perspective: 'raw' },
        )) ?? []

      const now = new Date()
      const tx = client.transaction()
      let talks = 0
      let deleted = 0
      for (const [talkId, own] of pickReviewBatch(reviews, budget)) {
        const { published, versions, locked, releasesListed } =
          await readTalkVersions(client, talkId)
        if (!published || !releasesListed || locked.length > 0) {
          console.error(
            `Review retention: ${talkId} waits (missing, or a locked release version)`,
          )
          continue
        }
        const summary = foldSummary(published as TalkDoc, own, now)
        for (const doc of [published, ...versions]) {
          tx.patch(doc._id, (p) =>
            p.ifRevisionId(doc._rev).set({ reviewSummary: summary }),
          )
        }
        for (const r of own) {
          tx.patch(r._id, (p) => lockRevision(p, r._rev))
          tx.delete(r._id)
        }
        talks++
        deleted += own.length
      }
      if (deleted === 0) continue
      if (!dryRun) await tx.commit()
      result.talks += talks
      result.deleted += deleted
    } catch (error) {
      console.error(
        `Review retention: failed for conference ${conferenceId}:`,
        error,
      )
    }
  }
  return result
}
