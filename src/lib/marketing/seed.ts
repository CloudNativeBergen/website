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
  slotTimeFor,
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
import { BLANK_ORIGIN } from './origin'
import { publishedIn } from './recipes'
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
   * `(utm_campaign, utm_content)` pairs (`publishedPair`) whose post has
   * ALREADY been published in this edition, from the surviving variants'
   * tagged links (`publishedTaskKeys`).
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
  /**
   * The plan to expand onto, when it already exists ("add a built-in
   * Campaign"). A restored or Studio-made plan need not carry the
   * deterministic id, and every Campaign and Task must reference the real one.
   */
  planId?: string
}

export interface SeedPlanRecord {
  _id: string
  conferenceId: string
  ownerId: string
  /** The plan's origin, as `planOrigin` reads it (`origin.ts`). */
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
  /**
   * EVERY Recipe of the Campaign, static ones included (Templates spec §2.1).
   * Generation and copy read these and never the Template again, so the plan
   * is frozen at the Recipes it was given.
   */
  recipes: TaskRecipe[]
  /** Keys generated already: the subjectless cadences, expanded right here. */
  generatedKeys: string[]
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

/** A blank plan: the plan document and nothing else (Templates spec §3). */
export function blankPlan(
  input: Pick<SeedInput, 'ownerId' | 'now'> & { conferenceId: string },
): SeedPlan {
  return {
    plan: {
      _id: planIdFor(input.conferenceId),
      conferenceId: input.conferenceId,
      ownerId: input.ownerId,
      templateVersion: BLANK_ORIGIN,
      createdAt: input.now,
    },
    campaigns: [],
    ...emptyRecords(),
  }
}

/** A recipe seeds when it is dated by the Template itself. */
/** A static Recipe: materialized once, at seeding, then lookup-only (§2.1). */
export function seedsAtCreation(recipe: TaskRecipe): boolean {
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
    _id: input.planId ?? planIdFor(conference._id),
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
    const campaign: SeedCampaign = {
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
      recipes: structuredClone(recipe.recipes),
      generatedKeys: [],
      optional: recipe.optional,
    }
    campaigns.push(campaign)

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
    const published = publishedIn(input.publishedKeys, recipe.key)
    // ...and a render whose every dependant has already gone out. Dropping only
    // the posts left the beat's `studioRender` in the new plan with nothing to
    // feed: open work asking the organizer to recreate an asset no remaining
    // Task can use, and a plan-health figure inflated by it.
    //
    // A dependant is scoped to the render's OWN BEAT — explicitly through
    // `prerequisites`, or implicitly because `buildSubjectBeat` makes every
    // later recipe in the beat depend on the earlier non-publishing ones. Taking
    // "every later publishing recipe in the Campaign" instead kept a render
    // alive on an unrelated later beat: in a multi-beat Campaign, an unpublished
    // `cfpEncourage` post preserved `cfpOpenRender` although nothing surviving
    // referenced it.
    //
    // And a dependant of ANY kind counts. Prerequisites are editable for every
    // Kind, so a checklist that needs the asset keeps the render even when every
    // post in the beat has gone.
    const atCreation = recipe.recipes.filter(seedsAtCreation)
    const dependantsOfRender = (render: TaskRecipe, index: number) =>
      atCreation.filter(
        (d, i) =>
          d.key !== render.key &&
          (d.prerequisites?.includes(render.key) ||
            (d.beat === render.beat && i > index)),
      )
    const seeded = atCreation.filter((r, index) => {
      if (r.kind === 'publishing') return !published.has(r.key)
      if (r.kind !== 'studioRender') return true
      const dependants = dependantsOfRender(r, index)
      return (
        dependants.length === 0 ||
        !dependants.every(
          (d) => d.kind === 'publishing' && published.has(d.key),
        )
      )
    })
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
          at: slotAt(date, slotTimeFor(r)),
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

    // Subjectless cadences expand now, and ONLY now: their dates are all
    // known (§5.4), and the keys go on the Campaign's marker with them.
    const countdown = expandCampaignSubjectless({
      ...context,
      publishedKeys: input.publishedKeys,
      recipes: campaign.recipes,
      generatedKeys: new Set(campaign.generatedKeys),
      milestones,
      now,
      taskId: () => newId('marketingTask'),
      newId,
    })
    campaign.generatedKeys = countdown.tasks.map((t) => t.key)
    appendRecords(records, countdown)
  }

  return { plan, campaigns, ...records }
}
