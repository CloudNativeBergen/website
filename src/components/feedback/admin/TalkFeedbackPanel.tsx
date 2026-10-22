'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { ChatBubbleLeftRightIcon, CheckIcon } from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type {
  AdminFeedbackComment,
  AdminTalkFeedback,
  KeepAnswer,
} from '@/lib/feedback/admin'
import type { RemovedCounts, RemoveRequest } from '@/lib/feedback/bulk-remove'
import type { FeedbackColour } from '@/lib/feedback/colour'
import { feedbackTotals, type ColourCounts } from '@/lib/feedback/totals'
import { plural } from '@/lib/text/display'
import { ANSWERS } from '../answers'
import { ColourBar, FEEDBACK_TONE } from '../tone'
import {
  CommentItem,
  doneNote,
  errorText,
  excerpt,
  failureNote,
  focusRequestFor,
  OutcomeNote,
  type FocusRequest,
  REMOVED_BUT_LISTED,
  removeMessage,
  removeQuestion,
  type ActionKind,
  type Note,
} from './FeedbackCommentItem'
import { ResponsesOverTime } from './ResponsesOverTime'

type CardDraft = Record<FeedbackColour, string>

const COUNT = /^\d{1,6}$/

/** A Card Counts save as its commit returned the talk. */
export interface CardsSave {
  /** The talk's `_updatedAt`: the commit's time, to the second. */
  updatedAt: string | null
  /** The talk's `_rev`: exactly this write. */
  rev: string | null
}

interface SavedCards {
  cards: ColourCounts
  save: CardsSave | null
}

/** How long saved counts may stand in for a read that has not caught up. */
export const CARDS_OVERLAY_MS = 10_000

/**
 * The read certainly includes the save: it shows the save's own revision,
 * or a talk that changed strictly after the save committed (`_updatedAt`
 * is the commit's time). Anything else may be a read from before it, or a
 * write in the same second (`_updatedAt` has whole seconds, and two writes
 * in one second cannot be ordered): the overlay then stands until its time
 * is up, never longer.
 */
function includesSave(
  save: CardsSave | null,
  readAt: string | null,
  readRev: string | null,
): boolean {
  if (save?.rev && readRev === save.rev) return true
  return (
    !!save?.updatedAt &&
    !!readAt &&
    Date.parse(readAt) > Date.parse(save.updatedAt)
  )
}

export interface TalkFeedbackPanelProps {
  feedback: AdminTalkFeedback
  /** The Feedback Code section, for a talk that may hold one. */
  code?: ReactNode
  /** Save the Card Counts (`proposal.updateAudienceFeedback`). */
  /**
   * Save the Card Counts (`proposal.updateAudienceFeedback`); resolves with
   * the talk's `_updatedAt` and `_rev` from the commit, when known.
   */
  onSaveCards: (cards: ColourCounts) => Promise<CardsSave | null>
  onHide: (responseId: string) => Promise<unknown>
  onUnhide: (responseId: string) => Promise<unknown>
  /**
   * Remove (`sessionFeedback.adminRemove`), a comment or a chart range:
   * only answers still as the page showed them.
   */
  onRemove: (request: RemoveRequest) => Promise<RemovedCounts>
  /**
   * Keep a flagged comment (`sessionFeedback.adminKeep`) on the revision
   * the panel showed; a refused Keep says where the comment stands now.
   */
  onKeep: (comment: AdminFeedbackComment) => Promise<KeepAnswer>
  /** The heading, for a page that moves focus to it (after a Retry). */
  headingRef?: Ref<HTMLHeadingElement>
  /**
   * Saved counts' time is up: read the talk again; resolves true once that
   * read has landed, false if it failed.
   */
  onCardsExpired?: () => Promise<boolean>
  /** How long saved counts stand in for a lagging read. */
  cardsOverlayMs?: number
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
  onKeep,
  headingRef,
  onCardsExpired,
  cardsOverlayMs = CARDS_OVERLAY_MS,
}: TalkFeedbackPanelProps) {
  const { comments } = feedback
  const formId = useId()
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [cardsNote, setCardsNote] = useState<Note | null>(null)
  // The read after a save goes through GROQ, which can lag the commit by
  // about a second: the saved counts stay on screen until a read surely
  // includes them, and at most CARDS_OVERLAY_MS: then the page reads the
  // talk once more and, once that read has landed, shows it as it is.
  const [saved, setSaved] = useState<SavedCards | null>(null)
  if (saved && includesSave(saved.save, feedback.updatedAt, feedback.rev))
    setSaved(null)
  // The latest callback, so a parent's re-render never restarts the timer.
  const expire = useRef(onCardsExpired)
  useEffect(() => {
    expire.current = onCardsExpired
  })
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(async () => {
      // Done when the read it asks for has landed, whatever it holds: a
      // deep-equal result keeps the same data object, so the data cannot
      // say it. A read that failed tries again after another while.
      const read = expire.current ? await expire.current() : true
      setSaved((now) => (now !== saved ? now : read ? null : { ...now }))
    }, cardsOverlayMs)
    return () => clearTimeout(timer)
  }, [saved, cardsOverlayMs])
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
      const save = await onSaveCards(cards)
      // Against the server's read, never an earlier save's counts on screen.
      setSaved({ cards, save })
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
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center text-lg font-semibold text-gray-900 focus:outline-none dark:text-white"
        >
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
          </div>
        )}
        {/* Always mounted, so the words are announced when they appear
            (not with a region that appears with them); the wrong inputs
            point at them. */}
        <p
          id={errorId}
          aria-live="polite"
          className={
            invalid ? 'text-sm text-red-700 dark:text-red-400' : 'sr-only'
          }
        >
          {invalid ? 'Card Counts are whole numbers, 0 or more.' : ''}
        </p>
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
        onKeep={onKeep}
        onRemove={onRemove}
      />
    </section>
  )
}

/** What the last action on a comment did, and on which revision. */
type CommentNote = Note & { kind: ActionKind; seenRev?: string }

/**
 * A Kept note the comment has since moved past: flagged again at a newer
 * revision. It would describe the past beside a live flag.
 */
const overtaken = (note: CommentNote, now: AdminFeedbackComment) =>
  note.kind === 'keep' &&
  note.ok &&
  !!note.seenRev &&
  now.rev !== note.seenRev &&
  now.flagged

/** The talk's comments with Keep, Hide, Unhide and Remove (§10.3). */
function TalkComments({
  comments,
  onHide,
  onUnhide,
  onKeep,
  onRemove,
}: Pick<
  TalkFeedbackPanelProps,
  'onHide' | 'onUnhide' | 'onKeep' | 'onRemove'
> & {
  comments: AdminFeedbackComment[]
}) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  // What the last action on each comment did, by response id.
  const [notes, setNotes] = useState<ReadonlyMap<string, CommentNote>>(
    new Map(),
  )
  const [announcement, setAnnouncement] = useState('')
  /** The latest finished action, which focus may follow (Keep, Hide). */
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const [removing, setRemoving] = useState<AdminFeedbackComment | null>(null)
  const [asking, setAsking] = useState(false)

  async function run(
    kind: ActionKind,
    id: string,
    action: () => Promise<unknown>,
  ) {
    setAnnouncement('')
    setPending((p) => new Set([...p, id]))
    const seen = comments.find((c) => c.id === id)
    const at = {
      kind,
      seenRev: seen?.rev,
      about: seen ? `“${excerpt(seen.comment)}”` : undefined,
    }
    let outcome: CommentNote
    try {
      outcome = { ...at, ...doneNote(kind, 1, await action()) }
    } catch (e) {
      outcome = { ...at, ...failureNote(e, !!seen) }
    }
    setNotes((all) => new Map(all).set(id, outcome))
    setAnnouncement([outcome.text, outcome.about].filter(Boolean).join(' '))
    setFocusRequest(focusRequestFor(id, 'session'))
    setPending((p) => new Set([...p].filter((x) => x !== id)))
  }

  const listed = new Set(comments.map((c) => c.id))
  // A removed comment's outcome, once a refetch took it away, shows above,
  // and a Keep's that found it gone. Not a Hide's: its note must not come
  // back when a range Remove takes that comment away.
  const gone = [...notes]
    .filter(
      ([id, note]) =>
        !listed.has(id) && (note.kind === 'remove' || note.kind === 'keep'),
    )
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
        <OutcomeNote outcome={gone[gone.length - 1]} className="mt-2" named />
      )}
      {comments.length === 0 ? (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          No comments yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {comments.map((c) => {
            const stored = notes.get(c.id)
            const note = stored && !overtaken(stored, c) ? stored : null
            return (
              <CommentItem
                key={c.id}
                comment={c}
                place="session"
                // The panel lives in the page's narrow sidebar.
                stacked
                pending={pending.has(c.id)}
                focusRequest={focusRequest}
                note={
                  note?.ok && note.kind === 'remove'
                    ? { ...note, text: REMOVED_BUT_LISTED }
                    : note
                }
                onHide={() => run('hide', c.id, () => onHide(c.id))}
                onUnhide={() => run('unhide', c.id, () => onUnhide(c.id))}
                onKeep={() => run('keep', c.id, () => onKeep(c))}
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
          // The answer as shown: removed only while it is still that one.
          await run('remove', comment.id, () =>
            onRemove({
              responses: [{ id: comment.id, submittedAt: comment.submittedAt }],
            }),
          )
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
