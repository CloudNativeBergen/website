import type { RailSegment } from '../mobileRail'
import type { Placing, SegmentState } from './types'
import {
  OPEN_MAX_HEIGHT,
  PX_PER_MIN,
  SEG_MAX_HEIGHT,
  SEG_MIN_HEIGHT,
} from './constants'

/** Clamped, duration-proportional pixel height for a rail segment's card. */
export function segmentHeight(seg: RailSegment): number {
  const max = seg.kind === 'open' ? OPEN_MAX_HEIGHT : SEG_MAX_HEIGHT
  return Math.min(
    max,
    Math.max(SEG_MIN_HEIGHT, Math.round(seg.durationMin * PX_PER_MIN)),
  )
}

/** Accessible label for a rail segment, context-aware of the current pick-up. */
export function segmentLabel(
  seg: RailSegment,
  placing: Placing | null,
  state: SegmentState,
): string {
  if (seg.kind === 'open') {
    return `Assign to open slot ${seg.startTime} to ${seg.endTime}`
  }
  const title = seg.talk.talk?.title ?? seg.talk.placeholder ?? 'Untitled'
  if (!placing) return `Options for ${title}`
  if (state === 'source') return `Cancel moving ${title}`
  return seg.kind === 'talk' ? `Swap with ${title}` : title
}
