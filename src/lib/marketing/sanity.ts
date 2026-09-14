import { randomUUID } from 'node:crypto'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import type { VariantStatus } from '@/lib/social/types'
import type { Milestone } from './milestones'
import type { SeedPlan } from './seed'
import type {
  CampaignView,
  MarketingChannel,
  Outcome,
  PlanSummary,
  TaskKind,
  TaskStatus,
  TaskView,
} from './types'

/**
 * Sanity persistence for the Marketing Plan. Seeding writes everything in ONE
 * transaction; the timeline reads the plan, its Campaigns and its Tasks in
 * ONE tenant-scoped round trip.
 */

const ref = (id: string) => ({ _type: 'reference' as const, _ref: id })
const weakRef = (id: string) => ({ ...ref(id), _weak: true })

/**
 * A Sanity "document already exists" on `create` — the plan id is
 * deterministic per edition, so a concurrent second seed lands here.
 */
function isAlreadyExists(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('already exists')
}

export type CommitSeedPlanResult =
  { committed: true } | { committed: false; reason: 'exists' }

/**
 * Persist an expanded plan: plan, Campaigns, Tasks, posts and variants, in
 * one transaction so a partial plan can never exist. The plan is `create`d
 * (never `createIfNotExists`): a plan that already exists fails the WHOLE
 * transaction rather than silently duplicating its Campaigns underneath.
 * Every array member carries a `_key` (Sanity requires it).
 */
export async function commitSeedPlan(
  seed: SeedPlan,
): Promise<CommitSeedPlanResult> {
  const now = getCurrentDateTime()
  const conference = ref(seed.plan.conferenceId)
  const tx = clientWrite.transaction().create({
    _id: seed.plan._id,
    _type: 'marketingPlan',
    conference,
    owner: weakRef(seed.plan.ownerId),
    templateVersion: seed.plan.templateVersion,
    createdAt: seed.plan.createdAt,
    updatedAt: now,
  })

  for (const c of seed.campaigns) {
    tx.create({
      _id: c._id,
      _type: 'marketingCampaign',
      plan: ref(c.planId),
      conference,
      key: c.key,
      title: c.title,
      startMilestone: c.startMilestone,
      startOffsetDays: c.startOffsetDays,
      endMilestone: c.endMilestone,
      endOffsetDays: c.endOffsetDays,
      startDate: c.startDate,
      endDate: c.endDate,
      provisional: c.provisional,
      primaryOutcome: c.primaryOutcome,
      ...(c.outcomeTargetPage
        ? { outcomeTargetPage: c.outcomeTargetPage }
        : {}),
      ...(c.target !== null ? { target: c.target } : {}),
      triggers: c.triggers.map((t) => ({
        _key: randomUUID(),
        _type: 'marketingTrigger',
        event: t.event,
        taskRecipeKey: t.taskRecipeKey,
      })),
      optional: c.optional,
    })
  }

  for (const p of seed.posts) {
    tx.create({
      _id: p._id,
      _type: 'socialPost',
      conference,
      body: p.body,
      defaultScheduledAt: p.defaultScheduledAt,
      createdBy: weakRef(p.createdBy),
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const v of seed.variants) {
    tx.create({
      _id: v._id,
      _type: 'socialPostVariant',
      post: ref(v.postId),
      conference,
      platform: v.platform,
      body: v.body,
      link: v.link,
      status: v.status,
      scheduledAt: v.scheduledAt,
      usesCustomTime: false,
      attempts: [],
      attemptCount: 0,
      updatedAt: now,
    })
  }

  for (const t of seed.tasks) {
    tx.create({
      _id: t._id,
      _type: 'marketingTask',
      campaign: ref(t.campaignId),
      plan: ref(t.planId),
      conference,
      key: t.key,
      title: t.title,
      kind: t.kind,
      ...(t.channel ? { channel: t.channel } : {}),
      milestone: t.milestone,
      offsetDays: t.offsetDays,
      ...(t.dueAt ? { dueAt: t.dueAt } : {}),
      provisional: t.provisional,
      ...(t.status ? { status: t.status } : {}),
      assignee: weakRef(t.assigneeId),
      prerequisites: t.prerequisiteIds.map((id) => ({
        _key: randomUUID(),
        ...weakRef(id),
      })),
      ...(t.variantId ? { variant: weakRef(t.variantId) } : {}),
      ...(t.targetPage ? { targetPage: t.targetPage } : {}),
      ...(t.instructions ? { instructions: t.instructions } : {}),
      origin: t.origin,
    })
  }

  try {
    await tx.commit()
  } catch (error) {
    if (isAlreadyExists(error)) return { committed: false, reason: 'exists' }
    throw error
  }
  return { committed: true }
}

// ---------------------------------------------------------------------------
// The timeline read
// ---------------------------------------------------------------------------

interface RawPlanView {
  _id: string
  ownerId: string | null
  ownerName: string | null
  templateVersion: string | null
  createdAt: string | null
  campaigns:
    | {
        _id: string
        key: string | null
        title: string | null
        startDate: string | null
        endDate: string | null
        provisional: boolean | null
        startMilestone: Milestone | null
        endMilestone: Milestone | null
        primaryOutcome: Outcome | null
        target: number | null
        optional: boolean | null
      }[]
    | null
  tasks:
    | {
        _id: string
        campaignId: string | null
        key: string | null
        title: string | null
        kind: TaskKind | null
        channel: MarketingChannel | null
        dueAt: string | null
        provisional: boolean | null
        milestone: Milestone | null
        status: TaskStatus | null
        prerequisiteIds: (string | null)[] | null
        variantId: string | null
        assigneeId: string | null
        hasAsset: boolean | null
        messageId: string | null
        variant: {
          status: VariantStatus | null
          scheduledAt: string | null
          url: string | null
        } | null
      }[]
    | null
}

export interface StoredPlanView {
  plan: PlanSummary
  campaigns: CampaignView[]
  tasks: TaskView[]
}

/** The Kind's completion rule (spec §2.3). */
function isComplete(task: NonNullable<RawPlanView['tasks']>[number]): boolean {
  switch (task.kind) {
    case 'publishing':
      return task.variant?.status === 'published' && !!task.variant.url
    case 'studioRender':
      return task.hasAsset === true
    case 'speakerOutreach':
    case 'sponsorOutreach':
      return !!task.messageId
    case 'eventPageUpdate':
    case 'checklist':
      return task.status === 'done'
    default:
      return false
  }
}

/**
 * The plan of one conference with its Campaigns and Tasks, or null. Every
 * root — the plan and the two nested reads — carries the conference
 * predicate, and the plan membership is checked on top, so a Campaign or
 * Task of another plan (or tenant) never rides along. A publishing Task's
 * variant is followed only when it belongs to the same conference.
 */
export async function getPlanView(
  conferenceId: string,
): Promise<StoredPlanView | null> {
  const row = await scopedFetch<RawPlanView | null>(
    clientReadUncached,
    { conferenceId },
    // A plain literal, not a `groq` tag: the tenancy rule credits the builder's
    // splice only when the text is the argument itself.
    `*[_type == "marketingPlan" && !(_id in path("drafts.**"))][0]{
      _id,
      "ownerId": owner._ref,
      "ownerName": owner->name,
      templateVersion,
      createdAt,
      "campaigns": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**"))] | order(startDate asc){
        _id, key, title, startDate, endDate, provisional, startMilestone, endMilestone, primaryOutcome, target, optional
      },
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**"))]{
        _id,
        "campaignId": campaign._ref,
        key, title, kind, channel, dueAt, provisional, milestone, status,
        "prerequisiteIds": prerequisites[]._ref,
        "variantId": variant._ref,
        "assigneeId": assignee._ref,
        "hasAsset": defined(asset.asset),
        messageId,
        "variant": select(variant->conference._ref == conference._ref => variant->{ status, scheduledAt, "url": publishResult.url })
      }
    }`,
    {},
    { cache: 'no-store' },
  )
  if (!row) return null

  const campaigns: CampaignView[] = (row.campaigns ?? []).map((c) => ({
    _id: c._id,
    key: c.key ?? '',
    title: c.title ?? c.key ?? '',
    startDate: c.startDate ?? '',
    endDate: c.endDate ?? '',
    provisional: c.provisional === true,
    startMilestone: c.startMilestone ?? 'CONFERENCE_START',
    endMilestone: c.endMilestone ?? 'CONFERENCE_END',
    primaryOutcome: c.primaryOutcome ?? 'attributedSessions',
    target: c.target ?? null,
    optional: c.optional === true,
  }))

  const tasks: TaskView[] = (row.tasks ?? [])
    .filter((t) => t.campaignId && t.kind)
    .map((t) => {
      const publishing = t.kind === 'publishing'
      return {
        _id: t._id,
        campaignId: t.campaignId!,
        key: t.key ?? '',
        title: t.title ?? t.key ?? '',
        kind: t.kind!,
        channel: t.channel ?? null,
        date: publishing ? (t.variant?.scheduledAt ?? null) : (t.dueAt ?? null),
        provisional: t.provisional === true,
        milestone: t.milestone ?? null,
        status: publishing
          ? (t.variant?.status ?? 'draft')
          : (t.status ?? 'open'),
        complete: isComplete(t),
        prerequisiteIds: (t.prerequisiteIds ?? []).filter(
          (id): id is string => typeof id === 'string',
        ),
        variantId: t.variantId ?? null,
        assigneeId: t.assigneeId ?? null,
      }
    })

  return {
    plan: {
      _id: row._id,
      ownerId: row.ownerId ?? null,
      ownerName: row.ownerName ?? null,
      templateVersion: row.templateVersion ?? '',
      createdAt: row.createdAt ?? '',
    },
    campaigns,
    tasks,
  }
}
