import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  osloDateCutoff,
  REMINDER_LOG_RETENTION_DAYS,
} from '@/lib/retention/cutoffs'

/**
 * Deletes `scheduledReminderLog` dedup markers for conferences that ended more
 * than {@link REMINDER_LOG_RETENTION_DAYS} days ago (Oslo date).
 *
 * SAFE TO DELETE: the markers only dedupe sends for live editions. The reminder
 * cron runs for conferences with `endDate >= today` only
 * (`resolveActiveReminderConferences`), and the speaker-briefing markers are
 * read by organizer-triggered sends, not by any cron. Nothing can re-fire for an
 * edition this old, so dropping its markers cannot cause a repeat send.
 *
 * Bounded: at most {@link MAX_DELETES_PER_RUN} markers per run, one transaction
 * per conference. A failing conference is logged and skipped.
 */
const MAX_DELETES_PER_RUN = 200

export async function deleteExpiredReminderLogs(
  dryRun = false,
): Promise<{ deleted: number }> {
  const cutoff = osloDateCutoff(REMINDER_LOG_RETENTION_DAYS)
  const conferences =
    (await clientReadUncached.fetch<{ _id: string }[]>(
      // groq-global: platform RETENTION CRON — enumerates every tenant's
      // conferences past the reminder-log horizon by design; each deletion
      // below is scoped to that one conference.
      `*[_type == "conference" && defined(endDate) && endDate < $cutoff]{ _id }`,
      { cutoff },
      { cache: 'no-store' },
    )) ?? []

  let deleted = 0
  for (const { _id: conferenceId } of conferences) {
    const budget = MAX_DELETES_PER_RUN - deleted
    if (budget <= 0) break
    try {
      // Drafts are included on purpose: the filter does not exclude them, so a
      // stray draft marker goes with its published one.
      const ids =
        (await scopedFetch<string[]>(
          clientReadUncached,
          { conferenceId },
          `*[_type == "scheduledReminderLog"][0...${budget}]._id`,
          {},
          { cache: 'no-store' },
        )) ?? []
      if (ids.length === 0) continue
      if (!dryRun) {
        const tx = clientWrite.transaction()
        for (const id of ids) tx.delete(id)
        await tx.commit()
      }
      deleted += ids.length
    } catch (error) {
      console.error(
        `Reminder log retention: failed for conference ${conferenceId}:`,
        error,
      )
    }
  }
  return { deleted }
}
