import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { mergeConferences } from '@/lib/conference/merge'
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
  type RawPlanRow = {
    planId: string
    conferenceId: string | null
    lastRemindedAt: string
    startDate?: string | null
    conference?: {
      _id: string
      startDate?: string | null
      domains?: readonly string[] | null
      organization?: { _ref: string } | null
    } | null
  }
  const rows = await clientReadUncached.fetch<RawPlanRow[]>(
    // groq-global: bounded cron discovery serves plan-owning tenants waiting longest first.
    `*[${plans}]{
      "planId": _id,
      "conferenceId": conference._ref,
      "lastRemindedAt": coalesce(lastRemindedAt, ""),
      "startDate": conference->startDate,
      "conference": conference->{ _id, startDate, domains, organization }
    }`,
    {},
    { cache: 'no-store' },
  )
  const validRows = (rows ?? []).filter(
    (r): r is RawPlanRow & { conferenceId: string } => !!r.conferenceId,
  )
  if (validRows.length === 0) return []

  const confCache = new Map<
    string,
    {
      _id: string
      startDate?: string | null
      domains?: readonly string[] | null
      organization?: { _ref: string } | null
    }
  >()
  for (const r of validRows) {
    if (r.conference && !confCache.has(r.conference._id)) {
      confCache.set(r.conference._id, r.conference)
    }
  }
  const mergedConfs = await mergeConferences(Array.from(confCache.values()))
  const confMap = new Map(mergedConfs.map((c) => [c._id, c]))

  const enriched = validRows.map((r) => {
    const conf = r.conference ? confMap.get(r.conference._id) : undefined
    return {
      planId: r.planId,
      conferenceId: r.conferenceId,
      lastRemindedAt: r.lastRemindedAt,
      startDate: conf?.startDate ?? r.startDate ?? '',
    }
  })

  const waiting = [...enriched]
    .sort((a, b) => {
      const remComp = a.lastRemindedAt.localeCompare(b.lastRemindedAt)
      if (remComp !== 0) return remComp
      const dateComp = a.startDate.localeCompare(b.startDate)
      if (dateComp !== 0) return dateComp
      return a.planId.localeCompare(b.planId)
    })
    .slice(0, MAX_CONFERENCES_PER_RUN)

  if (enriched.length <= MAX_CONFERENCES_PER_RUN) {
    return waiting.map(({ planId, conferenceId }) => ({ planId, conferenceId }))
  }

  const count = enriched.length
  const pageSize = MAX_CONFERENCES_PER_RUN / 2
  const day = Math.floor(Date.parse(now) / 86_400_000)
  const start = (day % Math.ceil(count / pageSize)) * pageSize

  const rotating = [...enriched]
    .sort((a, b) => a.planId.localeCompare(b.planId))
    .slice(start, start + pageSize)

  const reserved = new Set(rotating.map(({ planId }) => planId))
  return [...rotating, ...waiting.filter(({ planId }) => !reserved.has(planId))]
    .slice(0, MAX_CONFERENCES_PER_RUN)
    .map(({ planId, conferenceId }) => ({ planId, conferenceId }))
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
