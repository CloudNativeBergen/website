'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { FaceSmileIcon } from '@heroicons/react/24/outline'
import { MAX_COMMENT_LENGTH } from '@/lib/feedback'
import type { FeedbackColour } from '@/lib/feedback/colour'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'
import {
  ANSWERS,
  AnswerButtons,
  CONTROL_BORDER,
  HEADING_FOCUS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  Status,
  useFocusOnMount,
  type DeleteAnswer,
  type DeleteNotice,
  type StatusLine,
  type SubmitAnswer,
} from './answers'
import { DELETE_FAILED, DeleteControl, eraseAnswer } from './DeleteAnswerButton'
import { useOneAtATime } from './useOneAtATime'

/** Where the Answered state's link leads: a full page load, never `next/link`. */
const PROGRAMME_HREF = '/program'

/** The counter speaks only here: at 100 left, and at the limit. */
const ANNOUNCE_LEFT = 100

/**
 * The Answered state (speaker feedback spec §7.2): what was recorded, Change
 * answer, the comment box, Delete my answer, and the way back to the
 * programme. Focus moves to the heading only when this state is ENTERED by a
 * tap; actions taken here keep focus where it is, or move it to what they
 * opened.
 *
 * Every action here is Submit or Delete my answer, one at a time; what they
 * answer with replaces the page, so a window that closed meanwhile shows
 * Closed. Change answer sends the colour ONLY: the stored comment stays as
 * it is, whatever this tab believes it to be.
 *
 * THE BOX SHOWS THE STORED COMMENT until the attendee edits it: `edit` is
 * `null` while untouched, so when the server tells this tab a comment it did
 * not know of (another tab sent it; a colour change brought it back), the
 * box follows, and Update comment re-sends that comment rather than an
 * empty box that would erase it. An edit is kept until exactly it is sent:
 * keystrokes made while a send is in flight stay in the box, unsent.
 */
export function AnsweredState({
  level: Heading,
  page,
  announce,
  submit,
  remove,
  onOutcome,
}: {
  level: 'h1' | 'h2'
  page: Extract<AttendeeFeedbackState, { state: 'answered' }>
  announce: boolean
  submit: SubmitAnswer
  remove: DeleteAnswer
  /** The page's next state; the notice only when Delete my answer led there. */
  onOutcome: (next: AttendeeFeedbackState, notice?: DeleteNotice) => void
}) {
  const heading = useFocusOnMount(announce)
  const answer = ANSWERS.find((a) => a.colour === page.colour)
  const Icon = answer?.Icon ?? FaceSmileIcon
  const stored = page.comment ?? ''
  const hadComment = !!page.comment
  const [edit, setEditState] = useState<string | null>(null)
  // The edit as it is NOW, for code that resumes after a wait: a closure
  // would read the edit as it was at the tap.
  const editNow = useRef<string | null>(null)
  const setEdit = (value: string | null) => {
    editNow.current = value
    setEditState(value)
  }
  const draft = edit ?? stored
  const [changing, setChanging] = useState(false)
  const [tapped, setTapped] = useState<FeedbackColour | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // `answer`: the line says the new answer (focus moved on during a colour
  // change). A keystroke keeps that part, so it is still there to be read;
  // the next action clears it.
  const [commentStatus, setCommentStatus] = useState<
    (StatusLine & { answer?: string }) | null
  >(null)
  const [changeStatus, setChangeStatus] = useState<StatusLine | null>(null)
  const [deleteStatus, setDeleteStatus] = useState<StatusLine | null>(null)
  const { pending, run } = useOneAtATime()
  const answerId = useId()
  const pickId = useId()
  const commentId = useId()
  const counterId = useId()
  const grid = useRef<HTMLDivElement>(null)
  // The grid and Keep my answer: everything that unmounts when it closes.
  const changingBlock = useRef<HTMLDivElement>(null)
  const changeButton = useRef<HTMLButtonElement>(null)
  const wasChanging = useRef(false)
  const changeStatusLine = useRef<HTMLParagraphElement>(null)
  // Where focus goes when the grid closes: back to Change answer on Keep,
  // to the heading (which now names the new answer) after a change.
  const afterClose = useRef<'change' | 'heading'>('change')
  // What had focus when a colour was tapped: after the change, the heading
  // takes focus only if focus has not moved on since (into the box, say).
  const focusAtTap = useRef<Element | null>(null)
  // Decided when the change resolves: whether the heading takes focus. When
  // it does not, the status line says the new answer instead.
  const headingTakesFocus = useRef(true)

  useEffect(() => {
    if (changing) {
      grid.current?.querySelector('button')?.focus()
    } else if (wasChanging.current) {
      if (afterClose.current === 'change') changeButton.current?.focus()
      else if (headingTakesFocus.current) heading.current?.focus()
    }
    wasChanging.current = changing
  }, [changing, heading])

  // Under the grid, the failure can sit below the fold on a short screen.
  useEffect(() => {
    if (changeStatus?.kind === 'error') {
      changeStatusLine.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [changeStatus])

  /** Clear, then set on the next task: the same words are announced again. */
  const announceComment = (status: StatusLine) => {
    setCommentStatus(null)
    setTimeout(() => setCommentStatus(status), 0)
  }

  const change = async (colour: FeedbackColour) => {
    setTapped(colour)
    focusAtTap.current = document.activeElement
    setCommentStatus(null)
    setChangeStatus(null)
    setConfirming(false)
    const next = await run(() => submit(colour), { state: 'unavailable' })
    if (!next) return
    if (next.state === 'unavailable') {
      // Under the grid, where the tap was; the grid stays.
      setChangeStatus({
        kind: 'error',
        text: "We couldn't confirm your answer. Please try again.",
      })
      return
    }
    onOutcome(next)
    if (next.state === 'answered') {
      // Focus still on the tapped button, anywhere in the grid or on Keep my
      // answer (all about to unmount) or on nothing: it has not moved on.
      const now = document.activeElement
      headingTakesFocus.current =
        !now ||
        now === document.body ||
        now === focusAtTap.current ||
        !!changingBlock.current?.contains(now)
      afterClose.current = 'heading'
      setChanging(false)
      const lines: string[] = []
      // Focus moved on (into the box, say): the heading that names the new
      // answer is not read out, so the status line says it, once.
      const label = ANSWERS.find((a) => a.colour === next.colour)?.label
      const answer =
        !headingTakesFocus.current && label
          ? `You answered ${label}.`
          : undefined
      if (answer) lines.push(answer)
      // A comment this tab did not know of has filled the untouched box: the
      // box as it is NOW (typed in during the wait, it stays as typed), and
      // `undefined` (unread) keeps the comment this tab has.
      const shown = next.comment === undefined ? stored : (next.comment ?? '')
      if (editNow.current === null && shown !== stored) {
        lines.push('Showing your saved comment.')
      }
      if (lines.length) {
        setCommentStatus({ kind: 'neutral', text: lines.join(' '), answer })
      }
    }
  }

  const keep = () => {
    if (pending) return
    afterClose.current = 'change'
    setChanging(false)
  }

  const sendComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    setConfirming(false)
    if (!draft.trim() && !hadComment) {
      announceComment({
        kind: 'neutral',
        text: 'Nothing to send: the box is empty.',
      })
      return
    }
    setCommentStatus(null)
    const sent = draft
    const next = await run(() => submit(page.colour, sent), {
      state: 'unavailable',
    })
    if (!next) return
    if (next.state === 'unavailable') {
      setCommentStatus({
        kind: 'error',
        text: "We couldn't send your comment. Please try again.",
      })
      return
    }
    if (next.state === 'answered') {
      const text = next.comment
        ? hadComment
          ? 'Comment updated.'
          : 'Comment sent.'
        : hadComment
          ? 'Comment removed.'
          : ''
      setCommentStatus(text ? { kind: 'ok', text } : null)
      // Sent: the box follows the stored comment again (trimmed, as stored),
      // unless it was typed in meanwhile; that newer text stays, unsent. An
      // edit kept after its own send would stop the box following a comment
      // another tab stores, and Update would overwrite it unseen.
      if (editNow.current === sent) setEdit(null)
    }
    onOutcome(next)
  }

  const erase = async () => {
    // Cleared BEFORE the wait, so a second failure is announced again.
    setDeleteStatus(null)
    setCommentStatus(null)
    setDeleting(true)
    await eraseAnswer({
      run,
      remove,
      onDelete: onOutcome,
      onFailed: () => setDeleteStatus({ kind: 'error', text: DELETE_FAILED }),
    })
    setDeleting(false)
  }

  const length = draft.length
  const left = MAX_COMMENT_LENGTH - length
  const nearLimit = left <= ANNOUNCE_LEFT
  const announcement =
    left === ANNOUNCE_LEFT
      ? `${ANNOUNCE_LEFT} characters left.`
      : left === 0
        ? 'Character limit reached.'
        : ''

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <Icon
          className={`size-12 ${answer?.iconClassName ?? ''}`}
          aria-hidden="true"
        />
        <Heading
          ref={heading}
          tabIndex={announce ? -1 : undefined}
          aria-describedby={answerId}
          className={`mt-4 text-lg font-semibold text-balance ${HEADING_FOCUS}`}
        >
          Thanks!
        </Heading>
        <p id={answerId} className="mt-2 text-gray-600 dark:text-gray-400">
          You answered{' '}
          <strong className="text-gray-900 dark:text-white">
            {answer?.label}
          </strong>
          .
        </p>
      </div>

      {changing ? (
        <div ref={changingBlock} className="mt-6">
          <p id={pickId} className="text-center text-sm font-medium">
            Pick a new answer
          </p>
          <AnswerButtons
            ref={grid}
            labelledBy={pickId}
            pending={pending}
            tapped={tapped}
            current={page.colour}
            onTap={change}
          />
          <Status
            ref={changeStatusLine}
            status={changeStatus}
            className="mt-3"
          />
          <div className="mt-3 text-center">
            <button
              type="button"
              aria-disabled={pending}
              onClick={keep}
              className={SECONDARY_BUTTON}
            >
              Keep my answer
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 text-center">
          <button
            ref={changeButton}
            type="button"
            aria-disabled={pending}
            onClick={() => {
              if (pending) return
              setCommentStatus(null)
              setConfirming(false)
              setChanging(true)
            }}
            className={SECONDARY_BUTTON}
          >
            Change answer
          </button>
        </div>
      )}

      <form onSubmit={sendComment} className="mt-8" aria-busy={pending}>
        <label htmlFor={commentId} className="block text-sm font-medium">
          Comment for the speaker (optional)
        </label>
        <textarea
          id={commentId}
          name="comment"
          rows={4}
          maxLength={MAX_COMMENT_LENGTH}
          value={draft}
          onChange={(event) => {
            setEdit(event.target.value)
            // Typing makes any other line stale; the new answer stays.
            setCommentStatus((line) =>
              line?.answer
                ? line.text === line.answer
                  ? line
                  : { kind: 'neutral', text: line.answer, answer: line.answer }
                : null,
            )
          }}
          aria-describedby={counterId}
          className={`mt-2 block w-full rounded-lg ${CONTROL_BORDER} bg-white px-3 py-2 text-base text-gray-900 shadow-xs focus:border-gray-900 focus:outline-2 focus:outline-offset-0 focus:outline-gray-900 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-white dark:focus:outline-white`}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* The visible counter is silent; the sr-only line speaks at the
              thresholds only, so a keystroke is never read out. */}
          <p
            id={counterId}
            className={`text-sm tabular-nums ${nearLimit ? 'font-medium text-amber-800 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}
          >
            {length.toLocaleString('en')}/
            {MAX_COMMENT_LENGTH.toLocaleString('en')}
            {nearLimit && (left === 0 ? ' · at the limit' : ` · ${left} left`)}
          </p>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
          <button
            type="submit"
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault()
            }}
            className={PRIMARY_BUTTON}
          >
            {hadComment ? 'Update comment' : 'Send comment'}
          </button>
        </div>
        <Status status={commentStatus} className="mt-3" />
      </form>

      <div className="mt-8 flex flex-col items-center">
        <DeleteControl
          pending={pending}
          deleting={deleting}
          hasComment={hadComment}
          confirming={confirming}
          onConfirmingChange={(open) => {
            setDeleteStatus(null)
            setConfirming(open)
          }}
          onConfirm={erase}
          error={deleteStatus}
        />
      </div>

      <div className="mt-8 flex justify-center border-t border-gray-300 pt-6 dark:border-gray-700">
        <a
          href={PROGRAMME_HREF}
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:focus-visible:outline-white"
        >
          Back to the programme
        </a>
      </div>
    </div>
  )
}
