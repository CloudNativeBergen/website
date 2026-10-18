'use client'

import { useState } from 'react'
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'
import { Failed, SECONDARY_BUTTON, type DeleteAnswer } from './answers'
import { useOneAtATime, type RunAction } from './useOneAtATime'

export const DELETE_FAILED = "We couldn't delete your answer. Please try again."

/**
 * Delete my answer (speaker feedback spec §7.4), under whichever
 * one-at-a-time guard the caller holds. A failed delete keeps the page as it
 * is and reports; anything else replaces the page, and only a delete the
 * server confirmed is announced as one: a refusal (an expired cookie, a
 * rotated code) shows the page's current state and no "deleted" line.
 */
export async function eraseAnswer({
  run,
  remove,
  onDelete,
  onFailed,
}: {
  run: RunAction
  remove: DeleteAnswer
  onDelete: (next: AttendeeFeedbackState, deleted: boolean) => void
  onFailed: () => void
}) {
  const next = await run(remove, {
    deleted: false,
    page: { state: 'unavailable' },
  })
  if (!next) return
  if (next.page.state === 'unavailable') onFailed()
  else onDelete(next.page, next.deleted)
}

export function DeleteButton({
  pending,
  onClick,
}: {
  pending: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-disabled={pending}
      onClick={onClick}
      className={`${SECONDARY_BUTTON} text-red-700 dark:text-red-400`}
    >
      {pending ? (
        <ArrowPathIcon
          className="size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <TrashIcon className="size-5" aria-hidden="true" />
      )}
      Delete my answer
    </button>
  )
}

/**
 * Delete my answer on Closed and Not yet open (§7.4, R1): the talk is in the
 * cookie's list, so there may be an answer to delete; a missing one is
 * harmless. Holds its own guard: it is the only action on those pages.
 */
export function DeleteAnswerButton({
  remove,
  onDelete,
}: {
  remove: DeleteAnswer
  onDelete: (next: AttendeeFeedbackState, deleted: boolean) => void
}) {
  const [failed, setFailed] = useState(false)
  const { pending, run } = useOneAtATime()
  return (
    <div className="mt-8 flex flex-col items-center">
      <DeleteButton
        pending={pending}
        onClick={() => {
          setFailed(false)
          eraseAnswer({
            run,
            remove,
            onDelete,
            onFailed: () => setFailed(true),
          })
        }}
      />
      {failed && <Failed>{DELETE_FAILED}</Failed>}
    </div>
  )
}
