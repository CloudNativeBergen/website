/**
 * THE PLAN GROWS ITSELF (spec §5.3, §5.4). Triggers and the recurring
 * expansion both end here: find the Campaigns that want Tasks for a subject,
 * build the subject's beat, and commit it with the generation marker.
 *
 * IDEMPOTENT per (Campaign, recipe, subject): every generated key is recorded
 * on the Campaign (`generatedKeys`) in the same transaction that creates the
 * Task, compare-and-set on the Campaign revision. A key on the marker is
 * never generated again — not by a second sponsor event, not by tomorrow's
 * cron, and not after the organizer deleted the Task. A concurrent generator
 * loses the revision race, re-reads, and finds the keys already recorded.
 * Task ids are also deterministic per (Campaign, key), so even a hand-edited
 * marker cannot produce a duplicate Task.
 */

import { createHash, randomUUID } from 'node:crypto'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { getCurrentDateTime, osloTodayDateString } from '@/lib/time'
import {
  planCeilingWarnings,
  warningsTouching,
  type CeilingWarning,
} from './ceilings'
import {
  beatCadence,
  beatRecipes,
  buildSubjectBeat,
  subjectBeatDates,
  type BeatDates,
  type ChannelOccupancy,
  type GenerationSubject,
} from './expansion'
import {
  addDaysToDate,
  conferenceValuesFor,
  CHANNEL_SLOT,
  emptyRecords,
  appendRecords,
  generatedTaskKey,
  slotAt,
  WORK_SLOT,
  type TaskRecords,
} from './generate'
import {
  commitGeneratedTasks,
  getGenerationContext,
  type GenerationCampaign,
  type GenerationContext,
} from './generation-sanity'
import {
  resolveAllMilestones,
  type Milestone,
  type ResolvedMilestone,
} from './milestones'
import { BUILTIN_TEMPLATE } from './template'
import type { CampaignRecipe, SubjectList, TaskRecipe } from './template/types'
import type { TaskOrigin, TriggerEvent } from './types'
import { getPlanView } from './sanity'

/** Days after a sponsor signs that the render and the thank-you posts are due (§5.3). */
const SPONSOR_RENDER_DAYS = 1
const SPONSOR_POST_DAYS = 3
/** Subjects per transaction, so a long speaker list never builds one huge commit. */
const BEATS_PER_COMMIT = 20
/** Revision races tolerated before a run gives up (the next run carries on). */
const MAX_CONFLICTS = 3

export type GenerationRequest =
  | { kind: 'trigger'; event: TriggerEvent; subjects: GenerationSubject[] }
  | { kind: 'expansion'; list: SubjectList; subjects: GenerationSubject[] }

export interface GenerationResult {
  created: number
  /** Ceiling warnings the created Tasks are part of (§5.4). */
  warnings: CeilingWarning[]
  /** Why nothing could be generated, when that is the answer. */
  skipped?: 'no-plan' | 'milestones' | 'conflicts'
}

/** Deterministic per (Campaign, key): a duplicate Task cannot exist. */
export function generatedTaskId(campaignId: string, key: string): string {
  const hash = createHash('sha256').update(`${campaignId}|${key}`).digest('hex')
  return `marketingTask.gen-${hash.slice(0, 32)}`
}

interface PendingBeat {
  campaign: GenerationCampaign
  recipes: TaskRecipe[]
  subject: GenerationSubject
  origin: TaskOrigin
}

/** The Template Campaign of a stored Campaign (copied plans keep the keys). */
function templateCampaign(key: string): CampaignRecipe | undefined {
  return BUILTIN_TEMPLATE.campaigns.find((c) => c.key === key)
}

/** The beats a request asks of one Campaign. */
function beatsFor(
  campaign: GenerationCampaign,
  request: GenerationRequest,
): { beat: string; origin: TaskOrigin }[] {
  const template = templateCampaign(campaign.key)
  if (!template) return []
  if (request.kind === 'trigger') {
    return campaign.triggers
      .filter((t) => t.event === request.event)
      .map((t) => template.recipes.find((r) => r.key === t.taskRecipeKey)?.beat)
      .filter((beat): beat is string => !!beat)
      .map((beat) => ({ beat, origin: 'trigger' as const }))
  }
  const beats = new Set(
    template.recipes
      .filter((r) => r.cadence?.subjects === request.list)
      .map((r) => r.beat),
  )
  return [...beats].map((beat) => ({ beat, origin: 'expansion' as const }))
}

/** The recipes of a beat not yet generated for this subject. */
function pendingRecipes(
  campaign: GenerationCampaign,
  recipes: TaskRecipe[],
  subjectId: string,
): TaskRecipe[] {
  const done = new Set(campaign.generatedKeys)
  return recipes.filter((r) => !done.has(generatedTaskKey(r.key, subjectId)))
}

function occupancyFor(
  context: GenerationContext,
  campaignId: string,
  beat: string,
): ChannelOccupancy {
  const occupancy: ChannelOccupancy = {
    linkedin: new Map(),
    bluesky: new Map(),
  }
  for (const t of context.tasks) {
    if (t.campaignId !== campaignId || !t.channel || !t.at) continue
    if (!t.key.startsWith(`${beat}:`) || !t.key.endsWith(`:${t.channel}`))
      continue
    const day = osloTodayDateString(new Date(t.at))
    occupancy[t.channel].set(day, (occupancy[t.channel].get(day) ?? 0) + 1)
  }
  return occupancy
}

/** Fixed dates for a sponsor beat: render +1 d, posts +3 d, no Milestone anchor. */
function sponsorBeatDates(recipes: TaskRecipe[], now: string): BeatDates {
  const today = osloTodayDateString(new Date(now))
  const dates: BeatDates = new Map()
  for (const r of recipes) {
    const at =
      r.kind === 'publishing' && r.channel
        ? slotAt(
            addDaysToDate(today, SPONSOR_POST_DAYS),
            CHANNEL_SLOT[r.channel],
          )
        : slotAt(addDaysToDate(today, SPONSOR_RENDER_DAYS), WORK_SLOT)
    dates.set(r.key, { at, anchor: null, provisional: false })
  }
  return dates
}

/**
 * Build the next commit's worth of records for ONE Campaign, or null when
 * nothing is pending anywhere. Dates are computed fresh from the context,
 * so a retry after a conflict deals slots from what actually landed.
 */
function nextCommit(
  context: GenerationContext,
  milestones: Record<Milestone, ResolvedMilestone>,
  requests: GenerationRequest[],
  now: string,
): { campaign: GenerationCampaign; records: TaskRecords } | null {
  const pending: PendingBeat[] = []
  for (const campaign of context.campaigns) {
    const template = templateCampaign(campaign.key)
    if (!template) continue
    for (const request of requests) {
      for (const { beat, origin } of beatsFor(campaign, request)) {
        const recipes = beatRecipes(template, beat)
        for (const subject of request.subjects) {
          const todo = pendingRecipes(campaign, recipes, subject._id)
          if (todo.length > 0)
            pending.push({ campaign, recipes: todo, subject, origin })
        }
      }
    }
  }
  if (pending.length === 0) return null

  const campaign = pending[0].campaign
  const values = conferenceValuesFor(context.conference)
  const baseUrl = conferenceBaseUrl(context.conference)
  const ownerId = context.plan.ownerId
  if (!ownerId) return null
  const occupancies = new Map<string, ChannelOccupancy>()
  const records = emptyRecords()
  let beats = 0
  for (const item of pending) {
    if (item.campaign._id !== campaign._id) continue
    if (beats >= BEATS_PER_COMMIT) break
    const beat = item.recipes[0].beat
    let dates: BeatDates | null
    if (beatCadence(item.recipes)) {
      if (!occupancies.has(beat)) {
        occupancies.set(beat, occupancyFor(context, campaign._id, beat))
      }
      dates = subjectBeatDates({
        recipes: item.recipes,
        milestones,
        occupancy: occupancies.get(beat)!,
        now,
      })
    } else {
      dates = sponsorBeatDates(item.recipes, now)
    }
    if (!dates) {
      // No slot left in the window: record nothing, so nothing is marked done.
      continue
    }
    appendRecords(
      records,
      buildSubjectBeat({
        recipes: item.recipes,
        subject: item.subject,
        dates,
        origin: item.origin,
        campaign: { _id: campaign._id, key: campaign.key },
        planId: context.plan._id,
        conference: { _id: context.conference._id, baseUrl },
        values,
        assigneeId: ownerId,
        taskId: (key) => generatedTaskId(campaign._id, key),
        newId: (type) => `${type}.${randomUUID()}`,
      }),
    )
    beats += 1
  }
  if (records.tasks.length === 0) {
    // Every pending beat of this Campaign is out of slots; move on by
    // dropping them from consideration.
    return nextCommit(
      {
        ...context,
        campaigns: context.campaigns.filter((c) => c._id !== campaign._id),
      },
      milestones,
      requests,
      now,
    )
  }
  return { campaign, records }
}

/**
 * Generate what the requests ask for on one conference's plan. Never throws
 * for "nothing to do"; a failing Sanity write does throw, for the caller's
 * per-conference guard.
 */
export async function runGeneration(
  conferenceId: string,
  requests: GenerationRequest[],
  now: string = getCurrentDateTime(),
): Promise<GenerationResult> {
  const created: string[] = []
  let conflicts = 0
  let milestones: Record<Milestone, ResolvedMilestone> | null = null
  const result = async (
    skipped?: GenerationResult['skipped'],
  ): Promise<GenerationResult> => ({
    created: created.length,
    warnings: milestones
      ? await warningsFor(conferenceId, milestones, created)
      : [],
    ...(skipped ? { skipped } : {}),
  })
  for (;;) {
    const context = await getGenerationContext(conferenceId)
    if (!context) return result('no-plan')
    try {
      milestones = resolveAllMilestones(context.conference)
    } catch {
      return result('milestones')
    }
    const next = nextCommit(context, milestones, requests, now)
    if (!next) return result()
    const landed = await commitGeneratedTasks({
      conferenceId,
      campaignId: next.campaign._id,
      campaignRev: next.campaign._rev,
      records: next.records,
    })
    if (landed) {
      created.push(...next.records.tasks.map((t) => t._id))
    } else if (++conflicts > MAX_CONFLICTS) {
      return result('conflicts')
    }
  }
}

/** The ceiling warnings the given Tasks are part of, across the whole plan. */
export async function warningsFor(
  conferenceId: string,
  milestones: Record<Milestone, ResolvedMilestone>,
  taskIds: string[],
): Promise<CeilingWarning[]> {
  if (taskIds.length === 0) return []
  const view = await getPlanView(conferenceId)
  if (!view) return []
  return warningsTouching(planCeilingWarnings(view.tasks, milestones), taskIds)
}
