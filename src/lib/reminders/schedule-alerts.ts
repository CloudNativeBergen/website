import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { createNotifications } from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'
import type { MovedTalk, SlotPlacement } from './types'

/**
 * Event-driven schedule-change alerts (activates the reserved `schedule_update`
 * notification type). The schedule SAVE path captures a day's talk placements
 * BEFORE the write and calls {@link notifyScheduleChanges} AFTER it; a talk whose
 * slot genuinely MOVED (date, start time, or track changed) and that was
 * previously placed earns one notification to its speakers. Newly-placed and
 * removed talks do NOT fire (only a move is a move).
 */

/**
 * Pure diff: talks present in BOTH the prior and next placement sets whose
 * date, startTime, or track POSITION (`trackIndex`) changed. A talk only in
 * `next` (newly placed) or only in `prior` (removed) is excluded. Last placement
 * wins if a talk id appears more than once in a set (defensive — a valid
 * schedule places a talk once).
 *
 * The track is compared by INDEX, not display title, so renaming a track fires
 * no spurious "moved" alerts for its unchanged talks; only an actual position
 * change (or a date/time change) is a move.
 */
export function diffScheduleSlots(
  prior: SlotPlacement[],
  next: SlotPlacement[],
): MovedTalk[] {
  const priorById = new Map<string, SlotPlacement>()
  for (const slot of prior) {
    if (slot.talkId) priorById.set(slot.talkId, slot)
  }
  const nextById = new Map<string, SlotPlacement>()
  for (const slot of next) {
    if (slot.talkId) nextById.set(slot.talkId, slot)
  }

  const moved: MovedTalk[] = []
  for (const [talkId, to] of nextById) {
    const from = priorById.get(talkId)
    if (!from) continue // newly placed — not a move
    if (
      from.date !== to.date ||
      from.startTime !== to.startTime ||
      from.trackIndex !== to.trackIndex
    ) {
      moved.push({
        talkId,
        from: {
          date: from.date,
          startTime: from.startTime,
          trackIndex: from.trackIndex,
          trackTitle: from.trackTitle,
        },
        to: {
          date: to.date,
          startTime: to.startTime,
          trackIndex: to.trackIndex,
          trackTitle: to.trackTitle,
        },
      })
    }
  }
  return moved
}

/** Result of a schedule-change notification pass. */
export interface ScheduleChangeSummary {
  moved: number
  notified: number
}

interface TalkSpeakerRow {
  _id: string
  title: string | null
  speakerIds: string[] | null
}

/**
 * Diff `prior` vs `next` placements and notify the speakers of every moved talk.
 *
 * NEVER-FAIL: wrapped so a notification (or the speaker lookup) can never fail
 * the schedule save that triggered it. `actorId`, when known (the acting
 * organizer), is excluded from recipients and recorded as the notification actor.
 */
export async function notifyScheduleChanges({
  prior,
  next,
  conferenceId,
  actorId,
}: {
  prior: SlotPlacement[]
  next: SlotPlacement[]
  conferenceId: string
  actorId?: string
}): Promise<ScheduleChangeSummary> {
  const summary: ScheduleChangeSummary = { moved: 0, notified: 0 }
  try {
    const moved = diffScheduleSlots(prior, next)
    summary.moved = moved.length
    if (moved.length === 0) return summary

    const movedById = new Map(moved.map((m) => [m.talkId, m]))
    const rows = await clientReadUncached.fetch<TalkSpeakerRow[]>(
      `*[_type == "talk" && _id in $ids]{ _id, title, "speakerIds": speakers[]._ref }`,
      { ids: Array.from(movedById.keys()) },
      { cache: 'no-store' },
    )

    const inputs: NotificationInput[] = []
    for (const row of rows ?? []) {
      const move = movedById.get(row._id)
      if (!move) continue
      const title = row.title || 'your talk'
      for (const speakerId of row.speakerIds ?? []) {
        if (!speakerId || speakerId === actorId) continue
        inputs.push({
          recipientId: speakerId,
          conferenceId,
          notificationType: 'schedule_update',
          title: `Your talk "${title}" was moved`,
          message: `"${title}" is now at ${move.to.startTime} on ${move.to.trackTitle}. Check the program for the latest schedule.`,
          link: '/program',
          relatedProposalId: row._id,
          ...(actorId ? { actorId } : {}),
        })
      }
    }

    if (inputs.length > 0) {
      await createNotifications(inputs)
      summary.notified = inputs.length
    }
  } catch (error) {
    console.error('notifyScheduleChanges failed:', error)
  }
  return summary
}
