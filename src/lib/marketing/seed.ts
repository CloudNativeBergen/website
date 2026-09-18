/**
 * TEMPLATE EXPANSION — pure. Turns a Plan Template plus one conference into
 * the records a seeded plan consists of (spec §3.1 "Create", §5), with ids
 * already assigned so Prerequisites and variants can reference each other
 * before anything is written. `sanity.ts` persists the result in one
 * transaction; the router supplies the conference from the request domain.
 *
 * What seeds: every recipe with an anchor, no cadence and no subject, plus the
 * subjectless cadences (the countdown), which expand at plan creation
 * (§5.4). Trigger recipes are dated by their event (`generation.ts`) and
 * subject cadences by the recurring expansion once their subjects exist.
 */

import {
  appendRecords,
  emptyRecords,
  conferenceValuesFor,
  materializeTask,
  recipeSlotTime,
  resolveAnchor,
  slotAt,
  type SeedPost,
  type SeedTask,
  type SeedVariant,
} from './materialize'
import { expandCampaignSubjectless } from './expansion'
import {
  resolveAllMilestones,
  type Milestone,
  type MilestoneSource,
} from './milestones'
import type { PlanTemplate, TaskRecipe } from './template/types'
import type { CampaignTrigger, Outcome } from './types'

export {
  addDaysToDate,
  type SeedPost,
  type SeedTask,
  type SeedVariant,
} from './materialize'

/** The slice of a conference seeding reads. */
export interface SeedConference extends MilestoneSource {
  _id: string
  title: string
  city: string
  venueName?: string | null
  ticketCapacity?: number | null
  /** The conference origin the tagged links point at. */
  baseUrl: string
}

export interface SeedInput {
  template: PlanTemplate
  conference: SeedConference
  /** Keys of optional Campaigns to include. */
  includeOptional: string[]
  /** The organizer seeding the plan: owner, and default assignee. */
  ownerId: string
  /** ISO datetime the plan is created at. */
  now: string
  /** Id source, injectable for determinism; receives the document type. */
  newId: (type: string) => string
  /**
   * Task keys whose post has ALREADY been published in this edition, from the
   * surviving variants' tagged links (`publishedTaskKeys`).
   *
   * A whole-plan delete deliberately keeps published variants and posts — the
   * record of what went out must outlive a tidy-up — so seeding afterwards
   * recreated the announcement that had already gone out as a fresh draft, and
   * an organizer working the new plan could approve and publish the CFP, ticket
   * or countdown post a second time. Trigger and expansion generation has
   * always consulted these keys; seeding and copying did not.
   *
   * A render is not suppressed here: it may still be needed by a Channel that
   * has not published. `generation.ts` owns that rule and is left to it.
   */
  publishedKeys?: ReadonlySet<string>
}

export interface SeedPlanRecord {
  _id: string
  conferenceId: string
  ownerId: string
  templateVersion: string
  createdAt: string
  /** A copied plan: the plan it was copied from (§2.1). */
  copiedFrom?: string
}

export interface SeedCampaign {
  _id: string
  planId: string
  conferenceId: string
  key: string
  title: string
  startMilestone: Milestone
  startOffsetDays: number
  endMilestone: Milestone
  endOffsetDays: number
  /** YYYY-MM-DD */
  startDate: string
  endDate: string
  provisional: boolean
  primaryOutcome: Outcome
  outcomeTargetPage: string | null
  target: number | null
  triggers: CampaignTrigger[]
  optional: boolean
}

export interface SeedPlan {
  plan: SeedPlanRecord
  campaigns: SeedCampaign[]
  tasks: SeedTask[]
  posts: SeedPost[]
  variants: SeedVariant[]
}

/** The plan document id is deterministic: one plan per edition (§2.1). */
export function planIdFor(conferenceId: string): string {
  return `marketingPlan.${conferenceId}`
}

/** A recipe seeds when it is dated by the Template itself. */
function seedsAtCreation(recipe: TaskRecipe): boolean {
  return (
    recipe.anchor !== undefined &&
    recipe.cadence === undefined &&
    recipe.subjectSource === 'none'
  )
}

export function expandTemplate(input: SeedInput): SeedPlan {
  const { template, conference, ownerId, now, newId } = input
  const optionalKeys = new Set(
    template.campaigns.filter((c) => c.optional).map((c) => c.key),
  )
  for (const key of input.includeOptional) {
    if (!optionalKeys.has(key)) {
      throw new Error(`Seed: "${key}" is not an optional Campaign`)
    }
  }
  const include = new Set(input.includeOptional)
  const milestones = resolveAllMilestones(conference)

  const plan: SeedPlanRecord = {
    _id: planIdFor(conference._id),
    conferenceId: conference._id,
    ownerId,
    templateVersion: template.version,
    createdAt: now,
  }

  const values = conferenceValuesFor(conference)
  const campaigns: SeedCampaign[] = []
  const records = emptyRecords()

  for (const recipe of template.campaigns) {
    if (recipe.optional && !include.has(recipe.key)) continue
    const start = resolveAnchor(recipe.start, milestones)
    const end = resolveAnchor(recipe.end, milestones)
    const campaignId = newId('marketingCampaign')
    const capacity = conference.ticketCapacity
    campaigns.push({
      _id: campaignId,
      planId: plan._id,
      conferenceId: conference._id,
      key: recipe.key,
      title: recipe.title,
      startMilestone: recipe.start.milestone,
      startOffsetDays: recipe.start.offsetDays,
      endMilestone: recipe.end.milestone,
      endOffsetDays: recipe.end.offsetDays,
      startDate: start.date,
      endDate: end.date,
      provisional: start.provisional || end.provisional,
      primaryOutcome: recipe.primaryOutcome,
      outcomeTargetPage: recipe.outcomeTargetPage ?? null,
      target:
        recipe.target && capacity
          ? Math.round(recipe.target.shareOfCapacity * capacity)
          : null,
      triggers: recipe.triggers.map((t) => ({ ...t })),
      optional: recipe.optional,
    })

    const context = {
      campaign: { _id: campaignId, key: recipe.key },
      planId: plan._id,
      conference: { _id: conference._id, baseUrl: conference.baseUrl },
      values,
      assigneeId: ownerId,
    }

    // Ids first, so a Prerequisite can point forward within the Campaign.
    // A publishing recipe whose key already went out is dropped, so a reseed
    // after a deletion does not re-offer a post the edition has published.
    const published = input.publishedKeys ?? new Set<string>()
    const seeded = recipe.recipes.filter(
      (r) =>
        seedsAtCreation(r) &&
        !(r.kind === 'publishing' && published.has(r.key)),
    )
    const idByKey = new Map(seeded.map((r) => [r.key, newId('marketingTask')]))

    for (const r of seeded) {
      const anchor = r.anchor!
      const { date, provisional } = resolveAnchor(anchor, milestones)
      appendRecords(
        records,
        materializeTask({
          ...context,
          recipe: r,
          taskId: idByKey.get(r.key)!,
          key: r.key,
          at: slotAt(date, recipeSlotTime(r)),
          anchor,
          provisional,
          prerequisiteIds: (r.prerequisites ?? [])
            .map((key) => idByKey.get(key))
            .filter((id): id is string => id !== undefined),
          origin: 'template',
          newId,
        }),
      )
    }

    // Subjectless cadences expand now: their dates are all known (§5.4).
    appendRecords(
      records,
      expandCampaignSubjectless({
        ...context,
        template: recipe,
        milestones,
        now,
        taskId: () => newId('marketingTask'),
        newId,
      }),
    )
  }

  return { plan, campaigns, ...records }
}
