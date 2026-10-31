import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { lockRevision } from '@/lib/feedback/talk-versions'
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
 * Per conference, ONE transaction: set the summary on the talk (published and
 * draft, each guarded by `ifRevisionId`), guard every review by its revision,
 * then delete the reviews. A concurrent edit fails the guard and the whole
 * transaction, so a review is never deleted without being counted, and is
 * never counted twice: the summary is absolute (folded base + these reviews).
 *
 * Bounded to about {@link MAX_REVIEWS_PER_RUN} reviews per run (whole talks
 * only). A failing conference is logged and skipped.
 *
 * ponytail: talks in a Content Release version are not patched; publishing
 * such a version would drop the summary. Add versions here (as
 * `src/lib/feedback/fold.ts` does) if releases ever carry old talks.
 */
const MAX_REVIEWS_PER_RUN = 200

interface TalkDoc {
  _id: string
  _rev: string
  reviewSummary?: ReviewSummary | null
}

interface ReviewDoc {
  _id: string
  _rev: string
  talk: string
  score?: { content: number; relevance: number; speaker: number } | null
}

export interface FoldPlan {
  talks: { docs: TalkDoc[]; summary: ReviewSummary }[]
  reviews: ReviewDoc[]
}

/**
 * Pure: which talks fold, with what summary, and which reviews go, within
 * `budget` reviews (always at least one whole talk).
 */
export function planReviewFold(
  talkDocs: TalkDoc[],
  reviews: ReviewDoc[],
  budget: number,
  now: Date,
): FoldPlan {
  const byTalk = new Map<string, ReviewDoc[]>()
  for (const r of reviews) {
    byTalk.set(r.talk, [...(byTalk.get(r.talk) ?? []), r])
  }
  const plan: FoldPlan = { talks: [], reviews: [] }
  for (const [talkId, own] of byTalk) {
    const published = talkDocs.find((t) => t._id === talkId)
    if (!published) continue // no published talk to keep the summary on
    if (plan.reviews.length > 0 && plan.reviews.length + own.length > budget)
      break
    const draft = talkDocs.find((t) => t._id === `drafts.${talkId}`)
    plan.talks.push({
      docs: draft ? [published, draft] : [published],
      summary: {
        ...summarizeReviews(own, published.reviewSummary),
        foldedAt: now.toISOString(),
      },
    })
    plan.reviews.push(...own)
  }
  return plan
}

export async function foldExpiredReviews(
  dryRun = false,
): Promise<{ talks: number; deleted: number }> {
  const cutoff = osloMonthsCutoff(REVIEW_RETENTION_MONTHS)
  const conferences =
    (await clientReadUncached.fetch<{ _id: string }[]>(
      // groq-global: platform RETENTION CRON — enumerates every tenant's
      // conferences past the review horizon by design; each fold below is
      // scoped to that one conference.
      `*[_type == "conference" && defined(endDate) && endDate < $cutoff]{ _id }`,
      { cutoff },
      { cache: 'no-store' },
    )) ?? []

  const result = { talks: 0, deleted: 0 }
  for (const { _id: conferenceId } of conferences) {
    const budget = MAX_REVIEWS_PER_RUN - result.deleted
    if (budget <= 0) break
    try {
      // Published and draft talks of this conference.
      const talkDocs =
        (await scopedFetch<TalkDoc[]>(
          clientReadUncached,
          { conferenceId },
          `*[_type == "talk"]{ _id, _rev, reviewSummary }`,
          {},
          { cache: 'no-store' },
        )) ?? []
      const talkIds = talkDocs
        .map((t) => t._id)
        .filter((id) => !id.startsWith('drafts.'))
      if (talkIds.length === 0) continue
      const reviews =
        (await clientReadUncached.fetch<ReviewDoc[]>(
          // groq-global-scoped: `$talkIds` is the id set of ONE conference's
          // talks, read via the scopedFetch above.
          `*[_type == "review" && proposal._ref in $talkIds]{ _id, _rev, "talk": proposal._ref, score }`,
          { talkIds },
          { cache: 'no-store' },
        )) ?? []
      const plan = planReviewFold(talkDocs, reviews, budget, new Date())
      if (plan.reviews.length === 0) continue
      if (!dryRun) {
        const tx = clientWrite.transaction()
        for (const { docs, summary } of plan.talks) {
          for (const doc of docs) {
            tx.patch(doc._id, (p) =>
              p.ifRevisionId(doc._rev).set({ reviewSummary: summary }),
            )
          }
        }
        for (const r of plan.reviews) {
          tx.patch(r._id, (p) => lockRevision(p, r._rev))
          tx.delete(r._id)
        }
        await tx.commit()
      }
      result.talks += plan.talks.length
      result.deleted += plan.reviews.length
    } catch (error) {
      console.error(
        `Review retention: failed for conference ${conferenceId}:`,
        error,
      )
    }
  }
  return result
}
