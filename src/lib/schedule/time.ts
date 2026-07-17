import { ProposalExisting } from '@/lib/proposal/types'

/**
 * Pure time helpers for the schedule editor. Previously this arithmetic was
 * re-implemented with `new Date('2000-01-01T…')` in five different files
 * (types.ts, DroppableTrack, DraggableProposal, DraggableServiceSession,
 * useScheduleEditor); centralising it here removes the duplication and makes the
 * most-reused logic in the feature unit-testable.
 *
 * All times are `HH:MM` on a single day. Arithmetic wraps at 24h (mod 1440),
 * matching the previous `Date`-based behaviour; end-of-day CLAMPING is a
 * scheduling RULE handled elsewhere, not a property of these primitives.
 */

export interface TimeSlot {
  time: string
  displayTime: string
}

/**
 * Grid bounds of the schedule editor (one conference day). Single source of
 * truth for the visible/placeable range: `DroppableTrack` renders slots across
 * `[SCHEDULE_START, SCHEDULE_END]` and `operations.ts` rejects any placement
 * whose end exceeds `SCHEDULE_END` (otherwise the item renders below the grid).
 * Kept as `HH:MM` strings so they compose with the helpers below.
 */
export const SCHEDULE_START = '08:00'
export const SCHEDULE_END = '21:00'

/** `HH:MM` → minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

/** Minutes since midnight → `HH:MM`, wrapping at 24h (matches Date rollover). */
export function toHHMM(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(wrapped / 60)
  const mins = wrapped % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/** Add (or subtract) minutes to a `HH:MM` time. */
export function addMinutes(hhmm: string, delta: number): string {
  return toHHMM(toMinutes(hhmm) + delta)
}

/** End time of a slot starting at `startTime` lasting `durationMinutes`. */
export function calculateEndTime(
  startTime: string,
  durationMinutes: number,
): string {
  return addMinutes(startTime, durationMinutes)
}

/** Minutes between two same-day `HH:MM` times (`end - start`). */
export function durationBetween(start: string, end: string): number {
  return toMinutes(end) - toMinutes(start)
}

/**
 * Do intervals `[start1,end1)` and `[start2,end2)` overlap? Strict `<`, so items
 * that merely touch at a boundary (one ends exactly when the next begins) do NOT
 * overlap.
 */
export function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  return (
    toMinutes(start1) < toMinutes(end2) && toMinutes(start2) < toMinutes(end1)
  )
}

/** Inclusive list of `HH:MM` slots from `startTime` to `endTime` every `interval`. */
export function generateTimeSlots(
  startTime: string = '08:00',
  endTime: string = '21:00',
  intervalMinutes: number = 5,
): TimeSlot[] {
  const slots: TimeSlot[] = []
  const endMin = toMinutes(endTime)
  for (let m = toMinutes(startTime); m <= endMin; m += intervalMinutes) {
    const time = toHHMM(m)
    slots.push({ time, displayTime: time })
  }
  return slots
}

/**
 * Talk duration in minutes, parsed from `proposal.format` (`"<type>_<minutes>"`,
 * e.g. `presentation_25`). Defaults to 25 for a missing/unparseable format.
 */
export function getProposalDurationMinutes(proposal: ProposalExisting): number {
  const DEFAULT = 25
  if (!proposal.format) return DEFAULT

  const split = proposal.format.split('_')
  if (split.length >= 2) {
    const parsed = parseInt(split[1], 10)
    if (!isNaN(parsed)) return parsed
  }
  return DEFAULT
}
