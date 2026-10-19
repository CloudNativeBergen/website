'use client'

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
    : 'Your feedback appears here once your session is on the schedule.'
}

/**
 * The **Session Feedback** tab (speaker feedback spec §9.3). Asks the server
 * only once feedback is visible by the clock, and refreshes every 30 seconds
 * while the window is open, stopping when the speaker is idle or the tab is
 * in the background (`useIdlePolling`). The server decides visibility again
 * and filters hidden comments; a clock ahead of the server's just shows the
 * waiting line until the next refresh.
 */
export function SessionFeedbackResults({
  talkId,
  window,
}: {
  talkId: string
  /** The window on the clock (`useWindowOnTheClock`). */
  window: FeedbackWindow
}) {
  const visible = window.feedbackVisible
  const live = window.state === 'open'
  const refetchInterval = useIdlePolling({
    intervalMs: RESULTS_POLL_MS,
    enabled: visible && live,
    onResume: () => void refetch(),
  })
  const { data, error, refetch, isFetching } =
    api.sessionFeedback.results.useQuery(
      { talkId },
      { enabled: visible, refetchInterval },
    )

  if (!visible) return <Waiting window={window} />
  if (data && !data.visible) return <Waiting window={data.window} />
  if (data)
    return (
      <FeedbackResultsView
        totals={data.totals}
        comments={data.comments}
        live={live}
      />
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
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
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
