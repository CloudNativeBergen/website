'use client'

import { useId, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { FEEDBACK_COLOURS, type FeedbackColour } from '@/lib/feedback/colour'
import {
  hasTooFew,
  MIN_RANKED_RESPONSES,
  rankSessions,
  type FeedbackSort,
} from '@/lib/feedback/ranking'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import type {
  AdminFeedbackComment,
  AdminFeedbackOverview,
  AdminFeedbackSession,
} from '@/lib/feedback/admin'
import { formats, type Format } from '@/lib/proposal/types'
import { formatFeedbackCommentTime } from '@/lib/time'
import { ANSWERS } from '../answers'

const TONE: Record<FeedbackColour, { bar: string; text: string }> = {
  green: {
    bar: 'bg-green-600 dark:bg-green-500',
    text: 'text-green-800 dark:text-green-300',
  },
  yellow: {
    bar: 'bg-yellow-400',
    text: 'text-yellow-900 dark:text-yellow-300',
  },
  red: {
    bar: 'bg-red-600 dark:bg-red-500',
    text: 'text-red-800 dark:text-red-300',
  },
}

/** The session list's columns at `sm` and up; a phone stacks each row. */
const COLUMNS =
  'sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_7.5rem_5.5rem] sm:items-center sm:gap-4'

const SORTS: { key: FeedbackSort; label: string }[] = [
  { key: 'lovedIt', label: 'Loved it' },
  { key: 'responses', label: 'Responses' },
  { key: 'comments', label: 'Comments' },
]

const ACTION =
  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-50'

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** The Remove confirmation's question, naming the count (§10.3). */
export const removeQuestion = (count: number) =>
  `Remove ${plural(count, 'response', 'responses')}?`

export interface SessionFeedbackAdminProps {
  overview: AdminFeedbackOverview
  /** The conference, shown under the title. */
  conferenceTitle?: string
  onHide: (responseId: string) => Promise<unknown>
  onUnhide: (responseId: string) => Promise<unknown>
  onRemove: (responseIds: string[]) => Promise<unknown>
}

/**
 * The organizers' Session Feedback page (speaker feedback spec §10.1,
 * §10.3): the stat cards, every session ranked by "Loved it" (fewer than 10
 * responses: "too few", after the rest), and rows that open to the
 * session's comments with Hide, Unhide and Remove. Presentational; the data
 * and the actions come from `sessionFeedback.admin*`.
 */
export function SessionFeedbackAdmin({
  overview,
  conferenceTitle,
  onHide,
  onUnhide,
  onRemove,
}: SessionFeedbackAdminProps) {
  const [sort, setSort] = useState<FeedbackSort>('lovedIt')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<AdminFeedbackComment | null>(null)

  const sessions = rankSessions(overview.sessions, sort)
  const { totals } = overview

  async function run(ids: string[], action: () => Promise<unknown>) {
    setError(null)
    setPending((p) => new Set([...p, ...ids]))
    try {
      await action()
      return true
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'That didn’t work. Try again.',
      )
      return false
    } finally {
      setPending((p) => new Set([...p].filter((id) => !ids.includes(id))))
    }
  }

  const toggle = (talkId: string) =>
    setOpen((o) => {
      const next = new Set(o)
      if (!next.delete(talkId)) next.add(talkId)
      return next
    })

  return (
    <div>
      <AdminPageHeader
        icon={<ChatBubbleLeftRightIcon />}
        title="Session Feedback"
        description="What attendees thought of each session: scanned answers and Card Counts together."
        contextHighlight={conferenceTitle}
        stats={[
          { value: totals.total, label: 'Responses', color: 'blue' },
          {
            value:
              totals.lovedItPercent === null
                ? '–'
                : `${totals.lovedItPercent}%`,
            label: 'Loved it',
            color: 'green',
          },
          { value: overview.comments, label: 'Comments', color: 'slate' },
          {
            value: overview.flagged,
            label: 'Flagged',
            color: overview.flagged > 0 ? 'red' : 'slate',
          },
        ]}
      />

      <p
        role="alert"
        className={
          error
            ? 'mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200'
            : 'sr-only'
        }
      >
        {error ?? ''}
      </p>

      <section
        aria-label="Sessions"
        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800"
      >
        <div
          role="group"
          aria-label="Sort sessions"
          className={`flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-gray-200 px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400 ${COLUMNS}`}
        >
          <span className="mr-1 sm:hidden">Sort by</span>
          <span className="hidden sm:block">Session</span>
          <span className="hidden sm:block">Spread</span>
          {SORTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={sort === key}
              onClick={() => setSort(key)}
              className="rounded-md px-2 py-1 text-xs font-semibold tracking-wide uppercase hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-pressed:bg-brand-sky-mist aria-pressed:text-brand-cloud-blue sm:-mx-2 sm:justify-self-end dark:hover:bg-gray-700 dark:aria-pressed:bg-blue-900/40 dark:aria-pressed:text-blue-300"
            >
              {label}
              {sort === key && <span aria-hidden="true"> ↓</span>}
            </button>
          ))}
        </div>

        {sessions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-600 dark:text-gray-400">
            No confirmed sessions yet. Each confirmed talk appears here with its
            feedback.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map((session) => (
              <SessionRow
                key={session.talkId}
                session={session}
                open={open.has(session.talkId)}
                onToggle={() => toggle(session.talkId)}
                pending={pending}
                onHide={(id) => run([id], () => onHide(id))}
                onUnhide={(id) => run([id], () => onUnhide(id))}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        )}
      </section>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        Sessions with fewer than {MIN_RANKED_RESPONSES} responses show “too few”
        and rank after the rest.
      </p>

      <ConfirmationModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          if (await run([removing.id], () => onRemove([removing.id])))
            setRemoving(null)
        }}
        title={removeQuestion(1)}
        message="Its colour and comment are deleted for good and no longer count. There is no undo."
        confirmButtonText="Remove"
        variant="danger"
        isLoading={removing !== null && pending.has(removing.id)}
        guardSecondTap
      >
        {removing && (
          <blockquote className="mt-3 border-l-2 border-gray-300 pl-3 text-sm wrap-break-word whitespace-pre-line text-gray-700 dark:border-gray-600 dark:text-gray-300">
            {removing.comment}
          </blockquote>
        )}
      </ConfirmationModal>
    </div>
  )
}

function SessionRow({
  session,
  open,
  onToggle,
  pending,
  onHide,
  onUnhide,
  onRemove,
}: {
  session: AdminFeedbackSession
  open: boolean
  onToggle: () => void
  pending: ReadonlySet<string>
  onHide: (id: string) => void
  onUnhide: (id: string) => void
  onRemove: (comment: AdminFeedbackComment) => void
}) {
  const panelId = useId()
  const { totals, comments } = session
  const tooFew = hasTooFew(totals)
  const meta = [
    session.speakers.join(', '),
    session.format
      ? (formats.get(session.format as Format) ?? session.format)
      : null,
    session.slotAt ? formatFeedbackCommentTime(session.slotAt) : null,
  ].filter(Boolean)

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-cloud-blue dark:hover:bg-gray-700/40 ${COLUMNS}`}
      >
        <span className="flex min-w-0 items-start gap-2">
          <ChevronRightIcon
            aria-hidden="true"
            className={`mt-0.5 size-4 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none dark:text-gray-400 ${open ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0">
            <span className="block font-medium wrap-break-word text-gray-900 dark:text-white">
              {session.title}
            </span>
            {meta.length > 0 && (
              <span className="mt-0.5 block text-xs wrap-break-word text-gray-600 dark:text-gray-400">
                {meta.join(' · ')}
              </span>
            )}
          </span>
        </span>
        <ColourBar totals={totals} />
        <span className="flex flex-wrap gap-x-3 gap-y-1 pl-6 text-sm text-gray-700 tabular-nums sm:contents dark:text-gray-300">
          <span className="sm:text-right">
            {tooFew ? (
              <span className="text-gray-500 dark:text-gray-400">too few</span>
            ) : (
              <span className="font-semibold text-gray-900 dark:text-white">
                {totals.lovedItPercent}%
              </span>
            )}
            <span className="sm:sr-only"> loved it</span>
          </span>
          <span className="sm:text-right">
            {totals.total}
            <span className="sm:sr-only"> responses</span>
            {/* On a phone the open row's breakdown carries the cards. */}
            {totals.cardsTotal > 0 && (
              <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">
                {' '}
                ({totals.cardsTotal} cards)
              </span>
            )}
          </span>
          <span className="sm:text-right">
            {comments.length}
            <span className="sm:sr-only">
              {comments.length === 1 ? ' comment' : ' comments'}
            </span>
          </span>
        </span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="border-t border-gray-100 bg-gray-50 px-4 py-3 sm:pl-10 dark:border-gray-700 dark:bg-gray-900/40"
      >
        {open && (
          <>
            <Breakdown totals={totals} />
            {comments.length === 0 ? (
              <p className="py-2 text-sm text-gray-600 dark:text-gray-400">
                No comments for this session.
              </p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    pending={pending.has(c.id)}
                    onHide={() => onHide(c.id)}
                    onUnhide={() => onUnhide(c.id)}
                    onRemove={() => onRemove(c)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/** Combined counts per colour, split into scanned and cards (§4.3). */
function Breakdown({ totals }: { totals: FeedbackTotals }) {
  return (
    <dl className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 tabular-nums dark:text-gray-400">
      {ANSWERS.map(({ colour, label }) => (
        <div key={colour} className="flex gap-1">
          <dt className={`font-medium ${TONE[colour].text}`}>{label}</dt>
          <dd>
            {totals.combined[colour]} ({totals.scanned[colour]} scanned
            {totals.cards[colour] > 0 && `, ${totals.cards[colour]} cards`})
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ColourBar({ totals }: { totals: FeedbackTotals }) {
  return (
    <span
      aria-hidden="true"
      className="ml-6 flex h-2 overflow-hidden rounded-full bg-gray-100 sm:ml-0 dark:bg-gray-700"
    >
      {totals.total > 0 &&
        FEEDBACK_COLOURS.map((colour) =>
          totals.combined[colour] > 0 ? (
            <span
              key={colour}
              className={TONE[colour].bar}
              style={{
                width: `${(totals.combined[colour] / totals.total) * 100}%`,
              }}
            />
          ) : null,
        )}
    </span>
  )
}

function CommentItem({
  comment,
  pending,
  onHide,
  onUnhide,
  onRemove,
}: {
  comment: AdminFeedbackComment
  pending: boolean
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
            className={`inline-flex items-center gap-1 font-medium ${TONE[comment.colour].text}`}
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
