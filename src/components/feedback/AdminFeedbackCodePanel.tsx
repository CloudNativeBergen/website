'use client'

import { useRef, useState } from 'react'
import { ArrowPathIcon, QrCodeIcon } from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { api } from '@/lib/trpc/client'
import { FeedbackCodePanel } from './FeedbackCodePanel'
import { useWindowOnTheClock } from './useWindowOnTheClock'

/**
 * The confirmation before a rotation, word for word (speaker feedback spec
 * §10.4).
 */
export const rotateMessage = (code: string) =>
  `/f/${code} stops working now. Printed sheets and slides showing it will reach a dead page. Existing responses are kept.`

/**
 * A talk's Feedback Code on its admin page (#1459). Viewing never mints: an
 * organizer presses Mint, so a room has a code to print whether or not its
 * speakers ever opened their page. Rotate replaces a code (§10.4), offered
 * only where the server says it would rotate. A talk that is not a confirmed
 * talk of this conference shows nothing.
 */
export function AdminFeedbackCodePanel({
  talkId,
  title,
  embedded = false,
}: {
  talkId: string
  /** The talk's title, for the print sheet and the download file names. */
  title: string
  /** Inside another panel: no card of its own. */
  embedded?: boolean
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
        // A code was minted, so §5 would mint now: it may be rotated.
        { ...minted, mayMint: false, mayRotate: true },
      )
      heading.current?.focus()
    },
    // No longer a talk that may hold a code: say so where the button was.
    onError: (error) => {
      if (error.data?.code === 'NOT_FOUND') heading.current?.focus()
    },
  })
  const refused = mint.error?.data?.code === 'NOT_FOUND'

  const [asking, setAsking] = useState(false)
  const rotate = api.sessionFeedback.rotateCode.useMutation({
    onSuccess: (rotated) => {
      utils.sessionFeedback.adminCode.setData(
        { talkId },
        { ...rotated, mayMint: false, mayRotate: true },
      )
      // Focus goes back to Rotate as the dialog closes; the live region
      // says the code changed.
      setAsking(false)
    },
    // Refused (no longer rotatable) or a release in the way: read again, so
    // the offer goes if it should, and say why where the button was.
    onError: (error) => {
      setAsking(false)
      if (error.data?.code === 'NOT_FOUND' || error.data?.code === 'CONFLICT')
        void utils.sessionFeedback.adminCode.invalidate({ talkId })
    },
  })

  // An organizer may leave the page up through the session's start.
  const shownWindow = useWindowOnTheClock(code.data?.window)
  // The window may close while the page is up; the offer closes with it.
  const mayMint =
    !!code.data?.mayMint && shownWindow?.state !== 'closed' && !refused
  const mayRotate = !!code.data?.mayRotate && shownWindow?.state !== 'closed'

  if (code.error?.data?.code === 'NOT_FOUND') return null

  return (
    <section
      aria-label="Feedback Code"
      className={
        embedded
          ? ''
          : 'rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800'
      }
    >
      <h3
        ref={heading}
        tabIndex={-1}
        className={`mb-3 flex items-center font-semibold text-gray-900 focus:outline-none dark:text-white ${embedded ? 'text-sm' : 'text-lg'}`}
      >
        <QrCodeIcon className="mr-2 size-5" aria-hidden="true" />
        Feedback Code
      </h3>
      <p className="sr-only" aria-live="polite">
        {rotate.data?.code
          ? `Feedback Code rotated. The new code is ${rotate.data.code}.`
          : mint.data?.code
            ? 'Feedback Code minted.'
            : ''}
      </p>
      {code.data?.code && code.data.url && shownWindow ? (
        <div className="space-y-3">
          <FeedbackCodePanel
            url={code.data.url}
            title={title}
            window={shownWindow}
            audience="organizer"
          />
          {mayRotate && (
            <button
              type="button"
              onClick={() => {
                rotate.reset()
                setAsking(true)
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowPathIcon className="size-4" aria-hidden="true" />
              Rotate Feedback Code
            </button>
          )}
          {rotate.error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {rotate.error.data?.code === 'NOT_FOUND'
                ? 'This code can no longer be rotated: the feedback window has closed, or the talk changed.'
                : rotate.error.data?.code === 'CONFLICT'
                  ? rotate.error.message
                  : 'The code could not be rotated. Try again.'}
            </p>
          )}
          <ConfirmationModal
            isOpen={asking}
            onClose={() => {
              if (!rotate.isPending) setAsking(false)
            }}
            onConfirm={() => rotate.mutate({ talkId, code: code.data!.code! })}
            title="Rotate Feedback Code?"
            message={rotateMessage(code.data.code)}
            confirmButtonText="Rotate"
            variant="danger"
            isLoading={rotate.isPending}
            guardSecondTap
          />
        </div>
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
