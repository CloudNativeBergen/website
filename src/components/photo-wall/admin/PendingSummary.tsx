'use client'

import { countByTab } from '@/lib/photo-wall'
import { api } from '@/lib/trpc/client'
import { MODERATION_QUEUE_ID, revealPendingTab } from './ModerationQueue'

/**
 * The live pending count at the top of `/admin/photo-wall` (Photo Wall spec
 * §10), from the polled queue: the SAME query as {@link ModerationQueue}, so
 * React Query shares one cache entry and one poll. This observer sets no
 * interval of its own; the queue's, mounted beside it, drives the reads.
 */
export function PendingSummary() {
  const queue = api.photoWall.moderationQueue.useQuery()
  return (
    <PendingSummaryView
      pending={queue.data ? countByTab(queue.data.posts).pending : undefined}
    />
  )
}

export interface PendingSummaryViewProps {
  /** Posts waiting for approval; undefined until the first read answers. */
  pending?: number
}

export function PendingSummaryView({ pending }: PendingSummaryViewProps) {
  const waiting = pending !== undefined && pending > 0
  const text =
    pending === undefined
      ? ''
      : pending === 0
        ? 'Nothing waiting for approval'
        : `${pending} ${pending === 1 ? 'photo' : 'photos'} waiting`
  return (
    <div
      data-testid="pending-summary"
      className={`flex flex-wrap items-center gap-x-2 text-sm ${
        waiting
          ? 'rounded-lg bg-amber-50 px-3 py-1 font-medium text-amber-900 ring-1 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/30'
          : 'text-gray-600 dark:text-gray-400'
      }`}
    >
      {/* The page's one live region for the count: each poll that changes it
          is announced without interrupting. Not `role="status"`: the
          Settings card's "Saving…" is the page's one status. */}
      <p aria-live="polite" aria-atomic="true" className="py-1.5">
        {text}
      </p>
      {waiting && (
        <>
          <span aria-hidden="true">·</span>
          <a
            href={`#${MODERATION_QUEUE_ID}`}
            onClick={(event) => {
              // By hand rather than a hash navigation: the Pending tab must
              // be selected too, and the URL stays the page's.
              event.preventDefault()
              revealPendingTab()
            }}
            className="rounded-sm py-1.5 font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:focus-visible:outline-indigo-400"
          >
            Review
          </a>
        </>
      )}
    </div>
  )
}
