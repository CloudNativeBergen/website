import type { ConferenceSchedule } from '@/lib/conference/types'
import { parseTalkDateTime } from '@/lib/program/time-utils'
import { isHiddenFromStream } from './schedule-utils'

/**
 * A room's stream screen that also shows the Photo Wall: the room view and
 * Screen Mode take turns, full screen, crossfading. Asked for by the
 * screen's own link (`/stream/<room>?wall=1`); without it the room screen
 * is the room view alone.
 */

/** The query parameter a room screen's link asks for the wall with. */
export const WALL_ROTATION_PARAM = 'wall'
/** How long the room view shows before the wall's turn. */
export const ROOM_TURN_MS = 60_000
/** How long the wall shows before the room view comes back. */
export const WALL_TURN_MS = 30_000
/** The crossfade between the two. */
export const CROSSFADE_MS = 1_000
/** The room view stays this long before the room's next talk starts. */
export const HOLD_BEFORE_TALK_MS = 5 * 60_000

/** Does the room screen's link ask for the wall (`?wall=1`)? */
export function wallRotationRequested(
  value: string | string[] | undefined,
): boolean {
  return value === '1'
}

/**
 * Is the room's next talk about to start? Then the room view stays, so the
 * people walking in see what begins, not photos. Any slot the room view
 * shows counts, a service session too; the hold ends when it starts.
 */
export function holdsRoom(
  schedules: ConferenceSchedule[],
  roomTrackTitle: string,
  now: Date,
): boolean {
  const at = now.getTime()
  return schedules.some(
    (schedule) =>
      schedule.date &&
      schedule.tracks?.some(
        (track) =>
          track.trackTitle === roomTrackTitle &&
          track.talks?.some((talk) => {
            if (!talk.startTime || isHiddenFromStream(talk)) return false
            const start = parseTalkDateTime(
              schedule.date,
              talk.startTime,
            ).getTime()
            return start - HOLD_BEFORE_TALK_MS <= at && at < start
          }),
      ),
  )
}

/** What the screen shows, and since when (ms on the screen's clock). */
export interface Turn {
  view: 'room' | 'wall'
  since: number
}

/**
 * The turn at `now`: the same object while nothing changes. The wall's turn
 * comes only while the wall is open and the room isn't held, and ends at
 * once when either changes; a held room view starts its 60 s afresh when
 * the hold lets go.
 */
export function nextTurn(
  turn: Turn,
  { now, wallOpen, held }: { now: number; wallOpen: boolean; held: boolean },
): Turn {
  if (turn.view === 'wall') {
    return !wallOpen || held || now - turn.since >= WALL_TURN_MS
      ? { view: 'room', since: now }
      : turn
  }
  if (held) return turn.since === now ? turn : { view: 'room', since: now }
  return wallOpen && now - turn.since >= ROOM_TURN_MS
    ? { view: 'wall', since: now }
    : turn
}
