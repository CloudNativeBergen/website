import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { createNotifications } from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'
import { toDateString } from './dates'
import { REMINDER_REGISTRY } from './registry'
import {
  reminderLogId,
  dayOfLogId,
  readReminderLogs,
  shouldSendReminder,
  stampReminderLog,
  createDayOfLog,
} from './marker'
import type {
  CandidateTalk,
  DayOfAgendaSummary,
  ReminderConference,
  ReminderKeyResult,
  ReminderSpeaker,
  SpeakerRemindersSummary,
} from './types'

/**
 * Server-only scheduled speaker reminders. Both entry points wrap their whole
 * run in a never-throw envelope and isolate every per-speaker emit, so the cron
 * (whose steps must all complete) can never be failed by one bad speaker, a read
 * error, or a notification failure. `createNotifications` already never throws;
 * the marker write can, so it is inside the per-item try/catch.
 */

/** Hard cap on sends per run, so a backlog can never fan out unbounded. */
const MAX_SENDS_PER_RUN = 500

/** Raw talk row for the candidate projection. */
interface TalkRow {
  _id: string
  title: string | null
  status: string | null
  speakerIds: string[] | null
  hasSlides: boolean
}

/** Raw travel-support row. */
interface TravelRow {
  speakerId: string | null
  status: string | null
}

/**
 * Build the per-speaker candidate set for a conference: every speaker on an
 * accepted or confirmed talk, with their talks and travel-support status folded
 * in. One read for talks, one for travel support.
 */
export async function fetchReminderSpeakers(
  conferenceId: string,
): Promise<ReminderSpeaker[]> {
  const [talkRows, travelRows] = await Promise.all([
    clientReadUncached.fetch<TalkRow[]>(
      `*[_type == "talk" && conference._ref == $conferenceId && status in ["accepted", "confirmed"]]{
        _id,
        title,
        status,
        "speakerIds": speakers[]._ref,
        "hasSlides": count(attachments[attachmentType == "slides"]) > 0
      }`,
      { conferenceId },
      { cache: 'no-store' },
    ),
    clientReadUncached.fetch<TravelRow[]>(
      `*[_type == "travelSupport" && conference._ref == $conferenceId]{
        "speakerId": speaker._ref,
        status
      }`,
      { conferenceId },
      { cache: 'no-store' },
    ),
  ])

  const travelBySpeaker = new Map<string, string>()
  for (const row of travelRows ?? []) {
    if (row.speakerId && row.status) {
      travelBySpeaker.set(row.speakerId, row.status)
    }
  }

  const bySpeaker = new Map<string, ReminderSpeaker>()
  for (const row of talkRows ?? []) {
    if (!row.status) continue
    const talk: CandidateTalk = {
      _id: row._id,
      title: row.title || 'your talk',
      status: row.status,
      hasSlides: row.hasSlides === true,
    }
    for (const speakerId of row.speakerIds ?? []) {
      if (!speakerId) continue
      let speaker = bySpeaker.get(speakerId)
      if (!speaker) {
        speaker = {
          speakerId,
          talks: [],
          travelSupportStatus: travelBySpeaker.get(speakerId) ?? null,
        }
        bySpeaker.set(speakerId, speaker)
      }
      speaker.talks.push(talk)
    }
  }

  return Array.from(bySpeaker.values())
}

/**
 * Evaluate the fixed reminder registry against the conference's speakers and
 * emit every due, not-already-sent reminder (one hub notification per speaker;
 * push + email ride free through `createNotifications`). Deduped and cadence-
 * gated by the `scheduledReminderLog` marker.
 */
export async function runSpeakerReminders(
  conference: ReminderConference,
  now: Date = new Date(),
): Promise<SpeakerRemindersSummary> {
  const perReminder = new Map<string, ReminderKeyResult>(
    REMINDER_REGISTRY.map((reminder) => [
      reminder.key,
      { key: reminder.key, due: 0, sent: 0, skipped: 0, failed: 0 },
    ]),
  )
  const summary: SpeakerRemindersSummary = {
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    perReminder: Array.from(perReminder.values()),
  }

  try {
    const today = toDateString(now)
    const speakers = await fetchReminderSpeakers(conference._id)
    summary.candidates = speakers.length

    // Collect every (reminder, speaker) that evaluates as due, with its id.
    const due: {
      reminderIndex: number
      key: string
      speakerId: string
      id: string
      copy: { title: string; message: string; link: string }
    }[] = []

    for (let i = 0; i < REMINDER_REGISTRY.length; i++) {
      const reminder = REMINDER_REGISTRY[i]
      for (const speaker of speakers) {
        const copy = reminder.evaluate(speaker, conference, today)
        if (!copy) continue
        perReminder.get(reminder.key)!.due += 1
        due.push({
          reminderIndex: i,
          key: reminder.key,
          speakerId: speaker.speakerId,
          id: reminderLogId(reminder.key, conference._id, speaker.speakerId),
          copy,
        })
      }
    }

    // One batched read of every candidate marker, then apply the cap/spacing
    // gate to decide who actually gets sent this run.
    const existing = await readReminderLogs(due.map((item) => item.id))

    let sends = 0
    for (const item of due) {
      const reminder = REMINDER_REGISTRY[item.reminderIndex]
      const result = perReminder.get(item.key)!
      if (!shouldSendReminder(existing.get(item.id), reminder, now)) {
        result.skipped += 1
        summary.skipped += 1
        continue
      }
      if (sends >= MAX_SENDS_PER_RUN) {
        result.skipped += 1
        summary.skipped += 1
        continue
      }
      try {
        const input: NotificationInput = {
          recipientId: item.speakerId,
          conferenceId: conference._id,
          notificationType: reminder.notificationType,
          title: item.copy.title.slice(0, 200),
          message: item.copy.message,
          link: item.copy.link,
        }
        // Stamp the dedup marker ONLY when the hub write actually persisted.
        // `createNotifications` never throws — a silent failure returns 0 — so
        // stamping unconditionally would mark a failed once-only reminder 'sent'
        // and permanently suppress it. Gate on the persisted count so a failed
        // emit retries next run.
        const persisted = await createNotifications([input])
        if (persisted > 0) {
          await stampReminderLog({
            id: item.id,
            key: reminder.key,
            conferenceId: conference._id,
            speakerId: item.speakerId,
            now,
          })
          sends += 1
          result.sent += 1
          summary.sent += 1
        } else {
          result.failed += 1
          summary.failed += 1
          console.error(
            `Speaker reminder '${reminder.key}' persisted nothing for speaker ${item.speakerId}; not stamping marker`,
          )
        }
      } catch (error) {
        result.failed += 1
        summary.failed += 1
        console.error(
          `Speaker reminder '${reminder.key}' failed for speaker ${item.speakerId}:`,
          error,
        )
      }
    }
  } catch (error) {
    console.error('runSpeakerReminders: run failed:', error)
  }

  summary.perReminder = Array.from(perReminder.values())
  return summary
}

/** One speaker's earliest talk on today's schedule, for the day-of copy. */
interface AgendaEntry {
  speakerId: string
  talkTitle: string
  startTime: string
  trackTitle: string
}

/** Raw schedule projection for today's agenda. */
interface AgendaScheduleRow {
  tracks:
    | {
        trackTitle: string | null
        talks:
          | {
              startTime: string | null
              talkTitle: string | null
              speakerIds: string[] | null
            }[]
          | null
      }[]
    | null
}

/**
 * Build one agenda entry per (speaker) presenting today, keeping each speaker's
 * EARLIEST slot (so a speaker with two talks today gets one notification about
 * the first). Fetches only schedule docs whose `date` is today.
 */
export async function fetchTodaysAgenda(
  conferenceId: string,
  today: string,
): Promise<AgendaEntry[]> {
  const rows = await clientReadUncached.fetch<AgendaScheduleRow[]>(
    `*[_type == "schedule" && conference._ref == $conferenceId && date == $today]{
      tracks[]{
        trackTitle,
        "talks": talks[defined(talk)]{
          startTime,
          "talkTitle": talk->title,
          "speakerIds": talk->speakers[]._ref
        }
      }
    }`,
    { conferenceId, today },
    { cache: 'no-store' },
  )

  const bySpeaker = new Map<string, AgendaEntry>()
  for (const row of rows ?? []) {
    for (const track of row.tracks ?? []) {
      for (const slot of track.talks ?? []) {
        if (!slot.startTime) continue
        for (const speakerId of slot.speakerIds ?? []) {
          if (!speakerId) continue
          const existing = bySpeaker.get(speakerId)
          if (!existing || slot.startTime < existing.startTime) {
            bySpeaker.set(speakerId, {
              speakerId,
              talkTitle: slot.talkTitle || 'your talk',
              startTime: slot.startTime,
              trackTitle: track.trackTitle || 'the schedule',
            })
          }
        }
      }
    }
  }

  return Array.from(bySpeaker.values())
}

/**
 * When today matches a schedule day, send each speaker presenting today ONE
 * "you're presenting today" notification, deduped per (speaker, date) by a
 * deterministic day-of marker.
 */
export async function runDayOfAgenda(
  conference: ReminderConference,
  now: Date = new Date(),
): Promise<DayOfAgendaSummary> {
  const summary: DayOfAgendaSummary = {
    isScheduleDay: false,
    presenting: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  }

  try {
    const today = toDateString(now)
    const agenda = await fetchTodaysAgenda(conference._id, today)
    summary.isScheduleDay = agenda.length > 0
    summary.presenting = agenda.length
    if (agenda.length === 0) return summary

    const withIds = agenda.map((entry) => ({
      entry,
      id: dayOfLogId(conference._id, entry.speakerId, today),
    }))
    const existing = await readReminderLogs(withIds.map((item) => item.id))

    for (const { entry, id } of withIds) {
      if (existing.has(id)) {
        summary.skipped += 1
        continue
      }
      try {
        const input: NotificationInput = {
          recipientId: entry.speakerId,
          conferenceId: conference._id,
          // 'system' → push category `otherUpdates`. A day-of agenda ping is NOT
          // a proposal decision, so it must not be muted by a speaker who turned
          // off `proposalDecisions` (which 'proposal_status_changed' maps to).
          notificationType: 'system',
          title: `You're presenting today at ${conference.title || 'the conference'}!`,
          message: `"${entry.talkTitle}" at ${entry.startTime} on ${entry.trackTitle}. Break a leg!`,
          link: '/program',
        }
        // Stamp the day-of dedup marker ONLY when the hub write persisted (see
        // the runSpeakerReminders rationale): a silent failure returns 0, and
        // stamping anyway would permanently suppress this once-per-day reminder.
        const persisted = await createNotifications([input])
        if (persisted > 0) {
          await createDayOfLog({
            id,
            conferenceId: conference._id,
            speakerId: entry.speakerId,
            now,
          })
          summary.sent += 1
        } else {
          summary.failed += 1
          console.error(
            `Day-of agenda persisted nothing for speaker ${entry.speakerId}; not stamping marker`,
          )
        }
      } catch (error) {
        summary.failed += 1
        console.error(
          `Day-of agenda failed for speaker ${entry.speakerId}:`,
          error,
        )
      }
    }
  } catch (error) {
    console.error('runDayOfAgenda: run failed:', error)
  }

  return summary
}
