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
  StoredTaskEditorData,
  TaskEditorTask,
  TaskKind,
  TaskOrigin,
  TaskStatus,
  TaskView,
} from './types'
import type { TaskSubjectRef } from './pages'

/**
 * Sanity persistence for the Marketing Plan. Seeding writes everything in ONE
 * transaction; the timeline reads the plan, its Campaigns and its Tasks in
 * ONE tenant-scoped round trip.
 */

const ref = (id: string) => ({ _type: 'reference' as const, _ref: id })
const weakRef = (id: string) => ({ ...ref(id), _weak: true })

/**
 * A Sanity "document already exists" on `create` OF THE PLAN — its id is
 * deterministic per edition, so a concurrent second seed lands here. Every
 * other id in the transaction is a fresh UUID; a 409 that does not name the
 * plan is not "the plan exists" and is rethrown.
 */
function isPlanAlreadyExists(error: unknown, planId: string): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  const message = error instanceof Error ? error.message : ''
  return (
    (statusCode === 409 || /already exists/i.test(message)) &&
    message.includes(planId)
  )
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
      ...(t.alt ? { alt: t.alt } : {}),
      ...(t.instructions ? { instructions: t.instructions } : {}),
      origin: t.origin,
    })
  }

  try {
    await tx.commit()
  } catch (error) {
    if (isPlanAlreadyExists(error, seed.plan._id)) {
      return { committed: false, reason: 'exists' }
    }
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
  tasks: RawTaskView[] | null
}

interface RawTaskView {
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
  approvedAt: string | null
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
}

/**
 * The fields a Task chip is drawn from. The variant is followed only when it
 * belongs to the same conference as the Task, so a hand-edited cross-tenant
 * reference yields "unscheduled draft" rather than another tenant's status.
 */
const TASK_VIEW_FIELDS = `
  _id,
  "campaignId": campaign._ref,
  key, title, kind, channel, dueAt, provisional, milestone, status, approvedAt,
  "prerequisiteIds": prerequisites[]._ref,
  "variantId": select(variant->conference._ref == conference._ref => variant._ref),
  "assigneeId": assignee._ref,
  "hasAsset": defined(asset.asset),
  messageId,
  "variant": select(variant->conference._ref == conference._ref => variant->{ status, scheduledAt, "url": publishResult.url })`

export interface StoredPlanView {
  plan: PlanSummary
  campaigns: CampaignView[]
  tasks: TaskView[]
}

/** The Kind's completion rule (spec §2.3). */
function isComplete(task: RawTaskView): boolean {
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

/** A raw row with a Campaign and a Kind is a Task the timeline can draw. */
function isDrawable(
  t: RawTaskView,
): t is RawTaskView & { campaignId: string; kind: TaskKind } {
  return !!t.campaignId && !!t.kind
}

function toTaskView(
  t: RawTaskView & { campaignId: string; kind: TaskKind },
): TaskView {
  const publishing = t.kind === 'publishing'
  return {
    _id: t._id,
    campaignId: t.campaignId,
    key: t.key ?? '',
    title: t.title ?? t.key ?? '',
    kind: t.kind,
    channel: t.channel ?? null,
    date: publishing ? (t.variant?.scheduledAt ?? null) : (t.dueAt ?? null),
    provisional: t.provisional === true,
    milestone: t.milestone ?? null,
    status: publishing ? (t.variant?.status ?? 'draft') : (t.status ?? 'open'),
    complete: isComplete(t),
    prerequisiteIds: (t.prerequisiteIds ?? []).filter(
      (id): id is string => typeof id === 'string',
    ),
    variantId: t.variantId ?? null,
    assigneeId: t.assigneeId ?? null,
    approvedAt: t.approvedAt ?? null,
  }
}

function toTaskViews(rows: RawTaskView[] | null): TaskView[] {
  return (rows ?? []).filter(isDrawable).map(toTaskView)
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
    `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id,
      "ownerId": owner._ref,
      "ownerName": owner->name,
      templateVersion,
      createdAt,
      "campaigns": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(startDate asc){
        _id, key, title, startDate, endDate, provisional, startMilestone, endMilestone, primaryOutcome, target, optional
      },
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{${TASK_VIEW_FIELDS}
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

  const tasks = toTaskViews(row.tasks)

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

// ---------------------------------------------------------------------------
// The Task editor (#1012)
// ---------------------------------------------------------------------------

interface RawTaskEditor extends RawTaskView {
  _rev: string
  approvedByName: string | null
  assigneeName: string | null
  targetPage: string | null
  instructions: string | null
  externalUrl: string | null
  skipReason: string | null
  origin: TaskOrigin | null
  assetUrl: string | null
  subject: {
    _id: string
    _type: string
    name: string | null
    slug: string | null
  } | null
  campaign: { _id: string; key: string | null; title: string | null } | null
  planOwnerId: string | null
  siblings: RawTaskView[] | null
}

const SUBJECT_TYPES: Record<string, TaskSubjectRef['type']> = {
  speaker: 'speaker',
  sponsor: 'sponsor',
  talk: 'talk',
}

/**
 * The Task the editor opens, with its Campaign, the plan owner and the other
 * Tasks of the SAME Campaign (the Prerequisites picker, spec §2.3), or null.
 * The root and the siblings root both carry the conference predicate; the
 * Campaign is followed only within the conference. The variant's editor
 * data is a separate by-id read (`getSocialVariantEditorData`) the caller
 * makes once this read has proven the variant is the Task's and ours.
 */
export async function getTaskEditorData(
  taskId: string,
  conferenceId: string,
): Promise<StoredTaskEditorData | null> {
  const row = await scopedFetch<RawTaskEditor | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && _id == $taskId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{${TASK_VIEW_FIELDS},
      _rev,
      "approvedByName": approvedBy->name,
      "assigneeName": assignee->name,
      targetPage, instructions, externalUrl, skipReason, origin,
      "assetUrl": asset.asset->url,
      "subject": subject->{ _id, _type, "name": coalesce(name, title), "slug": slug.current },
      "campaign": select(campaign->conference._ref == conference._ref => campaign->{ _id, key, title }),
      "planOwnerId": plan->owner._ref,
      "siblings": *[_type == "marketingTask" && conference._ref == $conferenceId && campaign._ref == ^.campaign._ref && _id != ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{${TASK_VIEW_FIELDS}
      }
    }`,
    { taskId },
    { cache: 'no-store' },
  )
  if (!row || !isDrawable(row) || !row.campaign) return null
  const subjectType = row.subject ? SUBJECT_TYPES[row.subject._type] : undefined
  const task: TaskEditorTask = {
    ...toTaskView(row),
    _rev: row._rev,
    approvedByName: row.approvedByName ?? null,
    assigneeName: row.assigneeName ?? null,
    targetPage: row.targetPage ?? null,
    instructions: row.instructions ?? null,
    externalUrl: row.externalUrl ?? null,
    skipReason: row.skipReason ?? null,
    subject:
      row.subject && subjectType
        ? {
            _id: row.subject._id,
            type: subjectType,
            name: row.subject.name ?? '',
            slug: row.subject.slug ?? null,
          }
        : null,
    assetUrl: row.assetUrl ?? null,
    origin: row.origin ?? null,
  }
  return {
    task,
    campaign: {
      _id: row.campaign._id,
      key: row.campaign.key ?? '',
      title: row.campaign.title ?? row.campaign.key ?? '',
    },
    planOwnerId: row.planOwnerId ?? null,
    siblings: toTaskViews(row.siblings),
    variant: null,
  }
}

export interface TaskLinkInputs {
  kind: TaskKind
  channel: MarketingChannel | null
  taskKey: string
  campaignKey: string
  variantId: string | null
}

/** What the tagged link (spec §3.4) is derived from, or null. */
export async function getTaskLinkInputs(
  taskId: string,
  conferenceId: string,
): Promise<TaskLinkInputs | null> {
  const row = await scopedFetch<{
    kind: TaskKind | null
    channel: MarketingChannel | null
    taskKey: string | null
    campaignKey: string | null
    variantId: string | null
  } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && _id == $taskId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      kind, channel, "taskKey": key,
      "campaignKey": select(campaign->conference._ref == conference._ref => campaign->key),
      "variantId": select(variant->conference._ref == conference._ref => variant._ref)
    }`,
    { taskId },
    { cache: 'no-store' },
  )
  if (!row?.kind || !row.taskKey || !row.campaignKey) return null
  return {
    kind: row.kind,
    channel: row.channel ?? null,
    taskKey: row.taskKey,
    campaignKey: row.campaignKey,
    variantId: row.variantId ?? null,
  }
}

/**
 * The Task of this conference that owns a variant, or null. The posting
 * core asks before it lets a variant's link be edited or its post deleted
 * (spec §2.3, §3.4).
 */
export async function getTaskForVariant(
  variantId: string,
  conferenceId: string,
): Promise<string | null> {
  const id = await scopedFetch<string | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && variant._ref == $variantId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]._id`,
    { variantId },
    { cache: 'no-store' },
  )
  return id ?? null
}

/** Assignees are the conference's organizers (spec §2.3, `assignee` → organizer). */
export async function isConferenceOrganizer(
  conferenceId: string,
  speakerId: string,
): Promise<boolean> {
  // groq-global-scoped: by the conference id, which is the tenant key itself.
  const query = `count(*[_type == "conference" && _id == $conferenceId && $speakerId in organizers[]._ref]) > 0`
  const result = await clientReadUncached.fetch<boolean | null>(
    query,
    { conferenceId, speakerId },
    { cache: 'no-store' },
  )
  return result === true
}

function isRevisionConflict(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision') && message.includes('mismatch')
}

async function commitOrConflict(tx: {
  commit: () => Promise<unknown>
}): Promise<boolean> {
  try {
    await tx.commit()
    return true
  } catch (error) {
    if (isRevisionConflict(error)) return false
    throw error
  }
}

/**
 * Set (and unset) fields on a Task, compare-and-set on the revision the
 * caller read: two organizers ticking the same checklist, or one approving
 * while another skips, cannot both land. False = the Task changed.
 */
export async function updateTaskFields(
  taskId: string,
  rev: string,
  fields: Record<string, unknown>,
  unset: string[] = [],
): Promise<boolean> {
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction().patch(taskId, (p) => {
    const set = p.ifRevisionId(rev).set({ ...fields, updatedAt: now })
    return unset.length > 0 ? set.unset(unset) : set
  })
  return commitOrConflict(tx)
}

export interface ApproveTaskInput {
  taskId: string
  taskRev: string
  by: string
  /** ISO datetime. */
  at: string
  /** Publishing Kind: the variant that moves `draft → scheduled` (§3.2). */
  variant: { id: string; rev: string; scheduledAt: string } | null
}

/**
 * Approval in ONE transaction: the variant enters `scheduled` (a fresh
 * scheduling cycle, so `attemptCount` restarts) and the Task records who
 * approved it and when. Both are compare-and-set, so a cron claim or a
 * colleague's edit in between conflicts instead of being overwritten.
 */
export async function approveTask(input: ApproveTaskInput): Promise<boolean> {
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction()
  if (input.variant) {
    const { id, rev, scheduledAt } = input.variant
    tx.patch(id, (p) =>
      p.ifRevisionId(rev).set({
        status: 'scheduled',
        scheduledAt,
        attemptCount: 0,
        updatedAt: now,
      }),
    )
  }
  tx.patch(input.taskId, (p) =>
    p.ifRevisionId(input.taskRev).set({
      approvedBy: weakRef(input.by),
      approvedAt: input.at,
      updatedAt: now,
    }),
  )
  return commitOrConflict(tx)
}

export interface SetTaskDateInput {
  taskId: string
  taskRev: string
  /** ISO datetime. */
  at: string
  /** Publishing Kind: the variant whose `scheduledAt` is the Task's date. */
  variant: { id: string; rev: string } | null
}

/**
 * Move a Task by hand. A publishing Task's date IS its variant's time
 * (pinned: `usesCustomTime`), any other Kind's is `dueAt`. Either way the
 * Task loses its Milestone anchor and its provisional flag (spec §2.6: a
 * hand-moved Task no longer follows the Milestone).
 */
export async function setTaskDate(input: SetTaskDateInput): Promise<boolean> {
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction()
  if (input.variant) {
    tx.patch(input.variant.id, (p) =>
      p.ifRevisionId(input.variant!.rev).set({
        scheduledAt: input.at,
        usesCustomTime: true,
        updatedAt: now,
      }),
    )
  }
  tx.patch(input.taskId, (p) =>
    p
      .ifRevisionId(input.taskRev)
      .set({
        ...(input.variant ? {} : { dueAt: input.at }),
        provisional: false,
        updatedAt: now,
      })
      .unset(['milestone', 'offsetDays']),
  )
  return commitOrConflict(tx)
}

export interface DeleteTaskInput {
  taskId: string
  taskRev: string
  conferenceId: string
  /** Publishing Kind: the variant (and post) created with the Task. */
  variant: { id: string; rev: string; postId: string } | null
  /** Tasks listing this one as a Prerequisite; the reference is dropped. */
  dependantIds: string[]
}

/**
 * Delete a Task and, for a publishing Task, its variant and its post (when
 * no other variant is left on it) in ONE transaction (spec §2.3). The
 * caller has refused an in-flight or published variant; the variant and
 * the Task are still guarded by a compare-and-set patch in the same
 * transaction, so a cron claim landing in between aborts the delete.
 * Draft twins go too: a surviving twin could be published back.
 */
export async function deleteTask(input: DeleteTaskInput): Promise<boolean> {
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction()
  for (const id of input.dependantIds) {
    // The id is interpolated into a JSONMatch path. It passed the tenancy
    // guard, so it names an existing Sanity document, and Sanity ids are
    // [A-Za-z0-9._-]: a quote can never reach this string.
    tx.patch(id, (p) => p.unset([`prerequisites[_ref == "${input.taskId}"]`]))
  }
  if (input.variant) {
    const { id, rev, postId } = input.variant
    // The post goes only when it is OURS and this was its last variant. The
    // post id came off the variant (a weak reference), so its conference is
    // checked here rather than trusted.
    const query = `{
      "others": count(*[_type == "socialPostVariant" && conference._ref == $conferenceId && post._ref == $postId && _id != $variantId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]),
      "ownPost": count(*[_type == "socialPost" && _id == $postId && conference._ref == $conferenceId]) > 0
    }`
    const row = await clientReadUncached.fetch<{
      others: number | null
      ownPost: boolean | null
    } | null>(
      query,
      { conferenceId: input.conferenceId, postId, variantId: id },
      { cache: 'no-store' },
    )
    tx.patch(id, (p) => p.ifRevisionId(rev).set({ updatedAt: now }))
    tx.delete(id)
    tx.delete(`drafts.${id}`)
    if (row?.ownPost === true && !row.others) {
      tx.delete(postId)
      tx.delete(`drafts.${postId}`)
    }
  }
  tx.patch(input.taskId, (p) =>
    p.ifRevisionId(input.taskRev).set({ updatedAt: now }),
  )
  tx.delete(input.taskId)
  tx.delete(`drafts.${input.taskId}`)
  return commitOrConflict(tx)
}
