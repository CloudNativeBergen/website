'use client'

import { useId } from 'react'
import {
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type { AdminFeedbackComment } from '@/lib/feedback/admin'
import { plural } from '@/lib/text/display'
import { formatFeedbackCommentTime } from '@/lib/time'
import { ANSWERS } from '../answers'
import { FEEDBACK_TONE } from '../tone'

/**
 * ONE ADMIN COMMENT ROW (speaker feedback spec §10.1–§10.3), shared by
 * `/admin/feedback` and a talk's admin panel, so an action added to it
 * (Keep, F7) lands on both: the comment with its colour, time and marks,
 * and Hide/Unhide and Remove beside it.
 */

export const ACTION =
  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-50'

/** The Remove confirmation's question, naming the count (§10.3). */
export const removeQuestion = (count: number) =>
  `Remove ${plural(count, 'response', 'responses')}?`

/** What the Remove confirmation says under its question (§10.3). */
export const removeMessage = (count: number) =>
  count === 1
    ? 'Its colour and comment are deleted for good and no longer count. There is no undo.'
    : 'Their colours and comments are deleted for good and no longer count. There is no undo.'

export type ActionKind = 'hide' | 'unhide' | 'remove'

/** What an action did, in words: whether it worked, and what to say. */
export interface Note {
  ok: boolean
  text: string
}

/** What a Hide, Unhide or Remove did, kept per response it acted on. */
export interface Outcome extends Note {
  talkId: string
  responseId: string
  kind: ActionKind
}

/** What a failed action says: the server's words, or a plain fallback. */
export const errorText = (
  error: unknown,
  fallback = 'That didn’t work. Reload the page to see where things stand.',
) => (error instanceof Error && error.message ? error.message : fallback)

/** What a successful action says where it happened. */
export const DONE: Record<ActionKind, (count: number) => string> = {
  hide: () => 'Comment hidden from speakers.',
  unhide: () => 'Comment shown to speakers again.',
  remove: (n) => `${plural(n, 'response', 'responses')} removed.`,
}

/** A successful Remove whose comment a refetch has not taken away yet. */
export const REMOVED_BUT_LISTED =
  'Removed. This list is out of date until it refreshes.'

/**
 * What an action did, in words, where the organizer is working. Not a live
 * region: the page's one status region announces the same words.
 */
export function OutcomeNote({
  outcome,
  className = '',
}: {
  outcome: Note
  className?: string
}) {
  return (
    <p
      className={`text-sm font-medium ${outcome.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'} ${className}`}
    >
      {outcome.text}
    </p>
  )
}

export function CommentItem({
  comment,
  pending,
  note,
  onHide,
  onUnhide,
  onRemove,
}: {
  comment: AdminFeedbackComment
  pending: boolean
  /** What the last action on this comment did, when it is said here. */
  note: Note | null
  onHide: () => void
  onUnhide: () => void
  onRemove: () => void
}) {
  const textId = useId()
  const answer = ANSWERS.find((a) => a.colour === comment.colour)!
  const { Icon } = answer
  const guard = (action: () => void) => () => {
    if (!pending) action()
  }
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          <span
            className={`inline-flex items-center gap-1 font-medium ${FEEDBACK_TONE[comment.colour].text}`}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {answer.label}
          </span>
          {comment.submittedAt && (
            <time dateTime={comment.submittedAt}>
              {formatFeedbackCommentTime(comment.submittedAt)}
            </time>
          )}
          {comment.hidden && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              <EyeSlashIcon className="size-3.5" aria-hidden="true" />
              Hidden from speakers
            </span>
          )}
          {comment.flagged && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <FlagIcon className="size-3.5" aria-hidden="true" />
              Flagged by a speaker
            </span>
          )}
        </p>
        <p
          id={textId}
          className={`mt-1 text-sm wrap-break-word whitespace-pre-line ${comment.hidden ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {comment.comment}
        </p>
        {note && <OutcomeNote outcome={note} className="mt-2" />}
      </div>
      <div className="-ml-2.5 flex shrink-0 gap-1 sm:ml-0">
        {comment.hidden ? (
          <button
            type="button"
            aria-describedby={textId}
            aria-disabled={pending}
            onClick={guard(onUnhide)}
            className={`${ACTION} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
          >
            <EyeIcon className="size-4" aria-hidden="true" />
            Unhide
          </button>
        ) : (
          <button
            type="button"
            aria-describedby={textId}
            aria-disabled={pending}
            onClick={guard(onHide)}
            className={`${ACTION} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
          >
            <EyeSlashIcon className="size-4" aria-hidden="true" />
            Hide
          </button>
        )}
        <button
          type="button"
          aria-describedby={textId}
          aria-disabled={pending}
          onClick={guard(onRemove)}
          className={`${ACTION} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30`}
        >
          <TrashIcon className="size-4" aria-hidden="true" />
          Remove
        </button>
      </div>
    </li>
  )
}
