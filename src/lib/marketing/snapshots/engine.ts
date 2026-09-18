/**
 * THE SNAPSHOT RUN (spec §6.4). For ONE conference: read the plan, take one
 * day-grain attribution reading for its whole range, sweep the published
 * Bluesky posts in batches, then write one `marketingSnapshot` per Campaign
 * for YESTERDAY. The daily cron and the on-demand refresh both call this — the
 * views read Snapshots only, never the vendors.
 *
 * THE DAY CONVENTION, once, for the whole module: the CONFERENCE timezone,
 * everywhere. A Snapshot's `date` is the last completed conference day, the
 * query groups its rows in that zone, and every window ceiling is the start of
 * the conference day in progress. Campaign windows are conference days, so
 * anything else — a UTC label, a UTC grouping — puts an hour of every edge day
 * in the wrong Campaign or dates a reading to a day it holds no data for.
 *
 * NULL IS NOT ZERO. A vendor that failed marks its `source` unavailable and
 * every number it feeds is stored `null`. That includes a TRUNCATED analytics
 * result: truncation drops the smallest groups, so a quiet Campaign would come
 * back as a confident zero it never earned.
 */

import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { osloLocalInputToIso, osloTodayDateString } from '@/lib/time'
import { parseBlueskyExternalId } from '@/lib/social/provider/bluesky'
import type { PostEngagement } from '@/lib/social/provider'
import type { CampaignBreakdownRow } from '../analytics'
import { addDaysToDate } from '../materialize'
import {
  computeCampaignOutcome,
  conferenceDay,
  type OutcomeProposal,
  type OutcomeTicket,
} from '../outcomes'
import type {
  SnapshotCampaign,
  SnapshotDeps,
  SnapshotDocument,
  SnapshotPlan,
  SnapshotRunResult,
  SnapshotTask,
  SourceStatus,
} from './types'

/** Sanity's document-id ceiling; a longer id is refused by the API. */
const MAX_ID_LENGTH = 128

/** One Snapshot per Campaign per day, so a re-run REPLACES rather than piles up. */
export function snapshotId(campaignId: string, date: string): string {
  const id = `marketingSnapshot.${campaignId}.${date}`
  if (id.length <= MAX_ID_LENGTH) return id
  // Only reachable for a hand-made Campaign id far longer than the UUIDs we
  // mint; hashing keeps the id deterministic, which is the whole point.
  const digest = createHash('sha256')
    .update(campaignId)
    .digest('hex')
    .slice(0, 32)
  return `marketingSnapshot.${digest}.${date}`
}

/**
 * The last COMPLETED conference day — the day a reading covers, and the last
 * day any window may include. Calendar arithmetic, so a DST transition is one
 * day back rather than "24 hours ago".
 */
export function snapshotDate(now: Date): string {
  return addDaysToDate(osloTodayDateString(now), -1)
}

/**
 * The instant the conference day in progress began — the exclusive end of
 * every query. Strictly earlier than the start of the UTC day (the conference
 * is east of Greenwich), so it also satisfies the provider's own
 * "never query up to now" guard.
 */
export function startOfConferenceDay(now: Date): Date | null {
  const iso = osloLocalInputToIso(`${osloTodayDateString(now)}T00:00`)
  return iso ? new Date(iso) : null
}

export async function runConferenceSnapshots(
  conferenceId: string,
  deps: SnapshotDeps,
  now: Date,
): Promise<SnapshotRunResult> {
  const date = snapshotDate(now)
  const base: SnapshotRunResult = {
    conferenceId,
    date,
    written: 0,
    source: { posthog: 'unavailable', bluesky: 'unavailable' },
    notes: [],
  }

  const plan = await deps.readPlan(conferenceId)
  if (!plan) return { ...base, skipped: 'no plan' }
  // Stamped FIRST, exactly as the expansion cron does: a conference whose run
  // then fails still goes to the back of the queue instead of blocking every
  // edition behind it. A plan with NO Campaigns is stamped too — an unstamped
  // plan sorts oldest for ever, and twenty empty ones would take every slot of
  // every run and starve the editions that have something to measure.
  await deps.markSnapshotted(plan.planId, now.toISOString())
  if (plan.campaigns.length === 0) {
    return { ...base, skipped: 'plan has no campaigns' }
  }

  const notes: string[] = []
  const rows = await readBreakdown(plan, deps, now, notes)
  const engagement = await readEngagement(plan, deps, notes)
  const proposals = await readIf(
    plan.campaigns.some((c) => c.primaryOutcome === 'cfpSubmissions'),
    () => deps.readProposals(conferenceId),
    'proposals',
    notes,
  )
  const tickets = await readIf(
    plan.campaigns.some((c) => c.primaryOutcome === 'ticketsSoldInWindow'),
    () => deps.readTickets(conferenceId),
    'tickets',
    notes,
  )

  const source = {
    posthog: (rows === null ? 'unavailable' : 'ok') as SourceStatus,
    bluesky: (engagement === null ? 'unavailable' : 'ok') as SourceStatus,
  }
  const takenAt = now.toISOString()

  const documents = plan.campaigns.map((campaign) =>
    snapshotDocument({
      campaign,
      tasks: plan.tasks.filter((task) => task.campaignId === campaign._id),
      conferenceId,
      date,
      takenAt,
      rows,
      engagement,
      proposals,
      tickets,
      source,
      now,
    }),
  )

  const fresh = await withoutStale(
    documents,
    conferenceId,
    takenAt,
    deps,
    notes,
  )
  if (fresh.length > 0) await deps.writeSnapshots(fresh)

  return { ...base, written: fresh.length, source, notes }
}

/**
 * A reading already stored for this date that is NEWER than this run wins.
 * Two refreshes can be in flight at once (the rate limiter bounds how often,
 * not how many), and the slower one must not replace the fresher answer. This
 * is a stale-write guard, NOT mutual exclusion: two runs that overlap inside
 * the read-then-write gap can still both write, and the later one wins.
 */
async function withoutStale(
  documents: SnapshotDocument[],
  conferenceId: string,
  takenAt: string,
  deps: SnapshotDeps,
  notes: string[],
): Promise<SnapshotDocument[]> {
  if (documents.length === 0) return documents
  let existing: { _id: string; takenAt: string | null }[]
  try {
    existing = await deps.readExisting(
      conferenceId,
      documents.map((document) => document._id),
    )
  } catch (error) {
    // The guard is an optimisation; failing it must not cost the whole run.
    notes.push(`existing-snapshot read failed: ${describe(error)}`)
    return documents
  }
  const newerThanUs = new Set(
    existing
      .filter((row) => row.takenAt !== null && takenAt < row.takenAt)
      .map((row) => row._id),
  )
  if (newerThanUs.size > 0) {
    notes.push(
      `${newerThanUs.size} snapshot(s) left alone: a fresher reading exists`,
    )
  }
  return documents.filter((document) => !newerThanUs.has(document._id))
}

/**
 * ONE day-grain call for the plan's whole range (spec §6.4). The rows carry a
 * day each, so the pure layer can still give every Campaign its own window.
 */
async function readBreakdown(
  plan: SnapshotPlan,
  deps: SnapshotDeps,
  now: Date,
  notes: string[],
): Promise<CampaignBreakdownRow[] | null> {
  const range = planRange(plan.campaigns, plan.tasks, now)
  if (!range) {
    notes.push('posthog: the plan has no completed day yet')
    return null
  }
  let result
  try {
    result = await deps.breakdown({
      conferenceId: plan.conferenceId,
      from: range.from,
      to: range.to,
    })
  } catch (error) {
    notes.push(`posthog: ${describe(error)}`)
    return null
  }
  if (!result.ok) {
    notes.push(`posthog: ${result.kind} — ${result.message}`)
    return null
  }
  if (result.truncated) {
    notes.push(
      'posthog: result hit the row cap; the smallest groups may be missing',
    )
    return null
  }
  return result.rows
}

/**
 * The plan's whole range: the earliest day any Campaign's window can open →
 * the start of today (UTC).
 *
 * That day is the earlier of the earliest Campaign start and the earliest
 * PUBLICATION. A Task moved back by hand can go out before its Campaign's
 * window opens, and the attributed window starts at the publication (§6.3) —
 * a range beginning at the Campaign start would never fetch those days, and
 * the traffic would read as a confident zero rather than as what it is.
 */
export function planRange(
  campaigns: readonly SnapshotCampaign[],
  tasks: readonly SnapshotTask[],
  now: Date,
): { from: Date; to: Date } | null {
  const days = [
    ...campaigns.map((c) => c.startDate).filter(Boolean),
    ...publishedDaysOf(tasks),
  ].sort()
  if (days.length === 0) return null
  const fromIso = osloLocalInputToIso(`${days[0]}T00:00`)
  if (!fromIso) return null
  const from = new Date(fromIso)
  const to = startOfConferenceDay(now)
  return !to || Number.isNaN(from.getTime()) || from.getTime() >= to.getTime()
    ? null
    : { from, to }
}

/** The UTC days the plan's published Tasks actually went out on. */
function publishedDaysOf(tasks: readonly SnapshotTask[]): string[] {
  const days: string[] = []
  for (const task of tasks) {
    if (task.variantStatus !== 'published' || !task.publishedAt) continue
    const day = conferenceDay(task.publishedAt)
    if (day) days.push(day)
  }
  return days
}

async function readEngagement(
  plan: SnapshotPlan,
  deps: SnapshotDeps,
  notes: string[],
): Promise<Map<string, PostEngagement> | null> {
  const uris = [
    ...new Set(
      plan.tasks
        .map((task) => task.postUri)
        .filter((uri): uri is string => !!uri),
    ),
  ]
  // Nothing published on Bluesky is not a failure: an empty map is a complete
  // answer, and the Campaign's interaction count is a true zero.
  if (uris.length === 0) return new Map()
  let result
  try {
    result = await deps.engagement(uris)
  } catch (error) {
    notes.push(`bluesky: ${describe(error)}`)
    return null
  }
  if (!result.ok) {
    notes.push(`bluesky: ${result.kind} — ${result.message}`)
    return null
  }
  if (result.missing.length > 0) {
    notes.push(`bluesky: ${result.missing.length} post(s) no longer resolve`)
  }
  return result.counts
}

/** Fetch only when some Campaign needs it; a failure is `null`, never `[]`. */
async function readIf<T>(
  needed: boolean,
  read: () => Promise<T[]>,
  label: string,
  notes: string[],
): Promise<T[] | null> {
  if (!needed) return []
  try {
    return await read()
  } catch (error) {
    notes.push(`${label}: ${describe(error)}`)
    return null
  }
}

interface DocumentInput {
  campaign: SnapshotCampaign
  tasks: SnapshotTask[]
  conferenceId: string
  date: string
  takenAt: string
  rows: CampaignBreakdownRow[] | null
  engagement: Map<string, PostEngagement> | null
  proposals: OutcomeProposal[] | null
  tickets: OutcomeTicket[] | null
  source: { posthog: SourceStatus; bluesky: SourceStatus }
  now: Date
}

export function snapshotDocument(input: DocumentInput): SnapshotDocument {
  const outcome = computeCampaignOutcome({
    campaign: input.campaign,
    tasks: input.tasks,
    rows: input.rows,
    engagement: input.engagement,
    proposals: input.proposals,
    tickets: input.tickets,
    now: input.now,
  })
  return {
    _id: snapshotId(input.campaign._id, input.date),
    _type: 'marketingSnapshot',
    campaign: { _type: 'reference', _ref: input.campaign._id, _weak: true },
    campaignKey: input.campaign.key,
    campaignTitle: input.campaign.title,
    campaignPrimaryOutcome: input.campaign.primaryOutcome,
    campaignTarget: input.campaign.target ?? null,
    campaignStartDate: input.campaign.startDate,
    campaignEndDate: input.campaign.endDate,
    conference: { _type: 'reference', _ref: input.conferenceId },
    date: input.date,
    primaryOutcomeValue: outcome.value,
    primaryOutcomeAttributed: outcome.attributed,
    primaryOutcomeAttributedValue: outcome.attributedValue,
    secondary: outcome.secondary,
    perTask: outcome.perTask
      .filter(
        (entry) =>
          !input.tasks.find((task) => task._id === entry.taskId)
            ?.orphanedPublication,
      )
      .map((entry) => ({
        _key: randomUUID(),
        _type: 'marketingSnapshotTask',
        taskKey: entry.taskKey,
        task: { _type: 'reference', _ref: entry.taskId, _weak: true },
        sessions: entry.sessions,
        clicks: entry.clicks,
        blueskyLikes: entry.engagement?.likes ?? null,
        blueskyReposts: entry.engagement?.reposts ?? null,
        blueskyReplies: entry.engagement?.replies ?? null,
        blueskyQuotes: entry.engagement?.quotes ?? null,
      })),
    source: input.source,
    takenAt: input.takenAt,
  }
}

/** The `at://` uri of a published post, from the stored strong ref. */
export function postUriOf(
  externalId: string | null | undefined,
): string | null {
  return parseBlueskyExternalId(externalId)?.uri ?? null
}

function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}
