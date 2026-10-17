'use client'

import { useEffect, useRef } from 'react'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { FeedbackCodePanel } from './FeedbackCodePanel'

/**
 * The speaker's Session Feedback section (speaker feedback spec §9.1), shown
 * at the top of `/cfp/proposal/[id]` for a confirmed talk. Its code is minted
 * on mount by `sessionFeedback.ensureCode`, never during render.
 *
 * Only the **Feedback Code** tab exists so far; the **Session Feedback**
 * results tab comes with F3. Until then a talk the server will not give a
 * code (its window closed before it ever had one) shows nothing.
 */
export function SessionFeedbackSection({ talkId }: { talkId: string }) {
  const { mutate, data, error, isPending, isIdle } =
    api.sessionFeedback.ensureCode.useMutation()

  // Once per talk, also under Strict Mode's double effect run. A second call
  // would only return the same code, but costs a request.
  const requested = useRef<string | null>(null)
  useEffect(() => {
    if (requested.current === talkId) return
    requested.current = talkId
    mutate({ talkId })
  }, [mutate, talkId])

  if (error?.data?.code === 'NOT_FOUND') return null
  if (data && (!data.code || !data.url)) return null

  return (
    <section
      aria-labelledby="session-feedback-heading"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800"
    >
      <h2 id="session-feedback-heading" className="sr-only">
        Session Feedback
      </h2>
      <div
        role="tablist"
        aria-label="Session Feedback"
        className="mb-5 flex gap-6 border-b border-gray-200 dark:border-gray-700"
      >
        <button
          type="button"
          role="tab"
          id="session-feedback-tab-code"
          aria-selected="true"
          aria-controls="session-feedback-panel-code"
          className="-mb-px inline-flex items-center gap-1.5 border-b-2 border-brand-cloud-blue px-1 pb-2 text-sm font-medium text-brand-cloud-blue dark:border-blue-400 dark:text-blue-400"
        >
          <QrCodeIcon className="size-4" aria-hidden="true" />
          Feedback Code
        </button>
      </div>
      <div
        role="tabpanel"
        id="session-feedback-panel-code"
        aria-labelledby="session-feedback-tab-code"
      >
        {data?.code && data.url ? (
          <FeedbackCodePanel url={data.url} window={data.window} />
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-red-700 dark:text-red-400">
              Your Feedback Code could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => mutate({ talkId })}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Try again
            </button>
          </div>
        ) : (
          (isPending || isIdle) && <FeedbackCodeSkeleton />
        )}
      </div>
    </section>
  )
}

function FeedbackCodeSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 sm:flex-row sm:items-center"
      aria-busy="true"
      aria-label="Loading your Feedback Code"
    >
      <div className="size-44 shrink-0 animate-pulse rounded-md bg-gray-100 dark:bg-gray-700" />
      <div className="w-full max-w-md space-y-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
      </div>
    </div>
  )
}
