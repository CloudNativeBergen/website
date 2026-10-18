'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  FaceFrownIcon,
  FaceSmileIcon,
  LockClosedIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import {
  FEEDBACK_COLOUR_LABELS,
  type FeedbackColour,
} from '@/lib/feedback/colour'
import type { PublicFeedbackTalk, SubmitOutcome } from '@/lib/feedback/server'
import { formatSessionInstant } from '@/lib/time'

/**
 * The page the attendee sees: a state of the code, `unavailable` when it
 * could not be read, or `answered` after a tap.
 */
export type AttendeeFeedbackState = SubmitOutcome

/** Submit (speaker feedback spec §7.4), bound to the page's code. */
export type SubmitAnswer = (colour: FeedbackColour) => Promise<SubmitOutcome>

const ANSWERS = [
  {
    colour: 'green',
    label: FEEDBACK_COLOUR_LABELS.green,
    Icon: FaceSmileIcon,
    className: 'bg-green-600 text-white',
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
 * A tap calls `submit`, and the page shows what it answers: a thank-you, or
 * the state the code is in now (closed since the page loaded, say). A failed
 * save keeps the buttons, with a line saying the answer wasn't saved.
 */
export function AttendeeFeedbackPage({
  logo,
  page: initial,
  submit,
}: {
  logo: ConferenceLogoData | null
  page: AttendeeFeedbackState
  submit: SubmitAnswer
}) {
  const [page, setPage] = useState(initial)
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
        <PageState page={page} submit={submit} onAnswer={setPage} />
      </main>
    </div>
  )
}

function PageState({
  page,
  submit,
  onAnswer,
}: {
  page: AttendeeFeedbackState
  submit: SubmitAnswer
  onAnswer: (next: AttendeeFeedbackState) => void
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
    case 'answered': {
      const answer = ANSWERS.find((a) => a.colour === page.colour)
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Thanks level={level} answer={answer} />
        </>
      )
    }
    case 'not-yet-open':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            level={level}
            Icon={ClockIcon}
            title="Feedback opens when the session starts"
          >
            {page.opensAt
              ? `It opens on ${formatSessionInstant(page.opensAt)}. Scan the code again then.`
              : 'Scan the code again during the session.'}
          </Notice>
        </>
      )
    case 'closed':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            level={level}
            Icon={LockClosedIcon}
            title="Feedback for this session has closed"
          >
            Thank you for coming. Feedback closes 24 hours after a session ends.
          </Notice>
        </>
      )
    case 'unknown':
      return (
        <Notice
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
          level={level}
          Icon={ExclamationTriangleIcon}
          title="Feedback isn't available right now"
        >
          Something went wrong on our side. Try again in a moment.
        </Notice>
      )
  }
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
  onAnswer: (next: SubmitOutcome) => void
}) {
  const [tapped, setTapped] = useState<FeedbackColour | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const answer = (colour: FeedbackColour) => {
    setTapped(colour)
    setFailed(false)
    startTransition(async () => {
      let next: SubmitOutcome
      try {
        next = await submit(colour)
      } catch {
        next = { state: 'unavailable' }
      }
      // Not saved: keep the buttons, so the attendee can tap again.
      if (next.state === 'unavailable') setFailed(true)
      else onAnswer(next)
    })
  }

  return (
    <>
      <Question className="text-xl font-semibold">
        How was this session?
      </Question>
      <div className="mt-5 flex flex-col gap-3" aria-busy={pending}>
        {ANSWERS.map(({ colour, label, Icon, className }) => {
          const saving = pending && tapped === colour
          const ShownIcon = saving ? ArrowPathIcon : Icon
          return (
            <button
              key={colour}
              type="button"
              disabled={pending}
              onClick={() => answer(colour)}
              className={`flex min-h-20 w-full items-center gap-4 rounded-xl px-6 text-xl font-bold shadow-xs transition-opacity focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-wait dark:focus-visible:outline-white ${pending && !saving ? 'opacity-50' : ''} ${className}`}
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
      {failed && (
        <p
          role="alert"
          className="mt-4 text-center text-sm font-medium text-red-700 dark:text-red-400"
        >
          Your answer wasn&apos;t saved. Please try again.
        </p>
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

/**
 * The plain thank-you after a tap (F1c). The answer's own icon and words say
 * what was recorded; focus moves to the heading so a screen reader announces
 * it. Changing the answer is a new scan and tap until F2 adds the Answered
 * state.
 */
function Thanks({
  level: Heading,
  answer,
}: {
  level: 'h1' | 'h2'
  answer: (typeof ANSWERS)[number] | undefined
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const Icon = answer?.Icon ?? FaceSmileIcon
  return (
    <div className="flex flex-col items-center text-center">
      <Icon
        className={`size-12 ${answer?.iconClassName ?? ''}`}
        aria-hidden="true"
      />
      <Heading
        ref={heading}
        tabIndex={-1}
        className="mt-4 text-lg font-semibold text-balance outline-none"
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
      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        Changed your mind? Scan the code again and tap another answer.
      </p>
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
  children,
}: {
  level: 'h1' | 'h2'
  Icon: typeof ClockIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="size-12 text-gray-400" aria-hidden="true" />
      <Heading className="mt-4 text-lg font-semibold text-balance">
        {title}
      </Heading>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  )
}
