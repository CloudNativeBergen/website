import type { NotificationType } from '@/lib/notification/types'

/**
 * The active conference a reminder run targets, projected down to the date
 * anchors the registry needs. See `resolveActiveReminderConference`.
 */
export interface ReminderConference {
  _id: string
  title?: string
  /** Conference start (YYYY-MM-DD). */
  startDate: string
  /** Conference end (YYYY-MM-DD). */
  endDate: string
  /** When the program is published (YYYY-MM-DD), if set. */
  programDate?: string
  /** When travel-support payouts are made (YYYY-MM-DD), if set. */
  travelSupportPaymentDate?: string
}

/** A talk this speaker is presenting, projected for reminder evaluation. */
export interface CandidateTalk {
  _id: string
  title: string
  /** Proposal workflow status (e.g. 'accepted', 'confirmed'). */
  status: string
  /** True when the talk already has an attachment of type 'slides'. */
  hasSlides: boolean
}

/** One speaker (with their accepted/confirmed talks) evaluated by the registry. */
export interface ReminderSpeaker {
  speakerId: string
  talks: CandidateTalk[]
  /** This speaker's travel-support status for the conference, if any. */
  travelSupportStatus?: string | null
}

/** The rendered copy a due reminder produces for one speaker. */
export interface ReminderCopy {
  title: string
  message: string
  /** App-relative deep link to the relevant resource. */
  link: string
}

/**
 * A single fixed reminder in the registry. This is the ONE place to tune the
 * default schedule: change the predicate, timing window, cadence, or copy here.
 */
export interface Reminder {
  /** Stable key — part of the dedup marker id. Never rename in place. */
  key: string
  notificationType: NotificationType
  /**
   * Maximum times this reminder may fire per speaker per conference.
   * 1 = single-shot (once per conference); >1 = re-arming up to the cap.
   */
  maxSends: number
  /**
   * Minimum whole days between successive sends of a re-arming reminder. 0 for
   * single-shot reminders (they never re-send anyway once the cap of 1 is hit).
   */
  spacingDays: number
  /**
   * Returns the copy when this reminder is due for `speaker` on `today`, or
   * `null` when it does not apply. Pure — no clock/network access; `today` and
   * the conference dates are passed in (all YYYY-MM-DD).
   */
  evaluate(
    speaker: ReminderSpeaker,
    conference: ReminderConference,
    today: string,
  ): ReminderCopy | null
}

/** The dedup marker document as read back for a send decision. */
export interface ReminderLog {
  _id: string
  count?: number | null
  lastSentAt?: string | null
}

/** Aggregate per-reminder outcome for structured cron logging. */
export interface ReminderKeyResult {
  key: string
  /** Speakers for whom the reminder evaluated as due this run. */
  due: number
  /** Of those, how many were actually sent (passed the dedup/spacing gate). */
  sent: number
  /** Skipped by the cap/spacing gate. */
  skipped: number
  /** Failed and isolated (logged). */
  failed: number
}

/** Summary returned by `runSpeakerReminders`. */
export interface SpeakerRemindersSummary {
  candidates: number
  sent: number
  skipped: number
  failed: number
  perReminder: ReminderKeyResult[]
}

/** Summary returned by `runDayOfAgenda`. */
export interface DayOfAgendaSummary {
  /** Whether today matched a schedule day for the conference. */
  isScheduleDay: boolean
  /** Distinct speakers presenting today. */
  presenting: number
  sent: number
  skipped: number
  failed: number
}

/** A talk's placement in the schedule, used by the schedule-change diff. */
export interface SlotPlacement {
  talkId: string
  /** Schedule day (YYYY-MM-DD). */
  date: string
  /** Slot start time (HH:mm). */
  startTime: string
  /** Track the slot sits in. */
  trackTitle: string
}

/** A talk whose placement changed between two saves of a schedule day. */
export interface MovedTalk {
  talkId: string
  from: Omit<SlotPlacement, 'talkId'>
  to: Omit<SlotPlacement, 'talkId'>
}
