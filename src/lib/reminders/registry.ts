import { daysUntil } from './dates'
import type { Reminder, ReminderSpeaker } from './types'

/**
 * THE FIXED DEFAULT REMINDER SCHEDULE.
 *
 * This registry is the single, hardcoded source of truth for speaker-prep
 * reminders (Phase 1: no config UI — tune the defaults here in code). Each entry
 * decides, purely from a speaker's talks + the conference date anchors + today's
 * date, whether it is due — cadence/dedup is enforced separately by the runner
 * via the `scheduledReminderLog` marker (see `marker.ts`).
 *
 * Timing windows are DAY-OF granularity (no minute-level), matching the cron's
 * once-a-day cadence.
 */

/** The confirm-talk nudge re-fires at most this many times... */
const CONFIRM_MAX_SENDS = 2
/** ...spaced at least this many days apart. Mirrors the contract-reminders cron. */
const CONFIRM_SPACING_DAYS = 7

/** The upload-slides window opens this many days before the conference starts. */
const SLIDES_WINDOW_DAYS = 7
const SLIDES_MAX_SENDS = 2
const SLIDES_SPACING_DAYS = 3

const TRAVEL_MAX_SENDS = 2
const TRAVEL_SPACING_DAYS = 7
/** Travel payment reminder arms when the payout date is within this many days. */
const TRAVEL_PAYMENT_WINDOW_DAYS = 7

/** The logistics note fires within this many days of the start (T-2d). */
const LOGISTICS_WINDOW_DAYS = 2

/** The conference display name used in warm copy. */
function confName(title?: string): string {
  return title || 'the conference'
}

/** True while `today` is on or before the conference's last day. */
function conferenceNotEnded(today: string, endDate: string): boolean {
  const days = daysUntil(today, endDate)
  return !Number.isNaN(days) && days >= 0
}

/** The speaker's first talk in a given status, if any. */
function talkInStatus(speaker: ReminderSpeaker, status: string) {
  return speaker.talks.find((talk) => talk.status === status)
}

/**
 * (a) confirm-talk — an accepted (but not yet confirmed) talk needs the speaker
 * to confirm participation. Due from acceptance onward; re-nudged up to
 * {@link CONFIRM_MAX_SENDS} times, {@link CONFIRM_SPACING_DAYS} days apart.
 *
 * PUSH CATEGORY: kept on `proposal_status_changed` (→ `proposalDecisions`)
 * deliberately — confirming an ACCEPTED talk is decision-adjacent, so it belongs
 * with a speaker's proposal-decision pushes. The non-decision prep reminders
 * (upload-slides, logistics, day-of) instead use `system` (→ `otherUpdates`) so
 * a speaker who mutes proposal decisions still receives them.
 */
const confirmTalk: Reminder = {
  key: 'confirm-talk',
  notificationType: 'proposal_status_changed',
  maxSends: CONFIRM_MAX_SENDS,
  spacingDays: CONFIRM_SPACING_DAYS,
  evaluate(speaker, conference, today) {
    if (!conferenceNotEnded(today, conference.endDate)) return null
    const talk = talkInStatus(speaker, 'accepted')
    if (!talk) return null
    return {
      title: `Please confirm your talk at ${confName(conference.title)}`,
      message: `Great news — your talk "${talk.title}" was accepted! Please confirm your participation so we can lock it into the program. It only takes a moment.`,
      link: `/cfp/proposal/${talk._id}`,
    }
  },
}

/**
 * (b) upload-slides — a confirmed talk with no slides attachment, from T-7d.
 * Re-nudged up to {@link SLIDES_MAX_SENDS} times inside the window.
 */
const uploadSlides: Reminder = {
  key: 'upload-slides',
  // `system` → push category `otherUpdates`: a slides-upload nudge is not a
  // proposal decision and must not be muted with `proposalDecisions`.
  notificationType: 'system',
  maxSends: SLIDES_MAX_SENDS,
  spacingDays: SLIDES_SPACING_DAYS,
  evaluate(speaker, conference, today) {
    if (!conferenceNotEnded(today, conference.endDate)) return null
    const daysToStart = daysUntil(today, conference.startDate)
    if (Number.isNaN(daysToStart) || daysToStart > SLIDES_WINDOW_DAYS) {
      return null
    }
    const talk = speaker.talks.find(
      (candidate) => candidate.status === 'confirmed' && !candidate.hasSlides,
    )
    if (!talk) return null
    return {
      title: `Time to upload your slides for ${confName(conference.title)}`,
      message: `Your talk "${talk.title}" is coming up soon. Please upload your slides through your proposal page so our AV team can have everything ready for you.`,
      link: `/cfp/proposal/${talk._id}`,
    }
  },
}

/**
 * (c) travel-reminder — the organizer-sensible trigger, in priority order:
 *   1. a travel-support request left in `draft` (the speaker still has to submit
 *      it — the clearest speaker-actionable state); or
 *   2. an already-submitted/approved (not yet `paid`) request when the
 *      conference's `travelSupportPaymentDate` is within
 *      {@link TRAVEL_PAYMENT_WINDOW_DAYS} days (nudge to verify banking details
 *      before payout).
 * Re-nudged up to {@link TRAVEL_MAX_SENDS} times, {@link TRAVEL_SPACING_DAYS}
 * apart.
 */
const travelReminder: Reminder = {
  key: 'travel-reminder',
  notificationType: 'travel_support_update',
  maxSends: TRAVEL_MAX_SENDS,
  spacingDays: TRAVEL_SPACING_DAYS,
  // NOTE: no conference-ended guard here — travel support has a lifecycle that
  // extends toward the payout, and the cron already only runs for the ACTIVE
  // (not-yet-ended) conference. The payment-date branch therefore only fires
  // while the conference is still active; a payout scheduled AFTER the event is
  // out of Phase-1 scope (post-conference reminders would need the conference to
  // remain "active", which it does not). The primary, always-actionable trigger
  // is the `draft` state (the speaker still has to submit).
  evaluate(speaker, conference, today) {
    const status = speaker.travelSupportStatus
    if (!status) return null

    if (status === 'draft') {
      return {
        title: `Finish your travel support request`,
        message: `You started a travel support request for ${confName(conference.title)} but haven't submitted it yet. Complete it so we can review and arrange your reimbursement.`,
        link: '/cfp/expense',
      }
    }

    if (
      conference.travelSupportPaymentDate &&
      (status === 'submitted' || status === 'approved')
    ) {
      const daysToPay = daysUntil(today, conference.travelSupportPaymentDate)
      if (
        !Number.isNaN(daysToPay) &&
        daysToPay >= 0 &&
        daysToPay <= TRAVEL_PAYMENT_WINDOW_DAYS
      ) {
        return {
          title: `Travel support payment coming up`,
          message: `We're preparing travel support payments for ${confName(conference.title)} soon. Please double-check your banking details are complete and correct so we can pay you on time.`,
          link: '/cfp/expense',
        }
      }
    }

    return null
  },
}

/**
 * (d) logistics — a warm venue/arrival/AV one-liner to every confirmed speaker
 * at T-2d. Single-shot (once per conference).
 */
const logistics: Reminder = {
  key: 'logistics',
  // `system` → push category `otherUpdates`: a venue/arrival/AV note is not a
  // proposal decision and must not be muted with `proposalDecisions`.
  notificationType: 'system',
  maxSends: 1,
  spacingDays: 0,
  evaluate(speaker, conference, today) {
    const daysToStart = daysUntil(today, conference.startDate)
    if (
      Number.isNaN(daysToStart) ||
      daysToStart < 0 ||
      daysToStart > LOGISTICS_WINDOW_DAYS
    ) {
      return null
    }
    const talk = talkInStatus(speaker, 'confirmed')
    if (!talk) return null
    return {
      title: `See you soon at ${confName(conference.title)}!`,
      message: `${confName(conference.title)} is almost here. Check the venue and plan your arrival, and when you get there drop by the speaker room so we can set up your AV. The full schedule is on the program page.`,
      link: '/program',
    }
  },
}

/** The fixed default schedule, evaluated in order. */
export const REMINDER_REGISTRY: Reminder[] = [
  confirmTalk,
  uploadSlides,
  travelReminder,
  logistics,
]
