import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { createNotifications } from '@/lib/notification/sanity'
import {
  runReminderEngine,
  type ReminderMarker,
  type ReminderTask,
} from './engine'

export const MAX_CONFERENCES_PER_RUN = 50
export const MAX_CANDIDATES_PER_CONFERENCE = 100

export async function resolveReminderConferences(): Promise<string[]> {
  // groq-global: cron discovery lists plan-owning conference IDs across tenants.
  const planConferenceIds = `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].conference._ref`
  return clientReadUncached.fetch<string[]>(
    // groq-global: bounded cron conference discovery; the fixed fragment above lists plan-owning tenants.
    `*[_type == "conference" && _id in ${planConferenceIds}] | order(startDate asc, _id asc)[0...${MAX_CONFERENCES_PER_RUN}]._id`,
    {},
    { cache: 'no-store' },
  )
}

export function reminderCandidateQuery(marker: ReminderMarker): string {
  // groq-global-scoped: passed only through scopedFetch with the conference binding; marker is a closed union.
  return `*[_type == "marketingTask" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && defined(assignee._ref) && !defined(${marker}) && coalesce(status, "") != "skipped" && (
    (kind == "publishing" && variant->conference._ref == conference._ref && variant->status == "awaiting-manual" && dateTime(variant->scheduledAt) <= dateTime($cutoff)) ||
    (kind != "publishing" && status == "open" && dateTime(dueAt) <= dateTime($cutoff) &&
      !(kind == "studioRender" && defined(asset.asset)) &&
      !(kind in ["speakerOutreach", "sponsorOutreach"] && defined(messageId)))
  )] | order(select(kind == "publishing" => variant->scheduledAt, dueAt) asc, _id asc)[0...${MAX_CANDIDATES_PER_CONFERENCE}]{
    _id, _rev, "conferenceId": conference._ref, title, kind, "assigneeId": assignee._ref,
    status, dueAt, "hasAsset": defined(asset.asset), messageId, remindedAt, overdueNudgedAt,
    "variant": select(variant->conference._ref == conference._ref => variant->{status, scheduledAt})
  }`
}

export async function getReminderCandidates(
  conferenceId: string,
  now: string,
  marker: ReminderMarker,
) {
  const cutoff = new Date(
    Date.parse(now) - (marker === 'overdueNudgedAt' ? 86_400_000 : 0),
  ).toISOString()
  return scopedFetch<ReminderTask[]>(
    clientReadUncached,
    { conferenceId },
    reminderCandidateQuery(marker),
    { cutoff },
    { cache: 'no-store' },
  )
}

export async function claimReminder(
  task: ReminderTask,
  marker: ReminderMarker,
  now: string,
): Promise<boolean> {
  try {
    await clientWrite
      .patch(task._id)
      .ifRevisionId(task._rev)
      .set({ [marker]: now })
      .commit()
    return true
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 409) return false
    throw error
  }
}

export function runMarketingReminders(conferenceId: string, now: string) {
  return runReminderEngine(conferenceId, now, {
    candidates: getReminderCandidates,
    claim: claimReminder,
    notify: createNotifications,
  })
}
