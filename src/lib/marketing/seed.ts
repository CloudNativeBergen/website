/**
 * TEMPLATE EXPANSION — pure. Turns a Plan Template plus one conference into
 * the records a seeded plan consists of (spec §3.1 "Create", §5), with ids
 * already assigned so Prerequisites and variants can reference each other
 * before anything is written. `sanity.ts` persists the result in one
 * transaction; the router supplies the conference from the request domain.
 *
 * What seeds: every recipe with an anchor, no cadence and no subject. Trigger
 * recipes are dated by their event and cadence recipes by the expansion —
 * both are DECLARED on the Campaign here and executed by later tickets.
 */

import { formatConferenceDateLong, osloLocalInputToIso } from '@/lib/time'
import type { VariantStatus } from '@/lib/social/types'
import { taggedUrl } from './link'
import {
  resolveAllMilestones,
  type Milestone,
  type MilestoneSource,
  type ResolvedMilestone,
} from './milestones'
import { eventTagFor, resolvePlaceholders } from './placeholders'
import type { Anchor, PlanTemplate, TaskRecipe } from './template/types'
import type {
  CampaignTrigger,
  MarketingChannel,
  Outcome,
  TaskKind,
  TaskOrigin,
  TaskStatus,
} from './types'

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
}

export interface SeedPlanRecord {
  _id: string
  conferenceId: string
  ownerId: string
  templateVersion: string
  createdAt: string
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

export interface SeedTask {
  _id: string
  campaignId: string
  planId: string
  conferenceId: string
  key: string
  title: string
  kind: TaskKind
  channel: MarketingChannel | null
  milestone: Milestone
  offsetDays: number
  /** ISO datetime; only for non-publishing Kinds. */
  dueAt?: string
  provisional: boolean
  /** Only for non-publishing Kinds. */
  status?: TaskStatus
  assigneeId: string
  prerequisiteIds: string[]
  /** Publishing Kind only. */
  postId?: string
  variantId?: string
  targetPage?: string
  /** Resolved alt-text skeleton for the image the beat carries. */
  alt?: string
  instructions?: string
  origin: TaskOrigin
}

export interface SeedPost {
  _id: string
  conferenceId: string
  body: string
  defaultScheduledAt: string
  createdBy: string
}

export interface SeedVariant {
  _id: string
  conferenceId: string
  postId: string
  platform: MarketingChannel
  body: string
  link: string
  scheduledAt: string
  status: VariantStatus
}

export interface SeedPlan {
  plan: SeedPlanRecord
  campaigns: SeedCampaign[]
  tasks: SeedTask[]
  posts: SeedPost[]
  variants: SeedVariant[]
}

/** Wall-clock slot per Channel in Europe/Oslo (playbook §2: LinkedIn mornings, Bluesky evenings). */
const CHANNEL_SLOT: Record<MarketingChannel, string> = {
  linkedin: '08:00',
  bluesky: '18:00',
}
const WORK_SLOT = '09:00'

/** Adds whole days to a YYYY-MM-DD string in UTC, so no DST shift leaks in. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The plan document id is deterministic: one plan per edition (§2.1). */
export function planIdFor(conferenceId: string): string {
  return `marketingPlan.${conferenceId}`
}

function resolveAnchor(
  anchor: Anchor,
  milestones: Record<Milestone, ResolvedMilestone>,
): { date: string; provisional: boolean } {
  const m = milestones[anchor.milestone]
  return {
    date: addDaysToDate(m.date, anchor.offsetDays),
    provisional: m.provisional,
  }
}

function slotAt(date: string, time: string): string {
  const iso = osloLocalInputToIso(`${date}T${time}`)
  if (!iso) throw new Error(`Seed: cannot place ${date} ${time} in Oslo time`)
  return iso
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

  const conferenceValues = {
    event: conference.title,
    date: formatConferenceDateLong(conference.startDate ?? ''),
    // No venue yet: say so rather than doubling the city ("at Bergen, Bergen").
    venue: conference.venueName || 'a venue to be announced',
    city: conference.city,
    eventTag: eventTagFor(conference.title),
  }

  const campaigns: SeedCampaign[] = []
  const tasks: SeedTask[] = []
  const posts: SeedPost[] = []
  const variants: SeedVariant[] = []

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

    // Ids first, so a Prerequisite can point forward within the Campaign.
    const seeded = recipe.recipes.filter(seedsAtCreation)
    const idByKey = new Map(seeded.map((r) => [r.key, newId('marketingTask')]))

    for (const r of seeded) {
      const anchor = r.anchor!
      const { date, provisional } = resolveAnchor(anchor, milestones)
      const prerequisiteIds = (r.prerequisites ?? [])
        .map((key) => idByKey.get(key))
        .filter((id): id is string => id !== undefined)
      const base = {
        _id: idByKey.get(r.key)!,
        campaignId,
        planId: plan._id,
        conferenceId: conference._id,
        key: r.key,
        title: r.title,
        kind: r.kind,
        channel: r.channel ?? null,
        milestone: anchor.milestone,
        offsetDays: anchor.offsetDays,
        provisional,
        assigneeId: ownerId,
        prerequisiteIds,
        origin: 'template' as const,
      }

      const alt = r.alt
        ? resolvePlaceholders(r.alt, conferenceValues)
        : undefined
      if (r.kind === 'publishing') {
        const channel = r.channel!
        const link = taggedUrl({
          baseUrl: conference.baseUrl,
          targetPage: r.targetPage!,
          channel,
          campaignKey: recipe.key,
          taskKey: r.key,
        })
        const body = resolvePlaceholders(r.skeleton!, {
          ...conferenceValues,
          url: link,
        })
        const scheduledAt = slotAt(date, CHANNEL_SLOT[channel])
        const postId = newId('socialPost')
        const variantId = newId('socialPostVariant')
        posts.push({
          _id: postId,
          conferenceId: conference._id,
          body,
          defaultScheduledAt: scheduledAt,
          createdBy: ownerId,
        })
        variants.push({
          _id: variantId,
          conferenceId: conference._id,
          postId,
          platform: channel,
          body,
          link,
          scheduledAt,
          status: 'draft',
        })
        tasks.push({
          ...base,
          postId,
          variantId,
          targetPage: r.targetPage,
          ...(alt ? { alt } : {}),
        })
      } else {
        tasks.push({
          ...base,
          dueAt: slotAt(date, WORK_SLOT),
          status: 'open',
          ...(alt ? { alt } : {}),
          ...(r.instructions ? { instructions: r.instructions } : {}),
        })
      }
    }
  }

  return { plan, campaigns, tasks, posts, variants }
}
