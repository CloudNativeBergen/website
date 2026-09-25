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
 * marker cannot produce a duplicate Task. Published variant links preserve
 * promotion keys across a whole-tree deletion and reseed; draft-only subjects
 * regenerate. A render is suppressed only once all dependent channels published.
 */

import { createHash, randomUUID } from 'node:crypto'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { getCurrentDateTime, osloTodayDateString } from '@/lib/time'
import { ceilingWarningsFor } from './ceiling-check'
import { shortCodeMinterFor } from './short-code-sanity'
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
} from './materialize'
import {
  commitGeneratedTasks,
  getGenerationContext,
  getSpeakerTagSources,
  publishedTaskKeys,
  type GenerationCampaign,
  type GenerationContext,
} from './generation-sanity'
import {
  resolveAllMilestones,
  type Milestone,
  type ResolvedMilestone,
} from './milestones'
import { publishedIn } from './recipes'
import type { BlueskyTag } from './tagging/body'
import { blueskyTagFor, ownBlueskyHandle } from './tagging/lookup'
import type { SubjectList, TaskRecipe } from './template/types'
import type { TaskOrigin, TriggerEvent } from './types'

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
  /** Ceiling warnings the created posts are part of (§5.4), as sentences. */
  warnings: string[]
  /** Why nothing could be generated, when that is the answer. */
  skipped?: 'no-plan' | 'no-owner' | 'conflicts'
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
  /** Renders of this beat an earlier run already created. */
  existingRenderIds: string[]
}

/**
 * The beats a request asks of one Campaign — from the Recipes STORED on it
 * (Templates spec §2.1), never the Template it was seeded from. A Campaign
 * with no Recipes asks for nothing.
 */
function beatsFor(
  campaign: GenerationCampaign,
  request: GenerationRequest,
): { beat: string; origin: TaskOrigin }[] {
  if (request.kind === 'trigger') {
    return campaign.triggers
      .filter((t) => t.event === request.event)
      .map((t) => campaign.recipes.find((r) => r.key === t.taskRecipeKey)?.beat)
      .filter((beat): beat is string => !!beat)
      .map((beat) => ({ beat, origin: 'trigger' as const }))
  }
  const beats = new Set(
    campaign.recipes
      .filter((r) => r.cadence?.subjects === request.list)
      .map((r) => r.beat),
  )
  return [...beats].map((beat) => ({ beat, origin: 'expansion' as const }))
}

/**
 * Local markers prevent duplicates until deletion; published keys outlive a
 * reseed. `publishedPairs` holds `publishedPair(utm_campaign, utm_content)`:
 * a post sent from ANOTHER Campaign with the same Task key is not this one's.
 */
export function pendingRecipes(
  campaign: Pick<GenerationCampaign, 'key' | 'generatedKeys'>,
  recipes: TaskRecipe[],
  subjectId: string,
  publishedPairs: ReadonlySet<string>,
): TaskRecipe[] {
  const generated = new Set(campaign.generatedKeys)
  const published = publishedIn(publishedPairs, campaign.key)
  return recipes.filter((recipe, index) => {
    const key = generatedTaskKey(recipe.key, subjectId)
    if (generated.has(key) || published.has(key)) return false
    if (recipe.kind !== 'studioRender') return true
    // buildSubjectBeat makes every later publishing recipe depend on all
    // earlier non-publishing recipes, even without explicit prerequisites.
    const dependants = recipes
      .slice(index + 1)
      .filter((r) => r.kind === 'publishing')
    return (
      dependants.length === 0 ||
      !dependants.every((r) =>
        published.has(generatedTaskKey(r.key, subjectId)),
      )
    )
  })
}

/**
 * The renders of this beat that an earlier run already created for this
 * subject. A sibling created now waits on them, so a beat completed over two
 * runs (one Channel had a slot, the other did not) still shows as waiting.
 */
function existingRenderIds(
  campaign: GenerationCampaign,
  recipes: TaskRecipe[],
  subjectId: string,
): string[] {
  const done = new Set(campaign.generatedKeys)
  return recipes
    .filter((r) => r.kind !== 'publishing')
    .map((r) => generatedTaskKey(r.key, subjectId))
    .filter((key) => done.has(key))
    .map((key) => generatedTaskId(campaign._id, key))
}

/**
 * How busy each Channel already is, per Oslo day, across the WHOLE plan —
 * seeded posts and countdowns included. The slot dealer avoids a day that is
 * already spoken for, so the expansion does not manufacture the ceiling
 * breaches the timeline would then warn about (§5.4).
 */
function planOccupancy(context: GenerationContext): ChannelOccupancy {
  const occupancy: ChannelOccupancy = {
    linkedin: new Map(),
    bluesky: new Map(),
  }
  for (const t of context.tasks) {
    if (!t.channel || !t.at) continue
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
 * Every (Campaign, beat, subject) the requests still want something of, in
 * Campaign order. One beat per (Campaign, beat, subject), however many
 * requests or Triggers name it.
 */
function pendingBeats(
  context: GenerationContext,
  requests: GenerationRequest[],
  blocked: ReadonlySet<string>,
  published: ReadonlySet<string>,
): PendingBeat[] {
  const pending: PendingBeat[] = []
  const seen = new Set<string>()
  for (const campaign of context.campaigns) {
    if (blocked.has(campaign._id)) continue
    for (const request of requests) {
      for (const { beat, origin } of beatsFor(campaign, request)) {
        const recipes = beatRecipes(campaign, beat)
        for (const subject of request.subjects) {
          // One beat per (Campaign, beat, subject) per commit, however many
          // requests or Triggers name it: two `create`s of the same
          // deterministic id in one transaction can never land.
          const once = `${campaign._id}|${beat}|${subject._id}`
          if (seen.has(once)) continue
          seen.add(once)
          const todo = pendingRecipes(campaign, recipes, subject._id, published)
          if (todo.length > 0) {
            pending.push({
              campaign,
              recipes: todo,
              subject,
              origin,
              existingRenderIds: existingRenderIds(
                campaign,
                recipes,
                subject._id,
              ),
            })
          }
        }
      }
    }
  }
  return pending
}

/**
 * Build the next commit's worth of records for ONE Campaign, or null when
 * nothing is pending anywhere. Dates are computed fresh from the context, so
 * a retry after a conflict deals slots from what actually landed.
 *
 * `milestones` is null when the conference has lost a required date: cadence
 * beats then have nothing to anchor to and wait, but Trigger beats are dated
 * by their event and carry on.
 */
function nextCommit(
  context: GenerationContext,
  milestones: Record<Milestone, ResolvedMilestone> | null,
  requests: GenerationRequest[],
  now: string,
  blocked: ReadonlySet<string>,
  published: ReadonlySet<string>,
  /** The caller's batch mint for this conference (short-links spec §2.2). */
  newShortCode: () => string,
  /** Bluesky tags looked up for this run, by speaker id (`lookUpTags`). */
  tags: ReadonlyMap<string, BlueskyTag | null>,
): { campaign: GenerationCampaign; records: TaskRecords } | null {
  const ownerId = context.plan.ownerId
  if (!ownerId) return null
  const pending = pendingBeats(context, requests, blocked, published)
  if (pending.length === 0) return null

  const campaign = pending[0].campaign
  const values = conferenceValuesFor(context.conference)
  const baseUrl = conferenceBaseUrl(context.conference)
  const occupancy = planOccupancy(context)
  const records = emptyRecords()
  let beats = 0
  for (const item of pending) {
    if (item.campaign._id !== campaign._id) continue
    if (beats >= BEATS_PER_COMMIT) break
    let dates: BeatDates | null
    if (beatCadence(item.recipes)) {
      dates = milestones
        ? subjectBeatDates({
            recipes: item.recipes,
            milestones,
            occupancy,
            now,
          })
        : null
    } else {
      dates = sponsorBeatDates(item.recipes, now)
    }
    if (!dates) {
      // No slot left in the window (or no Milestones to place one against):
      // record nothing, so nothing is marked done and a later run can try.
      continue
    }
    appendRecords(
      records,
      buildSubjectBeat({
        recipes: item.recipes,
        subject: item.subject,
        dates,
        origin: item.origin,
        existingRenderIds: item.existingRenderIds,
        tags,
        campaign: { _id: campaign._id, key: campaign.key },
        planId: context.plan._id,
        conference: { _id: context.conference._id, baseUrl },
        values,
        assigneeId: ownerId,
        taskId: (key) => generatedTaskId(campaign._id, key),
        newId: (type) => `${type}.${randomUUID()}`,
        newShortCode,
      }),
    )
    beats += 1
  }
  if (records.tasks.length === 0) {
    // Every pending beat of this Campaign is out of slots; move on.
    return nextCommit(
      context,
      milestones,
      requests,
      now,
      new Set([...blocked, campaign._id]),
      published,
      newShortCode,
      tags,
    )
  }
  return { campaign, records }
}

/** A recipe whose generated body tags its subject (tagging spec §2, §4.1). */
const tagsItsSubject = (r: TaskRecipe) =>
  r.kind === 'publishing' && r.channel === 'bluesky' && r.tagSubject === true

/**
 * Look up the Bluesky tag of every person a pending tagging beat names and
 * `cache` does not hold yet (tagging spec §4.4, Generation). NEVER THROWS
 * and never waits past the resolver's timeout: generation runs inside Trigger
 * handlers, and a lookup that fails leaves those people untagged — their
 * plain names — rather than failing the Tasks.
 */
async function lookUpTags(
  conferenceId: string,
  context: GenerationContext,
  pending: PendingBeat[],
  cache: Map<string, BlueskyTag | null>,
): Promise<void> {
  const wanted = new Set<string>()
  for (const item of pending) {
    if (!item.recipes.some(tagsItsSubject)) continue
    for (const person of item.subject.people ?? [])
      if (!cache.has(person._id)) wanted.add(person._id)
  }
  if (wanted.size === 0) return
  const ids = [...wanted]
  try {
    const own = ownBlueskyHandle(context.conference.socialLinks)
    const sources = new Map(
      (await getSpeakerTagSources(conferenceId, ids)).map((s) => [s._id, s]),
    )
    const found = await Promise.all(
      ids.map((id) => blueskyTagFor(sources.get(id), own)),
    )
    ids.forEach((id, i) => cache.set(id, found[i]))
  } catch (error) {
    console.warn('marketing generation: Bluesky tag lookup failed', error)
    for (const id of ids) cache.set(id, null)
  }
}

/** The same subject named twice (two CRM rows, two Triggers) is one subject. */
function dedupeSubjects(requests: GenerationRequest[]): GenerationRequest[] {
  return requests.map((request) => {
    const seen = new Set<string>()
    return {
      ...request,
      subjects: request.subjects.filter((s) =>
        seen.has(s._id) ? false : (seen.add(s._id), true),
      ),
    }
  })
}

/**
 * Generate what the requests ask for on one conference's plan. Never throws
 * for "nothing to do"; a failing Sanity write does throw, for the caller's
 * per-conference guard.
 *
 * A Campaign whose commit keeps losing the revision race (or hits a Task id
 * that already exists) is set aside after `MAX_CONFLICTS` tries so the other
 * Campaigns of the run still get their Tasks; the next run tries it again.
 */
export async function runGeneration(
  conferenceId: string,
  requests: GenerationRequest[],
  now: string = getCurrentDateTime(),
): Promise<GenerationResult> {
  let created = 0
  const createdVariants: string[] = []
  const deduped = dedupeSubjects(requests)
  const conflicts = new Map<string, number>()
  const blocked = new Set<string>()
  // Looked up once per run: a retry after a lost race asks Bluesky nothing new.
  const tags = new Map<string, BlueskyTag | null>()
  const result = async (
    skipped?: GenerationResult['skipped'],
  ): Promise<GenerationResult> => ({
    created,
    warnings:
      createdVariants.length > 0
        ? await ceilingWarningsFor(conferenceId, {
            variantIds: createdVariants,
          })
        : [],
    ...((skipped ?? (blocked.size > 0 ? 'conflicts' : undefined))
      ? { skipped: skipped ?? 'conflicts' }
      : {}),
  })
  for (;;) {
    const context = await getGenerationContext(conferenceId)
    if (!context) return result('no-plan')
    if (!context.plan.ownerId) return result('no-owner')
    let milestones: Record<Milestone, ResolvedMilestone> | null
    try {
      milestones = resolveAllMilestones(context.conference)
    } catch {
      // A conference that lost a required date cannot place cadence slots;
      // Trigger beats are dated by their event and still land.
      milestones = null
    }
    const published = await publishedTaskKeys(conferenceId)
    // Re-read per iteration: the previous iteration committed codes of its
    // own, and a batch must check against them too.
    const newShortCode = await shortCodeMinterFor(conferenceId)
    await lookUpTags(
      conferenceId,
      context,
      pendingBeats(context, deduped, blocked, published),
      tags,
    )
    const next = nextCommit(
      context,
      milestones,
      deduped,
      now,
      blocked,
      published,
      newShortCode,
      tags,
    )
    if (!next) return result()
    const landed = await commitGeneratedTasks({
      conferenceId,
      campaignId: next.campaign._id,
      campaignRev: next.campaign._rev,
      records: next.records,
    })
    if (landed) {
      created += next.records.tasks.length
      createdVariants.push(...next.records.variants.map((v) => v._id))
      conflicts.delete(next.campaign._id)
      continue
    }
    const tries = (conflicts.get(next.campaign._id) ?? 0) + 1
    conflicts.set(next.campaign._id, tries)
    if (tries > MAX_CONFLICTS) blocked.add(next.campaign._id)
  }
}
