'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChatBubbleLeftRightIcon, CheckIcon } from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type {
  AdminFeedbackComment,
  AdminTalkFeedback,
} from '@/lib/feedback/admin'
import type { FeedbackColour } from '@/lib/feedback/colour'
import type { ColourCounts } from '@/lib/feedback/totals'
import { plural } from '@/lib/text/display'
import { ANSWERS } from '../answers'
import { ColourBar, FEEDBACK_TONE } from '../tone'
import {
  CommentItem,
  DONE,
  OutcomeNote,
  REMOVED_BUT_LISTED,
  removeMessage,
  removeQuestion,
  type ActionKind,
  type Outcome,
} from './FeedbackCommentItem'
import { ResponsesOverTime } from './ResponsesOverTime'

type CardDraft = Record<FeedbackColour, string>

const COUNT = /^\d{1,6}$/

export interface TalkFeedbackPanelProps {
  feedback: AdminTalkFeedback
  /** The Feedback Code section, for a talk that may hold one. */
  code?: ReactNode
  /** Save the Card Counts (`proposal.updateAudienceFeedback`). */
  onSaveCards: (cards: ColourCounts) => Promise<unknown>
  onHide: (responseId: string) => Promise<unknown>
  onUnhide: (responseId: string) => Promise<unknown>
  onRemove: (responseIds: string[]) => Promise<unknown>
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
}: TalkFeedbackPanelProps) {
  const { totals, comments } = feedback
  const formId = useId()
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [cardsNote, setCardsNote] = useState<{
    ok: boolean
    text: string
  } | null>(null)

  const shown = (colour: FeedbackColour) =>
    draft?.[colour] ?? String(totals.cards[colour])
  const invalid = draft
    ? ANSWERS.some(({ colour }) => !COUNT.test(draft[colour].trim()))
    : false

  async function saveCards() {
    if (!draft || invalid || saving) return
    setSaving(true)
    setCardsNote(null)
    try {
      await onSaveCards({
        green: Number(draft.green),
        yellow: Number(draft.yellow),
        red: Number(draft.red),
      })
      setDraft(null)
      setCardsNote({ ok: true, text: 'Card Counts saved.' })
    } catch (e) {
      setCardsNote({
        ok: false,
        text:
          e instanceof Error && e.message
            ? e.message
            : 'The Card Counts could not be saved. Try again.',
      })
    }
    setSaving(false)
  }

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
            if (e.key === 'Escape' && draft) {
              e.preventDefault()
              setDraft(null)
            }
          }}
          className="grid grid-cols-3 gap-2"
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
              <p className="text-2xl font-bold text-gray-900 tabular-nums dark:text-white">
                {totals.combined[colour]}
              </p>
              <p className="text-xs whitespace-nowrap text-gray-600 tabular-nums dark:text-gray-400">
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
                  aria-invalid={
                    draft ? !COUNT.test(draft[colour].trim()) : false
                  }
                  onChange={(e) =>
                    setDraft({
                      green: shown('green'),
                      yellow: shown('yellow'),
                      red: shown('red'),
                      [colour]: e.target.value,
                    })
                  }
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
            {invalid && (
              <p className="text-sm text-red-700 dark:text-red-400">
                Card Counts are whole numbers, 0 or more.
              </p>
            )}
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
          onRemove={onRemove}
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
  const [notes, setNotes] = useState<ReadonlyMap<string, Outcome>>(new Map())
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
    const at = { talkId: '', responseId: id, kind }
    let outcome: Outcome
    try {
      await action()
      outcome = { ...at, ok: true, text: DONE[kind](1) }
    } catch (e) {
      outcome = {
        ...at,
        ok: false,
        text:
          e instanceof Error && e.message
            ? e.message
            : 'That didn’t work. Reload the page to see where things stand.',
      }
    }
    setNotes((all) => new Map(all).set(id, outcome))
    setAnnouncement(outcome.text)
    setPending((p) => new Set([...p].filter((x) => x !== id)))
  }

  const listed = new Set(comments.map((c) => c.id))
  // A removed comment's outcome, once a refetch took it away, shows above.
  const gone = [...notes.values()].filter((o) => !listed.has(o.responseId))
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
