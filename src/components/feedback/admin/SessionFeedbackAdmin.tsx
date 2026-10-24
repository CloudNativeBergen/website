'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  ChevronRightIcon,
  FlagIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import {
  hasTooFew,
  keepOrder,
  MIN_RANKED_RESPONSES,
  rankSessions,
  type FeedbackSort,
} from '@/lib/feedback/ranking'
import type { FeedbackTotals } from '@/lib/feedback/totals'
import type {
  AdminFeedbackComment,
  AdminFeedbackOverview,
  AdminFeedbackSession,
  KeepAnswer,
} from '@/lib/feedback/admin'
import type { RemoveRequest, RemovedCounts } from '@/lib/feedback/bulk-remove'
import { formats } from '@/lib/proposal/types'
import { formatConferenceDayTime } from '@/lib/time'
import { ANSWERS } from '../answers'
import { ColourBar, FEEDBACK_TONE } from '../tone'
import {
  CommentItem,
  doneNote,
  excerpt,
  failureNote,
  focusLost,
  focusRequestFor,
  focusWanted,
  OutcomeNote,
  REMOVED_BUT_LISTED,
  removeMessage,
  removeQuestion,
  type ActionKind,
  type FocusRequest,
  type Place,
} from './FeedbackCommentItem'

/** The session list's columns at `sm` and up; a phone stacks each row. */
const COLUMNS =
  'sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_7.5rem_5.5rem] sm:items-center sm:gap-4'

const SORTS: { key: FeedbackSort; label: string }[] = [
  { key: 'lovedIt', label: 'Loved it' },
  { key: 'responses', label: 'Responses' },
  { key: 'comments', label: 'Comments' },
]

export interface SessionFeedbackAdminProps {
  overview: AdminFeedbackOverview
  /** The conference, shown under the title. */
  conferenceTitle?: string
  onHide: (responseId: string) => Promise<unknown>
  onUnhide: (responseId: string) => Promise<unknown>
  /**
   * Keep a flagged comment: clears the flag the page showed (its
   * revision), the comment stays (§10.3). Resolves with the server's
   * {@link KeepAnswer}: a refused Keep says where the comment stands now.
   */
  onKeep: (comment: AdminFeedbackComment) => Promise<KeepAnswer | void>
  /** Remove (`sessionFeedback.adminRemove`): only answers still as seen. */
  onRemove: (request: RemoveRequest) => Promise<RemovedCounts>
  /**
   * The last refetch failed: the numbers shown are earlier ones. Offers
   * Retry, which is `retrying` while it runs.
   */
  refreshFailed?: { onRetry: () => void; retrying?: boolean }
}

/** The session an action is about, and where on the page it was taken. */
interface Where {
  talkId: string
  place: Place
}

/** What a Hide, Unhide, Keep or Remove did, kept per response it acted on. */
interface Outcome extends Where {
  responseId: string
  /** The comment's revision when the action was taken. */
  seenRev?: string
  /**
   * Which comment, in words (session and the comment's start), for a note
   * said where the comment is no longer listed.
   */
  about?: string
  kind: ActionKind
  ok: boolean
  text: string
}

const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i])

/** A removal the dialog asks about, and the comment it quotes. */
interface Removal extends Where {
  ids: string[]
  comment?: string
  /** The answer as shown: removed only while it is still that one. */
  request: RemoveRequest
}

/**
 * Where each outcome is said: beside its comment while that comment is
 * listed (a Hide, a Keep, a failure, or a Remove a refetch has not caught up
 * with), else once at the top, the latest only (outcomes are kept in the
 * order they happened).
 */
/**
 * A success the comment has since moved past: it changed after the action
 * (another revision) into the state the action ended, e.g. flagged again
 * after a Keep. Its note would describe the past beside a live problem.
 */
function overtaken(o: Outcome, now: AdminFeedbackComment): boolean {
  if (!o.ok || !o.seenRev || now.rev === o.seenRev) return false
  if (o.kind === 'keep') return now.flagged
  if (o.kind === 'hide') return !now.hidden
  if (o.kind === 'unhide') return now.hidden
  return false
}

function placeOutcomes(
  outcomes: readonly Outcome[],
  comments: readonly AdminFeedbackComment[],
): { byComment: Map<string, Outcome>; atTop: Outcome | null } {
  const listed = new Map(comments.map((c) => [c.id, c]))
  const byComment = new Map<string, Outcome>()
  let atTop: Outcome | null = null
  for (const o of outcomes) {
    const now = listed.get(o.responseId)
    if (!now) atTop = o
    else if (overtaken(o, now)) continue
    else if (o.ok && o.kind === 'remove')
      byComment.set(o.responseId, { ...o, text: REMOVED_BUT_LISTED })
    else byComment.set(o.responseId, o)
  }
  return { byComment, atTop }
}

/**
 * The organizers' Session Feedback page (speaker feedback spec §10.1,
 * §10.3): the stat cards, every session ranked by "Loved it" (fewer than 10
 * responses: "too few", after the rest), and rows that open to the
 * session's comments with Hide, Unhide, Keep and Remove. Above them, while a
 * speaker's flag waits for an organizer, the red flagged-by-speakers box with
 * Keep, Hide and Remove. Presentational; the data and the actions come from
 * `sessionFeedback.admin*`.
 */
export function SessionFeedbackAdmin({
  overview,
  conferenceTitle,
  onHide,
  onUnhide,
  onKeep,
  onRemove,
  refreshFailed,
}: SessionFeedbackAdminProps) {
  const [sort, setSort] = useState<FeedbackSort>('lovedIt')
  // The order on screen, by talk id. A refetch after Hide or Remove keeps
  // it, so the row being worked in never jumps; only a new sort re-ranks.
  const [shown, setShown] = useState<string[]>(() =>
    rankSessions(overview.sessions, 'lovedIt').map((s) => s.talkId),
  )
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, Outcome>>(
    new Map(),
  )
  /** Whose outcome the live region says (its response id). */
  const [announced, setAnnounced] = useState<string | null>(null)
  /** The organizer's latest finished action, which focus may follow. */
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const [retried, setRetried] = useState(false)
  const [removing, setRemoving] = useState<Removal | null>(null)
  // Open apart from `removing`, which stays until the dialog has left, so
  // its title never changes during the closing transition.
  const [asking, setAsking] = useState(false)
  const removingNow = useRef<Removal | null>(null)

  const sessions = keepOrder(shown, overview.sessions, sort)
  const displayed = sessions.map((s) => s.talkId)
  // Rows new to the page join the kept order where they were placed, so a
  // later refetch does not rank them again (React's state-from-render form).
  if (!sameOrder(displayed, shown)) setShown(displayed)
  const ranked = rankSessions(overview.sessions, sort).map((s) => s.talkId)
  const orderKept = !sameOrder(displayed, ranked)
  // A retry's own outcome lasts only while the refetch keeps failing.
  if (!refreshFailed && retried) setRetried(false)
  const { totals } = overview
  // The flagged-by-speakers box: every flagged comment, with its session.
  // Gone with its last comment, unless it still has something to say.
  const flaggedComments = overview.sessions.flatMap((s) =>
    s.comments
      .filter((c) => c.flagged)
      .map((comment) => ({ session: s, comment })),
  )
  const shownOutcomes = [...outcomes.values()]
  const announcedOutcome =
    announced && shownOutcomes.find((o) => o.responseId === announced)
  // Named, as the note at the top of the box is: the region speaks wherever
  // the organizer is on the page.
  const announcement = announcedOutcome
    ? [announcedOutcome.text, announcedOutcome.about].filter(Boolean).join(' ')
    : ''
  const boxOutcomes = shownOutcomes.filter((o) => o.place === 'flagged')
  // Once shown it stays for this visit ("Nothing else is flagged."), so the
  // list below does not jump up when the last flag is resolved.
  const [boxShown, setBoxShown] = useState(false)
  const showBox =
    boxShown || flaggedComments.length > 0 || boxOutcomes.length > 0
  if (showBox && !boxShown) setBoxShown(true)

  const sortButtons = useRef(new Map<FeedbackSort, HTMLButtonElement>())
  const boxHeading = useRef<HTMLHeadingElement>(null)
  const rowToggles = useRef(new Map<string, HTMLButtonElement>())

  function sortBy(key: FeedbackSort) {
    setSort(key)
    setShown(rankSessions(overview.sessions, key).map((s) => s.talkId))
  }

  const record = (ids: string[], outcome: Outcome | null) =>
    setOutcomes((all) => {
      const next = new Map(all)
      for (const id of ids) next.delete(id)
      if (outcome) next.set(outcome.responseId, outcome)
      return next
    })

  async function run(
    { talkId, place }: Where,
    kind: ActionKind,
    ids: string[],
    action: () => Promise<unknown>,
  ) {
    record(ids, null)
    // Emptied in this render and refilled in a later one, so the same words
    // twice in a row still change the region and are announced again.
    setAnnounced(null)
    setPending((p) => new Set([...p, ...ids]))
    const session = overview.sessions.find((s) => s.talkId === talkId)
    const seen = session?.comments.find((c) => c.id === ids[0])
    const at = {
      talkId,
      place,
      responseId: ids[0],
      seenRev: seen?.rev,
      about:
        session && seen
          ? `${session.title}: “${excerpt(seen.comment)}”`
          : undefined,
      kind,
    }
    let outcome: Outcome
    try {
      outcome = { ...at, ...doneNote(kind, ids.length, await action()) }
    } catch (e) {
      outcome = { ...at, ...failureNote(e, !!seen) }
    }
    record(ids, outcome)
    setAnnounced(outcome.responseId)
    // Focus may follow this action, for a moment: never a later background
    // read (a refetch on returning to the tab) moving it.
    setFocusRequest(focusRequestFor(outcome.responseId, place))
    setPending((p) => new Set([...p].filter((id) => !ids.includes(id))))
  }

  const removePending = removing?.ids.some((id) => pending.has(id)) ?? false

  const inRow = (s: AdminFeedbackSession): Where => ({
    talkId: s.talkId,
    place: 'session',
  })
  const inBox = (talkId: string): Where => ({ talkId, place: 'flagged' })

  function askToRemove(where: Where, c: AdminFeedbackComment) {
    const removal: Removal = {
      ...where,
      ids: [c.id],
      comment: c.comment,
      request: { responses: [{ id: c.id, submittedAt: c.submittedAt }] },
    }
    removingNow.current = removal
    setRemoving(removal)
    setAsking(true)
  }

  function toggle(talkId: string) {
    const closing = open.has(talkId)
    setOpen((o) => {
      const next = new Set(o)
      if (!next.delete(talkId)) next.add(talkId)
      return next
    })
    // A collapsed row forgets what went well in it; failures stay.
    if (closing)
      setOutcomes(
        (all) =>
          new Map(
            [...all].filter(
              ([, o]) =>
                !(o.talkId === talkId && o.place === 'session' && o.ok),
            ),
          ),
      )
  }

  return (
    <div className="space-y-6">
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
          // No filter: the flagged box below already lists every flag.
          ...(overview.flagged > 0
            ? [
                {
                  value: overview.flagged,
                  label: 'Flagged',
                  color: 'red' as const,
                },
              ]
            : []),
        ]}
      />

      {/* Always rendered: a screen reader announces text SET in an existing
          live region, not a region that appears with its text. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* The refresh note. Its live region is always in the accessibility
          tree (sr-only while empty, never display:none) and holds only the
          words; Retry sits beside it. Sticky below the admin top bar (72 px below `lg`, h-16 above), so it
          stays in view while the organizer works further down. */}
      <div
        className={
          refreshFailed
            ? 'sticky top-[72px] z-30 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-900 shadow-sm lg:top-16 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200'
            : 'sr-only'
        }
      >
        <p role="status" aria-live="polite">
          {refreshFailed
            ? refreshFailed.retrying
              ? 'Refreshing…'
              : retried
                ? 'Still couldn’t refresh, showing earlier numbers.'
                : 'Couldn’t refresh, showing earlier numbers.'
            : ''}
        </p>
        {refreshFailed && (
          <button
            type="button"
            aria-disabled={refreshFailed.retrying ?? false}
            onClick={() => {
              if (refreshFailed.retrying) return
              setRetried(true)
              refreshFailed.onRetry()
            }}
            className="min-h-11 rounded-md px-3 font-semibold hover:bg-yellow-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-700 aria-disabled:cursor-wait aria-disabled:opacity-60 sm:min-h-9 dark:hover:bg-yellow-900/40"
          >
            {refreshFailed.retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </div>

      {showBox && (
        <FlaggedBox
          headingRef={boxHeading}
          flagged={flaggedComments}
          outcomes={boxOutcomes}
          pending={pending}
          focusRequest={focusRequest}
          onKeep={(talkId, c) =>
            run(inBox(talkId), 'keep', [c.id], () => onKeep(c))
          }
          onHide={(talkId, id) =>
            run(inBox(talkId), 'hide', [id], () => onHide(id))
          }
          onRemove={(talkId, c) => askToRemove(inBox(talkId), c)}
        />
      )}

      <div>
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
                ref={(el) => {
                  if (el) sortButtons.current.set(key, el)
                  else sortButtons.current.delete(key)
                }}
                type="button"
                aria-pressed={sort === key}
                onClick={() => sortBy(key)}
                className="min-h-11 rounded-md px-2 py-1 text-xs font-semibold tracking-wide uppercase hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-pressed:bg-brand-sky-mist aria-pressed:text-brand-cloud-blue sm:-mx-2 sm:min-h-0 sm:justify-self-end dark:hover:bg-gray-700 dark:aria-pressed:bg-blue-900/40 dark:aria-pressed:text-blue-300"
              >
                {label}
                {sort === key && <span aria-hidden="true"> ↓</span>}
              </button>
            ))}
          </div>

          {orderKept && (
            <p className="flex flex-wrap items-center gap-x-2 border-b border-gray-200 px-4 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
              Order kept while you work
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => {
                  sortBy(sort)
                  // This button goes with the cue; keep focus on the sort.
                  sortButtons.current.get(sort)?.focus()
                }}
                className="min-h-11 rounded-md px-1 font-semibold text-brand-cloud-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue sm:min-h-0 dark:text-blue-300"
              >
                Re-sort
              </button>
            </p>
          )}
          {sessions.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-600 dark:text-gray-400">
              No confirmed sessions yet. Each confirmed talk appears here with
              its feedback.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {sessions.map((session) => (
                <SessionRow
                  toggleRef={(el) => {
                    if (el) rowToggles.current.set(session.talkId, el)
                    else rowToggles.current.delete(session.talkId)
                  }}
                  key={session.talkId}
                  session={session}
                  open={open.has(session.talkId)}
                  onToggle={() => toggle(session.talkId)}
                  pending={pending}
                  focusRequest={focusRequest}
                  outcomes={shownOutcomes.filter(
                    (o) => o.talkId === session.talkId && o.place === 'session',
                  )}
                  onHide={(id) =>
                    run(inRow(session), 'hide', [id], () => onHide(id))
                  }
                  onUnhide={(id) =>
                    run(inRow(session), 'unhide', [id], () => onUnhide(id))
                  }
                  onKeep={(c) =>
                    run(inRow(session), 'keep', [c.id], () => onKeep(c))
                  }
                  onRemove={(c) => askToRemove(inRow(session), c)}
                />
              ))}
            </ul>
          )}
        </section>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Sessions with fewer than {MIN_RANKED_RESPONSES} responses show “too
          few” and rank after the rest.
        </p>
      </div>

      <ConfirmationModal
        isOpen={asking}
        // Not while the delete runs: its outcome belongs to this question.
        onClose={() => {
          if (!removePending) setAsking(false)
        }}
        afterLeave={() => {
          const removal = removing
          setRemoving(null)
          // A Remove that worked took its button away while the dialog held
          // focus, so there is no trigger to return to: focus goes to where
          // the comment was, the box's heading or the session's row.
          // Checked once the dialog itself has gone (it holds focus until
          // it unmounts, just after this).
          if (removal)
            setTimeout(() => {
              if (!focusLost()) return
              ;(removal.place === 'flagged'
                ? boxHeading.current
                : rowToggles.current.get(removal.talkId)
              )?.focus()
            })
        }}
        onConfirm={async () => {
          const removal = removing
          if (!removal || removePending) return
          await run(removal, 'remove', removal.ids, () =>
            onRemove(removal.request),
          )
          // Closed either way, the outcome is on the page behind it; but only
          // if this is still the question that asked for this delete.
          if (removingNow.current === removal) setAsking(false)
        }}
        title={removeQuestion(removing?.ids.length ?? 0)}
        message={removeMessage(removing?.ids.length ?? 0)}
        confirmButtonText="Remove"
        variant="danger"
        isLoading={removePending}
        guardSecondTap
      >
        {removing?.comment && (
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
  toggleRef,
  open,
  onToggle,
  pending,
  focusRequest,
  outcomes,
  onHide,
  onUnhide,
  onKeep,
  onRemove,
}: {
  session: AdminFeedbackSession
  /** The row's toggle, for focus to return to after a Remove. */
  toggleRef: (el: HTMLButtonElement | null) => void
  open: boolean
  onToggle: () => void
  pending: ReadonlySet<string>
  focusRequest: FocusRequest | null
  /** The outcomes of actions in this session's row. */
  outcomes: readonly Outcome[]
  onHide: (id: string) => void
  onUnhide: (id: string) => void
  onKeep: (comment: AdminFeedbackComment) => void
  onRemove: (comment: AdminFeedbackComment) => void
}) {
  const panelId = useId()
  const { totals, comments } = session
  const tooFew = hasTooFew(totals)
  const flagged = comments.some((c) => c.flagged)
  const { byComment, atTop } = placeOutcomes(outcomes, comments)
  const meta = [
    session.speakers.join(', '),
    session.format ? formats.get(session.format) : null,
    session.slotAt ? formatConferenceDayTime(session.slotAt) : null,
  ].filter(Boolean)

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        ref={toggleRef}
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
              {flagged && (
                <>
                  <FlagIcon
                    aria-hidden="true"
                    className="ml-1.5 inline size-4 align-[-2px] text-red-600 dark:text-red-400"
                  />
                  <span className="sr-only"> (a comment is flagged)</span>
                </>
              )}
            </span>
            {meta.length > 0 && (
              <span className="mt-0.5 block text-xs wrap-break-word text-gray-600 dark:text-gray-400">
                {meta.join(' · ')}
              </span>
            )}
          </span>
        </span>
        <ColourBar totals={totals} className="ml-6 h-2 sm:ml-0" />
        <span className="flex flex-wrap gap-x-3 gap-y-1 pl-6 text-sm text-gray-700 tabular-nums sm:contents dark:text-gray-300">
          <span className="sm:text-right">
            {tooFew ? (
              <span className="text-gray-500 dark:text-gray-400">
                too few<span className="sm:sr-only"> to rank</span>
              </span>
            ) : (
              <>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {totals.lovedItPercent}%
                </span>
                <span className="sm:sr-only"> loved it</span>
              </>
            )}
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
            {atTop && <OutcomeNote outcome={atTop} className="mb-2" named />}
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
                    place="session"
                    pending={pending.has(c.id)}
                    focusRequest={focusRequest}
                    note={byComment.get(c.id) ?? null}
                    onHide={() => onHide(c.id)}
                    onUnhide={() => onUnhide(c.id)}
                    onKeep={() => onKeep(c)}
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

/**
 * The red flagged-by-speakers box (§10.1): every comment a speaker flagged
 * that no organizer has acted on, with its session's title, and Keep, Hide
 * and Remove. Outcomes are said here, beside the comment while it is still
 * listed, then once at the top when it has gone (Keep, Hide and Remove all
 * take it out of the box).
 */
function FlaggedBox({
  flagged,
  headingRef: heading,
  outcomes,
  pending,
  focusRequest,
  onKeep,
  onHide,
  onRemove,
}: {
  flagged: { session: AdminFeedbackSession; comment: AdminFeedbackComment }[]
  /** The heading, which focus may go to; the page holds it. */
  headingRef: React.RefObject<HTMLHeadingElement | null>
  outcomes: readonly Outcome[]
  pending: ReadonlySet<string>
  focusRequest: FocusRequest | null
  onKeep: (talkId: string, comment: AdminFeedbackComment) => void
  onHide: (talkId: string, id: string) => void
  onRemove: (talkId: string, comment: AdminFeedbackComment) => void
}) {
  const headingId = useId()
  const { byComment, atTop } = placeOutcomes(
    outcomes,
    flagged.map(({ comment }) => comment),
  )
  // Keep, Hide and Remove all take the comment out of the box, and the
  // button that had focus with it: focus goes to the box's heading. Not to
  // the outcome's note, which the page's live region already says; and only
  // after the organizer's own action, never a background re-read.
  const topKey = atTop && `${atTop.responseId}:${atTop.kind}:${atTop.text}`
  useEffect(() => {
    if (topKey && focusWanted(focusRequest, 'flagged') && focusLost())
      heading.current?.focus()
  }, [topKey, focusRequest, heading])
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/40"
    >
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="flex items-center gap-2 text-base font-semibold text-red-800 dark:text-red-200"
      >
        <FlagIcon className="size-5 shrink-0" aria-hidden="true" />
        Flagged by speakers
        {flagged.length > 0 && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
            {flagged.length}
          </span>
        )}
      </h2>
      <p className="mt-1 text-sm text-red-800 dark:text-red-200">
        Keep clears the flag, Hide takes the comment off the speakers&rsquo;
        view, Remove deletes the response. Speakers aren&rsquo;t notified.
      </p>
      {atTop && <OutcomeNote outcome={atTop} className="mt-2" named />}
      {flagged.length === 0 ? (
        <p className="mt-2 text-sm text-red-800 dark:text-red-200">
          Nothing else is flagged.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-red-200 dark:divide-red-900">
          {flagged.map(({ session, comment }) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              place="flagged"
              sessionTitle={session.title}
              pending={pending.has(comment.id)}
              focusRequest={focusRequest}
              note={byComment.get(comment.id) ?? null}
              onKeep={() => onKeep(session.talkId, comment)}
              onHide={() => onHide(session.talkId, comment.id)}
              onRemove={() => onRemove(session.talkId, comment)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Combined counts per colour, split into scanned and cards (§4.3). */
function Breakdown({ totals }: { totals: FeedbackTotals }) {
  return (
    <dl className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 tabular-nums dark:text-gray-400">
      {ANSWERS.map(({ colour, label }) => (
        <div key={colour} className="flex items-baseline gap-1">
          <dt
            className={`font-medium whitespace-nowrap ${FEEDBACK_TONE[colour].text}`}
          >
            {label}
          </dt>
          <dd>
            {totals.combined[colour]} ({totals.scanned[colour]} scanned
            {totals.cards[colour] > 0 && `, ${totals.cards[colour]} cards`})
          </dd>
        </div>
      ))}
    </dl>
  )
}
