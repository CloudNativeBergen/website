'use client'

import { useEffect, useState } from 'react'
import { countByTab } from '@/lib/photo-wall'
import { formatConferenceClock } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import { MODERATION_QUEUE_ID, revealPendingTab } from './ModerationQueue'
import { MODERATION_POLL_MS } from './polling'

/** A count older than this has missed two polls: a hung or lost read. */
const STALE_AFTER_MS = 2 * MODERATION_POLL_MS

/** The clock, re-read every poll interval, so a read that never answers shows. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MODERATION_POLL_MS)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * The live pending count at the top of `/admin/photo-wall` (Photo Wall spec
 * §10), from the polled queue: the SAME query as {@link ModerationQueue}, so
 * React Query shares one cache entry and one poll. This observer sets no
 * interval of its own; the queue's, mounted beside it, drives the reads.
 */
export function PendingSummary() {
  const queue = api.photoWall.moderationQueue.useQuery()
  const now = useNow()
  // Not current: the last read failed, is waiting for the network
  // (`paused`), or has not answered for two polls. "Nothing waiting" must
  // never stand as an all-clear it can no longer vouch for.
  const notCurrent =
    queue.isError ||
    queue.fetchStatus === 'paused' ||
    now - queue.dataUpdatedAt > STALE_AFTER_MS
  return (
    <PendingSummaryView
      pending={queue.data ? countByTab(queue.data.posts).pending : undefined}
      staleSince={
        queue.data && notCurrent
          ? new Date(queue.dataUpdatedAt).toISOString()
          : undefined
      }
      failed={!queue.data && (queue.isError || queue.fetchStatus === 'paused')}
    />
  )
}

export interface PendingSummaryViewProps {
  /** Posts waiting for approval; undefined until the first read answers. */
  pending?: number
  /** When the count is not current: the time of the last read that answered. */
  staleSince?: string
  /** No count at all: the first read failed or is waiting for the network. */
  failed?: boolean
}

export function PendingSummaryView({
  pending,
  staleSince,
  failed = false,
}: PendingSummaryViewProps) {
  const waiting = pending !== undefined && pending > 0
  const text =
    pending === undefined
      ? failed
        ? 'Couldn’t load the count. Trying again…'
        : ''
      : pending === 0
        ? 'Nothing waiting for approval'
        : `${pending} ${pending === 1 ? 'photo' : 'photos'} waiting`
  return (
    <div
      data-testid="pending-summary"
      className={`flex flex-wrap items-start gap-x-2 text-sm ${
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
        {pending !== undefined && staleSince && (
          <span className="block text-xs font-normal text-red-700 dark:text-red-300">
            Not updated since {formatConferenceClock(staleSince)}
          </span>
        )}
      </p>
      {waiting && (
        <>
          <span aria-hidden="true" className="py-1.5">
            ·
          </span>
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
