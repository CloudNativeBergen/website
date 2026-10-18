'use client'

import { useEffect, useRef } from 'react'
import {
  ArrowPathIcon,
  FaceFrownIcon,
  FaceSmileIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline'
import {
  FEEDBACK_COLOUR_LABELS,
  type FeedbackColour,
} from '@/lib/feedback/colour'
import type {
  AttendeeFeedbackState,
  DeleteOutcome,
} from '@/lib/feedback/server'

/**
 * What the attendee page's actions look like from the client, bound to the
 * page's code (speaker feedback spec §7.4). Submit takes the colour and,
 * ONLY from the comment form, the comment: a colour-only tap leaves the
 * stored comment untouched, and `''` empties it.
 */
export type SubmitAnswer = (
  colour: FeedbackColour,
  comment?: string,
) => Promise<AttendeeFeedbackState>

/**
 * Delete my answer (§7.4), bound to the page's code. `deleted` is true only
 * once the delete committed; a refusal brings the page's current state.
 */
export type DeleteAnswer = () => Promise<DeleteOutcome>

/** What the page says above its state after Delete my answer. */
export type DeleteNotice = 'deleted' | 'nothing-to-delete'

/** The three answers (§7.2): each with its icon and words, never colour alone. */
export const ANSWERS = [
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

/** A heading that takes focus after a state swap: a visible ring for keyboard users only. */
export const HEADING_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900 dark:focus-visible:outline-white'

/**
 * Borders on THIS page at 3:1 or better against the page (gray-500 on
 * white, gray-400 on gray-950 and gray-900): non-text contrast, WCAG 1.4.11.
 */
export const CONTROL_BORDER = 'border border-gray-500 dark:border-gray-400'

export const SECONDARY_BUTTON = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg ${CONTROL_BORDER} px-4 text-sm font-semibold transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:focus-visible:outline-white`

export const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 aria-disabled:cursor-wait aria-disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:focus-visible:outline-white'

/**
 * A ref that focuses its element once, when it MOUNTS with `enabled` true.
 * Only the mount counts: a state entered by a tap is announced, a state the
 * page loaded in is not, and a later change of `enabled` while the element
 * stays mounted (another action on the same state) moves nothing.
 */
export function useFocusOnMount(enabled: boolean) {
  const ref = useRef<HTMLHeadingElement>(null)
  const onMount = useRef(enabled)
  useEffect(() => {
    if (onMount.current) ref.current?.focus()
  }, [])
  return ref
}

export function AnswerButtons({
  pending,
  tapped,
  current,
  onTap,
  labelledBy,
  ref,
}: {
  pending: boolean
  /** The colour whose save is in flight. */
  tapped: FeedbackColour | null
  /** The recorded answer, marked as pressed while changing it. */
  current?: FeedbackColour
  onTap: (colour: FeedbackColour) => void
  /** With `current`: the grid is a group named by this element. */
  labelledBy?: string
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      role={labelledBy ? 'group' : undefined}
      aria-labelledby={labelledBy}
      className="mt-5 flex flex-col gap-3"
      aria-busy={pending}
    >
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

/** A line saying an action could not be confirmed (the Open form). */
export function Failed({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 text-center text-sm font-medium text-red-700 dark:text-red-400"
    >
      {children}
    </p>
  )
}

/** What a status line says, and whether it is good news. */
export interface StatusLine {
  kind: 'ok' | 'error'
  text: string
}

/**
 * One always-rendered live region: VoiceOver announces text SET in an
 * existing `role="status"` container, not a container that appears with its
 * text. Success and failure share the place, told apart by colour and words.
 */
export function Status({
  status,
  className = '',
}: {
  status: StatusLine | null
  className?: string
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-5 text-center text-sm font-medium ${
        status?.kind === 'error'
          ? 'text-red-700 dark:text-red-400'
          : 'text-green-700 dark:text-green-400'
      } ${className}`}
    >
      {status?.text ?? ''}
    </p>
  )
}
