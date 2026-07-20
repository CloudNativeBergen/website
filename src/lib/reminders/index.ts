/**
 * Scheduled speaker reminders (Phase 1): speaker-prep reminders, a day-of
 * agenda, and event-driven schedule-change alerts. Server-only; every job is
 * never-throw and cadence-deduped via `scheduledReminderLog` markers.
 *
 * The fixed default reminder schedule lives in `registry.ts` — the one place to
 * tune timing/cadence/copy (no config UI in Phase 1).
 */
export { resolveActiveReminderConference } from './conference'
export { runSpeakerReminders, runDayOfAgenda } from './runner'
export { notifyScheduleChanges } from './schedule-alerts'
export type { SlotPlacement } from './types'
