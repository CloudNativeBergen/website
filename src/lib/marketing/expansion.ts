/**
 * RECURRING EXPANSION — pure (spec §5.4). A cadence recipe becomes dated
 * Tasks: its window is resolved against the Milestones, each Channel's rate
 * becomes evenly spread slots, and subjects are dealt onto the slots
 * round-robin — the earliest least-used slot first, so every slot gets one
 * subject before any gets two.
 *
 * Slots are compared as INSTANTS against `now`, never as dates: a speaker
 * confirmed at 19:00 does not land on that morning's 08:00 LinkedIn slot.
 * A subject beat also needs lead time for its studio render.
 */

import type { Milestone, ResolvedMilestone } from './milestones'
import {
  addDaysToDate,
  CHANNEL_SLOT,
  daysBetween,
  emptyRecords,
  appendRecords,
  generatedTaskKey,
  materializeTask,
  resolveAnchor,
  slotAt,
  WORK_SLOT,
  type PlaceholderValues,
  type SubjectLink,
  type TaskRecords,
} from './materialize'
import { publishedPair } from './recipes'
import type { Anchor, Cadence, TaskRecipe } from './template/types'
import type { MarketingChannel, TaskOrigin } from './types'

/** Lead time between creating a subject beat and its first post: the render. */
export const RENDER_LEAD_MS = 24 * 60 * 60 * 1000
/** The render is due this many days before the beat's first post. */
const RENDER_DAYS_BEFORE = 2

export interface Slot {
  /** YYYY-MM-DD, Oslo calendar day. */
  date: string
  /** ISO instant at the Channel's time. */
  at: string
  /** Against the cadence's `from` Milestone. */
  anchor: Anchor
  provisional: boolean
}

/** The render and publishing siblings of one beat, render first. */
export function beatRecipes(
  campaign: { recipes: TaskRecipe[] },
  beat: string,
): TaskRecipe[] {
  const recipes = campaign.recipes.filter((r) => r.beat === beat)
  return [
    ...recipes.filter((r) => r.kind !== 'publishing'),
    ...recipes.filter((r) => r.kind === 'publishing'),
  ]
}

/** The cadence a beat's publishing siblings share, if it is recurring. */
export function beatCadence(recipes: TaskRecipe[]): Cadence | undefined {
  return recipes.find((r) => r.kind === 'publishing' && r.cadence)?.cadence
}

export function cadenceSlots(
  cadence: Cadence,
  channel: MarketingChannel,
  milestones: Record<Milestone, ResolvedMilestone>,
): Slot[] {
  const perWeek = cadence.perWeek[channel]
  if (!perWeek || perWeek < 1) return []
  const from = resolveAnchor(cadence.from, milestones)
  const to = resolveAnchor(cadence.to, milestones)
  const span = daysBetween(from.date, to.date)
  const provisional = from.provisional || to.provisional
  const slots: Slot[] = []
  for (let week = 0; week * 7 <= span; week++) {
    for (let i = 0; i < perWeek; i++) {
      const offset = week * 7 + Math.floor((i * 7) / perWeek)
      if (offset > span) break
      const date = addDaysToDate(from.date, offset)
      slots.push({
        date,
        at: slotAt(date, CHANNEL_SLOT[channel]),
        anchor: {
          milestone: cadence.from.milestone,
          offsetDays: cadence.from.offsetDays + offset,
        },
        provisional,
      })
    }
  }
  return slots
}

/**
 * The slot for the next subject: at or after `notBefore`, the fewest Tasks
 * already on its day, earliest on a tie. Null when the window is over.
 */
export function pickSlot(
  slots: Slot[],
  occupancy: ReadonlyMap<string, number>,
  notBefore: string,
): Slot | null {
  const floor = Date.parse(notBefore)
  let best: Slot | null = null
  let bestCount = Infinity
  for (const slot of slots) {
    if (Date.parse(slot.at) < floor) continue
    const count = occupancy.get(slot.date) ?? 0
    if (count < bestCount) {
      best = slot
      bestCount = count
    }
  }
  return best
}

export interface GenerationSubject extends SubjectLink {
  values: PlaceholderValues
}

/**
 * A speaker as a Task subject. A speaker has a job title, not a company, so
 * `{company}` reads their title — the closest thing the platform stores.
 */
export function speakerSubject(
  speaker: { _id: string; name?: string | null; title?: string | null },
  talkTitle?: string | null,
): GenerationSubject {
  return {
    _id: speaker._id,
    type: 'speaker',
    values: {
      ...(speaker.name ? { name: speaker.name } : {}),
      ...(speaker.title ? { company: speaker.title } : {}),
      ...(talkTitle ? { title: talkTitle } : {}),
    },
  }
}

export interface DatedRecipe {
  at: string
  anchor: Anchor | null
  provisional: boolean
}

/** When each recipe of one subject beat happens, keyed by recipe key. */
export type BeatDates = Map<string, DatedRecipe>

export type ChannelOccupancy = Record<MarketingChannel, Map<string, number>>

/**
 * Dates one subject's beat on its cadence: one slot per sibling Channel, the
 * render two days before the first post (never before `now`). Null when no
 * sibling has a slot left. The chosen days are counted into `occupancy`, so
 * the next subject is dealt onto the next slot.
 */
export function subjectBeatDates(input: {
  recipes: TaskRecipe[]
  milestones: Record<Milestone, ResolvedMilestone>
  occupancy: ChannelOccupancy
  now: string
}): BeatDates | null {
  const cadence = beatCadence(input.recipes)
  if (!cadence) return null
  const notBefore = new Date(
    Date.parse(input.now) + RENDER_LEAD_MS,
  ).toISOString()
  const dates: BeatDates = new Map()
  let first: Slot | null = null
  for (const r of input.recipes) {
    if (r.kind !== 'publishing' || !r.channel) continue
    const slots = cadenceSlots(cadence, r.channel, input.milestones)
    const slot = pickSlot(slots, input.occupancy[r.channel], notBefore)
    if (!slot) continue
    dates.set(r.key, slot)
    if (!first || slot.at < first.at) first = slot
  }
  if (!first) return null
  for (const [key, slot] of dates) {
    const channel = input.recipes.find((r) => r.key === key)!.channel!
    const day = (slot as Slot).date
    input.occupancy[channel].set(
      day,
      (input.occupancy[channel].get(day) ?? 0) + 1,
    )
  }
  const renderDate = addDaysToDate(first.date, -RENDER_DAYS_BEFORE)
  const renderAt = slotAt(renderDate, WORK_SLOT)
  const early = Date.parse(renderAt) < Date.parse(input.now)
  for (const r of input.recipes) {
    if (r.kind === 'publishing') continue
    dates.set(
      r.key,
      early
        ? { at: input.now, anchor: null, provisional: false }
        : {
            at: renderAt,
            anchor: {
              milestone: first.anchor.milestone,
              offsetDays: first.anchor.offsetDays - RENDER_DAYS_BEFORE,
            },
            provisional: first.provisional,
          },
    )
  }
  return dates
}

export interface BeatContext {
  campaign: { _id: string; key: string }
  planId: string
  conference: { _id: string; baseUrl: string }
  /** Conference placeholder values. */
  values: PlaceholderValues
  assigneeId: string
  /** The Task id for a generated key (deterministic in production). */
  taskId: (key: string) => string
  newId: (type: string) => string
  /**
   * `(utm_campaign, utm_content)` pairs (`publishedPair`) whose post has
   * ALREADY been published in this edition.
   *
   * Trigger and expansion generation filter these out before they get here
   * (`pendingRecipes`), but seeding and copying reach the cadence expansion
   * directly — so a countdown published early, while its slot is still in the
   * future, was recreated as a fresh draft by a reseed and could go out twice.
   */
  publishedKeys?: ReadonlySet<string>
  /**
   * The Campaign's generation marker. A subjectless cadence expands when it is
   * put on the Campaign and never again: a key on the marker — a slot the
   * organizer deleted, or a countdown migration 053 found already there — is
   * not created a second time.
   */
  generatedKeys?: ReadonlySet<string>
}

/**
 * One subject's beat as records: the render (when the beat has one and it is
 * dated) and every dated sibling, each sibling waiting on the render.
 */
export function buildSubjectBeat(
  input: BeatContext & {
    recipes: TaskRecipe[]
    subject: GenerationSubject
    dates: BeatDates
    origin: TaskOrigin
    /**
     * Renders of this beat that were created on an earlier run (one Channel
     * had a slot then and another did not): a sibling created now still
     * waits on them.
     */
    existingRenderIds?: string[]
  },
): TaskRecords {
  const records = emptyRecords()
  const values = { ...input.values, ...input.subject.values }
  const subject: SubjectLink = {
    _id: input.subject._id,
    type: input.subject.type,
  }
  const renderIds: string[] = [...(input.existingRenderIds ?? [])]
  for (const r of input.recipes) {
    const date = input.dates.get(r.key)
    if (!date) continue
    const key = generatedTaskKey(r.key, input.subject._id)
    const taskId = input.taskId(key)
    if (r.kind !== 'publishing') renderIds.push(taskId)
    appendRecords(
      records,
      materializeTask({
        recipe: r,
        taskId,
        key,
        campaign: input.campaign,
        planId: input.planId,
        conference: input.conference,
        values,
        at: date.at,
        // A Trigger-created Task is dated by its event, never anchored
        // (spec §2.3), even when the event deals it onto a cadence slot.
        anchor: input.origin === 'trigger' ? null : date.anchor,
        provisional: date.provisional,
        assigneeId: input.assigneeId,
        prerequisiteIds: r.kind === 'publishing' ? [...renderIds] : [],
        subject,
        origin: input.origin,
        newId: input.newId,
      }),
    )
  }
  return records
}

/**
 * A subjectless cadence (the countdown): one Task per slot per Channel, each
 * keyed by its day against the cadence Milestone (`countdown:d-30:bluesky`),
 * with `{days}` counting down to the conference start. Slots already past
 * are skipped.
 */
export function expandSubjectlessCadence(
  input: BeatContext & {
    recipes: TaskRecipe[]
    milestones: Record<Milestone, ResolvedMilestone>
    now: string
  },
): TaskRecords {
  const records = emptyRecords()
  const cadence = beatCadence(input.recipes)
  if (!cadence) return records
  const start = input.milestones.CONFERENCE_START.date
  for (const r of input.recipes) {
    if (r.kind !== 'publishing' || !r.channel) continue
    for (const slot of cadenceSlots(cadence, r.channel, input.milestones)) {
      if (Date.parse(slot.at) < Date.parse(input.now)) continue
      const days = daysBetween(slot.date, start)
      const key = generatedTaskKey(r.key, `d${slot.anchor.offsetDays}`)
      // Already sent in this edition: the slot is still ahead, but the post is
      // behind us.
      if (input.publishedKeys?.has(publishedPair(input.campaign.key, key)))
        continue
      if (input.generatedKeys?.has(key)) continue
      appendRecords(
        records,
        materializeTask({
          recipe: r,
          taskId: input.taskId(key),
          key,
          campaign: input.campaign,
          planId: input.planId,
          conference: input.conference,
          values: {
            ...input.values,
            days: days === 1 ? '1 day' : `${days} days`,
          },
          at: slot.at,
          anchor: slot.anchor,
          provisional: slot.provisional,
          assigneeId: input.assigneeId,
          prerequisiteIds: [],
          origin: 'expansion',
          newId: input.newId,
        }),
      )
    }
  }
  return records
}

/**
 * Every subjectless cadence among a Campaign's Recipes, expanded — at the one
 * moment the Recipes are put on the Campaign (§5.4, Templates spec §2.1). The
 * caller records the keys of what comes back on `generatedKeys[]` in the same
 * transaction.
 */
export function expandCampaignSubjectless(
  input: BeatContext & {
    recipes: TaskRecipe[]
    milestones: Record<Milestone, ResolvedMilestone>
    now: string
  },
): TaskRecords {
  const records = emptyRecords()
  const beats = new Set(
    input.recipes
      .filter((r) => r.cadence && r.subjectSource === 'none')
      .map((r) => r.beat),
  )
  for (const beat of beats) {
    appendRecords(
      records,
      expandSubjectlessCadence({
        ...input,
        recipes: beatRecipes(input, beat),
      }),
    )
  }
  return records
}
