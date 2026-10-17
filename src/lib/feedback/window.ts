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
}

const DAY_MS = 24 * 60 * 60 * 1000

function slotInstant(date: string | null, time: string | null): number | null {
  if (!date || !time) return null
  const iso = osloLocalInputToIso(`${date}T${time}`)
  return iso ? Date.parse(iso) : null
}

/** Oslo midnight at the start of the day after `endDate`, or null. */
function conferenceOverAt(endDate: string | null | undefined): number | null {
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null
  const [y, m, d] = endDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  return slotInstant(next, '00:00')
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
  const overAt = conferenceOverAt(conferenceEndDate)
  const conferenceOver = overAt !== null && t >= overAt

  let opens = Infinity
  let lastEnd = -Infinity
  for (const s of slots) {
    const start = slotInstant(s.date, s.startTime)
    const end = slotInstant(s.date, s.endTime)
    if (start === null || end === null) continue
    opens = Math.min(opens, start)
    lastEnd = Math.max(lastEnd, end)
  }

  if (opens === Infinity) {
    return { state: 'unscheduled', feedbackVisible: conferenceOver }
  }

  const closes = lastEnd + DAY_MS
  const state: FeedbackWindowState =
    t < opens ? 'before' : t < closes ? 'open' : 'closed'
  return {
    state,
    opensAt: new Date(opens).toISOString(),
    closesAt: new Date(closes).toISOString(),
    lastSlotEnd: new Date(lastEnd).toISOString(),
    feedbackVisible: t >= lastEnd || conferenceOver,
  }
}
