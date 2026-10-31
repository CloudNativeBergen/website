# Migration 058: Backfill talk review summaries

## NOT RUN

## What and why

The daily `cleanup-notifications` cron deletes a conference's reviews 24 months
after it ends. In the same transaction it writes their count and averages to
`talk.reviewSummary` with `foldedAt` set. Readers then show live reviews plus
the folded summary.

This migration writes the same summary, without `foldedAt`, to every talk of an
ended conference that has reviews. It deletes nothing. Readers ignore a summary
without `foldedAt` while the reviews still exist, so nothing is counted twice.
The summary gives an early record and a way to check the numbers before the
cron starts deleting.

Talks whose summary is already folded are skipped. Every patch carries
`ifRevision`.

## Run

```sh
npx sanity migration run 058-review-summary-backfill            # dry run
npx sanity migration run 058-review-summary-backfill --no-dry-run
```

Undo: unset `reviewSummary` on talks where `!defined(reviewSummary.foldedAt)`.
