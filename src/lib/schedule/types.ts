import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import { ProposalExisting } from '@/lib/proposal/types'

// Pure time helpers live in ./time and placement rules in ./rules. Re-exported
// here so existing importers (`@/lib/schedule/types`) keep working while the
// module is split up.
export {
  toMinutes,
  toHHMM,
  addMinutes,
  durationBetween,
  calculateEndTime,
  timesOverlap,
  generateTimeSlots,
  getProposalDurationMinutes,
  type TimeSlot,
} from './time'
export {
  findAvailableTimeSlot,
  canSwapTalks,
  canPlaceDisplacedBack,
  isTrackIntervalFree,
  fitsInTrack,
  matchTalk,
  matchService,
} from './rules'

export interface DropPosition {
  trackIndex: number
  timeSlot: string
}

/**
 * A schedule slot the EDITOR works with: tagged, with the talk/placeholder
 * optionality resolved at the load boundary. Structurally assignable to the
 * persisted {@link TrackTalk} shape (the `kind` tag is an extra property that the
 * explicit serializer in sanity.ts never writes), so {@link EditorSchedule} flows
 * into every {@link ConferenceSchedule}-typed consumer unchanged.
 *
 * Each variant declares the OTHER content field as `?: undefined` — a closed
 * discriminated union whose members are mutually property-accessible. That keeps
 * the unchanged internal ops predicates (`slot.talk?._id`, `slot.placeholder`)
 * type-checking while the `kind` tag still narrows each variant (e.g. a
 * {@link TalkSlot}'s `talk` is non-optional after `kind === 'talk'`), which is
 * how the `!` assertions in operations.ts are retired.
 */
export interface TalkSlot {
  kind: 'talk'
  talk: ProposalExisting
  placeholder?: undefined
  startTime: string
  endTime: string
}
export interface ServiceSlot {
  kind: 'service'
  talk?: undefined
  placeholder: string
  startTime: string
  endTime: string
}
export type Slot = TalkSlot | ServiceSlot
export type EditorTrack = Omit<ScheduleTrack, 'talks'> & { talks: Slot[] }
export type EditorSchedule = Omit<ConferenceSchedule, 'tracks'> & {
  tracks: EditorTrack[]
}

/**
 * Resolve a persisted {@link TrackTalk} into an editor {@link Slot}: a
 * {@link TalkSlot} when the `talk` reference resolves, a {@link ServiceSlot} when
 * it is a placeholder, or `null` for a GHOST — a slot whose talk reference no
 * longer resolves and which is not a placeholder (its proposal was deleted after
 * being scheduled). Dropping ghosts here is the SINGLE editor-side ghost-strip.
 */
export function toSlot(t: TrackTalk): Slot | null {
  if (t.talk) {
    return {
      kind: 'talk',
      talk: t.talk,
      startTime: t.startTime,
      endTime: t.endTime,
    }
  }
  if (t.placeholder) {
    return {
      kind: 'service',
      placeholder: t.placeholder,
      startTime: t.startTime,
      endTime: t.endTime,
    }
  }
  return null
}

/** Convert a persisted track to an editor track, dropping ghost slots. */
export function toEditorTrack(track: ScheduleTrack): EditorTrack {
  return {
    ...track,
    talks: (track.talks || [])
      .map(toSlot)
      .filter((slot): slot is Slot => slot !== null),
  }
}

/**
 * Convert a whole persisted day to an {@link EditorSchedule}, dropping ghost
 * slots. Constructed once at the server load boundary so the editor never
 * carries an unremovable/unsavable ghost slot.
 */
export function toEditorSchedule(s: ConferenceSchedule): EditorSchedule {
  return { ...s, tracks: (s.tracks || []).map(toEditorTrack) }
}

export interface DragItem {
  type: 'proposal' | 'scheduled-talk' | 'service-session' | 'scheduled-service'
  proposal?: ProposalExisting
  serviceSession?: {
    placeholder: string
    startTime: string
    endTime: string
  }
  sourceTrackIndex?: number
  sourceTimeSlot?: string
}
