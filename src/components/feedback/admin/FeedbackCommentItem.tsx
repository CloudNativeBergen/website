'use client'

import { useEffect, useId, useRef } from 'react'
import {
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type {
  AdminFeedbackComment,
  KeepAnswer,
  KeepNow,
} from '@/lib/feedback/admin'
import type { RemovedCounts } from '@/lib/feedback/bulk-remove'
import { plural } from '@/lib/text/display'
import { formatFeedbackCommentTime } from '@/lib/time'
import { ANSWERS } from '../answers'
import { FEEDBACK_TONE } from '../tone'

/**
 * ONE ADMIN COMMENT ROW (speaker feedback spec §10.1–§10.3), shared by
 * `/admin/feedback` and a talk's admin panel, so Keep lands on both: the
 * comment with its colour, time and marks, and Keep (on a flagged comment),
 * Hide/Unhide and Remove beside it.
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

export type ActionKind = 'hide' | 'unhide' | 'remove' | 'keep'

/** What an action did, in words: whether it worked, and what to say. */
export interface Note {
  ok: boolean
  text: string
  /**
   * Which comment, in words (session and the comment's start), for a note
   * said where the comment is no longer listed.
   */
  about?: string
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
  keep: () => 'Kept: the flag is cleared, speakers still see the comment.',
}

export const isRefusedKeep = (
  answer: unknown,
): answer is Extract<KeepAnswer, { kept: false }> =>
  (answer as { kept?: unknown } | null)?.kept === false

/**
 * A Keep the server refused because the comment changed, told as where it
 * stands now (the server read it past GROQ's lag): if another organizer
 * already dealt with it, that is not an error, and "look at it again" would
 * point at nothing. Still flagged (a new flag, new wording): the refusal
 * stands, beside the comment.
 */
export const KEEP_REFUSED: Record<KeepNow, Note> = {
  flagged: {
    ok: false,
    text: 'This comment changed after this page loaded (a new flag or new wording). Look at it again before you keep it.',
  },
  unflagged: {
    ok: true,
    text: 'Already handled by another organizer: no longer flagged.',
  },
  hidden: {
    ok: true,
    text: 'Already handled by another organizer: now hidden from speakers.',
  },
  gone: {
    ok: true,
    text: 'Already gone: removed by an organizer, or its comment was deleted.',
  },
}

/**
 * What a failed action says. A NOT_FOUND for a comment the page showed: it
 * went after the page read it (another organizer's Remove, the device's own
 * delete); nothing leaks in saying so, the page already saw it.
 */
export function failureNote(error: unknown, shown: boolean): Note {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code
  if (code === 'NOT_FOUND' && shown) return KEEP_REFUSED.gone
  return { ok: false, text: errorText(error) }
}

/** A comment's start, for naming it in a note. */
export const excerpt = (text: string) =>
  text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text

/** Where on a page an action was taken: a flagged box or a comment list. */
export type Place = 'flagged' | 'session'

/** Focus may follow an action that just finished, and nothing else. */
export interface FocusRequest {
  responseId: string
  place: Place
  /** When the action finished, ms since the epoch. */
  at: number
}

/** The request an action that just finished makes. */
export const focusRequestFor = (
  responseId: string,
  place: Place,
): FocusRequest => ({ responseId, place, at: Date.now() })

/** How long after an action its re-read may still move focus. */
const FOCUS_WINDOW_MS = 3_000

export const focusWanted = (
  request: FocusRequest | null | undefined,
  place: Place,
  responseId?: string,
) =>
  !!request &&
  request.place === place &&
  (responseId === undefined || request.responseId === responseId) &&
  Date.now() - request.at < FOCUS_WINDOW_MS

export const focusLost = () =>
  !document.activeElement || document.activeElement === document.body

/**
 * What a Remove did, in words (§10.3): what went, what was already gone,
 * and what was kept because it had been answered again since the organizer
 * looked.
 */
export function removedText({ removed, gone, changed }: RemovedCounts) {
  const alone = (n: number) => n === 1 && removed + gone + changed === 1
  const parts: string[] = []
  if (removed > 0 || gone + changed === 0) parts.push(DONE.remove(removed))
  if (gone > 0)
    parts.push(
      alone(gone)
        ? 'It was already gone.'
        : gone === 1
          ? '1 was already gone.'
          : `${gone} were already gone.`,
    )
  if (changed > 0)
    parts.push(
      alone(changed)
        ? 'It had changed since you looked and was kept.'
        : changed === 1
          ? '1 had changed since you looked and was kept.'
          : `${changed} had changed since you looked and were kept.`,
    )
  return parts.join(' ')
}

/**
 * What a successful action says: a Remove by what it did (ok only if
 * something went), Hide and Unhide by their kind.
 */
export function doneNote(
  kind: ActionKind,
  count: number,
  result: unknown,
): Note {
  if (kind === 'remove' && isRemovedCounts(result))
    return { ok: result.removed > 0, text: removedText(result) }
  if (kind === 'keep' && isRefusedKeep(result)) return KEEP_REFUSED[result.now]
  return { ok: true, text: DONE[kind](count) }
}

const isRemovedCounts = (value: unknown): value is RemovedCounts =>
  typeof (value as RemovedCounts | null)?.removed === 'number' &&
  typeof (value as RemovedCounts).gone === 'number' &&
  typeof (value as RemovedCounts).changed === 'number'

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
  named = false,
}: {
  outcome: Note
  className?: string
  /** Away from its comment: say which comment it was about. */
  named?: boolean
}) {
  return (
    <p
      className={`text-sm font-medium ${outcome.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'} ${className}`}
    >
      {outcome.text}
      {named && outcome.about && (
        <span className="mt-0.5 block font-normal wrap-break-word text-gray-700 dark:text-gray-300">
          {outcome.about}
        </span>
      )}
    </p>
  )
}

export function CommentItem({
  comment,
  place,
  sessionTitle,
  pending,
  focusRequest,
  note,
  onHide,
  onUnhide,
  onKeep,
  onRemove,
  stacked = false,
}: {
  comment: AdminFeedbackComment
  /**
   * In a session's row, or in the flagged box, where every comment is
   * flagged (no "Flagged by a speaker" pill) and sessions mix.
   */
  place: Place
  /** The session's title, shown in the flagged box. */
  sessionTitle?: string
  pending: boolean
  /** The latest finished action focus may follow; none on a page without. */
  focusRequest?: FocusRequest | null
  /** What the last action on this comment did, when it is said here. */
  note: Note | null
  onHide: () => void
  onUnhide?: () => void
  /** Keep a flagged comment; no Keep without it. */
  onKeep?: () => void
  onRemove: () => void
  /**
   * Actions under the comment at every width: for a narrow column (a talk
   * page's sidebar), where three buttons beside it would squeeze the text.
   */
  stacked?: boolean
}) {
  const textId = useId()
  // An action can take its own button away (Keep, Hide swapped for Unhide):
  // focus goes to the comment it was about instead of falling to the page.
  // Not to the note, which the page's live region already says; and only
  // after the organizer's own action on this comment, here, never a
  // background re-read (a refetch on returning to the tab).
  const textRef = useRef<HTMLParagraphElement>(null)
  const noteKey = note && `${note.ok}:${note.text}`
  useEffect(() => {
    if (noteKey && focusWanted(focusRequest, place, comment.id) && focusLost())
      textRef.current?.focus()
    // Also when the read that takes the button away lands after the note.
  }, [
    noteKey,
    focusRequest,
    place,
    comment.id,
    comment.flagged,
    comment.hidden,
  ])
  const answer = ANSWERS.find((a) => a.colour === comment.colour)!
  const { Icon } = answer
  const guard = (action: () => void) => () => {
    if (!pending) action()
  }
  return (
    <li
      className={
        stacked
          ? 'flex flex-col gap-2 py-3'
          : 'flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4'
      }
    >
      <div className="min-w-0 flex-1">
        {place === 'flagged' && sessionTitle && (
          <p className="mb-1 text-sm font-medium wrap-break-word text-gray-900 dark:text-white">
            {sessionTitle}
          </p>
        )}
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
          {comment.flagged && place === 'session' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <FlagIcon className="size-3.5" aria-hidden="true" />
              Flagged by a speaker
            </span>
          )}
        </p>
        <p
          id={textId}
          ref={textRef}
          tabIndex={-1}
          className={`mt-1 text-sm wrap-break-word whitespace-pre-line ${comment.hidden ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {comment.comment}
        </p>
        {note && <OutcomeNote outcome={note} className="mt-2" />}
      </div>
      <div
        className={
          stacked
            ? '-ml-2.5 flex flex-wrap gap-1'
            : '-ml-2.5 flex shrink-0 flex-wrap gap-1 sm:ml-0'
        }
      >
        {comment.flagged && onKeep && (
          <button
            type="button"
            aria-describedby={textId}
            aria-disabled={pending}
            onClick={guard(onKeep)}
            className={`${ACTION} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
          >
            <CheckIcon className="size-4" aria-hidden="true" />
            Keep
          </button>
        )}
        {comment.hidden && onUnhide ? (
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
