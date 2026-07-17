import type { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import {
  SCHEDULE_START,
  SCHEDULE_END,
  toMinutes,
  durationBetween,
} from '@/lib/schedule/time'

/**
 * One row of the mobile time-rail. Assigned talks and service breaks each become
 * their own segment; every uncovered interval between them (and at the head/tail
 * of the day) becomes an `open` segment — the tappable "assign here" time that
 * makes the editor's free space visible on a phone.
 *
 * `talkIndex` on a talk/break segment is its index into the ORIGINAL
 * `track.talks` array (not the sorted order), so callers can dispatch reducer
 * actions (removeTalk, resizeService, …) without re-deriving it.
 */
export type RailSegment =
  | {
      kind: 'talk' | 'break'
      talk: TrackTalk
      talkIndex: number
      startTime: string
      endTime: string
      durationMin: number
    }
  | { kind: 'open'; startTime: string; endTime: string; durationMin: number }

/**
 * Build the vertical time-rail for one track: a chronological, gap-aware list of
 * segments spanning `[SCHEDULE_START, SCHEDULE_END]`. Talks are visited in start
 * order; the running `cursor` tracks the latest covered minute so back-to-back
 * items produce no gap while non-contiguous ones yield an `open` segment. A fully
 * empty track collapses to a single open segment covering the whole day.
 *
 * Malformed slots (missing times) are skipped; overlaps (which shouldn't occur
 * post-validation) never emit a negative-width open segment.
 */
export function buildTrackRail(track: ScheduleTrack): RailSegment[] {
  const indexed = (track.talks ?? []).map((talk, talkIndex) => ({
    talk,
    talkIndex,
  }))
  const ordered = indexed
    .filter(({ talk }) => talk.startTime && talk.endTime)
    .sort((a, b) => a.talk.startTime.localeCompare(b.talk.startTime))

  const segments: RailSegment[] = []
  let cursor = SCHEDULE_START

  for (const { talk, talkIndex } of ordered) {
    if (toMinutes(talk.startTime) > toMinutes(cursor)) {
      segments.push(openSegment(cursor, talk.startTime))
    }
    segments.push({
      kind: talk.placeholder ? 'break' : 'talk',
      talk,
      talkIndex,
      startTime: talk.startTime,
      endTime: talk.endTime,
      durationMin: durationBetween(talk.startTime, talk.endTime),
    })
    if (toMinutes(talk.endTime) > toMinutes(cursor)) cursor = talk.endTime
  }

  if (toMinutes(cursor) < toMinutes(SCHEDULE_END)) {
    segments.push(openSegment(cursor, SCHEDULE_END))
  }

  return segments
}

function openSegment(startTime: string, endTime: string): RailSegment {
  return {
    kind: 'open',
    startTime,
    endTime,
    durationMin: durationBetween(startTime, endTime),
  }
}
