import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { createNotifications } from '@/lib/notification/sanity'
import { getCurrentDateTime } from '@/lib/time'
import {
  runReminderEngine,
  type ReminderMarker,
  type ReminderTask,
} from './engine'

export const MAX_CONFERENCES_PER_RUN = 50
export const MAX_CANDIDATES_PER_CONFERENCE = 100

export interface ReminderConference {
  planId: string
  conferenceId: string
}

export async function resolveReminderConferences(
  now = getCurrentDateTime(),
): Promise<ReminderConference[]> {
  const plans =
    '_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && conference->_type == "conference"'
  const projection = '{"planId": _id, "conferenceId": conference._ref}'
  const waiting = await clientReadUncached.fetch<ReminderConference[]>(
    // groq-global: bounded cron discovery serves plan-owning tenants waiting longest first.
    `*[${plans}] | order(coalesce(lastRemindedAt, "") asc, conference->startDate asc, _id asc)[0...${MAX_CONFERENCES_PER_RUN}]${projection}`,
    {},
    { cache: 'no-store' },
  )
  if (waiting.length < MAX_CONFERENCES_PER_RUN) return waiting

  const count = await clientReadUncached.fetch<number>(
    // groq-global: only a count is read to locate a bounded, stamp-independent page.
    `count(*[${plans}])`,
    {},
    { cache: 'no-store' },
  )
  if (count <= MAX_CONFERENCES_PER_RUN) return waiting
  const pageSize = MAX_CONFERENCES_PER_RUN / 2
  const day = Math.floor(Date.parse(now) / 86_400_000)
  const start = (day % Math.ceil(count / pageSize)) * pageSize
  // Reserve half the budget for a UTC-day page. With a stable inventory this
  // visits every plan within ceil(count / 25) daily runs, even if stamps fail.
  const rotating = await clientReadUncached.fetch<ReminderConference[]>(
    // groq-global: stable id pagination provides bounded fairness independent of writes.
    `*[${plans}] | order(_id asc)[${start}...${start + pageSize}]${projection}`,
    {},
    { cache: 'no-store' },
  )
  const reserved = new Set(rotating.map(({ planId }) => planId))
  return [
    ...rotating,
    ...waiting.filter(({ planId }) => !reserved.has(planId)),
  ].slice(0, MAX_CONFERENCES_PER_RUN)
}

export function reminderCandidateQuery(marker: ReminderMarker): string {
  const publishingStatus =
    marker === 'remindedAt'
      ? 'variant->status == "awaiting-manual"'
      : '!(variant->status == "published" && coalesce(variant->publishResult.url, "") != "")'
  // groq-global-scoped: passed only through scopedFetch with the conference binding; marker is a closed union.
  return `*[_type == "marketingTask" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && defined(assignee._ref) && !defined(${marker}) && coalesce(status, "") != "skipped" && (
    (kind == "publishing" && variant->conference._ref == conference._ref && ${publishingStatus} && dateTime(variant->scheduledAt) <= dateTime($cutoff)) ||
    (kind != "publishing" && status == "open" && dateTime(dueAt) <= dateTime($cutoff) &&
      !(kind == "studioRender" && defined(asset.asset)) &&
      !(kind in ["speakerOutreach", "sponsorOutreach"] && defined(messageId)))
  )] | order(select(kind == "publishing" => variant->scheduledAt, dueAt) asc, _id asc)[0...${MAX_CANDIDATES_PER_CONFERENCE}]{
    _id, _rev, "conferenceId": conference._ref, title, kind, "assigneeId": assignee._ref,
    status, dueAt, "hasAsset": defined(asset.asset), messageId, remindedAt, overdueNudgedAt,
    "variant": select(variant->conference._ref == conference._ref => variant->{status, scheduledAt, "url": publishResult.url})
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

export async function runMarketingReminders(
  conferenceId: string,
  now: string,
  planId?: string,
): Promise<{ due: number; overdue: number; rotationError?: string }> {
  let rotationError: string | undefined
  if (planId) {
    // Stamp before work so a failing conference still moves behind those waiting.
    // Use the discovered document id, including plans restored in Studio.
    try {
      await clientWrite.patch(planId).set({ lastRemindedAt: now }).commit()
    } catch (error) {
      console.error(`Could not stamp ${planId} as reminded`, error)
      rotationError =
        error instanceof Error && error.message
          ? error.message
          : 'Rotation stamp failed'
    }
  }
  const counts = await runReminderEngine(conferenceId, now, {
    candidates: getReminderCandidates,
    claim: claimReminder,
    notify: createNotifications,
  })
  return rotationError ? { ...counts, rotationError } : counts
}
