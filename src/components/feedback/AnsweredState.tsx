'use client'

import { useId, useState } from 'react'
import { FaceSmileIcon } from '@heroicons/react/24/outline'
import { MAX_COMMENT_LENGTH } from '@/lib/feedback'
import type { FeedbackColour } from '@/lib/feedback/colour'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'
import {
  ANSWERS,
  AnswerButtons,
  Failed,
  HEADING_FOCUS,
  SECONDARY_BUTTON,
  useFocusOnMount,
  type DeleteAnswer,
  type SubmitAnswer,
} from './answers'
import { DELETE_FAILED, DeleteButton, eraseAnswer } from './DeleteAnswerButton'
import { useOneAtATime } from './useOneAtATime'

/** Where the Answered state's link leads: a full page load, never `next/link`. */
const PROGRAMME_HREF = '/program'

/**
 * The Answered state (speaker feedback spec §7.2): what was recorded, Change
 * answer, the comment box, Delete my answer, and the way back to the
 * programme. Focus moves to the heading after a tap so a screen reader
 * announces it, never on a plain page load.
 *
 * Every action here is Submit or Delete my answer, one at a time; what they
 * answer with replaces the page, so a window that closed meanwhile shows
 * Closed. Change answer sends the SAVED comment with the new colour: what is
 * typed in the box stays a draft until Send or Update comment.
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
  /** The page's next state; `deleted` when Delete my answer led there. */
  onOutcome: (next: AttendeeFeedbackState, deleted?: boolean) => void
}) {
  const heading = useFocusOnMount(announce)
  const answer = ANSWERS.find((a) => a.colour === page.colour)
  const Icon = answer?.Icon ?? FaceSmileIcon
  const [changing, setChanging] = useState(false)
  const [tapped, setTapped] = useState<FeedbackColour | null>(null)
  const [draft, setDraft] = useState(page.comment ?? '')
  const [sent, setSent] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const { pending, run } = useOneAtATime()
  const commentId = useId()
  const counterId = useId()

  const begin = () => {
    setFailed(null)
    setSent(null)
  }

  const change = async (colour: FeedbackColour) => {
    setTapped(colour)
    begin()
    const next = await run(() => submit(colour, page.comment ?? undefined))
    if (!next) return
    if (next.state === 'unavailable') {
      setFailed("We couldn't confirm your answer. Please try again.")
      return
    }
    onOutcome(next)
    if (next.state === 'answered') {
      // The tapped button goes away with the grid: the heading, which now
      // names the new answer, takes focus.
      setChanging(false)
      heading.current?.focus()
    }
  }

  const sendComment = async (event: React.FormEvent) => {
    event.preventDefault()
    begin()
    const next = await run(() => submit(page.colour, draft))
    if (!next) return
    if (next.state === 'unavailable') {
      setFailed("We couldn't send your comment. Please try again.")
      return
    }
    if (next.state === 'answered') {
      setSent(next.comment ? 'Comment sent.' : 'Comment removed.')
    }
    onOutcome(next)
  }

  const hasComment = page.comment !== null
  const length = draft.length
  const nearLimit = length >= MAX_COMMENT_LENGTH - 100

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
          className={`mt-4 text-lg font-semibold text-balance ${HEADING_FOCUS}`}
        >
          Thanks!
        </Heading>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          You answered{' '}
          <strong className="text-gray-900 dark:text-white">
            {answer?.label}
          </strong>
          .
        </p>
        {sent && (
          <p
            role="status"
            className="mt-2 text-sm font-medium text-green-700 dark:text-green-400"
          >
            {sent}
          </p>
        )}
      </div>

      {changing ? (
        <div className="mt-6">
          <p className="text-center text-sm font-medium">Pick a new answer</p>
          <AnswerButtons
            pending={pending}
            tapped={tapped}
            current={page.colour}
            onTap={change}
          />
          <div className="mt-3 text-center">
            <button
              type="button"
              aria-disabled={pending}
              onClick={() => {
                if (!pending) setChanging(false)
              }}
              className={SECONDARY_BUTTON}
            >
              Keep my answer
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 text-center">
          <button
            type="button"
            aria-disabled={pending}
            onClick={() => {
              if (!pending) setChanging(true)
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
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby={counterId}
          className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-xs focus:border-gray-900 focus:outline-2 focus:outline-offset-0 focus:outline-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-white dark:focus:outline-white"
        />
        <div className="mt-2 flex items-center justify-between gap-4">
          <p
            id={counterId}
            aria-live="polite"
            className={`text-sm tabular-nums ${nearLimit ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}
          >
            {length.toLocaleString('en')}/
            {MAX_COMMENT_LENGTH.toLocaleString('en')}
          </p>
          <button
            type="submit"
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault()
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:focus-visible:outline-white"
          >
            {hasComment ? 'Update comment' : 'Send comment'}
          </button>
        </div>
      </form>

      {failed && <Failed>{failed}</Failed>}

      <div className="mt-10 flex flex-col items-center gap-4">
        <DeleteButton
          pending={pending}
          onClick={() => {
            begin()
            eraseAnswer({
              run,
              remove,
              onDelete: (next) => onOutcome(next, true),
              onFailed: () => setFailed(DELETE_FAILED),
            })
          }}
        />
        <a
          href={PROGRAMME_HREF}
          className="text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:focus-visible:outline-white"
        >
          Back to the programme
        </a>
      </div>
    </div>
  )
}
