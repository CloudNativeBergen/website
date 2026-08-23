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
  stampReminderLogs,
  createDayOfLogs,
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
 * run in a never-throw envelope and isolate every emit, so the cron (whose steps
 * must all complete) can never be failed by one bad speaker, a read error, or a
 * notification failure. `createNotifications` already never throws; the marker
 * write can, so it is inside `emitReminderChunk`'s try/catch.
 *
 * WRITES ARE BATCHED (Sanity request budget). Both paths used to issue TWO
 * round-trips per due speaker — one `createNotifications([one])` and one marker
 * write — inside the per-speaker loop. They now emit in chunks of
 * {@link SEND_CHUNK_SIZE}: one hub write and one marker transaction per chunk,
 * with a per-item fallback on failure so the old failure ISOLATION survives.
 */

/**
 * Hard cap on sends per run, so a backlog can never fan out unbounded.
 *
 * It now bounds sends ATTEMPTED rather than sends that succeeded. The cap has to
 * be applied when the batch is assembled, before any write happens, and bounding
 * attempts is the stricter of the two readings — a run that fails cannot spend
 * the remaining budget retrying inside the same invocation. Failed items keep
 * their marker unstamped and are retried by the next daily run.
 */
const MAX_SENDS_PER_RUN = 500

/**
 * How many due reminders share one pair of round-trips (one `createNotifications`
 * + one marker transaction).
 *
 * This is the Sanity request budget knob. The runner used to issue TWO writes per
 * due speaker; at a 500-send cap that is 1000 requests per conference per daily
 * run. At 50 it is 20. It is not larger because a Sanity transaction is atomic:
 * the chunk size is also the blast radius of a single rejected mutation (see
 * `emitReminderChunk`, which falls back to per-item writes when a chunk fails, so
 * the failure ISOLATION of the old shape is preserved at the cost of one extra
 * round-trip on the failure path only).
 */
const SEND_CHUNK_SIZE = 50

/**
 * Emit one chunk of due reminders: ONE hub write for the whole chunk, then ONE
 * marker transaction. Returns the entries that were sent AND stamped, and the
 * entries that were not.
 *
 * NEVER THROWS. `createNotifications` already swallows its own failures and
 * reports them by resolving 0 (nothing committed — the transaction is atomic);
 * the marker write can throw and is caught here.
 *
 * ORDERING IS THE DEDUP INVARIANT: the marker is stamped only AFTER the hub write
 * has persisted. A failure between the two re-sends next run (unchanged from the
 * per-item shape) — never the reverse, which would permanently suppress a
 * reminder that was never delivered.
 *
 * FAILURE ISOLATION: a chunk failure retries the chunk ITEM BY ITEM — the exact
 * old shape — so one poison item (an over-long title, a rejected reference) fails
 * alone instead of taking its 49 neighbours down with it every single run.
 */
async function emitReminderChunk<T>(
  entries: T[],
  toInput: (entry: T) => NotificationInput,
  stamp: (entries: T[]) => Promise<void>,
  label: (entry: T) => string,
): Promise<{ sent: T[]; failed: T[] }> {
  const sent: T[] = []
  const failed: T[] = []
  if (entries.length === 0) return { sent, failed }

  let persisted = 0
  try {
    persisted = await createNotifications(entries.map(toInput))
  } catch (error) {
    // Defensive: the contract says it never throws, but a broken import or an
    // unexpected error must not escape into the cron.
    console.error('Reminder batch emit threw:', error)
    persisted = 0
  }

  if (persisted <= 0) {
    if (entries.length > 1) {
      for (const entry of entries) {
        const one = await emitReminderChunk([entry], toInput, stamp, label)
        sent.push(...one.sent)
        failed.push(...one.failed)
      }
      return { sent, failed }
    }
    console.error(
      `Reminder emit persisted nothing for ${label(entries[0])}; not stamping marker`,
    )
    failed.push(entries[0])
    return { sent, failed }
  }

  try {
    await stamp(entries)
    sent.push(...entries)
  } catch (error) {
    if (entries.length > 1) {
      // The hub write already landed for the whole chunk, so a re-emit is NOT an
      // option here — stamp one at a time instead, so a single rejected marker
      // cannot leave 49 delivered reminders unstamped (and re-sent tomorrow).
      for (const entry of entries) {
        try {
          await stamp([entry])
          sent.push(entry)
        } catch (singleError) {
          console.error(
            `Reminder marker stamp failed for ${label(entry)}:`,
            singleError,
          )
          failed.push(entry)
        }
      }
    } else {
      console.error(
        `Reminder marker stamp failed for ${label(entries[0])}:`,
        error,
      )
      failed.push(entries[0])
    }
  }

  return { sent, failed }
}

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

    // Select this run's sends — the cadence gate plus the hard cap — BEFORE any
    // write, so the emit below can batch them.
    const toSend: {
      id: string
      key: string
      speakerId: string
      input: NotificationInput
    }[] = []
    for (const item of due) {
      const reminder = REMINDER_REGISTRY[item.reminderIndex]
      const result = perReminder.get(item.key)!
      if (!shouldSendReminder(existing.get(item.id), reminder, now)) {
        result.skipped += 1
        summary.skipped += 1
        continue
      }
      if (toSend.length >= MAX_SENDS_PER_RUN) {
        result.skipped += 1
        summary.skipped += 1
        continue
      }
      toSend.push({
        id: item.id,
        key: reminder.key,
        speakerId: item.speakerId,
        input: {
          recipientId: item.speakerId,
          conferenceId: conference._id,
          notificationType: reminder.notificationType,
          title: item.copy.title.slice(0, 200),
          message: item.copy.message,
          link: item.copy.link,
        },
      })
    }

    // Emit in chunks: one hub write and one marker transaction per chunk instead
    // of two round-trips per due speaker. The marker is still stamped ONLY when
    // the hub write actually persisted — `createNotifications` never throws, and
    // a silent failure resolves 0, so stamping unconditionally would mark a
    // once-only reminder 'sent' and permanently suppress it.
    for (let i = 0; i < toSend.length; i += SEND_CHUNK_SIZE) {
      const chunk = toSend.slice(i, i + SEND_CHUNK_SIZE)
      const { sent, failed } = await emitReminderChunk(
        chunk,
        (entry) => entry.input,
        (entries) =>
          stampReminderLogs(
            entries.map((entry) => ({
              id: entry.id,
              key: entry.key,
              conferenceId: conference._id,
              speakerId: entry.speakerId,
            })),
            now,
          ),
        (entry) =>
          `speaker reminder '${entry.key}' for speaker ${entry.speakerId}`,
      )
      for (const entry of sent) {
        perReminder.get(entry.key)!.sent += 1
        summary.sent += 1
      }
      for (const entry of failed) {
        perReminder.get(entry.key)!.failed += 1
        summary.failed += 1
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
 *
 * OFFICIAL ONLY: a conference keeps several `schedule` documents per day — the
 * private `draft`s organizers are still editing plus an `archived` snapshot of
 * every previously-published version. Reading them all would mail a speaker the
 * time from an unpublished or superseded day; worse, keeping the EARLIEST slot
 * across documents means one stale draft wins over the real program. Legacy days
 * carry no `status` at all, so a missing one counts as official (the same
 * fallback `getScheduleData` applies in `src/lib/schedule/server.ts`) —
 * otherwise every pre-existing conference would stop sending day-of mail.
 */
export async function fetchTodaysAgenda(
  conferenceId: string,
  today: string,
): Promise<AgendaEntry[]> {
  const rows = await clientReadUncached.fetch<AgendaScheduleRow[]>(
    `*[_type == "schedule" && conference._ref == $conferenceId && date == $today && (status == "official" || !defined(status))]{
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

    const toSend: {
      id: string
      speakerId: string
      input: NotificationInput
    }[] = []
    for (const { entry, id } of withIds) {
      if (existing.has(id)) {
        summary.skipped += 1
        continue
      }
      toSend.push({
        id,
        speakerId: entry.speakerId,
        input: {
          recipientId: entry.speakerId,
          conferenceId: conference._id,
          // 'system' → push category `otherUpdates`. A day-of agenda ping is NOT
          // a proposal decision, so it must not be muted by a speaker who turned
          // off `proposalDecisions` (which 'proposal_status_changed' maps to).
          notificationType: 'system',
          title: `You're presenting today at ${conference.title || 'the conference'}!`,
          message: `"${entry.talkTitle}" at ${entry.startTime} on ${entry.trackTitle}. Break a leg!`,
          link: '/program',
        },
      })
    }

    // Same batched shape as `runSpeakerReminders`: one hub write and one marker
    // transaction per chunk. The day-of marker is still stamped ONLY when the hub
    // write persisted — a silent failure resolves 0, and stamping anyway would
    // permanently suppress this once-per-day reminder.
    for (let i = 0; i < toSend.length; i += SEND_CHUNK_SIZE) {
      const chunk = toSend.slice(i, i + SEND_CHUNK_SIZE)
      const { sent, failed } = await emitReminderChunk(
        chunk,
        (entry) => entry.input,
        (entries) =>
          createDayOfLogs(
            entries.map((entry) => ({
              id: entry.id,
              conferenceId: conference._id,
              speakerId: entry.speakerId,
            })),
            now,
          ),
        (entry) => `day-of agenda for speaker ${entry.speakerId}`,
      )
      summary.sent += sent.length
      summary.failed += failed.length
    }
  } catch (error) {
    console.error('runDayOfAgenda: run failed:', error)
  }

  return summary
}
