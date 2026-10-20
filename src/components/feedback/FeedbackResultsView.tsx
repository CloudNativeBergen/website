'use client'

import { useState } from 'react'
import type { SpeakerComment } from '@/lib/feedback/results'
import { sharePercent, type FeedbackTotals } from '@/lib/feedback/totals'
import { formatFeedbackCommentTime } from '@/lib/time'
import { ANSWERS } from './answers'
import { ColourBar, FEEDBACK_TONE, plural } from './tone'

/**
 * The speaker's Session Feedback (speaker feedback spec §9.3): a stacked
 * colour bar, combined totals per colour with an optional scanned-vs-cards
 * breakdown, and the visible comments oldest first. Presentational; the data
 * comes from `sessionFeedback.results`.
 */
export function FeedbackResultsView({
  totals,
  comments,
  live,
}: {
  totals: FeedbackTotals
  comments: SpeakerComment[]
  /** The window is open: answers may still arrive. */
  live: boolean
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
              <CommentItem key={c.id} comment={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CommentItem({ comment }: { comment: SpeakerComment }) {
  const answer = ANSWERS.find((a) => a.colour === comment.colour)!
  const { Icon } = answer
  return (
    <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
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
      </p>
      <p className="mt-1.5 text-sm wrap-break-word whitespace-pre-line text-gray-900 dark:text-gray-100">
        {comment.comment}
      </p>
    </li>
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
