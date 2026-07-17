import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import {
  toMinutes,
  timesOverlap,
  SCHEDULE_START,
  SCHEDULE_END,
  HHMM_PATTERN,
} from './time'

/**
 * Server-side payload validation for an admin schedule SAVE (pure, so it is
 * unit-testable without touching Sanity). The client sends whatever its editor
 * state holds; a malformed or hostile payload must be REJECTED before it is
 * persisted, because a bad write silently corrupts the public program (a slot
 * ending after the grid renders below it, an overlap double-books a track, a
 * dangling/foreign `talk` ref points the program at a talk from another edition).
 *
 * `validTalkIds` is the set of `talk` document ids that belong to THIS
 * conference — the caller fetches it once and every referenced id must be in it.
 * Returns a human-readable error string on the FIRST problem found, or `null`
 * when the whole payload is valid.
 */

/** The referenced talk id on a slot, from either `_id` or a Sanity `_ref`. */
function talkRefId(slot: TrackTalk): string | undefined {
  const talk = slot.talk as
    { _id?: string | null; _ref?: string | null } | undefined | null
  if (!talk) return undefined
  return talk._id || talk._ref || undefined
}

export function validateSchedulePayload(
  schedule: ConferenceSchedule,
  validTalkIds: ReadonlySet<string>,
): string | null {
  const startBound = toMinutes(SCHEDULE_START)
  const endBound = toMinutes(SCHEDULE_END)

  for (const track of schedule.tracks || []) {
    const slots = track.talks || []
    const label = track.trackTitle || 'Untitled track'

    for (const slot of slots) {
      if (
        !HHMM_PATTERN.test(slot.startTime) ||
        !HHMM_PATTERN.test(slot.endTime)
      ) {
        return `Track "${label}": times must be HH:MM (24h), got "${slot.startTime}"–"${slot.endTime}".`
      }

      const start = toMinutes(slot.startTime)
      const end = toMinutes(slot.endTime)

      if (end <= start) {
        return `Track "${label}": slot ${slot.startTime}–${slot.endTime} must end after it starts.`
      }
      if (start < startBound) {
        return `Track "${label}": slot ${slot.startTime}–${slot.endTime} starts before ${SCHEDULE_START}.`
      }
      if (end > endBound) {
        return `Track "${label}": slot ${slot.startTime}–${slot.endTime} ends after ${SCHEDULE_END}.`
      }

      const refId = talkRefId(slot)
      const hasTalk = Boolean(refId)
      const hasPlaceholder = Boolean(slot.placeholder)

      if (hasTalk && hasPlaceholder) {
        return `Track "${label}": slot ${slot.startTime}–${slot.endTime} has both a talk and a placeholder.`
      }
      if (!hasTalk && !hasPlaceholder) {
        return `Track "${label}": slot ${slot.startTime}–${slot.endTime} has neither a talk nor a placeholder.`
      }

      if (hasTalk && !validTalkIds.has(refId!)) {
        return `Track "${label}": slot ${slot.startTime}–${slot.endTime} references a talk that does not belong to this conference.`
      }
    }

    // Overlap within a single track (talks AND placeholders both occupy time).
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        if (
          timesOverlap(
            slots[i].startTime,
            slots[i].endTime,
            slots[j].startTime,
            slots[j].endTime,
          )
        ) {
          return `Track "${label}": slots ${slots[i].startTime}–${slots[i].endTime} and ${slots[j].startTime}–${slots[j].endTime} overlap.`
        }
      }
    }
  }

  return null
}
