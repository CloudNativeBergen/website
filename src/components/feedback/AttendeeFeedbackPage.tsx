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
import { formatRegistrationInstant } from '@/lib/time'

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
 * The answer buttons are not wired yet (F1b): they render disabled until the
 * Submit action lands (F1c).
 */
export function AttendeeFeedbackPage({
  logo,
  page,
}: {
  logo: ConferenceLogoData | null
  page: AttendeeFeedbackState
}) {
  return (
    <div className="min-h-dvh bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex justify-center px-4 pt-8">
        <ConferenceLogo
          conference={logo}
          variant="horizontal"
          className="h-10 w-auto max-w-full text-brand-slate-gray dark:text-white"
        />
      </header>
      <main className="mx-auto max-w-md px-4 pt-10 pb-12">
        <PageState page={page} />
      </main>
    </div>
  )
}

function PageState({ page }: { page: AttendeeFeedbackState }) {
  switch (page.state) {
    case 'open':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <h1 className="text-xl font-semibold">How was this session?</h1>
          <div className="mt-5 flex flex-col gap-3">
            {ANSWERS.map(({ colour, label, Icon, className }) => (
              <button
                key={colour}
                type="button"
                disabled
                className={`flex h-20 w-full items-center gap-4 rounded-xl px-6 text-xl font-bold shadow-xs ${className}`}
              >
                <Icon className="size-9 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
            Anonymous. You can change your answer until{' '}
            {formatRegistrationInstant(page.closesAt)}.
          </p>
        </>
      )
    case 'not-yet-open':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
            Icon={ClockIcon}
            title="Feedback opens when the session starts"
          >
            {page.opensAt
              ? `It opens ${formatRegistrationInstant(page.opensAt)}. Scan the code again then.`
              : 'Scan the code again during the session.'}
          </Notice>
        </>
      )
    case 'closed':
      return (
        <>
          <TalkHeading talk={page.talk} />
          <Notice
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
      <p className="font-display text-2xl leading-tight font-bold tracking-tight text-balance">
        {talk.title}
      </p>
      {talk.speakers.length > 0 && (
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {talk.speakers.join(', ')}
        </p>
      )}
    </div>
  )
}

function Notice({
  Icon,
  title,
  children,
}: {
  Icon: typeof ClockIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="size-12 text-gray-400" aria-hidden="true" />
      <h1 className="mt-4 text-lg font-semibold text-balance">{title}</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  )
}
