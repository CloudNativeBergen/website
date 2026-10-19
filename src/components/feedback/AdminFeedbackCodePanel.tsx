'use client'

import { useRef } from 'react'
import { QrCodeIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { FeedbackCodePanel } from './FeedbackCodePanel'
import { useWindowOnTheClock } from './useWindowOnTheClock'

/**
 * A talk's Feedback Code on its admin page (#1459). Viewing never mints: an
 * organizer presses Mint, so a room has a code to print whether or not its
 * speakers ever opened their page. A talk that is not a confirmed talk of
 * this conference shows nothing.
 */
export function AdminFeedbackCodePanel({
  talkId,
  title,
}: {
  talkId: string
  /** The talk's title, for the print sheet and the download file names. */
  title: string
}) {
  const utils = api.useUtils()
  // The Mint button goes once the code is minted: focus moves to the heading.
  const heading = useRef<HTMLHeadingElement>(null)
  const code = api.sessionFeedback.adminCode.useQuery(
    { talkId },
    { retry: false },
  )
  const mint = api.sessionFeedback.mintCode.useMutation({
    // No code back: the window closed meanwhile, or a release locks the
    // talk. Read again; a still-open window then means the release.
    onSuccess: (minted) => {
      void utils.sessionFeedback.mintPreview.invalidate()
      if (!minted.code) {
        void utils.sessionFeedback.adminCode.invalidate({ talkId })
        return
      }
      utils.sessionFeedback.adminCode.setData(
        { talkId },
        { ...minted, mayMint: false },
      )
      heading.current?.focus()
    },
    // No longer a talk that may hold a code: say so where the button was.
    onError: (error) => {
      if (error.data?.code === 'NOT_FOUND') heading.current?.focus()
    },
  })
  const refused = mint.error?.data?.code === 'NOT_FOUND'

  // An organizer may leave the page up through the session's start.
  const shownWindow = useWindowOnTheClock(code.data?.window)
  // The window may close while the page is up; the offer closes with it.
  const mayMint =
    !!code.data?.mayMint && shownWindow?.state !== 'closed' && !refused

  if (code.error?.data?.code === 'NOT_FOUND') return null

  return (
    <section
      aria-label="Feedback Code"
      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <h3
        ref={heading}
        tabIndex={-1}
        className="mb-3 flex items-center text-lg font-semibold text-gray-900 focus:outline-none dark:text-white"
      >
        <QrCodeIcon className="mr-2 size-5" aria-hidden="true" />
        Feedback Code
      </h3>
      <p className="sr-only" aria-live="polite">
        {mint.data?.code ? 'Feedback Code minted.' : ''}
      </p>
      {code.data?.code && code.data.url && shownWindow ? (
        <FeedbackCodePanel
          url={code.data.url}
          title={title}
          window={shownWindow}
          audience="organizer"
        />
      ) : code.data ? (
        <div className="space-y-3">
          {/* Live: a refused mint replaces the button with its reason here. */}
          <p
            aria-live="polite"
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            {refused
              ? 'This talk can no longer get a Feedback Code: it is not confirmed, or no speaker is left.'
              : !mayMint
                ? 'No Feedback Code: the feedback window has closed.'
                : mint.data && !mint.data.code
                  ? 'No code yet: a version of this talk waits in a scheduled release. Mint again once it is published.'
                  : 'No Feedback Code yet. The speakers get one when they open their talk; mint it now to print the sheet for the room.'}
          </p>
          {mayMint && (
            <button
              type="button"
              onClick={() => mint.mutate({ talkId })}
              disabled={mint.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              <QrCodeIcon className="size-4" aria-hidden="true" />
              {mint.isPending ? 'Minting…' : 'Mint Feedback Code'}
            </button>
          )}
          {mint.error && mayMint && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              The code could not be minted. Try again.
            </p>
          )}
        </div>
      ) : code.error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            The Feedback Code could not be loaded.
          </p>
          <button
            type="button"
            onClick={() => code.refetch()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Try again
          </button>
        </div>
      ) : (
        <div
          role="status"
          aria-label="Loading the Feedback Code"
          className="h-16 animate-pulse rounded bg-gray-100 dark:bg-gray-700"
        />
      )}
    </section>
  )
}
