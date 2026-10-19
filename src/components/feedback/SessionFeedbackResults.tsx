'use client'

import { useEffect, useRef, useState } from 'react'
import type { FeedbackWindow } from '@/lib/feedback'
import { api } from '@/lib/trpc/client'
import { useIdlePolling } from '@/hooks/useIdlePolling'
import { formatSessionInstant } from '@/lib/time'
import { FeedbackResultsView } from './FeedbackResultsView'
import { useWindowOnTheClock } from './useWindowOnTheClock'

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
 * Once the server has answered, its window (on the clock) runs the
 * lifecycle, not the one the section loaded with: a session moved while the
 * page is open keeps polling until its new closing time.
 */
export function SessionFeedbackResults({
  talkId,
  window: loadedWindow,
  active,
}: {
  talkId: string
  /** The window the section loaded with, on the clock. */
  window: FeedbackWindow
  /** The results tab is the one shown. */
  active: boolean
}) {
  // The server's latest window, once it has answered: it runs the lifecycle.
  const [serverWindow, setServerWindow] = useState<FeedbackWindow>()
  const current = useWindowOnTheClock(serverWindow) ?? loadedWindow
  const visible = current.feedbackVisible
  const live = current.state === 'open'

  const refetchInterval = useIdlePolling({
    intervalMs: RESULTS_POLL_MS,
    enabled: active && visible && live,
    onResume: () => void refetch(),
  })
  // Asked for once the loaded window turns visible; after that the server's
  // answer decides what shows.
  const { data, error, refetch, isFetching } =
    api.sessionFeedback.results.useQuery(
      { talkId },
      { enabled: loadedWindow.feedbackVisible, refetchInterval },
    )
  useEffect(() => {
    if (data) setServerWindow(data.window)
  }, [data])

  // Polling stops when the window closes (or never ran while the session
  // was moved later), so fetch once on each change that matters: the final
  // counts at close, the first results once visible.
  const previous = useRef({ live, visible })
  useEffect(() => {
    const was = previous.current
    previous.current = { live, visible }
    if (!loadedWindow.feedbackVisible) return
    if ((was.live && !live) || (!was.visible && visible)) void refetch()
  }, [live, visible, loadedWindow.feedbackVisible, refetch])

  if (!loadedWindow.feedbackVisible) return <Waiting window={loadedWindow} />
  if (data && !data.visible) return <Waiting window={current} />
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
