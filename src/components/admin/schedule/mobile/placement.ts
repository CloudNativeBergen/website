import type { ScheduleTrack } from '@/lib/conference/types'
import type { DragItem } from '@/lib/schedule/types'
import {
  classifyProposalDrop,
  classifyServiceDrop,
} from '@/lib/schedule/operations'
import type { RailSegment } from './rail'
import { MIN_OPEN_SLOT_MIN } from './constants'
import type { Placing, SegmentState } from './types'

/** Does `seg` represent the currently picked-up scheduled item? */
export function isPlacingSource(
  placing: Placing,
  panelTrackIndex: number,
  seg: RailSegment,
): boolean {
  return (
    placing.kind === 'scheduled' &&
    (seg.kind === 'talk' || seg.kind === 'break') &&
    panelTrackIndex === placing.trackIndex &&
    seg.talkIndex === placing.talkIndex
  )
}

/**
 * The engine DragItem for the current pick-up (proposal / scheduled talk /
 * scheduled service), so the UI can defer every legality question to the shared
 * classifiers instead of re-deriving the rule.
 */
export function placingDragItem(placing: Placing): DragItem {
  if (placing.kind === 'proposal') {
    return { type: 'proposal', proposal: placing.proposal }
  }
  const src = placing.talk
  if (src.talk) {
    return {
      type: 'scheduled-talk',
      proposal: src.talk,
      sourceTrackIndex: placing.trackIndex,
      sourceTimeSlot: src.startTime,
    }
  }
  return {
    type: 'scheduled-service',
    serviceSession: {
      placeholder: src.placeholder ?? '',
      startTime: src.startTime,
      endTime: src.endTime,
    },
    sourceTrackIndex: placing.trackIndex,
    sourceTimeSlot: src.startTime,
  }
}

/**
 * Whether `seg` in panel `T` is a legal drop target for the current pick-up.
 * Defers to the shared `classifyProposalDrop` / `classifyServiceDrop` engine
 * predicates so the UI never offers a drop the reducer would reject. The
 * cross-day duplicate set is only consulted for a FRESH proposal drop (moving
 * an already-scheduled talk bypasses the guard), matching the reducer.
 */
export function segmentState(
  placing: Placing,
  tracks: ScheduleTrack[],
  T: number,
  seg: RailSegment,
  otherScheduledProposalIds: ReadonlySet<string>,
): SegmentState {
  if (isPlacingSource(placing, T, seg)) return 'source'
  if (!tracks[T]) return 'invalid'

  const dragItem = placingDragItem(placing)
  const dropPosition = { trackIndex: T, timeSlot: seg.startTime }

  // Service pick-up: only moves into open slots (services never swap).
  if (dragItem.type === 'scheduled-service') {
    if (seg.kind !== 'open' || seg.durationMin < MIN_OPEN_SLOT_MIN) {
      return 'invalid'
    }
    return classifyServiceDrop(tracks, dragItem, dropPosition) === 'move'
      ? 'valid'
      : 'invalid'
  }

  // Proposal / scheduled talk: an open slot is a MOVE, an occupied talk a SWAP.
  if (seg.kind === 'open') {
    if (seg.durationMin < MIN_OPEN_SLOT_MIN) return 'invalid'
    return classifyProposalDrop(
      tracks,
      dragItem,
      dropPosition,
      otherScheduledProposalIds,
    ) === 'move'
      ? 'valid'
      : 'invalid'
  }
  if (seg.kind === 'talk') {
    return classifyProposalDrop(tracks, dragItem, dropPosition) === 'swap'
      ? 'valid'
      : 'invalid'
  }
  // `break` targets are never a valid drop.
  return 'invalid'
}
