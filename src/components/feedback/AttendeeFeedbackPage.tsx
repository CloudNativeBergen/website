'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FaceFrownIcon,
  FaceSmileIcon,
  LockClosedIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import {
  FEEDBACK_COLOUR_LABELS,
  type FeedbackColour,
} from '@/lib/feedback/colour'
import type {
  AttendeeFeedbackState,
  PublicFeedbackTalk,
} from '@/lib/feedback/server'
import { formatSessionInstant } from '@/lib/time'

export type { AttendeeFeedbackState }

/**
 * Submit (speaker feedback spec §7.4), bound to the page's code: the colour
 * and the comment. "Change answer" and "Send comment" are this one action.
 */
export type SubmitAnswer = (
  colour: FeedbackColour,
  comment?: string,
) => Promise<AttendeeFeedbackState>

/** Delete my answer (§7.4), bound to the page's code. */
export type DeleteAnswer = () => Promise<AttendeeFeedbackState>

/** The comment's limit (§7.2); the server refuses more once trimmed. */
export const MAX_COMMENT_LENGTH = 1000

/** Where the Answered state's link leads: a full page load, never `next/link`. */
const PROGRAMME_HREF = '/program'

const ANSWERS = [
  {
    colour: 'green',
    label: FEEDBACK_COLOUR_LABELS.green,
    Icon: FaceSmileIcon,
    className: 'bg-green-700 text-white',
    iconClassName: 'text-green-600 dark:text-green-500',
  },
  {
    colour: 'yellow',
    label: FEEDBACK_COLOUR_LABELS.yellow,
    Icon: MinusCircleIcon,
    className: 'bg-yellow-400 text-yellow-950',
    iconClassName: 'text-yellow-500 dark:text-yellow-400',
  },
  {
    colour: 'red',
    label: FEEDBACK_COLOUR_LABELS.red,
    Icon: FaceFrownIcon,
    className: 'bg-red-600 text-white',
    iconClassName: 'text-red-600 dark:text-red-500',
  },
] as const

/**
 * The attendee page, `/f/<code>` (speaker feedback spec §7.1, §7.2): the
 * conference logo and one state, nothing else. The talk's title and speakers
 * arrive only for a public talk; the resolver never hands them over otherwise.
 *
 * A tap calls `submit`, and the page shows what it answers: the Answered
 * state, or the state the code is in now (closed since the page loaded, say).
 * A failed save keeps the buttons, with a line saying the answer couldn't be
 * confirmed. From Answered the attendee changes the colour, sends a comment,
 * or deletes the answer; Delete is also on Closed and Not yet open while the
 * cookie lists the talk.
 */
export function AttendeeFeedbackPage({
  logo,
  page: initial,
  submit,
  remove,
}: {
  logo: ConferenceLogoData | null
  page: AttendeeFeedbackState
  submit: SubmitAnswer
  remove: DeleteAnswer
}) {
  const [page, setPage] = useState(initial)
  // Whatever a tap leads to takes focus, so a screen reader announces it: the
  // tapped button is gone from the page.
  const [afterTap, setAfterTap] = useState(false)
  const [deleted, setDeleted] = useState(false)
  return (
    <div
      data-shell-fit="viewport"
      className="min-h-dvh bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
    >
      {/* No logo when the conference could not be read: the platform's own
          mark on a tenant's domain would be another brand. */}
      {logo && (
        <header className="flex justify-center px-4 pt-8">
          <ConferenceLogo
            conference={logo}
            variant="horizontal"
            className="h-10 w-auto max-w-full text-brand-slate-gray dark:text-white"
          />
        </header>
      )}
      <main className="mx-auto max-w-md px-4 pt-10 pb-12">
        {deleted && (
          <p
            role="status"
            className="mb-6 rounded-lg bg-gray-100 px-4 py-3 text-center text-sm font-medium dark:bg-gray-800"
          >
            Your answer has been deleted.
          </p>
        )}
        <PageState
          page={page}
          submit={submit}
          remove={remove}
          announce={afterTap}
          onAnswer={(next) => {
            setPage(next)
            setAfterTap(true)
            setDeleted(false)
          }}
          onDelete={(next) => {
            setPage(next)
            setAfterTap(true)
            setDeleted(true)
          }}
        />
      </main>
    </div>
  )
}

function PageState({
  page,
  submit,
  remove,
  announce,
  onAnswer,
  onDelete,
}: {
  page: AttendeeFeedbackState
  submit: SubmitAnswer
  remove: DeleteAnswer
  announce: boolean
  onAnswer: (next: AttendeeFeedbackState) => void
  onDelete: (next: AttendeeFeedbackState) => void
}) {
  // The talk's title is the page's h1 when it is shown; the state's own
  // heading is the h1 otherwise.
  const level = 'talk' in page && page.talk ? ('h2' as const) : ('h1' as const)
  switch (page.state) {
    case 'open':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <AnswerForm
            level={level}
            closesAt={page.closesAt}
            submit={submit}
            onAnswer={onAnswer}
          />
        </>
      )
    case 'answered':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Answered
            level={level}
            page={page}
            announce={announce}
            submit={submit}
            remove={remove}
            onAnswer={onAnswer}
            onDelete={onDelete}
          />
        </>
      )
    case 'not-yet-open':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            announce={announce}
            level={level}
            Icon={ClockIcon}
            title="Feedback opens when the session starts"
          >
            {page.opensAt
              ? `It opens on ${formatSessionInstant(page.opensAt)}. Scan the code again then.`
              : 'Scan the code again during the session.'}
          </Notice>
          {page.canDelete && (
            <DeleteAnswerButton remove={remove} onDelete={onDelete} />
          )}
        </>
      )
    case 'closed':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            announce={announce}
            level={level}
            Icon={LockClosedIcon}
            title="Feedback for this session has closed"
          >
            Thank you for coming. Feedback closes 24 hours after a session ends.
          </Notice>
          {page.canDelete && (
            <DeleteAnswerButton remove={remove} onDelete={onDelete} />
          )}
        </>
      )
    case 'unknown':
      return (
        <Notice
          announce={announce}
          level={level}
          Icon={QuestionMarkCircleIcon}
          title="This feedback code isn't valid"
        >
          Check the code on the slide or the sheet in the room and scan it
          again.
        </Notice>
      )
    case 'unavailable':
      return (
        <Notice
          announce={announce}
          level={level}
          Icon={ExclamationTriangleIcon}
          title="Feedback isn't available right now"
        >
          Something went wrong on our side. Try again in a moment.
        </Notice>
      )
  }
}

/**
 * One action in flight at a time, checked synchronously so a double tap can't
 * send two. Plain state, not `useTransition`: with it, `isPending` never
 * cleared after a failed save in the dark story (cause not pinned down),
 * leaving every button disabled. `run` answers `unavailable` for a thrown
 * action, so a lost connection reads like a failed save.
 */
function useOneAtATime() {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const run = async (
    action: () => Promise<AttendeeFeedbackState>,
  ): Promise<AttendeeFeedbackState | null> => {
    if (busy.current) return null
    busy.current = true
    setPending(true)
    let next: AttendeeFeedbackState
    try {
      next = await action()
    } catch {
      next = { state: 'unavailable' }
    }
    busy.current = false
    setPending(false)
    return next
  }
  return { pending, run }
}

function AnswerButtons({
  pending,
  tapped,
  current,
  onTap,
}: {
  pending: boolean
  /** The colour whose save is in flight. */
  tapped: FeedbackColour | null
  /** The recorded answer, marked as pressed while changing it. */
  current?: FeedbackColour
  onTap: (colour: FeedbackColour) => void
}) {
  return (
    <div className="mt-5 flex flex-col gap-3" aria-busy={pending}>
      {ANSWERS.map(({ colour, label, Icon, className }) => {
        const saving = pending && tapped === colour
        const ShownIcon = saving ? ArrowPathIcon : Icon
        return (
          <button
            key={colour}
            type="button"
            // `aria-disabled`, not `disabled`: a disabled button drops focus to
            // the body, and after a failed save a keyboard or screen reader
            // user must still be on the answer they tapped.
            aria-disabled={pending}
            aria-pressed={
              current === undefined ? undefined : current === colour
            }
            onClick={() => onTap(colour)}
            className={`flex min-h-20 w-full items-center gap-4 rounded-xl px-6 text-xl font-bold shadow-xs transition-opacity focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gray-900 aria-disabled:cursor-wait aria-pressed:ring-4 aria-pressed:ring-gray-900/40 dark:focus-visible:outline-white dark:aria-pressed:ring-white/60 ${pending && !saving ? 'opacity-50' : ''} ${className}`}
          >
            <ShownIcon
              className={`size-9 shrink-0 ${saving ? 'animate-spin motion-reduce:animate-none' : ''}`}
              aria-hidden="true"
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Failed({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 text-center text-sm font-medium text-red-700 dark:text-red-400"
    >
      {children}
    </p>
  )
}

function AnswerForm({
  level: Question,
  closesAt,
  submit,
  onAnswer,
}: {
  level: 'h1' | 'h2'
  closesAt: string | null
  submit: SubmitAnswer
  onAnswer: (next: AttendeeFeedbackState) => void
}) {
  const [tapped, setTapped] = useState<FeedbackColour | null>(null)
  const [failed, setFailed] = useState(false)
  const { pending, run } = useOneAtATime()

  const answer = async (colour: FeedbackColour) => {
    setTapped(colour)
    setFailed(false)
    const next = await run(() => submit(colour))
    if (!next) return
    // Not confirmed: keep the buttons. Tapping again is safe, as a retry under
    // the same cookie lands on the same response.
    if (next.state === 'unavailable') setFailed(true)
    else onAnswer(next)
  }

  return (
    <>
      <Question className="text-xl font-semibold">
        How was this session?
      </Question>
      <AnswerButtons pending={pending} tapped={tapped} onTap={answer} />
      {failed && (
        <Failed>We couldn&apos;t confirm your answer. Please try again.</Failed>
      )}
      <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
        Anonymous. You can change your answer until{' '}
        {/* The closing time gives the slot away, so it is shown only for a
            public talk. */}
        {closesAt
          ? `${formatSessionInstant(closesAt)}.`
          : '24 hours after the session ends.'}
      </p>
    </>
  )
}

const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:border-gray-600 dark:focus-visible:outline-white'

/**
 * The Answered state (§7.2): what was recorded, Change answer, the comment
 * box, Delete my answer, and the way back to the programme. Focus moves to
 * the heading after a tap so a screen reader announces it, never on a plain
 * page load. Every action here is Submit or Delete my answer; what they
 * answer with replaces the page, so a window that closed meanwhile shows
 * Closed.
 */
function Answered({
  level: Heading,
  page,
  announce,
  submit,
  remove,
  onAnswer,
  onDelete,
}: {
  level: 'h1' | 'h2'
  page: Extract<AttendeeFeedbackState, { state: 'answered' }>
  announce: boolean
  submit: SubmitAnswer
  remove: DeleteAnswer
  onAnswer: (next: AttendeeFeedbackState) => void
  onDelete: (next: AttendeeFeedbackState) => void
}) {
  const heading = useFocusOnMount(announce)
  const answer = ANSWERS.find((a) => a.colour === page.colour)
  const Icon = answer?.Icon ?? FaceSmileIcon
  const [changing, setChanging] = useState(false)
  const [tapped, setTapped] = useState<FeedbackColour | null>(null)
  const [comment, setComment] = useState(page.comment ?? '')
  const [sent, setSent] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const { pending, run } = useOneAtATime()
  const commentId = useId()
  const counterId = useId()

  const change = async (colour: FeedbackColour) => {
    setTapped(colour)
    setFailed(null)
    setSent(null)
    const next = await run(() => submit(colour, comment))
    if (!next) return
    if (next.state === 'unavailable') {
      setFailed("We couldn't confirm your answer. Please try again.")
      return
    }
    onAnswer(next)
    if (next.state === 'answered') {
      // The tapped button goes away with the grid: the heading, which now
      // names the new answer, takes focus.
      setChanging(false)
      heading.current?.focus()
    }
  }

  const sendComment = async (event: React.FormEvent) => {
    event.preventDefault()
    setFailed(null)
    setSent(null)
    const next = await run(() => submit(page.colour, comment))
    if (!next) return
    if (next.state === 'unavailable') {
      setFailed("We couldn't send your comment. Please try again.")
    } else if (next.state === 'answered') {
      setSent(next.comment ? 'Comment sent.' : 'Comment removed.')
      onAnswer(next)
    } else {
      onAnswer(next)
    }
  }

  const erase = async () => {
    setFailed(null)
    setSent(null)
    const next = await run(remove)
    if (!next) return
    if (next.state === 'unavailable') {
      setFailed("We couldn't delete your answer. Please try again.")
    } else {
      onDelete(next)
    }
  }

  const hasComment = page.comment !== null
  const length = comment.length
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
          className="mt-4 text-lg font-semibold text-balance focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900 dark:focus-visible:outline-white"
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
          value={comment}
          onChange={(event) => setComment(event.target.value)}
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
        <DeleteButton pending={pending} onClick={erase} />
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

function DeleteButton({
  pending,
  onClick,
}: {
  pending: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-disabled={pending}
      onClick={onClick}
      className={`${SECONDARY_BUTTON} text-red-700 dark:text-red-400`}
    >
      {pending ? (
        <ArrowPathIcon
          className="size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <TrashIcon className="size-5" aria-hidden="true" />
      )}
      Delete my answer
    </button>
  )
}

/**
 * Delete my answer on Closed and Not yet open (§7.4, R1): the talk is in the
 * cookie's list, so there may be an answer to delete; a missing one is
 * harmless. What the action answers with replaces the page.
 */
function DeleteAnswerButton({
  remove,
  onDelete,
}: {
  remove: DeleteAnswer
  onDelete: (next: AttendeeFeedbackState) => void
}) {
  const [failed, setFailed] = useState(false)
  const { pending, run } = useOneAtATime()
  const erase = async () => {
    setFailed(false)
    const next = await run(remove)
    if (!next) return
    if (next.state === 'unavailable') setFailed(true)
    else onDelete(next)
  }
  return (
    <div className="mt-8 flex flex-col items-center">
      <DeleteButton pending={pending} onClick={erase} />
      {failed && (
        <Failed>We couldn&apos;t delete your answer. Please try again.</Failed>
      )}
    </div>
  )
}

function TalkHeading({ talk }: { talk: PublicFeedbackTalk | null }) {
  if (!talk) return null
  return (
    <div className="mb-8">
      <h1 className="font-display text-2xl leading-tight font-bold tracking-tight text-balance wrap-anywhere">
        {talk.title}
      </h1>
      {talk.speakers.length > 0 && (
        <p className="mt-1 wrap-anywhere text-gray-600 dark:text-gray-400">
          {talk.speakers.join(', ')}
        </p>
      )}
    </div>
  )
}

function Notice({
  level: Heading,
  Icon,
  title,
  announce = false,
  children,
}: {
  level: 'h1' | 'h2'
  Icon: typeof ClockIcon
  title: string
  /** Take focus on mount: this notice replaced the buttons after a tap. */
  announce?: boolean
  children: React.ReactNode
}) {
  const heading = useFocusOnMount(announce)
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="size-12 text-gray-400" aria-hidden="true" />
      <Heading
        ref={heading}
        tabIndex={announce ? -1 : undefined}
        className="mt-4 text-lg font-semibold text-balance focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900 dark:focus-visible:outline-white"
      >
        {title}
      </Heading>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  )
}

/** A ref that focuses its element once, on mount, when `enabled`. */
function useFocusOnMount(enabled: boolean) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (enabled) ref.current?.focus()
  }, [enabled])
  return ref
}
