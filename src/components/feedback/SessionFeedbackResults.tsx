'use client'

import { useEffect, useRef } from 'react'
import type { FeedbackWindow } from '@/lib/feedback'
import { api } from '@/lib/trpc/client'
import { useIdlePolling } from '@/hooks/useIdlePolling'
import { formatSessionInstant } from '@/lib/time'
import { FeedbackResultsView } from './FeedbackResultsView'

/** How often the results refresh while the window is open (§9.3). */
const RESULTS_POLL_MS = 30_000

/** Before feedback is visible (§9.3), worded from the window. */
function waitingText(window: FeedbackWindow) {
  return window.lastSlotEnd
    ? `Your feedback appears here when your session ends (${formatSessionInstant(window.lastSlotEnd)}).`
    : 'Your feedback appears here once your session is on the schedule and has ended, or when the conference is over.'
}

const RETRY_BUTTON =
  'rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'

/**
 * The **Session Feedback** tab (speaker feedback spec §9.3). Asks the server
 * only once feedback is visible by the clock, and refreshes every 30 seconds
 * while the window is open and the tab is shown, stopping when the speaker
 * is idle or the browser tab is in the background (`useIdlePolling`). The
 * server decides visibility again and filters hidden comments.
 *
 * Once the server has answered, its window runs the lifecycle (the section
 * shows it on the clock): a session moved while the page is open keeps
 * polling until its new closing time.
 */
export function SessionFeedbackResults({
  talkId,
  window,
  active,
  onWindow,
}: {
  talkId: string
  /**
   * The window on the clock: the server's latest from these results once
   * there is one (reported through `onWindow`), else the section's.
   */
  window: FeedbackWindow
  /** The results tab is the one shown. */
  active: boolean
  onWindow: (window: FeedbackWindow) => void
}) {
  const visible = window.feedbackVisible
  const live = window.state === 'open'

  const refetchInterval = useIdlePolling({
    intervalMs: RESULTS_POLL_MS,
    enabled: active && visible && live,
    // Back from idle, or to this tab: refresh only what has gone stale.
    onResume: () => {
      if (isStale) void refetch({ cancelRefetch: false })
    },
  })
  const { data, dataUpdatedAt, error, refetch, isFetching, isStale } =
    api.sessionFeedback.results.useQuery(
      { talkId },
      // An answer cached before this mount may predate the window the
      // section just loaded: always ask again on mount.
      { enabled: visible, refetchInterval, refetchOnMount: 'always' },
    )
  // Only an answer fetched since this mount may replace the section's
  // window; an older cached one would bring back a superseded window.
  const mountedAt = useRef(Infinity)
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])
  useEffect(() => {
    if (data && dataUpdatedAt >= mountedAt.current) onWindow(data.window)
  }, [data, dataUpdatedAt, onWindow])

  // Polling stops when the window closes (or never ran while the session
  // was moved later), so fetch once on each change that matters. At close,
  // a fresh request: a poll still in flight was sent before the deadline
  // and may miss its last answers. Once visible, `cancelRefetch: false`
  // joins the fetch that enabling the query already started.
  const previous = useRef({ live, visible })
  useEffect(() => {
    const was = previous.current
    previous.current = { live, visible }
    if (was.live && !live && visible) void refetch()
    else if (!was.visible && visible) void refetch({ cancelRefetch: false })
  }, [live, visible, refetch])

  if (!visible) return <Waiting window={window} />
  if (data && !data.visible) return <Waiting window={data.window} />
  if (data)
    return (
      <div className="space-y-4">
        {error && (
          // A failed refresh keeps what was loaded, and says so.
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-sm text-red-700 dark:text-red-400">
              Could not refresh. Showing the results loaded earlier.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              aria-disabled={isFetching}
              className={RETRY_BUTTON}
            >
              Try again
            </button>
          </div>
        )}
        <FeedbackResultsView
          totals={data.totals}
          comments={data.comments}
          live={live}
        />
      </div>
    )
  if (error)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Your Session Feedback could not be loaded.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          aria-disabled={isFetching}
          className={RETRY_BUTTON}
        >
          Try again
        </button>
      </div>
    )
  return <ResultsSkeleton />
}

function Waiting({ window }: { window: FeedbackWindow }) {
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300">
      {waitingText(window)}
    </p>
  )
}

function ResultsSkeleton() {
  const bar = 'animate-pulse rounded bg-gray-100 dark:bg-gray-700'
  return (
    <div role="status" className="space-y-5">
      <span className="sr-only">Loading your Session Feedback</span>
      <div className={`h-5 w-48 ${bar}`} />
      <div className={`h-3 w-full rounded-full ${bar}`} />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className={`h-20 ${bar}`} />
        <div className={`h-20 ${bar}`} />
        <div className={`h-20 ${bar}`} />
      </div>
    </div>
  )
}
