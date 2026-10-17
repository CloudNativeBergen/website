'use client'

/**
 * PROTOTYPE — throwaway. Answers "what does the attendee see after scanning a
 * Feedback Code?" (wayfinder ticket #1420). Three structurally different
 * variants of the open form, plus the shared non-open states. No persistence,
 * no network: state lives in useState and is printed under the form.
 * Lives on branch prototype/speaker-feedback-attendee-form; never merged.
 */
import { useState } from 'react'
import {
  CheckCircleIcon,
  ClockIcon,
  FaceFrownIcon,
  FaceSmileIcon,
  LockClosedIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'

export type Colour = 'green' | 'yellow' | 'red'

export type PageState =
  | { kind: 'open'; closesAt: string }
  | { kind: 'notYetOpen'; opensAt?: string }
  | { kind: 'closed' }
  | { kind: 'unknown' }

export interface TalkInfo {
  title: string
  speakers: string[]
  /** Only present when the talk is on the public programme (#1418). */
  public: boolean
}

export interface PrototypeProps {
  variant: 'A' | 'B' | 'C'
  conferenceName: string
  talk: TalkInfo
  state: PageState
  /** Start as if this device already answered (resubmission view). */
  initialAnswer?: { colour: Colour; comment: string }
}

const COLOURS: Colour[] = ['green', 'yellow', 'red']

const LABEL_A: Record<Colour, string> = {
  green: 'Loved it',
  yellow: 'It was OK',
  red: 'Not for me',
}

const ICON: Record<Colour, typeof FaceSmileIcon> = {
  green: FaceSmileIcon,
  yellow: MinusCircleIcon,
  red: FaceFrownIcon,
}

const SOLID: Record<Colour, string> = {
  green: 'bg-green-600 text-white',
  yellow: 'bg-yellow-400 text-yellow-950',
  red: 'bg-red-600 text-white',
}

const SOFT: Record<Colour, string> = {
  green:
    'border-green-600 text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40',
  yellow:
    'border-yellow-500 text-yellow-900 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-950/40',
  red: 'border-red-600 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40',
}

const MAX_COMMENT = 1000

export function FeedbackFormPrototype(props: PrototypeProps) {
  const { state, conferenceName } = props
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-blue-600 dark:border-gray-800 dark:text-blue-400">
        {conferenceName}
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        {state.kind === 'open' && (
          <OpenForm {...props} closesAt={state.closesAt} />
        )}
        {state.kind === 'notYetOpen' && (
          <NotYetOpen {...props} opensAt={state.opensAt} />
        )}
        {state.kind === 'closed' && <Closed talk={props.talk} />}
        {state.kind === 'unknown' && <Unknown />}
      </main>
    </div>
  )
}

function TalkHeading({ talk }: { talk: TalkInfo }) {
  if (!talk.public) return null
  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {talk.title}
      </h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {talk.speakers.join(' & ')}
      </p>
    </div>
  )
}

function Notice({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ClockIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-8 flex flex-col items-center text-center">
      <Icon className="size-12 text-gray-400" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {children}
      </p>
    </div>
  )
}

function NotYetOpen({ talk, opensAt }: PrototypeProps & { opensAt?: string }) {
  return (
    <>
      <TalkHeading talk={talk} />
      <Notice icon={ClockIcon} title="Feedback opens when the session starts">
        {talk.public && opensAt
          ? `Come back at ${opensAt}, or scan the code again during the session.`
          : 'Scan the code again during the session.'}
      </Notice>
    </>
  )
}

function Closed({ talk }: { talk: TalkInfo }) {
  return (
    <>
      <TalkHeading talk={talk} />
      <Notice
        icon={LockClosedIcon}
        title="Feedback for this session has closed"
      >
        Thank you for coming. Feedback closes 24 hours after a session ends.
      </Notice>
    </>
  )
}

function Unknown() {
  return (
    <Notice
      icon={QuestionMarkCircleIcon}
      title="This feedback code isn't valid"
    >
      Check the code on the slide or the sheet in the room and scan it again.
    </Notice>
  )
}

function OpenForm(props: PrototypeProps & { closesAt: string }) {
  const [answer, setAnswer] = useState<{
    colour: Colour
    comment: string
  } | null>(props.initialAnswer ?? null)
  const [log, setLog] = useState<string[]>([])
  const submit = (colour: Colour, comment: string) => {
    setAnswer({ colour, comment })
    setLog((l) => [
      ...l,
      `PUT response {colour: ${colour}, comment: ${comment ? `"${comment.slice(0, 40)}"` : '—'}}`,
    ])
  }
  const Variant = { A: VariantOneTap, B: VariantFormThenSend, C: VariantCards }[
    props.variant
  ]
  return (
    <>
      <Variant {...props} answer={answer} submit={submit} />
      <p className="mt-8 text-center text-xs text-gray-500">
        Anonymous. You can change your answer until {props.closesAt}.
      </p>
      <pre className="mt-6 rounded bg-gray-100 p-2 text-[10px] text-gray-600 dark:bg-gray-900 dark:text-gray-400">
        PROTOTYPE STATE{'\n'}answer: {JSON.stringify(answer)}
        {'\n'}
        {log.join('\n')}
      </pre>
    </>
  )
}

interface VariantProps extends PrototypeProps {
  answer: { colour: Colour; comment: string } | null
  submit: (colour: Colour, comment: string) => void
}

function CommentBox({
  value,
  onChange,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div>
      <label htmlFor="fb-comment" className="block text-sm font-medium">
        Comment for the speaker{' '}
        <span className="text-gray-500">(optional)</span>
      </label>
      <textarea
        id="fb-comment"
        rows={rows}
        maxLength={MAX_COMMENT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
        placeholder="What worked, what could be better?"
      />
      <p className="mt-1 text-right text-xs text-gray-500">
        {value.length}/{MAX_COMMENT}
      </p>
    </div>
  )
}

/**
 * A — One tap. Three full-width buttons with words; the tap IS the submit.
 * The comment is offered afterwards, on the thank-you screen.
 */
function VariantOneTap({ talk, answer, submit }: VariantProps) {
  const [comment, setComment] = useState(answer?.comment ?? '')
  const [changing, setChanging] = useState(false)
  if (answer && !changing) {
    const Icon = ICON[answer.colour]
    return (
      <>
        <TalkHeading talk={talk} />
        <div
          className={`mt-6 flex items-center gap-3 rounded-lg border-2 p-4 ${SOFT[answer.colour]}`}
        >
          <CheckCircleIcon className="size-6 shrink-0" aria-hidden />
          <p className="font-medium">
            Thanks! You answered{' '}
            <span className="inline-flex items-center gap-1">
              <Icon className="size-5" aria-hidden />
              {LABEL_A[answer.colour]}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="mt-2 text-sm text-blue-600 underline dark:text-blue-400"
        >
          Change answer
        </button>
        <div className="mt-6">
          <CommentBox value={comment} onChange={setComment} />
          <button
            type="button"
            disabled={comment === answer.comment}
            onClick={() => submit(answer.colour, comment)}
            className="mt-2 w-full rounded-md bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-40"
          >
            {answer.comment ? 'Update comment' : 'Send comment'}
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      <TalkHeading talk={talk} />
      <h2 className="mt-6 text-lg font-semibold">How was this session?</h2>
      <div className="mt-4 flex flex-col gap-3">
        {COLOURS.map((c) => {
          const Icon = ICON[c]
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                submit(c, answer?.comment ?? '')
                setChanging(false)
              }}
              className={`flex h-20 items-center gap-4 rounded-xl px-6 text-xl font-bold shadow-sm active:scale-[0.98] ${SOLID[c]}`}
            >
              <Icon className="size-9" aria-hidden />
              {LABEL_A[c]}
            </button>
          )
        })}
      </div>
    </>
  )
}

/**
 * B — Classic form. A segmented colour choice, the comment visible from the
 * start, one Send button. Nothing is stored until Send.
 */
function VariantFormThenSend({ talk, answer, submit }: VariantProps) {
  const [colour, setColour] = useState<Colour | null>(answer?.colour ?? null)
  const [comment, setComment] = useState(answer?.comment ?? '')
  const sent = answer && answer.colour === colour && answer.comment === comment
  return (
    <>
      <TalkHeading talk={talk} />
      <fieldset className="mt-6">
        <legend className="text-lg font-semibold">How was this session?</legend>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup">
          {COLOURS.map((c) => {
            const Icon = ICON[c]
            const on = colour === c
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setColour(c)}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 py-4 text-sm font-semibold ${
                  on
                    ? SOFT[c]
                    : 'border-gray-200 text-gray-600 dark:border-gray-800 dark:text-gray-400'
                }`}
              >
                <span
                  className={`flex size-10 items-center justify-center rounded-full ${SOLID[c]}`}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                {c === 'green' ? 'Green' : c === 'yellow' ? 'Yellow' : 'Red'}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="mt-6">
        <CommentBox value={comment} onChange={setComment} rows={3} />
      </div>
      <button
        type="button"
        disabled={!colour || !!sent}
        onClick={() => colour && submit(colour, comment)}
        className="mt-2 w-full rounded-md bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-40"
      >
        {sent
          ? 'Sent — thank you!'
          : answer
            ? 'Update feedback'
            : 'Send feedback'}
      </button>
    </>
  )
}

/**
 * C — Hold up a card. Mirrors the physical cards: three tall coloured cards
 * side by side, no words on the cards, a caption under each. Tapping a card
 * sends it and slides up a sheet offering the comment.
 */
function VariantCards({ talk, answer, submit }: VariantProps) {
  const [comment, setComment] = useState(answer?.comment ?? '')
  const [sheet, setSheet] = useState(false)
  const CAPTION: Record<Colour, string> = {
    green: 'Great',
    yellow: 'OK',
    red: 'Poor',
  }
  return (
    <>
      <TalkHeading talk={talk} />
      <h2 className="mt-6 text-center text-lg font-semibold">
        {answer ? 'Your card' : 'Hold up a card'}
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {COLOURS.map((c) => {
          const Icon = ICON[c]
          const chosen = answer?.colour === c
          const dim = answer && !chosen
          return (
            <button
              key={c}
              type="button"
              aria-pressed={chosen}
              aria-label={CAPTION[c]}
              onClick={() => {
                submit(c, answer?.comment ?? comment)
                setSheet(true)
              }}
              className={`flex aspect-[2/3] flex-col items-center justify-center rounded-2xl shadow-md transition ${SOLID[c]} ${
                chosen
                  ? 'ring-4 ring-blue-500 ring-offset-2 dark:ring-offset-gray-950'
                  : ''
              } ${dim ? 'opacity-30' : ''}`}
            >
              <Icon className="size-12" aria-hidden />
              <span className="mt-2 text-sm font-semibold">{CAPTION[c]}</span>
            </button>
          )
        })}
      </div>
      {answer && !sheet && (
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="mt-6 w-full rounded-md border border-gray-300 px-4 py-3 text-sm font-medium dark:border-gray-700"
        >
          {answer.comment
            ? 'Edit your comment'
            : 'Add a comment for the speaker'}
        </button>
      )}
      {sheet && answer && (
        <div className="mt-6 rounded-t-2xl border-t-4 border-blue-500 bg-gray-50 p-4 shadow-lg dark:bg-gray-900">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CheckCircleIcon className="size-5 text-green-600" aria-hidden />
            Card received. Anything to add?
          </p>
          <CommentBox value={comment} onChange={setComment} rows={3} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="flex-1 rounded-md border border-gray-300 px-4 py-3 text-sm font-medium dark:border-gray-700"
            >
              No thanks
            </button>
            <button
              type="button"
              disabled={!comment || comment === answer.comment}
              onClick={() => {
                submit(answer.colour, comment)
                setSheet(false)
              }}
              className="flex-1 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send comment
            </button>
          </div>
        </div>
      )}
    </>
  )
}
