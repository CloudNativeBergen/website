'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  ClockIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import type { FeedbackColour } from '@/lib/feedback/colour'
import { FEEDBACK_EMBED_ROOT } from '@/lib/feedback/url'
import type {
  AttendeeFeedbackState,
  PublicFeedbackTalk,
} from '@/lib/feedback/server'
import { formatSessionInstant } from '@/lib/time'
import { AnsweredState } from './AnsweredState'
import { DeleteAnswerButton } from './DeleteAnswerButton'
import {
  AnswerButtons,
  Failed,
  HEADING_FOCUS,
  Status,
  useFocusOnMount,
  type DeleteAnswer,
  type DeleteNotice,
  type SubmitAnswer,
} from './answers'
import { useOneAtATime } from './useOneAtATime'

export type { AttendeeFeedbackState }
export type { DeleteAnswer, SubmitAnswer } from './answers'

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
 *
 * `embedded` is the programme's feedback sheet (§7.5), which frames this page:
 * no logo, no full-viewport height, and no way back to the programme, which
 * would load the programme inside the sheet.
 */
export function AttendeeFeedbackPage({
  logo,
  page: initial,
  submit,
  remove,
  embedded = false,
}: {
  logo: ConferenceLogoData | null
  page: AttendeeFeedbackState
  submit: SubmitAnswer
  remove: DeleteAnswer
  embedded?: boolean
}) {
  const [page, setPage] = useState(initial)
  // Whatever an action leads to takes focus, so a screen reader announces
  // it: the tapped button is gone from the page.
  const [afterTap, setAfterTap] = useState(false)
  const [notice, setNotice] = useState<DeleteNotice | null>(null)
  // Counts delete outcomes: a Notice that stays mounted across one (Closed
  // before and after) takes focus on each.
  const [deletes, setDeletes] = useState(0)
  return (
    <div
      data-shell-fit="viewport"
      className={clsx(
        'bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100',
        !embedded && 'min-h-dvh',
      )}
    >
      {/* No logo when the conference could not be read: the platform's own
          mark on a tenant's domain would be another brand. */}
      {logo && !embedded && (
        <header className="flex justify-center px-4 pt-8">
          <ConferenceLogo
            conference={logo}
            variant="horizontal"
            className="h-10 w-auto max-w-full text-brand-slate-gray dark:text-white"
          />
        </header>
      )}
      <main
        {...(embedded && { [FEEDBACK_EMBED_ROOT]: '' })}
        className={clsx(
          'mx-auto max-w-md px-4',
          embedded ? 'pt-4 pb-8' : 'pt-10 pb-12',
        )}
      >
        {/* Always in the DOM, so the text set after a delete is announced;
            neutral on a refusal, whatever its reason (§7.4). */}
        <Status
          status={notice ? { kind: 'neutral', text: NOTICES[notice] } : null}
          className={
            notice
              ? 'mb-6 rounded-lg bg-gray-100 px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              : 'sr-only'
          }
        />
        <PageState
          page={page}
          submit={submit}
          remove={remove}
          announce={afterTap}
          deletes={deletes}
          embedded={embedded}
          onOutcome={(next, afterDelete) => {
            setPage((previous) =>
              // A comment the server could not read back after a
              // colour-only tap is UNKNOWN: keep what this page last knew.
              next.state === 'answered' && next.comment === undefined
                ? {
                    ...next,
                    comment:
                      previous.state === 'answered'
                        ? (previous.comment ?? null)
                        : null,
                  }
                : next,
            )
            setAfterTap(true)
            setNotice(afterDelete ?? null)
            if (afterDelete) setDeletes((n) => n + 1)
          }}
        />
      </main>
    </div>
  )
}

const NOTICES: Record<DeleteNotice, string> = {
  deleted: 'Your answer has been deleted.',
  'nothing-to-delete': 'There was no answer from this browser to delete.',
}

function PageState({
  page,
  submit,
  remove,
  announce,
  deletes,
  embedded,
  onOutcome,
}: {
  page: AttendeeFeedbackState
  submit: SubmitAnswer
  remove: DeleteAnswer
  announce: boolean
  deletes: number
  /** In the programme's sheet (§7.5): the attendee came from the programme. */
  embedded: boolean
  onOutcome: (next: AttendeeFeedbackState, afterDelete?: DeleteNotice) => void
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
            announce={announce}
            submit={submit}
            onAnswer={onOutcome}
          />
        </>
      )
    case 'answered':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <AnsweredState
            level={level}
            page={page}
            announce={announce}
            submit={submit}
            remove={remove}
            programmeLink={!embedded}
            onOutcome={onOutcome}
          />
        </>
      )
    case 'not-yet-open':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            announce={announce}
            refocus={deletes}
            level={level}
            Icon={ClockIcon}
            title="Feedback opens when the session starts"
          >
            {notYetOpenText(page.opensAt, embedded)}
          </Notice>
          {page.canDelete && (
            <DeleteAnswerButton remove={remove} onDelete={onOutcome} />
          )}
        </>
      )
    case 'closed':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            announce={announce}
            refocus={deletes}
            level={level}
            Icon={LockClosedIcon}
            title="Feedback for this session has closed"
          >
            Thank you for coming. Feedback closes 24 hours after a session ends.
          </Notice>
          {page.canDelete && (
            <DeleteAnswerButton remove={remove} onDelete={onOutcome} />
          )}
        </>
      )
    case 'unknown':
      return (
        <Notice
          announce={announce}
          level={level}
          Icon={QuestionMarkCircleIcon}
          title={
            embedded
              ? "Feedback isn't available for this session"
              : "This feedback code isn't valid"
          }
        >
          {embedded
            ? 'Try again later from the programme.'
            : 'Check the code on the slide or the sheet in the room and scan it again.'}
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

/** Where to come back from: the room's code, or the programme's sheet. */
function notYetOpenText(opensAt: string | null, embedded: boolean): string {
  const again = embedded ? 'Tap Give feedback again' : 'Scan the code again'
  return opensAt
    ? `It opens on ${formatSessionInstant(opensAt)}. ${again} then.`
    : `${again} during the session.`
}

function AnswerForm({
  level: Question,
  closesAt,
  announce,
  submit,
  onAnswer,
}: {
  level: 'h1' | 'h2'
  closesAt: string | null
  /** Take focus on mount: the form replaced the Answered state after a delete. */
  announce: boolean
  submit: SubmitAnswer
  onAnswer: (next: AttendeeFeedbackState) => void
}) {
  const [tapped, setTapped] = useState<FeedbackColour | null>(null)
  const [failed, setFailed] = useState(false)
  const { pending, run } = useOneAtATime()
  const question = useFocusOnMount(announce)

  const answer = async (colour: FeedbackColour) => {
    setTapped(colour)
    setFailed(false)
    const next = await run(() => submit(colour), { state: 'unavailable' })
    if (!next) return
    // Not confirmed: keep the buttons. Tapping again is safe, as a retry under
    // the same cookie lands on the same response.
    if (next.state === 'unavailable') setFailed(true)
    else onAnswer(next)
  }

  return (
    <>
      <Question
        ref={question}
        tabIndex={announce ? -1 : undefined}
        className={`text-xl font-semibold ${HEADING_FOCUS}`}
      >
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

function TalkHeading({ talk }: { talk: PublicFeedbackTalk | null }) {
  if (!talk) return null
  return (
    <div className="mb-8 text-center">
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
  refocus = 0,
  children,
}: {
  level: 'h1' | 'h2'
  Icon: typeof ClockIcon
  title: string
  /** Take focus on mount: this notice replaced the buttons after a tap. */
  announce?: boolean
  /** Take focus again each time this changes: a delete under this notice. */
  refocus?: number
  children: React.ReactNode
}) {
  const heading = useFocusOnMount(announce)
  useEffect(() => {
    // Delete my answer unmounted under a notice that stays: focus would
    // otherwise drop to the body.
    if (refocus > 0) heading.current?.focus()
  }, [refocus, heading])
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="size-12 text-gray-400" aria-hidden="true" />
      <Heading
        ref={heading}
        tabIndex={announce ? -1 : undefined}
        className={`mt-4 text-lg font-semibold text-balance ${HEADING_FOCUS}`}
      >
        {title}
      </Heading>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  )
}
