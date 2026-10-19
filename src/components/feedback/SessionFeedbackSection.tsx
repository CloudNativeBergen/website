'use client'

import { useEffect, useRef } from 'react'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { FeedbackCodePanel } from './FeedbackCodePanel'
import { useWindowOnTheClock } from './useWindowOnTheClock'

/**
 * The speaker's Session Feedback section (speaker feedback spec §9.1), shown
 * at the top of `/cfp/proposal/[id]` for a confirmed talk. Its code is minted
 * on mount by `sessionFeedback.ensureCode`, never during render.
 *
 * Only the **Feedback Code** tab exists so far, shown as the section's
 * heading; the **Session Feedback** results tab comes with F3, and with it a
 * real tab list. Until then a talk the server will not give a code (its
 * window closed before it ever had one) shows nothing.
 */
export function SessionFeedbackSection({
  talkId,
  title,
}: {
  talkId: string
  /** The talk's title, for the print sheet and the download file names. */
  title: string
}) {
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

  const shownWindow = useWindowOnTheClock(data?.window)

  if (error?.data?.code === 'NOT_FOUND') return null
  if (data && (!data.code || !data.url)) return null

  return (
    <section
      aria-label="Session Feedback"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-5 flex border-b border-gray-200 dark:border-gray-700">
        <h2 className="-mb-px inline-flex items-center gap-1.5 border-b-2 border-brand-cloud-blue px-1 pb-2 text-sm font-medium text-brand-cloud-blue dark:border-blue-400 dark:text-blue-400">
          <QrCodeIcon className="size-4" aria-hidden="true" />
          Feedback Code
        </h2>
      </div>
      <div>
        {data?.code && data.url && shownWindow ? (
          <FeedbackCodePanel
            url={data.url}
            title={title}
            window={shownWindow}
          />
        ) : error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              Your Feedback Code could not be loaded.
            </p>
            <button
              type="button"
              onClick={() => mutate({ talkId })}
              disabled={isPending}
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
  const bar = 'animate-pulse rounded bg-gray-100 dark:bg-gray-700'
  // The panel's shape, so the form below does not jump when the code arrives.
  return (
    <div
      role="status"
      className="flex flex-col gap-5 sm:flex-row sm:items-center"
    >
      <span className="sr-only">Loading your Feedback Code</span>
      <div className={`size-44 shrink-0 rounded-md ${bar}`} />
      <div className="w-full max-w-xl space-y-3">
        <div className={`h-5 w-3/4 ${bar}`} />
        <div className={`h-10 w-full ${bar}`} />
        <div className={`h-5 w-2/3 ${bar}`} />
        <div className={`h-8 w-28 ${bar}`} />
      </div>
    </div>
  )
}
