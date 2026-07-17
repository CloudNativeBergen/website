import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  calculateEndTime,
  durationBetween,
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
 */
export function canSwapTalks(
  track: ScheduleTrack,
  draggedProposal: ProposalExisting,
  targetTalk: TrackTalk,
  targetStartTime: string,
): boolean {
  if (!targetTalk.talk) return false
  return fitsInTrack(
    track,
    targetStartTime,
    getProposalDurationMinutes(draggedProposal),
    matchTalk(targetTalk.talk._id, targetTalk.startTime),
  )
}

/**
 * Reverse half of a swap: does the displaced `targetTalk` fit back into the
 * source track at `sourceStartTime`, once the dragged talk (which is leaving
 * that track) is excluded?
 */
export function canPlaceDisplacedBack(
  sourceTrack: ScheduleTrack,
  targetTalk: TrackTalk,
  sourceStartTime: string,
  draggedExclude: SlotMatcher,
): boolean {
  return fitsInTrack(
    sourceTrack,
    sourceStartTime,
    durationBetween(targetTalk.startTime, targetTalk.endTime),
    draggedExclude,
  )
}
