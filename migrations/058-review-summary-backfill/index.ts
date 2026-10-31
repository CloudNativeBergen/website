import { defineMigration, at, patch, set } from 'sanity/migrate'
import { summarizeReviews } from '../../src/lib/review/summary'
import { osloTodayDateString } from '../../src/lib/time'

/**
 * Writes `talk.reviewSummary` for every talk of a conference that has ended,
 * from its current reviews. Deletes nothing.
 *
 * The summary has no `foldedAt`, so readers keep using the live reviews and
 * never count them twice. The daily cleanup cron sets `foldedAt` when it
 * deletes the reviews, 24 months after the conference ends. Talks whose
 * summary is already folded are skipped. Each patch carries `ifRevision`.
 *
 * Dry run by default (`sanity migration run 058-review-summary-backfill`);
 * add `--no-dry-run` to write.
 */

interface Doc {
  _id: string
  _rev: string
  _type: string
  endDate?: string
  conference?: { _ref?: string }
  proposal?: { _ref?: string }
  score?: { content: number; relevance: number; speaker: number }
  reviewSummary?: { foldedAt?: string } | null
}

export default defineMigration({
  title: 'Backfill talk review summaries',
  description:
    'Stores review count and averages on talks of ended conferences. Deletes nothing.',
  documentTypes: ['conference', 'talk', 'review'],

  async *migrate(documents) {
    const today = osloTodayDateString()
    const ended = new Set<string>()
    const talks: Doc[] = []
    const reviews = new Map<string, Doc[]>()
    for await (const raw of documents()) {
      const doc = raw as unknown as Doc
      if (doc._type === 'conference' && doc.endDate && doc.endDate < today)
        ended.add(doc._id)
      if (doc._type === 'talk' && !doc._id.startsWith('drafts.'))
        talks.push(doc)
      if (doc._type === 'review' && doc.proposal?._ref) {
        const own = reviews.get(doc.proposal._ref) ?? []
        own.push(doc)
        reviews.set(doc.proposal._ref, own)
      }
    }

    let written = 0
    for (const talk of talks) {
      const own = reviews.get(talk._id)
      if (!own?.length || !ended.has(talk.conference?._ref ?? '')) continue
      if (talk.reviewSummary?.foldedAt) continue
      const summary = summarizeReviews(own)
      console.log(
        `  ✓ ${talk._id} ${summary.count} reviews, total ${summary.total}`,
      )
      yield patch(talk._id, [at('reviewSummary', set(summary))], {
        ifRevision: talk._rev,
      })
      written++
    }
    console.log(`\n=== Summary: ${written} talks get a review summary ===`)
  },
})
