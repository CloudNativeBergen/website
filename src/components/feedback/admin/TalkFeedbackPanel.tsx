'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChatBubbleLeftRightIcon, CheckIcon } from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type {
  AdminFeedbackComment,
  AdminTalkFeedback,
} from '@/lib/feedback/admin'
import type { RangeRemoved, RangeToRemove } from '@/lib/feedback/bulk-remove'
import type { FeedbackColour } from '@/lib/feedback/colour'
import { feedbackTotals, type ColourCounts } from '@/lib/feedback/totals'
import { plural } from '@/lib/text/display'
import { ANSWERS } from '../answers'
import { ColourBar, FEEDBACK_TONE } from '../tone'
import {
  CommentItem,
  DONE,
  errorText,
  OutcomeNote,
  REMOVED_BUT_LISTED,
  removeMessage,
  removeQuestion,
  type ActionKind,
  type Note,
} from './FeedbackCommentItem'
import { ResponsesOverTime } from './ResponsesOverTime'

type CardDraft = Record<FeedbackColour, string>

const COUNT = /^\d{1,6}$/

const sameCounts = (a: ColourCounts, b: ColourCounts) =>
  ANSWERS.every(({ colour }) => a[colour] === b[colour])

/** Counts saved, and the counts the read showed when they were. */
interface SavedCards {
  cards: ColourCounts
  over: ColourCounts
}

export interface TalkFeedbackPanelProps {
  feedback: AdminTalkFeedback
  /** The Feedback Code section, for a talk that may hold one. */
  code?: ReactNode
  /** Save the Card Counts (`proposal.updateAudienceFeedback`). */
  onSaveCards: (cards: ColourCounts) => Promise<unknown>
  onHide: (responseId: string) => Promise<unknown>
  onUnhide: (responseId: string) => Promise<unknown>
  /** Remove comments (all or nothing). */
  onRemove: (responseIds: string[]) => Promise<unknown>
  /** Remove a range from the chart (§10.2): only the answers seen in it. */
  onRemoveRange: (range: RangeToRemove) => Promise<RangeRemoved>
}

/**
 * A TALK'S SESSION FEEDBACK on its admin page (speaker feedback spec §10.2),
 * in place of the old Card Counts panel: totals per colour split into
 * scanned and Card Counts, the counts editable where they stand; the
 * Feedback Code with Mint and Rotate; responses over time with Remove by
 * range; and every comment with Hide, Unhide and Remove. Presentational; the
 * data and actions come from `sessionFeedback.adminTalk` and friends.
 */
export function TalkFeedbackPanel({
  feedback,
  code,
  onSaveCards,
  onHide,
  onUnhide,
  onRemove,
  onRemoveRange,
}: TalkFeedbackPanelProps) {
  const { comments } = feedback
  const formId = useId()
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [cardsNote, setCardsNote] = useState<Note | null>(null)
  // The read after a save goes through GROQ, which can lag the commit by
  // about a second: the saved counts stay on screen until a read shows them,
  // or shows anything newer than what was on screen when they were saved.
  const [saved, setSaved] = useState<SavedCards | null>(null)
  const read = feedback.totals.cards
  if (saved && (sameCounts(read, saved.cards) || !sameCounts(read, saved.over)))
    setSaved(null)
  const totals = saved
    ? feedbackTotals({
        // `scanned` holds the live and folded answers; only cards change.
        live: feedback.totals.scanned,
        cards: {
          greenCount: saved.cards.green,
          yellowCount: saved.cards.yellow,
          redCount: saved.cards.red,
        },
      })
    : feedback.totals

  const shown = (colour: FeedbackColour) =>
    draft?.[colour] ?? String(totals.cards[colour])
  const wrong = (colour: FeedbackColour) =>
    !!draft && !COUNT.test(draft[colour].trim())
  const invalid = ANSWERS.some(({ colour }) => wrong(colour))
  const errorId = useId()

  async function saveCards() {
    if (!draft || invalid || saving) return
    setSaving(true)
    setCardsNote(null)
    try {
      const cards = {
        green: Number(draft.green),
        yellow: Number(draft.yellow),
        red: Number(draft.red),
      }
      await onSaveCards(cards)
      setSaved({ cards, over: totals.cards })
      setDraft(null)
      setCardsNote({ ok: true, text: 'Card Counts saved.' })
    } catch (e) {
      setCardsNote({
        ok: false,
        text: errorText(e, 'The Card Counts could not be saved. Try again.'),
      })
    }
    setSaving(false)
  }

  return (
    <section
      aria-label="Session Feedback"
      className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
    >
      {/* A container: the tiles sit three abreast only where they fit. */}
      <div className="@container space-y-3 p-4">
        <h3 className="flex items-center text-lg font-semibold text-gray-900 dark:text-white">
          <ChatBubbleLeftRightIcon className="mr-2 size-5" aria-hidden="true" />
          Session Feedback
        </h3>
        <ColourBar totals={totals} className="h-2" />
        <p className="text-sm text-gray-700 tabular-nums dark:text-gray-300">
          {plural(totals.total, 'response', 'responses')}
          {totals.lovedItPercent !== null &&
            ` · ${totals.lovedItPercent}% loved it`}
          {' · '}
          {totals.scannedTotal} scanned, {totals.cardsTotal} cards
        </p>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            void saveCards()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && draft && !saving) {
              e.preventDefault()
              setDraft(null)
            }
          }}
          className="grid grid-cols-1 gap-2 @[16rem]:grid-cols-3"
        >
          {ANSWERS.map(({ colour, label }) => (
            <div
              key={colour}
              className={`min-w-0 rounded-md p-2 ${FEEDBACK_TONE[colour].tile}`}
            >
              <p
                className={`text-xs font-medium ${FEEDBACK_TONE[colour].text}`}
              >
                {label}
              </p>
              <p className="text-2xl font-bold wrap-break-word text-gray-900 tabular-nums dark:text-white">
                {totals.combined[colour]}
              </p>
              <p className="text-xs wrap-break-word text-gray-600 tabular-nums dark:text-gray-400">
                {totals.scanned[colour]} scanned
              </p>
              <label className="mt-1 block text-xs text-gray-600 dark:text-gray-400">
                Cards
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={`${label} cards`}
                  value={shown(colour)}
                  // Locked while a save runs: an edit made then would be
                  // dropped when the save lands, under "Card Counts saved."
                  readOnly={saving}
                  aria-invalid={wrong(colour)}
                  aria-describedby={wrong(colour) ? errorId : undefined}
                  onChange={(e) => {
                    if (saving) return
                    setDraft({
                      green: shown('green'),
                      yellow: shown('yellow'),
                      red: shown('red'),
                      [colour]: e.target.value,
                    })
                  }}
                  className="mt-0.5 block w-full rounded-md bg-white px-2 py-1 text-base text-gray-900 tabular-nums outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 aria-invalid:outline-red-500 sm:text-sm dark:bg-white/5 dark:text-white dark:outline-white/10 dark:focus:outline-indigo-500"
                />
              </label>
            </div>
          ))}
        </form>
        {draft && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              form={formId}
              disabled={invalid || saving}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-brand-cloud-blue px-3 text-sm font-semibold text-white shadow-xs hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              <CheckIcon className="size-4" aria-hidden="true" />
              {saving ? 'Saving…' : 'Save Card Counts'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setDraft(null)}
              className="min-h-9 rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            {/* Mounted with the draft, so the words are announced when
                they appear; the wrong inputs point at them. */}
            <p
              id={errorId}
              aria-live="polite"
              className="text-sm text-red-700 dark:text-red-400"
            >
              {invalid ? 'Card Counts are whole numbers, 0 or more.' : ''}
            </p>
          </div>
        )}
        <p
          role="status"
          aria-live="polite"
          className={
            cardsNote
              ? `text-sm font-medium ${cardsNote.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`
              : 'sr-only'
          }
        >
          {cardsNote?.text ?? ''}
        </p>
      </div>

      {code && <div className="p-4">{code}</div>}

      <div className="p-4">
        <ResponsesOverTime
          responses={feedback.responses}
          window={feedback.window}
          onRemove={onRemoveRange}
        />
      </div>

      <TalkComments
        comments={comments}
        onHide={onHide}
        onUnhide={onUnhide}
        onRemove={onRemove}
      />
    </section>
  )
}

/** What the last action on a comment did. */
type CommentNote = Note & { kind: ActionKind }

/** The talk's comments with Hide, Unhide and Remove (§10.3). */
function TalkComments({
  comments,
  onHide,
  onUnhide,
  onRemove,
}: Pick<TalkFeedbackPanelProps, 'onHide' | 'onUnhide' | 'onRemove'> & {
  comments: AdminFeedbackComment[]
}) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  // What the last action on each comment did, by response id.
  const [notes, setNotes] = useState<ReadonlyMap<string, CommentNote>>(
    new Map(),
  )
  const [announcement, setAnnouncement] = useState('')
  const [removing, setRemoving] = useState<AdminFeedbackComment | null>(null)
  const [asking, setAsking] = useState(false)

  async function run(
    kind: ActionKind,
    id: string,
    action: () => Promise<unknown>,
  ) {
    setAnnouncement('')
    setPending((p) => new Set([...p, id]))
    let outcome: CommentNote
    try {
      await action()
      outcome = { kind, ok: true, text: DONE[kind](1) }
    } catch (e) {
      outcome = { kind, ok: false, text: errorText(e) }
    }
    setNotes((all) => new Map(all).set(id, outcome))
    setAnnouncement(outcome.text)
    setPending((p) => new Set([...p].filter((x) => x !== id)))
  }

  const listed = new Set(comments.map((c) => c.id))
  // A removed comment's outcome, once a refetch took it away, shows above.
  // Only a Remove's: a Hide's note must not come back when a range Remove
  // takes that comment away.
  const gone = [...notes]
    .filter(([id, note]) => !listed.has(id) && note.kind === 'remove')
    .map(([, note]) => note)
  const removePending = removing ? pending.has(removing.id) : false

  return (
    <section aria-label="Comments" className="p-4">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        Comments{comments.length > 0 && ` (${comments.length})`}
      </h4>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {gone.length > 0 && (
        <OutcomeNote outcome={gone[gone.length - 1]} className="mt-2" />
      )}
      {comments.length === 0 ? (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          No comments yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {comments.map((c) => {
            const note = notes.get(c.id)
            return (
              <CommentItem
                key={c.id}
                comment={c}
                pending={pending.has(c.id)}
                note={
                  note?.ok && note.kind === 'remove'
                    ? { ...note, text: REMOVED_BUT_LISTED }
                    : (note ?? null)
                }
                onHide={() => run('hide', c.id, () => onHide(c.id))}
                onUnhide={() => run('unhide', c.id, () => onUnhide(c.id))}
                onRemove={() => {
                  setRemoving(c)
                  setAsking(true)
                }}
              />
            )
          })}
        </ul>
      )}
      <ConfirmationModal
        isOpen={asking}
        onClose={() => {
          if (!removePending) setAsking(false)
        }}
        afterLeave={() => setRemoving(null)}
        onConfirm={async () => {
          const comment = removing
          if (!comment || removePending) return
          await run('remove', comment.id, () => onRemove([comment.id]))
          setAsking(false)
        }}
        title={removeQuestion(1)}
        message={removeMessage(1)}
        confirmButtonText="Remove"
        variant="danger"
        isLoading={removePending}
        guardSecondTap
      >
        {removing && (
          <blockquote className="mt-3 border-l-2 border-gray-300 pl-3 text-sm wrap-break-word whitespace-pre-line text-gray-700 dark:border-gray-600 dark:text-gray-300">
            {removing.comment}
          </blockquote>
        )}
      </ConfirmationModal>
    </section>
  )
}
