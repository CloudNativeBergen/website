/**
 * THE FEEDBACK WINDOW (speaker feedback spec §6). Pure: it takes `now`, so it
 * is testable without mocking the clock, and it computes "conference over"
 * itself rather than calling `isConferenceOver`, which reads `new Date()`.
 *
 * The window runs from the start of the session's earliest slot until 24 hours
 * after its latest slot ends, as one continuous span even across days. The
 * slots come from the published, official schedules only (§4.4); that filter
 * is the slot query's job, not this function's.
 */
import { osloLocalInputToIso } from '@/lib/time'

/** One `tracks[].talks[]` entry of a schedule day that holds the talk. */
export interface FeedbackSlot {
  /** The schedule day, `YYYY-MM-DD` in Oslo. */
  date: string | null
  /** `HH:mm`, Oslo wall clock. */
  startTime: string | null
  endTime: string | null
}

export type FeedbackWindowState = 'unscheduled' | 'before' | 'open' | 'closed'

export interface FeedbackWindow {
  state: FeedbackWindowState
  /** ISO instants; absent when the talk has no slot. */
  opensAt?: string
  closesAt?: string
  lastSlotEnd?: string
  /** Speakers see their feedback once the last slot ended or the conference is over. */
  feedbackVisible: boolean
  /**
   * When the conference will be over, for a window whose feedback is not
   * visible yet and would not be by its last slot's end (no slot, or a slot
   * dated after the conference), so a page left open turns visible on time.
   */
  conferenceOverAt?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function slotInstant(date: string | null, time: string | null): number | null {
  if (!date || !time) return null
  const iso = osloLocalInputToIso(`${date}T${time}`)
  return iso ? Date.parse(iso) : null
}

/**
 * The instant `isConferenceOver` (`src/lib/conference/state.ts`) flips: UTC
 * midnight at the start of the day after `endDate`. The same instant, so this
 * window and every other "conference over" check on the site agree.
 */
function conferenceOverAt(endDate: string | null | undefined): number | null {
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null
  const [y, m, d] = endDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d + 1)
}

export function feedbackWindow({
  slots,
  conferenceEndDate,
  now,
}: {
  slots: readonly FeedbackSlot[]
  conferenceEndDate: string | null | undefined
  now: Date
}): FeedbackWindow {
  const t = now.getTime()
  const conferenceOver = isConferenceOverAt(conferenceEndDate, now)

  let opens = Infinity
  let lastEnd = -Infinity
  for (const s of slots) {
    const start = slotInstant(s.date, s.startTime)
    const end = slotInstant(s.date, s.endTime)
    // A slot that does not end after it starts (Studio checks only the
    // HH:mm shape) would show feedback before the session is over.
    if (start === null || end === null || end <= start) continue
    opens = Math.min(opens, start)
    lastEnd = Math.max(lastEnd, end)
  }

  if (opens === Infinity) {
    const overAt = conferenceOverAt(conferenceEndDate)
    return conferenceOver || overAt === null
      ? { state: 'unscheduled', feedbackVisible: conferenceOver }
      : {
          state: 'unscheduled',
          feedbackVisible: false,
          conferenceOverAt: new Date(overAt).toISOString(),
        }
  }

  const closes = lastEnd + DAY_MS
  const state: FeedbackWindowState =
    t < opens ? 'before' : t < closes ? 'open' : 'closed'
  const feedbackVisible = t >= lastEnd || conferenceOver
  // A slot dated after the conference's last day (a data error): feedback
  // turns visible when the conference is over, before that slot ends.
  const overAt = conferenceOverAt(conferenceEndDate)
  return {
    state,
    opensAt: new Date(opens).toISOString(),
    closesAt: new Date(closes).toISOString(),
    lastSlotEnd: new Date(lastEnd).toISOString(),
    feedbackVisible,
    ...(!feedbackVisible &&
      overAt !== null &&
      overAt < lastEnd && { conferenceOverAt: new Date(overAt).toISOString() }),
  }
}

/**
 * The state a window computed earlier has at `now`, from its own instants.
 * The speaker's page uses it to move "Opens…" to "Open until…" to "Closed"
 * on the clock, without asking the server again. A window with no slot keeps
 * its state.
 */
export function feedbackWindowStateAt(
  window: Pick<FeedbackWindow, 'state' | 'opensAt' | 'closesAt'>,
  now: Date,
): FeedbackWindowState {
  if (!window.opensAt || !window.closesAt) return window.state
  const t = now.getTime()
  if (t < Date.parse(window.opensAt)) return 'before'
  return t < Date.parse(window.closesAt) ? 'open' : 'closed'
}

/**
 * Whether speakers see their feedback at `now` (§6), from a window computed
 * earlier: once its last slot has ended, once the conference is over for a
 * talk with no slot, or when the server already said so.
 */
export function feedbackVisibleAt(
  window: Pick<
    FeedbackWindow,
    'feedbackVisible' | 'lastSlotEnd' | 'conferenceOverAt'
  >,
  now: Date,
): boolean {
  const reached = (instant: string | undefined) =>
    !!instant && now.getTime() >= Date.parse(instant)
  return (
    window.feedbackVisible ||
    reached(window.lastSlotEnd) ||
    reached(window.conferenceOverAt)
  )
}

/** "The conference is over" at `now`, as {@link feedbackWindow} judges it. */
export function isConferenceOverAt(
  endDate: string | null | undefined,
  now: Date,
): boolean {
  const overAt = conferenceOverAt(endDate)
  return overAt !== null && now.getTime() >= overAt
}

/**
 * No answer can arrive any more: the window has closed, or, for a talk with
 * no slot, its conference is over (for an unscheduled talk `feedbackVisible`
 * is exactly "the conference is over"). The summary goes out from here
 * (§11.1), and §5 mints no code.
 */
export const answersClosed = (window: FeedbackWindow) =>
  window.state === 'closed' ||
  (window.state === 'unscheduled' && window.feedbackVisible)

/** §5: a code may be minted until {@link answersClosed}. */
export const mayMint = (window: FeedbackWindow) => !answersClosed(window)
