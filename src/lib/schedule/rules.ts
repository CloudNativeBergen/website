import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  calculateEndTime,
  endsWithinScheduleDay,
  getProposalDurationMinutes,
  timesOverlap,
} from './time'

/**
 * Scheduling placement rules (pure). Extracted from types.ts during the
 * refactor and CORRECTED: occupancy is now interval-based and covers BOTH talks
 * and service sessions (breaks/lunch). Previously the checks only looked at
 * items with a `.talk` and only at an exact `startTime` match, so a talk could
 * be dropped straddling lunch, service sessions bypassed collision entirely, and
 * a cross-track swap could leave the source track overlapping.
 */

/** Match a specific slot by identity so it can be excluded from a free-check. */
export type SlotMatcher = (slot: TrackTalk) => boolean

/** Exclude the talk currently occupying `startTime` with the given talk id. */
export function matchTalk(talkId: string, startTime: string): SlotMatcher {
  return (slot) => slot.talk?._id === talkId && slot.startTime === startTime
}

/** Exclude the service session at `startTime` with the given placeholder. */
export function matchService(
  placeholder: string,
  startTime: string,
): SlotMatcher {
  return (slot) =>
    slot.placeholder === placeholder && slot.startTime === startTime
}

/** Compose matchers: a slot is excluded if ANY of the matchers claim it. */
export function anyMatch(
  ...matchers: Array<SlotMatcher | undefined>
): SlotMatcher {
  return (slot) => matchers.some((match) => match?.(slot))
}

/**
 * Is the interval `[startTime, endTime)` free in `track`? Every slot that
 * occupies time is an obstacle — talks AND service sessions — so nothing can be
 * placed overlapping a break. `exclude` skips a specific slot (the item being
 * moved out of its own position).
 */
export function isTrackIntervalFree(
  track: ScheduleTrack,
  startTime: string,
  endTime: string,
  exclude?: SlotMatcher,
): boolean {
  return !track.talks.some((slot) => {
    if (exclude?.(slot)) return false
    return timesOverlap(startTime, endTime, slot.startTime, slot.endTime)
  })
}

/** Can an item of `durationMinutes` be placed at `startTime` in `track`? */
export function fitsInTrack(
  track: ScheduleTrack,
  startTime: string,
  durationMinutes: number,
  exclude?: SlotMatcher,
): boolean {
  return isTrackIntervalFree(
    track,
    startTime,
    calculateEndTime(startTime, durationMinutes),
    exclude,
  )
}

/**
 * The slot a proposal can occupy at `preferredStartTime` (its whole footprint
 * must be free), or `null` if it would overlap anything. `excludeTalk` lets a
 * talk be re-placed at/around its own current slot.
 */
export function findAvailableTimeSlot(
  track: ScheduleTrack,
  proposal: ProposalExisting,
  preferredStartTime?: string,
  excludeTalk?: { talkId: string; startTime: string },
): string | null {
  const startTime = preferredStartTime || '08:00'
  const exclude = excludeTalk
    ? matchTalk(excludeTalk.talkId, excludeTalk.startTime)
    : undefined
  return fitsInTrack(
    track,
    startTime,
    getProposalDurationMinutes(proposal),
    exclude,
  )
    ? startTime
    : null
}

/**
 * Forward half of a swap: does `draggedProposal` fit at `targetStartTime` in
 * `track` once the talk it displaces is removed? The caller must ALSO check the
 * reverse (that the displaced talk fits back into the source track) via
 * {@link canPlaceDisplacedBack} — validating only this direction was the source
 * of the post-swap-overlap bug.
 *
 * `draggedExclude` skips the dragged talk's OWN source slot: on a SAME-TRACK
 * swap the dragged talk is still sitting in this track at its source position,
 * so without excluding it the forward check self-collides and rejects every
 * legal same-track swap. Omitted for cross-track swaps (the dragged talk lives
 * in a different track, so there is nothing of its to exclude here).
 */
export function canSwapTalks(
  track: ScheduleTrack,
  draggedProposal: ProposalExisting,
  targetTalk: TrackTalk,
  targetStartTime: string,
  draggedExclude?: SlotMatcher,
): boolean {
  if (!targetTalk.talk) return false
  return fitsInTrack(
    track,
    targetStartTime,
    getProposalDurationMinutes(draggedProposal),
    anyMatch(
      matchTalk(targetTalk.talk._id, targetTalk.startTime),
      draggedExclude,
    ),
  )
}

/**
 * Reverse half of a swap: does the displaced `targetTalk` fit back into the
 * source track at `sourceStartTime`, once the dragged talk (which is leaving
 * that track) is excluded?
 *
 * The displaced talk's landing duration is its FORMAT duration
 * ({@link getProposalDurationMinutes}) — the value `performSwap` actually writes
 * — NOT the stored slot span. Validating with the stored span while the write
 * uses the format duration let a swap pass here then overlap a neighbour after
 * the write (when stored < format). Check-what-you-write.
 *
 * Two guards beyond interval-freedom:
 *  - end-of-day: the displaced talk must not run past {@link SCHEDULE_END} at
 *    its landing slot (the dragged talk's own end was checked by the caller, but
 *    the displaced talk's was not — a short talk could push a long one off-grid);
 *  - it excludes the TARGET's own old slot as well as the dragged source, so a
 *    SAME-TRACK swap (source === target track, target still present at its old
 *    position) does not self-collide. Cross-track: the target's old slot is in
 *    another track, so excluding it here is a harmless no-op.
 */
export function canPlaceDisplacedBack(
  sourceTrack: ScheduleTrack,
  targetTalk: TrackTalk,
  sourceStartTime: string,
  draggedExclude: SlotMatcher,
): boolean {
  if (!targetTalk.talk) return false
  const displacedDuration = getProposalDurationMinutes(targetTalk.talk)
  if (!endsWithinScheduleDay(sourceStartTime, displacedDuration)) return false
  return fitsInTrack(
    sourceTrack,
    sourceStartTime,
    displacedDuration,
    anyMatch(
      draggedExclude,
      matchTalk(targetTalk.talk._id, targetTalk.startTime),
    ),
  )
}
