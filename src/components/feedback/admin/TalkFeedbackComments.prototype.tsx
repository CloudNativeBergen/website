'use client'

/**
 * PROTOTYPE (wayfinder #1571) — never merged. Static fixtures, local state.
 *
 * QUESTION: how does a Judgement on a Feedback Response's comment show up
 * in the organizer's Session Feedback view, next to the speaker's flag?
 *
 *   A · Flag with its source   A Judgement IS a flag: same red pill, same
 *                               Keep / Hide / Remove, the pill names who
 *                               flagged it (a speaker, automatically, both).
 *   B · Beside, with a filter  Speaker flags unchanged. A quiet amber chip
 *                               on the comment, and a filter above the list
 *                               ("Likely unsafe (n)") the organizer toggles.
 *   C · Triage strip           Both: counts at the top (flagged by speaker,
 *                               likely unsafe, not checked) that filter the
 *                               list; a flagged comment's text is collapsed
 *                               until opened.
 *
 * `CommentRow` is a copy of `CommentItem` (FeedbackCommentItem.tsx) with the
 * marks row and the text made pluggable; everything else is imported.
 */

import { useId, useState, type ReactNode } from 'react'
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  EllipsisHorizontalCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type { AdminFeedbackComment } from '@/lib/feedback/admin'
import { feedbackTotals } from '@/lib/feedback/totals'
import { plural } from '@/lib/text/display'
import { formatConferenceDayTime } from '@/lib/time'
import { ANSWERS } from '../answers'
import { ColourBar, FEEDBACK_TONE } from '../tone'
import {
  ACTION,
  DONE,
  OutcomeNote,
  removeMessage,
  removeQuestion,
  type Note,
} from './FeedbackCommentItem'

/* ───────────────────────────── Domain ───────────────────────────── */

export type Reason = 'abusive' | 'sexual' | 'spam' | 'personal_info'

/** Jev's four answers, each a probability; `null` = not judged. */
export type Judgement = { scores: Record<Reason, number> } | null

export interface ProtoComment extends AdminFeedbackComment {
  judgement: Judgement
  /**
   * An organizer's earlier Keep. TODAY THIS DOES NOT EXIST: Keep only
   * unsets `flaggedAt`. Every variant below needs it stored, or Jev's
   * advice comes straight back after a Keep.
   */
  kept?: { by: string; at: string }
}

/** Organizer copy per reason: what to check, not what Jev "thinks". */
export const REASON_COPY: Record<Reason, string> = {
  abusive: 'may be abusive',
  sexual: 'may be sexual',
  spam: 'looks like spam',
  personal_info: 'may contain personal details',
}

const THRESHOLD = 0.5

/** The reasons at or over the threshold, strongest first. */
export function concerns(j: Judgement): { reason: Reason; score: number }[] {
  if (!j) return []
  return (Object.entries(j.scores) as [Reason, number][])
    .filter(([, score]) => score >= THRESHOLD)
    .map(([reason, score]) => ({ reason, score }))
    .sort((a, b) => b.score - a.score)
}

export const likelyUnsafe = (c: ProtoComment) => concerns(c.judgement).length > 0

/** "may be abusive, may be sexual (82%)": the reasons and the top score. */
export function concernText(c: ProtoComment) {
  const list = concerns(c.judgement)
  if (list.length === 0) return ''
  return `${list.map((x) => REASON_COPY[x.reason]).join(', ')} (${Math.round(list[0].score * 100)}%)`
}

/* ─────────────────────────── Fixtures ──────────────────────────── */

const id = (n: number) => `feedbackResponse-${String(n).padStart(32, '0')}`
const at = (hhmm: string) => `2026-10-27T${hhmm}:00.000Z`
const scores = (
  abusive = 0,
  sexual = 0,
  spam = 0,
  personal_info = 0,
): Judgement => ({ scores: { abusive, sexual, spam, personal_info } })

let n = 0
const make = (
  colour: AdminFeedbackComment['colour'],
  hhmm: string,
  comment: string,
  judgement: Judgement,
  fields: Partial<ProtoComment> = {},
): ProtoComment => ({
  id: id(++n),
  colour,
  comment,
  submittedAt: at(hhmm),
  hidden: false,
  flagged: false,
  rev: `rev-${n}`,
  judgement,
  ...fields,
})

/** Oldest first, as the real panel lists them. */
export const COMMENTS: ProtoComment[] = [
  // Harsh but fair: must never look flagged.
  make(
    'yellow',
    '08:33',
    'The demo failed and the talk ran 15 min over. Cut the second half next time.',
    scores(0.14, 0, 0.01, 0),
  ),
  // Flagged by the speaker AND likely unsafe.
  make(
    'red',
    '08:41',
    'Speakeren er en idiot, og det er alle som likte dette også.',
    scores(0.88, 0.01, 0.02, 0),
    { flagged: true },
  ),
  // Likely unsafe only: a phone number.
  make(
    'red',
    '08:52',
    'Ring meg på 041 23 456 så skal jeg forklare hva som var galt.',
    scores(0.05, 0, 0.03, 0.93),
  ),
  // Not judged: Jev was off or slow.
  make(
    'green',
    '08:55',
    'Kjempebra! Elsker når noen tør å vise feil live.',
    null,
  ),
  // Flagged by the speaker, nothing found automatically.
  make(
    'yellow',
    '09:03',
    'Litt mye salg av eget produkt, men greit innhold.',
    scores(0.08, 0, 0.31, 0),
    { flagged: true },
  ),
  // Likely unsafe, but an organizer already kept it.
  make(
    'green',
    '09:17',
    'Send gjerne slides til hele teamet, vi sitter i 3. etasje ved kantina.',
    scores(0.02, 0, 0.04, 0.61),
    { kept: { by: 'Kari', at: at('10:14') } },
  ),
  // Two reasons at once.
  make(
    'red',
    '09:24',
    'Hot speaker, would love to see more of her after the party 😏',
    scores(0.71, 0.82, 0.01, 0),
  ),
  make(
    'red',
    '09:51',
    'Buy 10k followers now → followz.example, cheap cheap cheap',
    scores(0.03, 0, 0.97, 0.1),
  ),
  // Already hidden by an organizer: the flag is gone, as today.
  make(
    'red',
    '09:55',
    'Hun burde holde seg til kjøkkenet.',
    scores(0.91, 0.05, 0, 0),
    { hidden: true },
  ),
  make(
    'green',
    '10:02',
    'Best talk of the day. The live demo actually worked!',
    scores(0.01, 0, 0.02, 0.01),
  ),
]

export const TOTALS = feedbackTotals({
  live: { green: 31, yellow: 6, red: 4 },
  cards: { greenCount: 12, yellowCount: 3, redCount: 0 },
})

/* ─────────────────────── Shared local state ─────────────────────── */

function useLocalModeration(initial: ProtoComment[]) {
  const [comments, setComments] = useState(initial)
  const [notes, setNotes] = useState<ReadonlyMap<string, Note>>(new Map())
  const [removing, setRemoving] = useState<ProtoComment | null>(null)
  const note = (id: string, text: string) =>
    setNotes((all) => new Map(all).set(id, { ok: true, text }))
  const patch = (id: string, fields: Partial<ProtoComment>) =>
    setComments((all) =>
      all.map((c) => (c.id === id ? { ...c, ...fields } : c)),
    )
  return {
    comments,
    notes,
    removing,
    keep(id: string) {
      patch(id, {
        flagged: false,
        kept: { by: 'you', at: new Date().toISOString() },
      })
      note(id, DONE.keep(1))
    },
    hide(id: string) {
      patch(id, { hidden: true, flagged: false })
      note(id, DONE.hide(1))
    },
    unhide(id: string) {
      patch(id, { hidden: false })
      note(id, DONE.unhide(1))
    },
    askRemove: setRemoving,
    confirmRemove() {
      if (!removing) return
      setComments((all) => all.filter((c) => c.id !== removing.id))
      setRemoving(null)
    },
  }
}

type Moderation = ReturnType<typeof useLocalModeration>

/* ────────────────────────── Shared pieces ───────────────────────── */

const PILL =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium'
const PILL_RED = `${PILL} bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300`
const PILL_AMBER = `${PILL} bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200`
const PILL_GRAY = `${PILL} bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200`
const PILL_NONE = `${PILL} border border-dashed border-gray-400 text-gray-600 dark:border-gray-500 dark:text-gray-400`

function HiddenPill() {
  return (
    <span className={PILL_GRAY}>
      <EyeSlashIcon className="size-3.5" aria-hidden="true" />
      Hidden from speakers
    </span>
  )
}

/** Not judged: distinct from "nothing found", without alarm. */
function NotCheckedPill() {
  return (
    <span className={PILL_NONE}>
      <EllipsisHorizontalCircleIcon className="size-3.5" aria-hidden="true" />
      Not checked
    </span>
  )
}

/** An earlier Keep, with what it overrode: quiet, so it does not re-alarm. */
function KeptLine({ c }: { c: ProtoComment }) {
  if (!c.kept) return null
  const was = concernText(c)
  return (
    <span className="text-gray-500 dark:text-gray-400">
      <CheckIcon className="mr-1 inline size-3.5" aria-hidden="true" />
      Kept by {c.kept.by}, {formatConferenceDayTime(c.kept.at)}
      {was && ` · was: ${was}`}
    </span>
  )
}

/**
 * A copy of `CommentItem` (stacked, place=session) with the marks after
 * the colour and time, and the text, pluggable.
 */
function CommentRow({
  comment,
  marks,
  body,
  note,
  showKeep,
  mod,
}: {
  comment: ProtoComment
  marks: ReactNode
  /** The comment's text, or something standing in for it (C). */
  body?: ReactNode
  note: Note | null
  showKeep: boolean
  mod: Moderation
}) {
  const textId = useId()
  const answer = ANSWERS.find((a) => a.colour === comment.colour)!
  const { Icon } = answer
  return (
    <li className="flex flex-col gap-2 py-3">
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
              {formatConferenceDayTime(comment.submittedAt)}
            </time>
          )}
          {comment.hidden && <HiddenPill />}
          {marks}
        </p>
        {body ?? (
          <p
            id={textId}
            tabIndex={-1}
            className={`mt-1 text-sm wrap-break-word whitespace-pre-line ${comment.hidden ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
          >
            {comment.comment}
          </p>
        )}
        {note && <OutcomeNote outcome={note} className="mt-2" />}
      </div>
      <div className="-ml-2.5 flex flex-wrap gap-1">
        {showKeep && (
          <button
            type="button"
            aria-describedby={textId}
            onClick={() => mod.keep(comment.id)}
            className={`${ACTION} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
          >
            <CheckIcon className="size-4" aria-hidden="true" />
            Keep
          </button>
        )}
        {comment.hidden ? (
          <button
            type="button"
            aria-describedby={textId}
            onClick={() => mod.unhide(comment.id)}
            className={`${ACTION} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
          >
            <EyeIcon className="size-4" aria-hidden="true" />
            Unhide
          </button>
        ) : (
          <button
            type="button"
            aria-describedby={textId}
            onClick={() => mod.hide(comment.id)}
            className={`${ACTION} text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700`}
          >
            <EyeSlashIcon className="size-4" aria-hidden="true" />
            Hide
          </button>
        )}
        <button
          type="button"
          aria-describedby={textId}
          onClick={() => mod.askRemove(comment)}
          className={`${ACTION} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30`}
        >
          <TrashIcon className="size-4" aria-hidden="true" />
          Remove
        </button>
      </div>
    </li>
  )
}

/** The Remove confirmation, as the real panel asks it. */
function RemoveAsk({ mod }: { mod: Moderation }) {
  return (
    <ConfirmationModal
      isOpen={!!mod.removing}
      onClose={() => mod.askRemove(null)}
      onConfirm={mod.confirmRemove}
      title={removeQuestion(1)}
      message={removeMessage(1)}
      confirmButtonText="Remove"
      variant="danger"
    >
      {mod.removing && (
        <blockquote className="mt-3 border-l-2 border-gray-300 pl-3 text-sm wrap-break-word whitespace-pre-line text-gray-700 dark:border-gray-600 dark:text-gray-300">
          {mod.removing.comment}
        </blockquote>
      )}
    </ConfirmationModal>
  )
}

/**
 * The Session Feedback card as it stands on `/admin/proposals/[id]`, with
 * the parts the prototype leaves alone (Card Counts, Feedback Code,
 * Responses over time) stood in for by one muted block.
 */
function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Session Feedback"
      className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="space-y-3 p-4">
        <h3 className="flex items-center text-lg font-semibold text-gray-900 dark:text-white">
          <ChatBubbleLeftRightIcon className="mr-2 size-5" aria-hidden="true" />
          Session Feedback
        </h3>
        <ColourBar totals={TOTALS} className="h-2" />
        <p className="text-sm text-gray-700 tabular-nums dark:text-gray-300">
          {plural(TOTALS.total, 'response', 'responses')}
          {TOTALS.lovedItPercent !== null &&
            ` · ${TOTALS.lovedItPercent}% loved it`}
          {' · '}
          {TOTALS.scannedTotal} scanned, {TOTALS.cardsTotal} cards
        </p>
        <p className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
          Card Counts, Feedback Code and Responses over time: as today.
        </p>
      </div>
      {children}
    </section>
  )
}

function CommentsHeading({
  count,
  children,
}: {
  count: number
  children?: ReactNode
}) {
  return (
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
      Comments{count > 0 && ` (${count})`}
      {children}
    </h4>
  )
}

/* ─────────────── A · Flag with its source ─────────────── */

/** A: flagged by anyone, not yet dealt with. */
const needsReviewA = (c: ProtoComment) =>
  !c.hidden && !c.kept && (c.flagged || likelyUnsafe(c))

function sourceA(c: ProtoComment) {
  const auto = concernText(c)
  if (c.flagged && auto) return `Flagged by a speaker and automatically: ${auto}`
  if (c.flagged) return 'Flagged by a speaker'
  return `Flagged automatically: ${auto}`
}

export function VariantA() {
  const mod = useLocalModeration(COMMENTS)
  const open = mod.comments.filter(needsReviewA).length
  return (
    <PanelFrame>
      <section aria-label="Comments" className="p-4">
        <CommentsHeading count={mod.comments.length}>
          {open > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
              <FlagIcon className="size-3.5" aria-hidden="true" />
              {open} flagged
            </span>
          )}
        </CommentsHeading>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {mod.comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              mod={mod}
              note={mod.notes.get(c.id) ?? null}
              showKeep={needsReviewA(c)}
              marks={
                <>
                  {needsReviewA(c) && (
                    <span className={PILL_RED}>
                      <FlagIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      {sourceA(c)}
                    </span>
                  )}
                  {c.hidden && likelyUnsafe(c) && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {concernText(c)}
                    </span>
                  )}
                  {c.kept && <KeptLine c={c} />}
                  {!c.judgement && !c.hidden && <NotCheckedPill />}
                </>
              }
            />
          ))}
        </ul>
      </section>
      <RemoveAsk mod={mod} />
    </PanelFrame>
  )
}

/* ─────────────── B · Beside, with a filter ─────────────── */

type FilterB = 'all' | 'unsafe' | 'unchecked'

/** B: Jev's open advice: likely unsafe, not hidden, not yet kept. */
const adviceOpenB = (c: ProtoComment) =>
  !c.hidden && !c.kept && likelyUnsafe(c)

const FILTER_BUTTON =
  'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue'

export function VariantB() {
  const mod = useLocalModeration(COMMENTS)
  const [filter, setFilter] = useState<FilterB>('all')
  const unsafe = mod.comments.filter(adviceOpenB).length
  const unchecked = mod.comments.filter((c) => !c.judgement).length
  const shown = mod.comments.filter((c) =>
    filter === 'unsafe'
      ? adviceOpenB(c)
      : filter === 'unchecked'
        ? !c.judgement
        : true,
  )
  const chip = (value: FilterB, label: string, count: number) => {
    const on = filter === value
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setFilter(on ? 'all' : value)}
        className={`${FILTER_BUTTON} ${
          on
            ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
            : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        {label} {count}
      </button>
    )
  }
  return (
    <PanelFrame>
      <section aria-label="Comments" className="p-4">
        <CommentsHeading count={mod.comments.length} />
        <div
          role="group"
          aria-label="Show"
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {chip('all', 'All', mod.comments.length)}
          {chip('unsafe', 'Likely unsafe', unsafe)}
          {chip('unchecked', 'Not checked', unchecked)}
        </div>
        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Nothing here.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {shown.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                mod={mod}
                note={mod.notes.get(c.id) ?? null}
                // Keep exists for a speaker's flag only, as today.
                showKeep={c.flagged}
                marks={
                  <>
                    {c.flagged && (
                      <span className={PILL_RED}>
                        <FlagIcon className="size-3.5" aria-hidden="true" />
                        Flagged by a speaker
                      </span>
                    )}
                    {adviceOpenB(c) && (
                      <span className={PILL_AMBER}>
                        <ExclamationTriangleIcon
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        Check this: {concernText(c)}
                      </span>
                    )}
                    {c.hidden && likelyUnsafe(c) && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {concernText(c)}
                      </span>
                    )}
                    {c.kept && <KeptLine c={c} />}
                    {!c.judgement && !c.hidden && <NotCheckedPill />}
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>
      <RemoveAsk mod={mod} />
    </PanelFrame>
  )
}

/* ─────────────── C · Triage strip, text collapsed ─────────────── */

type FilterC = 'all' | 'speaker' | 'unsafe' | 'unchecked'

const openC = (c: ProtoComment) => !c.hidden && !c.kept
const bySpeakerC = (c: ProtoComment) => openC(c) && c.flagged
const unsafeC = (c: ProtoComment) => openC(c) && likelyUnsafe(c)
const collapsedC = (c: ProtoComment) => bySpeakerC(c) || unsafeC(c)

function whyC(c: ProtoComment) {
  const parts: string[] = []
  if (c.flagged) parts.push('Flagged by a speaker')
  if (likelyUnsafe(c)) parts.push(`Likely unsafe: ${concernText(c)}`)
  else if (c.flagged && c.judgement) parts.push('nothing found automatically')
  return parts.join(' · ')
}

export function VariantC() {
  const mod = useLocalModeration(COMMENTS)
  const [filter, setFilter] = useState<FilterC>('all')
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const counts = {
    speaker: mod.comments.filter(bySpeakerC).length,
    unsafe: mod.comments.filter(unsafeC).length,
    unchecked: mod.comments.filter((c) => !c.judgement).length,
  }
  const shown = mod.comments.filter((c) =>
    filter === 'speaker'
      ? bySpeakerC(c)
      : filter === 'unsafe'
        ? unsafeC(c)
        : filter === 'unchecked'
          ? !c.judgement
          : true,
  )
  const tile = (
    value: Exclude<FilterC, 'all'>,
    label: string,
    count: number,
    tone: string,
  ) => {
    const on = filter === value
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setFilter(on ? 'all' : value)}
        className={`min-w-0 rounded-md border px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue ${
          on
            ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white'
            : 'border-transparent'
        } ${tone}`}
      >
        <span className="block text-lg leading-tight font-bold tabular-nums">
          {count}
        </span>
        <span className="block text-xs leading-tight font-medium wrap-break-word">
          {label}
        </span>
      </button>
    )
  }
  return (
    <PanelFrame>
      <section aria-label="Comments" className="p-4">
        <CommentsHeading count={mod.comments.length} />
        <div
          role="group"
          aria-label="Needs a look"
          className="mt-2 grid grid-cols-3 gap-1.5"
        >
          {tile(
            'speaker',
            'Flagged by speaker',
            counts.speaker,
            'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200',
          )}
          {tile(
            'unsafe',
            'Likely unsafe',
            counts.unsafe,
            'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
          )}
          {tile(
            'unchecked',
            'Not checked',
            counts.unchecked,
            'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
          )}
        </div>
        {filter !== 'all' && (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Showing {shown.length} of {mod.comments.length}.{' '}
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="font-medium text-brand-cloud-blue underline-offset-2 hover:underline dark:text-indigo-300"
            >
              Show all
            </button>
          </p>
        )}
        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Nothing here.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {shown.map((c) => {
              const closed = collapsedC(c) && !opened.has(c.id)
              return (
                <CommentRow
                  key={c.id}
                  comment={c}
                  mod={mod}
                  note={mod.notes.get(c.id) ?? null}
                  showKeep={collapsedC(c)}
                  marks={
                    <>
                      {c.hidden && likelyUnsafe(c) && (
                        <span className="text-gray-500 dark:text-gray-400">
                          {concernText(c)}
                        </span>
                      )}
                      {c.kept && <KeptLine c={c} />}
                      {!c.judgement && !c.hidden && <NotCheckedPill />}
                    </>
                  }
                  body={
                    collapsedC(c) ? (
                      <div className="mt-1">
                        <p
                          className={`flex items-start gap-1.5 text-xs font-medium ${
                            c.flagged
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-amber-800 dark:text-amber-200'
                          }`}
                        >
                          {c.flagged ? (
                            <FlagIcon
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <ExclamationTriangleIcon
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <span>{whyC(c)}</span>
                        </p>
                        {closed ? (
                          <button
                            type="button"
                            onClick={() =>
                              setOpened((s) => new Set([...s, c.id]))
                            }
                            className="mt-1 inline-flex min-h-8 items-center rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Show comment
                          </button>
                        ) : (
                          <p className="mt-1 text-sm wrap-break-word whitespace-pre-line text-gray-900 dark:text-gray-100">
                            {c.comment}
                          </p>
                        )}
                      </div>
                    ) : undefined
                  }
                />
              )
            })}
          </ul>
        )}
      </section>
      <RemoveAsk mod={mod} />
    </PanelFrame>
  )
}
