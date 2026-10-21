'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { TrashIcon } from '@heroicons/react/24/outline'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import {
  rangeBounds,
  responseBuckets,
  selectionIds,
  type BucketRange,
  type ChartResponse,
  type ResponseBucket,
} from '@/lib/feedback/buckets'
import type { FeedbackWindow } from '@/lib/feedback/window'
import { plural } from '@/lib/text/display'
import { formatConferenceClock, formatFeedbackCommentTime } from '@/lib/time'
import { ANSWERS } from '../answers'
import { FEEDBACK_TONE } from '../tone'
import {
  DONE,
  errorText,
  removeMessage,
  removeQuestion,
  type Note,
} from './FeedbackCommentItem'

/** A removed range in words: what went, and what was already gone. */
export const rangeRemovedText = ({
  removed,
  gone,
}: {
  removed: number
  gone: number
}) =>
  DONE.remove(removed) +
  (gone === 0
    ? ''
    : gone === 1
      ? ' 1 was already gone.'
      : ` ${gone} were already gone.`)

/** The range's span in words, e.g. "Wed 10 Jun, 09:00–09:30". */
const spanOf = (buckets: readonly ResponseBucket[], range: BucketRange) => {
  const [from, to] = rangeBounds(range)
  return `${formatFeedbackCommentTime(buckets[from].start)}–${formatConferenceClock(buckets[to].end)}`
}

/** Bottom to top: green, yellow, red, as a stacked column. */
const STACK = [...ANSWERS].reverse()

/**
 * RESPONSES OVER TIME (speaker feedback spec §10.2): a talk's scanned
 * responses in 10-minute buckets across its window. An organizer picks a
 * range (drag across the bars, Shift-click, or the arrow keys with Shift)
 * and removes exactly the responses that range held when they pressed
 * Remove: a response arriving after that is never removed unseen.
 */
export function ResponsesOverTime({
  responses,
  window,
  onRemove,
}: {
  responses: readonly ChartResponse[]
  window: Pick<FeedbackWindow, 'opensAt' | 'closesAt'>
  /**
   * Remove these responses, skipping any already gone; resolves with the
   * counts, rejects with the words to show.
   */
  onRemove: (ids: string[]) => Promise<{ removed: number; gone: number }>
}) {
  const headingId = useId()
  const helpId = useId()
  const optionId = useId()
  const chart = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // Bucketing, not display: while the window is open the chart reaches to
  // now, sampled once a minute (a later response stretches it anyway).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const buckets = responseBuckets({ responses, window, now: new Date(now) })
  const last = buckets.length - 1
  // The range by its buckets' start instants, not their places: a refetch
  // that drops the earliest response moves every bucket, never the range.
  const [stored, setStored] = useState<{
    anchor: string
    focus: string
  } | null>(null)
  const setRange = (next: BucketRange | null) =>
    setStored(
      next && {
        anchor: buckets[next.anchor].start,
        focus: buckets[next.focus].start,
      },
    )
  const [focused, setFocused] = useState(false)
  const at = (start: string) => buckets.findIndex((b) => b.start === start)
  const range: BucketRange | null =
    stored && at(stored.anchor) >= 0 && at(stored.focus) >= 0
      ? { anchor: at(stored.anchor), focus: at(stored.focus) }
      : null
  const active = range?.focus ?? 0
  const [removing, setRemoving] = useState<string[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Note | null>(null)

  if (buckets.length === 0)
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        No scanned responses yet.
      </p>
    )

  const max = Math.max(1, ...buckets.map((b) => b.ids.length))
  const ids = range ? selectionIds(buckets, range) : []
  const [from, to] = range ? rangeBounds(range) : [-1, -1]
  const selected = (i: number) => i >= from && i <= to

  const select = (next: BucketRange | null) => {
    setRange(next)
    setOutcome(null)
  }

  const indexAt = (clientX: number) => {
    const box = chart.current!.getBoundingClientRect()
    const i = Math.floor(((clientX - box.left) / box.width) * buckets.length)
    return Math.max(0, Math.min(last, i))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: active - 1,
      ArrowRight: active + 1,
      Home: 0,
      End: last,
    }
    if (e.key === 'Escape' && range) {
      e.preventDefault()
      select(null)
      return
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    const i = Math.max(0, Math.min(last, moves[e.key]))
    select(
      e.shiftKey
        ? { anchor: range?.anchor ?? active, focus: i }
        : { anchor: i, focus: i },
    )
  }

  async function remove() {
    if (!removing || pending) return
    setPending(true)
    try {
      setOutcome({ ok: true, text: rangeRemovedText(await onRemove(removing)) })
      setRange(null)
    } catch (e) {
      setOutcome({
        ok: false,
        text: errorText(e),
      })
    }
    setPending(false)
    setAsking(false)
  }

  return (
    <section aria-labelledby={headingId}>
      <h4
        id={headingId}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Responses over time
      </h4>
      <p
        id={helpId}
        className="mt-0.5 text-xs text-gray-600 dark:text-gray-400"
      >
        10-minute buckets. Drag across the bars, or use Shift with the arrow
        keys, to pick a range to remove.
      </p>
      <div
        ref={chart}
        role="listbox"
        aria-multiselectable="true"
        aria-labelledby={headingId}
        aria-describedby={helpId}
        aria-activedescendant={focused ? `${optionId}-${active}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          chart.current?.focus()
          chart.current?.setPointerCapture(e.pointerId)
          dragging.current = true
          const i = indexAt(e.clientX)
          select(
            e.shiftKey && range
              ? { anchor: range.anchor, focus: i }
              : { anchor: i, focus: i },
          )
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const i = indexAt(e.clientX)
          if (range && i !== range.focus)
            setRange({ anchor: range.anchor, focus: i })
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        className={`mt-2 flex h-24 cursor-crosshair touch-pan-y items-end rounded-md border border-gray-200 px-0.5 pt-1 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:border-gray-700 ${buckets.length <= 48 ? 'gap-px' : ''}`}
      >
        {buckets.map((b, i) => (
          <div
            key={b.start}
            id={`${optionId}-${i}`}
            role="option"
            aria-selected={selected(i)}
            aria-label={`${formatFeedbackCommentTime(b.start)}–${formatConferenceClock(b.end)}: ${plural(b.ids.length, 'response', 'responses')}`}
            className={`flex h-full min-w-0 flex-1 flex-col justify-end ${selected(i) ? 'bg-brand-sky-mist dark:bg-blue-900/50' : range ? 'opacity-35' : ''} ${focused && i === active ? 'outline-1 -outline-offset-1 outline-brand-cloud-blue dark:outline-blue-300' : ''}`}
          >
            {b.ids.length > 0 && (
              <div
                className="flex min-h-0.5 flex-col-reverse overflow-hidden"
                style={{ height: `${(b.ids.length / max) * 100}%` }}
              >
                {STACK.map(({ colour }) =>
                  b.counts[colour] > 0 ? (
                    <div
                      key={colour}
                      className={FEEDBACK_TONE[colour].bar}
                      style={{
                        height: `${(b.counts[colour] / b.ids.length) * 100}%`,
                      }}
                    />
                  ) : null,
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-gray-600 tabular-nums dark:text-gray-400">
        <time dateTime={buckets[0].start}>
          {formatFeedbackCommentTime(buckets[0].start)}
        </time>
        <time dateTime={buckets[last].end} className="text-right">
          {formatFeedbackCommentTime(buckets[last].end)}
        </time>
      </div>

      <div className="mt-3 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-gray-700 dark:text-gray-300"
        >
          {range
            ? `${spanOf(buckets, range)} · ${plural(ids.length, 'response', 'responses')}`
            : ''}
        </p>
        {range && (
          <div className="flex gap-1">
            {ids.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  // Exactly these: the ids on screen when Remove was pressed.
                  setRemoving(ids)
                  setAsking(true)
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-semibold text-white shadow-xs hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-red-500 dark:hover:bg-red-400"
              >
                <TrashIcon className="size-4" aria-hidden="true" />
                {ids.length === 1
                  ? 'Remove this response'
                  : `Remove these ${ids.length}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                select(null)
                chart.current?.focus()
              }}
              className="min-h-9 rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Clear
            </button>
          </div>
        )}
      </div>
      {outcome && (
        <p
          role={outcome.ok ? 'status' : 'alert'}
          className={`mt-2 text-sm font-medium ${outcome.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
        >
          {outcome.text}
        </p>
      )}

      <ConfirmationModal
        isOpen={asking}
        onClose={() => {
          if (!pending) setAsking(false)
        }}
        afterLeave={() => setRemoving(null)}
        onConfirm={remove}
        title={removeQuestion(removing?.length ?? 0)}
        message={removeMessage(removing?.length ?? 0)}
        confirmButtonText="Remove"
        variant="danger"
        isLoading={pending}
        guardSecondTap
      />
    </section>
  )
}
