import 'server-only'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { mergeConferences } from '@/lib/conference/merge'
import {
  MARKETING_SNAPSHOT_RETENTION_MONTHS,
  osloDateCutoff,
  osloMonthsCutoff,
  REMINDER_LOG_RETENTION_DAYS,
} from './cutoffs'

// groq-global-scoped: parent-keyed — `conference._ref == ^._id` bounds the
// count to the ENCLOSING conference.
const HAS_DOCS = `count(*[_type == $type && conference._ref == ^._id]) > 0`

/** Most documents one purge deletes per run; the next daily run continues. */
const MAX_DELETES_PER_RUN = 200

/**
 * Deletes documents of `type` whose conference ended before `cutoff` (an Oslo
 * YYYY-MM-DD). At most {@link MAX_DELETES_PER_RUN} per run, one transaction
 * per conference; a failing conference is logged and skipped. Drafts match
 * the same filter, so they go with their published documents.
 */
async function deleteForEndedConferences(
  type: 'scheduledReminderLog' | 'marketingSnapshot',
  cutoff: string,
  dryRun: boolean,
): Promise<{ deleted: number }> {
  type ConfRow = {
    _id: string
    endDate?: string | null
    domains?: string[] | null
    organization?: { _ref: string } | null
  }
  const rawConferences =
    (await clientReadUncached.fetch<ConfRow[]>(
      // groq-global: platform RETENTION CRON — enumerates every tenant's
      // conferences that still hold `type` documents; candidate conferences
      // are filtered in code with merged D1 dates.
      `*[_type == "conference" && defined(endDate) && ${HAS_DOCS}]{ _id, endDate, domains, organization }`,
      { type },
      { cache: 'no-store' },
    )) ?? []

  const merged = await mergeConferences(rawConferences)
  const conferences = merged.filter((c) =>
    Boolean(c.endDate && c.endDate < cutoff),
  )

  let deleted = 0
  for (const { _id: conferenceId } of conferences) {
    const budget = MAX_DELETES_PER_RUN - deleted
    if (budget <= 0) break
    try {
      const ids =
        (await scopedFetch<string[]>(
          clientReadUncached,
          { conferenceId },
          `*[_type == $type][0...${budget}]._id`,
          { type },
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
      console.error(`Retention (${type}): failed for ${conferenceId}:`, error)
    }
  }
  return { deleted }
}

/**
 * Reminder dedup markers, {@link REMINDER_LOG_RETENTION_DAYS} days after the
 * conference ends.
 *
 * SAFE TO DELETE: the reminder cron runs only for conferences with
 * `endDate >= today` (`resolveActiveReminderConferences`), and the
 * speaker-briefing markers are read only by organizer-triggered sends. Nothing
 * re-fires for an edition this old.
 */
export const deleteExpiredReminderLogs = (dryRun = false) =>
  deleteForEndedConferences(
    'scheduledReminderLog',
    osloDateCutoff(REMINDER_LOG_RETENTION_DAYS),
    dryRun,
  )

/**
 * Marketing snapshots, {@link MARKETING_SNAPSHOT_RETENTION_MONTHS} months after
 * the conference ends. That keeps the previous edition's readings for the
 * report's year-over-year comparison.
 */
export const deleteExpiredMarketingSnapshots = (dryRun = false) =>
  deleteForEndedConferences(
    'marketingSnapshot',
    osloMonthsCutoff(MARKETING_SNAPSHOT_RETENTION_MONTHS),
    dryRun,
  )
