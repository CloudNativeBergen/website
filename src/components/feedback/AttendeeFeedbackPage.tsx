import {
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
import type { FeedbackPage, PublicFeedbackTalk } from '@/lib/feedback/server'
import { formatSessionInstant } from '@/lib/time'

/** The page the attendee sees, or `unavailable` when it could not be read. */
export type AttendeeFeedbackState = FeedbackPage | { state: 'unavailable' }

const ANSWERS = [
  {
    colour: 'green',
    label: 'Loved it',
    Icon: FaceSmileIcon,
    className: 'bg-green-600 text-white',
  },
  {
    colour: 'yellow',
    label: 'It was OK',
    Icon: MinusCircleIcon,
    className: 'bg-yellow-400 text-yellow-950',
  },
  {
    colour: 'red',
    label: 'Not for me',
    Icon: FaceFrownIcon,
    className: 'bg-red-600 text-white',
  },
] as const

/**
 * The attendee page, `/f/<code>` (speaker feedback spec §7.1, §7.2): the
 * conference logo and one state, nothing else. The talk's title and speakers
 * arrive only for a public talk; the resolver never hands them over otherwise.
 *
 * The answer buttons are not wired yet (F1b): they render disabled, with a
 * line saying so, until the Submit action lands (F1c).
 */
export function AttendeeFeedbackPage({
  logo,
  page,
}: {
  logo: ConferenceLogoData | null
  page: AttendeeFeedbackState
}) {
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
        <PageState page={page} />
      </main>
    </div>
  )
}

function PageState({ page }: { page: AttendeeFeedbackState }) {
  // The talk's title is the page's h1 when it is shown; the state's own
  // heading is the h1 otherwise.
  const level = 'talk' in page && page.talk ? ('h2' as const) : ('h1' as const)
  switch (page.state) {
    case 'open': {
      const Question = level
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Question className="text-xl font-semibold">
            How was this session?
          </Question>
          {/* Until the Submit action lands (F1c), say so rather than offer
              buttons that look live and do nothing. */}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Answering isn&apos;t available yet.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {ANSWERS.map(({ colour, label, Icon, className }) => (
              <button
                key={colour}
                type="button"
                disabled
                className={`flex h-20 w-full items-center gap-4 rounded-xl px-6 text-xl font-bold shadow-xs disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-300 ${className}`}
              >
                <Icon className="size-9 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
            {/* §7.2's "You can change your answer until …" returns with the
                buttons (F1c); until then there is no answer to change. */}
            Answers are anonymous.
            {page.closesAt &&
              ` Feedback closes ${formatSessionInstant(page.closesAt)}.`}
          </p>
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
