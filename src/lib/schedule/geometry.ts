import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { SCHEDULE_START, durationBetween, toMinutes } from './time'

/**
 * Pixel geometry for the schedule editor's time grid. Single source of truth for
 * the minute→pixel scale and the position helpers — previously
 * `PIXELS_PER_MINUTE`/`MINUTES_TO_PIXELS = 2.4` was redeclared in DroppableTrack,
 * DraggableProposal and DraggableServiceSession, and the top/height math was
 * re-implemented with `new Date('2000-01-01T…')`. Time arithmetic is delegated to
 * the pure helpers in `./time`.
 */

/** Vertical scale: one schedule minute is this many pixels tall. */
export const PIXELS_PER_MINUTE = 2.4

/** Grid resolution: drop zones and time steps are this many minutes apart. */
export const SLOT_INTERVAL = 5

/** A time label is drawn on slots whose minute is a multiple of this. */
const LABEL_INTERVAL = 15

/** Vertical offset (px) of a `HH:MM` time from the top of the grid. */
export const calculateTimePosition = (time: string): number => {
  const totalMinutes = toMinutes(time) - toMinutes(SCHEDULE_START)
  return Math.max(0, totalMinutes * PIXELS_PER_MINUTE)
}

/** Absolute top/height (px) of a talk or service session on the grid. */
export const calculateTalkPosition = (
  talk: TrackTalk,
): { top: number; height: number } => {
  const top = calculateTimePosition(talk.startTime)
  const durationMinutes = durationBetween(talk.startTime, talk.endTime)
  const height = durationMinutes * PIXELS_PER_MINUTE
  return { top, height }
}

/** Should a time label be rendered at this slot? */
export const shouldShowTimeLabel = (time: string): boolean => {
  const [, minutes] = time.split(':').map(Number)
  return minutes % LABEL_INTERVAL === 0
}

/** Total minutes of real talk content (ignoring service sessions) in a track. */
export const calculateTalkContentMinutes = (track: ScheduleTrack): number => {
  return track.talks.reduce((total, talk) => {
    if (!talk.talk) return total
    return total + durationBetween(talk.startTime, talk.endTime)
  }, 0)
}
