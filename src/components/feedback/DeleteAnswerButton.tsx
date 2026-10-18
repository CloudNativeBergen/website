'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'
import {
  CONTROL_BORDER,
  SECONDARY_BUTTON,
  Status,
  type DeleteAnswer,
  type DeleteNotice,
  type StatusLine,
} from './answers'
import { useOneAtATime, type RunAction } from './useOneAtATime'

export const DELETE_FAILED = "We couldn't delete your answer. Please try again."

/**
 * Delete my answer (speaker feedback spec §7.4), under whichever
 * one-at-a-time guard the caller holds. A failed delete keeps the page as it
 * is and reports; anything else replaces the page, and only a delete the
 * server confirmed is announced as one: a refusal (an expired cookie, a
 * rotated code) shows the page's current state with a neutral line that
 * tells nothing about why.
 */
export async function eraseAnswer({
  run,
  remove,
  onDelete,
  onFailed,
}: {
  run: RunAction
  remove: DeleteAnswer
  onDelete: (next: AttendeeFeedbackState, notice: DeleteNotice) => void
  onFailed: () => void
}) {
  const next = await run(remove, {
    deleted: false,
    page: { state: 'unavailable' },
  })
  if (!next) return
  if (next.page.state === 'unavailable') onFailed()
  else onDelete(next.page, next.deleted ? 'deleted' : 'nothing-to-delete')
}

function DeleteButton({
  pending,
  onClick,
  ref,
}: {
  pending: boolean
  onClick: () => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-disabled={pending}
      onClick={onClick}
      className={`${SECONDARY_BUTTON} text-red-700 dark:text-red-400`}
    >
      <TrashIcon className="size-5" aria-hidden="true" />
      Delete my answer
    </button>
  )
}

/**
 * Delete my answer in two steps, inline: the button, then a confirmation
 * with Delete and Cancel. The comment goes with the answer and cannot be
 * recovered, so one tap near the thumb's resting zone must not be enough.
 * Focus moves to Cancel when the confirmation opens (a second tap of the
 * same spot deletes nothing) and back to the button ONLY when Cancel or
 * Escape closed it; an action taken elsewhere that closes it keeps its own
 * focus. No modal.
 *
 * `pending` is the page's shared one-at-a-time flag (every control is
 * `aria-disabled` under it); `deleting` is this control's own delete in
 * flight, the only thing that spins here.
 */
export function DeleteControl({
  pending,
  deleting,
  hasComment,
  confirming,
  onConfirmingChange,
  onConfirm,
  error,
}: {
  pending: boolean
  deleting: boolean
  /** Known only on Answered; the wording says what goes. */
  hasComment: boolean | null
  confirming: boolean
  onConfirmingChange: (confirming: boolean) => void
  onConfirm: () => void
  /** A failed delete, shown inside the confirmation above its buttons. */
  error: StatusLine | null
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  // Set by Cancel and Escape only: the trigger takes focus back when the
  // confirmation they closed has gone.
  const returnFocus = useRef(false)
  const questionId = useId()

  useEffect(() => {
    if (confirming) {
      cancel.current?.focus()
    } else if (returnFocus.current) {
      returnFocus.current = false
      trigger.current?.focus()
    }
  }, [confirming])

  const dismiss = () => {
    if (pending) return
    returnFocus.current = true
    onConfirmingChange(false)
  }

  if (!confirming) {
    return (
      <DeleteButton
        ref={trigger}
        pending={pending}
        onClick={() => {
          if (!pending) onConfirmingChange(true)
        }}
      />
    )
  }
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      aria-busy={deleting}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          dismiss()
        }
      }}
      className={`w-full rounded-lg ${CONTROL_BORDER} px-4 py-4 text-center`}
    >
      <p id={questionId} className="text-sm font-medium">
        {hasComment === true
          ? 'Delete your answer and comment? This can’t be undone.'
          : hasComment === false
            ? 'Delete your answer? This can’t be undone.'
            : 'Delete your answer and any comment? This can’t be undone.'}
      </p>
      <Status status={error} className="mt-2" />
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          aria-disabled={pending}
          onClick={() => {
            if (!pending) onConfirm()
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:bg-red-600 dark:focus-visible:outline-white"
        >
          {deleting && (
            <ArrowPathIcon
              className="size-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          ref={cancel}
          type="button"
          aria-disabled={pending}
          onClick={dismiss}
          className={SECONDARY_BUTTON}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Delete my answer on Closed and Not yet open (§7.4, R1): the talk is in the
 * cookie's list, so there may be an answer to delete. Holds its own guard:
 * it is the only action on those pages.
 */
export function DeleteAnswerButton({
  remove,
  onDelete,
}: {
  remove: DeleteAnswer
  onDelete: (next: AttendeeFeedbackState, notice: DeleteNotice) => void
}) {
  const [status, setStatus] = useState<StatusLine | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { pending, run } = useOneAtATime()
  return (
    <div className="mt-8 flex flex-col items-center">
      <DeleteControl
        pending={pending}
        deleting={pending}
        hasComment={null}
        confirming={confirming}
        onConfirmingChange={(open) => {
          setStatus(null)
          setConfirming(open)
        }}
        onConfirm={() => {
          // Cleared BEFORE the wait, so a second failure is announced again.
          setStatus(null)
          eraseAnswer({
            run,
            remove,
            onDelete,
            onFailed: () => setStatus({ kind: 'error', text: DELETE_FAILED }),
          })
        }}
        error={status}
      />
    </div>
  )
}
