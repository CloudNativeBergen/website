'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/trpc/client'
import { removeInRequests } from '@/lib/feedback/bulk-remove'
import type { TriageFilter } from '@/lib/feedback/triage'
import { AdminFeedbackCodePanel } from '../AdminFeedbackCodePanel'
import { TalkFeedbackPanel } from './TalkFeedbackPanel'

/**
 * `/admin/proposals/[id]`'s Session Feedback (speaker feedback spec §10.2):
 * reads `sessionFeedback.adminTalk` and wires Card Counts, Hide, Unhide and
 * Remove. Each action resolves once the talk has been read again. A talk
 * that is not one of this conference's shows nothing.
 */
/** How long "Refreshed." stays in the live region after a Retry. */
const REFRESHED_MS = 4000

export function TalkFeedbackAdminPanel({
  talkId,
  title,
  showCode,
}: {
  talkId: string
  title: string
  /** The Feedback Code section: confirmed talks, once codes are live. */
  showCode: boolean
}) {
  const utils = api.useUtils()
  // The triage tile pressed (Content judgement spec §8.2): the server
  // filters, so a tile is a new read; the list it replaces stays on screen
  // until the new one lands.
  const [filter, setFilter] = useState<TriageFilter | null>(null)
  const feedback = api.sessionFeedback.adminTalk.useQuery(
    { talkId, filter: filter ?? undefined },
    { retry: false, placeholderData: keepPreviousData },
  )
  // `/admin/feedback` holds the same responses and totals: a visit there
  // after acting here must not show what this page just changed.
  const refresh = {
    onSettled: () =>
      Promise.all([
        utils.sessionFeedback.adminTalk.invalidate({ talkId }),
        utils.sessionFeedback.adminOverview.invalidate(),
        // The nav badge: a Keep, Hide or Remove here can clear a flag.
        utils.sessionFeedback.flaggedCount.invalidate(),
      ]),
  }
  const hide = api.sessionFeedback.adminHide.useMutation(refresh)
  const unhide = api.sessionFeedback.adminUnhide.useMutation(refresh)
  const remove = api.sessionFeedback.adminRemove.useMutation(refresh)
  const keep = api.sessionFeedback.adminKeep.useMutation(refresh)
  const cards = api.proposal.admin.updateAudienceFeedback.useMutation(refresh)
  // Saved Card Counts' time is up: read the talk again. Stable, so the
  // panel's timer is never restarted by this component's re-renders.
  const { refetch } = feedback
  const readAgain = useCallback(
    async () => !(await refetch()).isError,
    [refetch],
  )
  // A Retry that worked takes the Retry button away: say so, and put
  // focus where the numbers are, not on <body>.
  const heading = useRef<HTMLHeadingElement>(null)
  const [refreshed, setRefreshed] = useState(false)
  useEffect(() => {
    if (!refreshed) return
    const timer = setTimeout(() => setRefreshed(false), REFRESHED_MS)
    return () => clearTimeout(timer)
  }, [refreshed])

  // The Feedback Code stands on its own while the feedback read is not
  // there: an organizer can still print, mint or rotate.
  const ownCode = showCode ? (
    <AdminFeedbackCodePanel talkId={talkId} title={title} />
  ) : null

  // Not a talk of this conference: the code panel refuses the same way.
  if (feedback.error?.data?.code === 'NOT_FOUND') return ownCode
  if (!feedback.data)
    return (
      <div className="space-y-4">
        {feedback.error ? (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              Session Feedback could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => feedback.refetch()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            role="status"
            aria-label="Loading Session Feedback"
            className="h-48 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
          />
        )}
        {ownCode}
      </div>
    )

  // A refetch after an action failed: React Query keeps the earlier data,
  // so say the numbers are earlier ones (as /admin/feedback does).
  const stale = feedback.isError
  return (
    <div className="space-y-2">
      {/* Always mounted: words set in a live region are announced. */}
      <div
        className={
          stale
            ? 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200'
            : 'sr-only'
        }
      >
        <p role="status" aria-live="polite">
          {stale
            ? feedback.isFetching
              ? 'Refreshing…'
              : 'Couldn’t refresh, showing earlier numbers.'
            : refreshed
              ? 'Refreshed.'
              : ''}
        </p>
        {stale && (
          <button
            type="button"
            aria-disabled={feedback.isFetching}
            onClick={() => {
              if (feedback.isFetching) return
              setRefreshed(false)
              void feedback.refetch().then((result) => {
                if (result.isError) return
                setRefreshed(true)
                heading.current?.focus()
              })
            }}
            className="min-h-9 rounded-md px-3 font-semibold hover:bg-yellow-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-700 aria-disabled:cursor-wait aria-disabled:opacity-60 dark:hover:bg-yellow-900/40"
          >
            Retry
          </button>
        )}
      </div>
      <TalkFeedbackPanel
        feedback={feedback.data}
        code={
          showCode ? (
            <AdminFeedbackCodePanel talkId={talkId} title={title} embedded />
          ) : undefined
        }
        onSaveCards={async (c) => {
          const saved = await cards.mutateAsync({
            id: talkId,
            feedback: {
              greenCount: c.green,
              yellowCount: c.yellow,
              redCount: c.red,
            },
          })
          // The talk as the commit returned it: when, and which write. The
          // panel keeps the counts on screen until a read includes it.
          const talk = saved as { _updatedAt?: unknown; _rev?: unknown } | null
          return {
            updatedAt:
              typeof talk?._updatedAt === 'string' ? talk._updatedAt : null,
            rev: typeof talk?._rev === 'string' ? talk._rev : null,
          }
        }}
        onHide={(id) => hide.mutateAsync({ responseIds: [id] })}
        onUnhide={(id) => unhide.mutateAsync({ responseIds: [id] })}
        onKeep={(c) => keep.mutateAsync({ responseId: c.id, rev: c.rev })}
        headingRef={heading}
        onCardsExpired={readAgain}
        filter={filter}
        onFilterChange={setFilter}
        onRemove={(request) =>
          removeInRequests(request, (chunk) => remove.mutateAsync(chunk))
        }
      />
    </div>
  )
}
