'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { FlagIcon } from '@heroicons/react/24/outline'
import { FlagIcon as FlagSolidIcon } from '@heroicons/react/24/solid'
import type { SpeakerComment } from '@/lib/feedback/results'
import { sharePercent, type FeedbackTotals } from '@/lib/feedback/totals'
import { plural } from '@/lib/text/display'
import { formatConferenceDayTime } from '@/lib/time'
import { ANSWERS } from './answers'
import { ColourBar, FEEDBACK_TONE } from './tone'

/**
 * The speaker's Session Feedback (speaker feedback spec §9.3): a stacked
 * colour bar, combined totals per colour with an optional scanned-vs-cards
 * breakdown, and the visible comments oldest first, each with a **Flag**
 * for organizers (§10.3) or, once flagged, "Flagged for organizers".
 * Presentational; the data comes from `sessionFeedback.results` and the flag
 * goes to `sessionFeedback.flag`.
 */
export function FeedbackResultsView({
  totals,
  comments,
  live,
  onFlag,
  updatedAt,
}: {
  totals: FeedbackTotals
  comments: SpeakerComment[]
  /** The window is open: answers may still arrive. */
  live: boolean
  /** Flag a comment for organizers; no Flag button without it. */
  onFlag?: (commentId: string) => Promise<unknown>
  /**
   * When these results were read (ms since the epoch): once a read clearly
   * after a flag has come in, its answer rules, flagged or not.
   */
  updatedAt?: number
}) {
  const [breakdown, setBreakdown] = useState(false)
  const hasCards = totals.cardsTotal > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {plural(totals.total, 'response', 'responses')} &middot;{' '}
          {plural(comments.length, 'comment', 'comments')}
        </p>
        {live && <LiveBadge />}
      </div>

      {totals.total === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {live
            ? 'No answers yet. They appear here as attendees scan your code.'
            : 'No one answered for this session.'}
        </p>
      ) : (
        <>
          <ColourBar totals={totals} className="h-3" />

          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {ANSWERS.map(({ colour, label, Icon }) => (
              <div
                key={colour}
                // The number first on screen, so a label that wraps at
                // phone width never pushes one tile's number below another's.
                className={`flex flex-col gap-1 rounded-lg p-2 sm:p-3 ${FEEDBACK_TONE[colour].tile} ${FEEDBACK_TONE[colour].text}`}
              >
                <dt className="order-2 flex items-center gap-1.5 text-xs font-medium sm:text-sm">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {label}
                </dt>
                <dd className="order-1 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-xl font-bold tabular-nums sm:text-2xl">
                    {totals.combined[colour]}
                  </span>
                  <span className="text-xs tabular-nums">
                    {sharePercent(totals.combined[colour], totals.total)}%
                  </span>
                </dd>
                {breakdown && (
                  <dd className="order-3 text-xs tabular-nums">
                    {totals.scanned[colour]} scanned &middot;{' '}
                    {totals.cards[colour]} cards
                  </dd>
                )}
              </div>
            ))}
          </dl>
          {hasCards && (
            <button
              type="button"
              aria-pressed={breakdown}
              onClick={() => setBreakdown((b) => !b)}
              className="-mx-2 rounded-md px-2 py-1 text-sm font-medium text-brand-cloud-blue hover:bg-brand-cloud-blue/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-pressed:bg-brand-cloud-blue/10 dark:text-blue-400 dark:hover:bg-blue-900/30 dark:aria-pressed:bg-blue-900/30"
            >
              Scanned vs cards
            </button>
          )}
        </>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Comments
        </h3>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            No comments yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                onFlag={onFlag}
                updatedAt={updatedAt}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

type FlagStep = 'idle' | 'confirming' | 'flagging' | 'failed'

const FLAG_BUTTON =
  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-50'

/**
 * How long after a flag a read may still miss it: GROQ can lag a write by
 * about a second (spec §4.2). A read later than this says what is so.
 */
const READ_LAG_MS = 5_000

function CommentItem({
  comment,
  onFlag,
  updatedAt,
}: {
  comment: SpeakerComment
  onFlag?: (commentId: string) => Promise<unknown>
  updatedAt?: number
}) {
  const answer = ANSWERS.find((a) => a.colour === comment.colour)!
  const { Icon } = answer
  const textId = useId()
  const [step, setStep] = useState<FlagStep>('idle')
  // Flagged by this click (when, in ms), until a refresh says so too or one
  // read well after it comes in; from then on the server's answer rules, so
  // an organizer's Keep brings Flag back.
  const [flaggedHere, setFlaggedHere] = useState<number | null>(null)
  if (
    flaggedHere !== null &&
    (comment.flagged || (updatedAt ?? 0) > flaggedHere + READ_LAG_MS)
  )
    setFlaggedHere(null)
  // Flagged by someone else meanwhile: a question or a failure left open here
  // is over, so a later Keep does not bring it back (and its autofocus).
  if (comment.flagged && step !== 'idle' && step !== 'flagging') setStep('idle')
  const flagButton = useRef<HTMLButtonElement>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const flagged = comment.flagged || flaggedHere !== null
  const asking = step === 'confirming' || step === 'flagging'
  // Where focus goes once the element it was on has gone: moved after the
  // render that shows the new one (each such change also sets `step`), not
  // on a timer.
  const focusTo = useRef<'flag' | 'marker' | null>(null)
  useEffect(() => {
    if (!focusTo.current) return
    ;(focusTo.current === 'flag' ? flagButton : marker).current?.focus()
    focusTo.current = null
  })

  async function flag() {
    if (!onFlag || step === 'flagging') return
    setStep('flagging')
    try {
      await onFlag(comment.id)
      // The question goes; focus goes to what it became.
      focusTo.current = 'marker'
      setFlaggedHere(Date.now())
      setStep('idle')
    } catch {
      // The question went with the button that had focus.
      focusTo.current = 'flag'
      setStep('failed')
    }
  }

  return (
    <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span
          className={`inline-flex items-center gap-1 font-medium ${FEEDBACK_TONE[comment.colour].text}`}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {answer.label}
        </span>
        {comment.submittedAt && (
          <time dateTime={comment.submittedAt}>
            {formatConferenceDayTime(comment.submittedAt)}
          </time>
        )}
        {/* Always rendered: a screen reader announces text set in a live
            region that is already there, not one that appears with it. */}
        <span role="status" className={flagged ? 'ml-auto' : 'sr-only'}>
          {flagged && (
            <span
              ref={marker}
              tabIndex={-1}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
            >
              <FlagSolidIcon className="size-3.5" aria-hidden="true" />
              Flagged for organizers
            </span>
          )}
        </span>
        {!flagged && onFlag && !asking && (
          <button
            ref={flagButton}
            type="button"
            aria-describedby={textId}
            onClick={() => setStep('confirming')}
            className={`${FLAG_BUTTON} ml-auto text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white`}
          >
            <FlagIcon className="size-4" aria-hidden="true" />
            Flag
          </button>
        )}
      </div>
      <p
        id={textId}
        className="mt-1.5 text-sm wrap-break-word whitespace-pre-line text-gray-900 dark:text-gray-100"
      >
        {comment.comment}
      </p>
      {!flagged && asking && (
        <FlagConfirm
          describedBy={textId}
          pending={step === 'flagging'}
          onConfirm={() => void flag()}
          onCancel={() => {
            // Back where the speaker was, once the Flag button is back.
            focusTo.current = 'flag'
            setStep('idle')
          }}
        />
      )}
      {!flagged && step === 'failed' && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          Couldn&rsquo;t flag this comment. Try again, or reload if it has gone.
        </p>
      )}
    </li>
  )
}

/**
 * The flag's confirmation (decided in F7): a speaker cannot take a flag
 * back, and it notifies every organizer.
 */
function FlagConfirm({
  describedBy,
  pending,
  onConfirm,
  onCancel,
}: {
  describedBy: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const questionId = useId()
  return (
    <div
      role="group"
      aria-labelledby={questionId}
      aria-describedby={describedBy}
      // Escape answers "no", as in any dialog.
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !pending) {
          e.stopPropagation()
          onCancel()
        }
      }}
      className="mt-3 rounded-md bg-gray-50 p-3 dark:bg-gray-900/50"
    >
      <p id={questionId} className="text-sm text-gray-800 dark:text-gray-200">
        Flag this comment for organizers? They decide whether it stays. You
        can&rsquo;t undo a flag.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          // The question just appeared where the Flag button was.
          autoFocus
          aria-disabled={pending}
          onClick={() => !pending && onConfirm()}
          className={`${FLAG_BUTTON} bg-red-600 text-white hover:bg-red-700`}
        >
          <FlagIcon className="size-4" aria-hidden="true" />
          {pending ? 'Flagging…' : 'Flag for organizers'}
        </button>
        <button
          type="button"
          aria-disabled={pending}
          onClick={() => !pending && onCancel()}
          className={`${FLAG_BUTTON} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-red-600 dark:bg-red-400" />
      </span>
      Live
    </span>
  )
}
