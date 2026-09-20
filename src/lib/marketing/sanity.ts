import { randomUUID } from 'node:crypto'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { scopedFetch } from '@/lib/sanity/scoped'
import { mediaDeletionBlockers } from '@/lib/social/media-deletion'
import { getCurrentDateTime } from '@/lib/time'
import type { VariantStatus } from '@/lib/social/types'
import type { Milestone } from './milestones'
import type { TaskRecords } from './materialize'
import { recipeToStored } from './recipes'
import type {
  SeedCampaign,
  SeedPlan,
  SeedPost,
  SeedTask,
  SeedVariant,
} from './seed'
import { totalEngagement } from '@/lib/social/provider'
import type {
  CampaignTrigger,
  CampaignView,
  LedgerSnapshot,
  StoredCampaignLedger,
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

type Ref = ReturnType<typeof ref>

/** The `socialPost` document a Task's post is created as. */
export function postDocument(p: SeedPost, conference: Ref, now: string) {
  return {
    _id: p._id,
    _type: 'socialPost',
    conference,
    body: p.body,
    defaultScheduledAt: p.defaultScheduledAt,
    createdBy: weakRef(p.createdBy),
    createdAt: now,
    updatedAt: now,
  }
}

/** The draft `socialPostVariant` document a publishing Task is created with. */
export function variantDocument(v: SeedVariant, conference: Ref, now: string) {
  return {
    _id: v._id,
    _type: 'socialPostVariant',
    post: weakRef(v.postId),
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
  }
}

/** The `marketingTask` document. Every array member carries a `_key`. */
export function taskDocument(t: SeedTask, conference: Ref) {
  return {
    _id: t._id,
    _type: 'marketingTask',
    // Weak owner references (#1084): a strong one makes Sanity refuse to
    // delete the Campaign or plan, after the Task chunks have already gone.
    campaign: weakRef(t.campaignId),
    plan: weakRef(t.planId),
    conference,
    key: t.key,
    title: t.title,
    kind: t.kind,
    ...(t.channel ? { channel: t.channel } : {}),
    ...(t.milestone
      ? { milestone: t.milestone, offsetDays: t.offsetDays ?? 0 }
      : {}),
    ...(t.dueAt ? { dueAt: t.dueAt } : {}),
    provisional: t.provisional,
    plannedAt: t.plannedAt,
    ...(t.status ? { status: t.status } : {}),
    assignee: weakRef(t.assigneeId),
    prerequisites: t.prerequisiteIds.map((id) => ({
      _key: randomUUID(),
      ...weakRef(id),
    })),
    ...(t.variantId ? { variant: weakRef(t.variantId) } : {}),
    ...(t.targetPage ? { targetPage: t.targetPage } : {}),
    ...(t.subject ? { subject: weakRef(t.subject._id) } : {}),
    ...(t.copyEdited ? { copyEdited: true } : {}),
    ...(t.alt ? { alt: t.alt } : {}),
    ...(t.instructions ? { instructions: t.instructions } : {}),
    origin: t.origin,
  }
}

/** A Trigger as an array member: Sanity requires a `_key` on each. */
export function triggerMember(t: CampaignTrigger) {
  return {
    _key: randomUUID(),
    _type: 'marketingTrigger' as const,
    event: t.event,
    taskRecipeKey: t.taskRecipeKey,
  }
}

/** Seeding, copying and "add a built-in Campaign" all create a Campaign here. */
export function campaignDocument(c: SeedCampaign, conference: Ref) {
  return {
    _id: c._id,
    _type: 'marketingCampaign' as const,
    plan: weakRef(c.planId),
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
    ...(c.outcomeTargetPage ? { outcomeTargetPage: c.outcomeTargetPage } : {}),
    ...(c.target !== null ? { target: c.target } : {}),
    triggers: c.triggers.map(triggerMember),
    recipes: c.recipes.map(recipeToStored),
    generatedKeys: c.generatedKeys,
    optional: c.optional,
  }
}

/**
 * Persist an expanded (or copied) plan: plan, Campaigns, Tasks, posts and
 * variants, in one transaction so a partial plan can never exist. The plan
 * is `create`d (never `createIfNotExists`): a plan that already exists fails
 * the WHOLE transaction rather than silently duplicating its Campaigns
 * underneath. Every array member carries a `_key` (Sanity requires it).
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
    ...(seed.plan.copiedFrom
      ? { copiedFrom: weakRef(seed.plan.copiedFrom) }
      : {}),
    createdAt: seed.plan.createdAt,
    updatedAt: now,
  })

  for (const c of seed.campaigns) tx.create(campaignDocument(c, conference))

  for (const p of seed.posts) tx.create(postDocument(p, conference, now))
  for (const v of seed.variants) tx.create(variantDocument(v, conference, now))
  for (const t of seed.tasks) tx.create(taskDocument(t, conference))

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
  structurallyEdited: boolean | null
  _id: string
  ownerId: string | null
  ownerName: string | null
  templateVersion: string | null
  copiedFromTitle: string | null
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
  handoffPending: boolean | null
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
  "handoffPending": kind == "studioRender" && defined(asset.asset) && count(*[
    _type == "marketingTask" && conference._ref == $conferenceId &&
    campaign._ref == ^.campaign._ref && kind == "publishing" &&
    ^._id in prerequisites[]._ref && defined(variant._ref) &&
    !(variant._ref in coalesce(^.handoffDoneFor, [])) &&
    !(_id in path("drafts.**")) && !(_id in path("versions.**"))
  ]) > 0,
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
  const outreachSent =
    (t.kind === 'speakerOutreach' || t.kind === 'sponsorOutreach') &&
    !!t.messageId
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
    // Outreach completion is presented as done, without writing a status.
    status: publishing
      ? (t.variant?.status ?? 'draft')
      : outreachSent
        ? 'done'
        : (t.status ?? 'open'),
    complete: isComplete(t),
    handoffPending: t.handoffPending === true,
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
      templateVersion, structurallyEdited,
      "copiedFromTitle": copiedFrom->conference->title,
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
      structurallyEdited: row.structurallyEdited === true,
      copiedFromTitle: row.copiedFromTitle ?? null,
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
  assetId: string | null
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
      "assetId": asset.asset._ref,
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
    messageId: row.messageId ?? null,
    assetUrl: row.assetUrl ?? null,
    assetId: row.assetId ?? null,
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

export async function commitOrConflict(tx: {
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
  campaign?: { id: string; rev?: string },
): Promise<boolean> {
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction().patch(taskId, (p) => {
    const set = p.ifRevisionId(rev).set({ ...fields, updatedAt: now })
    return unset.length > 0 ? set.unset(unset) : set
  })
  // Prerequisite edits advance the Campaign revision in the same transaction.
  // Handoff pending is derived independently from current recipients.
  if (campaign) {
    tx.patch(campaign.id, (p) =>
      (campaign.rev ? p.ifRevisionId(campaign.rev) : p).set({ updatedAt: now }),
    )
  }
  return commitOrConflict(tx)
}

export interface ApproveTaskInput {
  taskId: string
  taskRev: string
  by: string
  /** ISO datetime. */
  at: string
  /**
   * Publishing Kind: the variant that moves `draft → scheduled` (§3.2),
   * with the tagged link re-derived at approval (§3.4).
   */
  variant: { id: string; rev: string; scheduledAt: string; link: string } | null
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
    const { id, rev, scheduledAt, link } = input.variant
    tx.patch(id, (p) =>
      p.ifRevisionId(rev).set({
        status: 'scheduled',
        scheduledAt,
        link,
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
    // groq-global-scoped: a by-id ownership check on the post id carried by the variant this conference-scoped caller already admitted.
    const ownQuery = groq`count(*[_type == "socialPost" && _id == $postId && conference._ref == $conferenceId]) > 0`
    const ownPost = await clientReadUncached.fetch<boolean | null>(
      ownQuery,
      { conferenceId: input.conferenceId, postId },
      { cache: 'no-store' },
    )
    // "Was this the last variant?" used to be a count of LIVE, same-conference
    // siblings, which missed a draft-only sibling, a Content Release version and
    // a variant on another edition — safe only while `variant.post` was strong
    // and Sanity refused the delete itself. Shared with the other two paths that
    // delete a post, so the guard cannot go missing from just one of them.
    const removed = [postId, `drafts.${postId}`, id, `drafts.${id}`]
    const keepPost =
      ownPost !== true ||
      (await mediaDeletionBlockers([postId], removed)).length > 0
    tx.patch(id, (p) => p.ifRevisionId(rev).set({ updatedAt: now }))
    tx.delete(id)
    tx.delete(`drafts.${id}`)
    if (!keepPost) {
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

/**
 * The id of this edition's plan document, or null. Seeding gives it a
 * deterministic id, but a plan restored from a backup or made in the Studio
 * carries another one — so every write resolves it rather than rebuilding it.
 */
export async function getPlanId(conferenceId: string): Promise<string | null> {
  const id = await scopedFetch<string | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingPlan" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]._id`,
    {},
    { cache: 'no-store' },
  )
  return id ?? null
}

/**
 * Delegate the plan (spec §3.1). Tasks already assigned keep their assignee;
 * Tasks created from now on (Triggers, expansion) are assigned to the new
 * owner. False when the edition has no plan.
 */
export async function setPlanOwner(
  conferenceId: string,
  ownerId: string,
): Promise<boolean> {
  const planId = await getPlanId(conferenceId)
  if (!planId) return false
  await clientWrite
    .patch(planId)
    .set({ owner: weakRef(ownerId), updatedAt: getCurrentDateTime() })
    .commit()
  return true
}

// ---------------------------------------------------------------------------
// The Campaign ledger (#1018)
// ---------------------------------------------------------------------------

/** Whether the stored reading measured a different basis than the Campaign now has. */
/**
 * A reading measured under a DIFFERENT metric is not this Campaign's number and
 * is dropped. A reading measured over a different WINDOW is — it counted the
 * same thing over a different span, so it is shown with that span named.
 *
 * Dropping on the window too was a worse bug than the one it fixed: #1078
 * re-dates Campaign windows whenever a Milestone is set, so the ledger blanked
 * its own reading during normal operation until the next nightly snapshot.
 */
function measuredUnderAnotherMetric(row: {
  primaryOutcome?: Outcome | null
  snapshot?: RawLedgerSnapshot | null
}): boolean {
  const outcome = row.snapshot?.campaignPrimaryOutcome
  return !!outcome && outcome !== row.primaryOutcome
}

/** The span a reading covered, when it is no longer the Campaign's own. */
function measuredWindow(row: {
  startDate?: string | null
  endDate?: string | null
  snapshot?: RawLedgerSnapshot | null
}): { startDate: string; endDate: string } | null {
  const { campaignStartDate: start, campaignEndDate: end } = row.snapshot ?? {}
  if (!start || !end) return null
  return start === row.startDate && end === row.endDate
    ? null
    : { startDate: start, endDate: end }
}

interface RawLedgerSnapshot {
  /** The Campaign document this reading was taken against. */
  measuredCampaignId?: string | null
  campaignPrimaryOutcome?: Outcome | null
  campaignStartDate?: string | null
  campaignEndDate?: string | null
  date: string | null
  takenAt: string | null
  primaryOutcomeValue: number | null
  primaryOutcomeAttributed: boolean | null
  primaryOutcomeAttributedValue: number | null
  secondary: {
    attributedSessions: number | null
    checkoutClickThrough: number | null
    blueskyInteractions: number | null
  } | null
  perTask:
    | {
        taskId: string | null
        taskKey?: string | null
        sessions: number | null
        clicks: number | null
        blueskyLikes: number | null
        blueskyReposts: number | null
        blueskyReplies: number | null
        blueskyQuotes: number | null
      }[]
    | null
  source: {
    posthog: 'ok' | 'unavailable' | null
    bluesky: 'ok' | 'unavailable' | null
  } | null
}

interface RawLedger {
  _id: string
  key: string | null
  title: string | null
  startDate: string | null
  endDate: string | null
  provisional: boolean | null
  startMilestone: Milestone | null
  endMilestone: Milestone | null
  primaryOutcome: Outcome | null
  outcomeTargetPage: string | null
  target: number | null
  optional: boolean | null
  tasks: RawTaskView[] | null
  snapshot: RawLedgerSnapshot | null
}

/**
 * One Campaign, its Tasks and its LATEST stored reading, in one tenant-scoped
 * round trip — or null when the id is not this conference's Campaign.
 *
 * READS SNAPSHOTS ONLY (spec §6.4). The ledger never calls PostHog or Bluesky:
 * a page that queried a vendor on every open would be slow, rate-limited and
 * inconsistent with the Report, which reads the same daily rows.
 *
 * Every nested root repeats the conference predicate and the drafts/versions
 * exclusion — a Task or a Snapshot pointing at this Campaign from another
 * edition is not this ledger's.
 */
export async function getCampaignLedger(
  campaignId: string,
  conferenceId: string,
): Promise<StoredCampaignLedger | null> {
  const row = await scopedFetch<RawLedger | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingCampaign" && _id == $campaignId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{
      _id, key, title, startDate, endDate, provisional, startMilestone, endMilestone,
      primaryOutcome, outcomeTargetPage, target, optional,
      "tasks": *[_type == "marketingTask" && conference._ref == $conferenceId && campaign._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{${TASK_VIEW_FIELDS}
      },
      "snapshot": *[_type == "marketingSnapshot" && conference._ref == $conferenceId && (campaignKey == ^.key || (!defined(campaignKey) && campaign._ref == ^._id)) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(date desc, takenAt desc, _id desc)[0]{
        "measuredCampaignId": campaign._ref,
        date, takenAt, campaignPrimaryOutcome, campaignStartDate, campaignEndDate,
        primaryOutcomeValue, primaryOutcomeAttributed,
        primaryOutcomeAttributedValue, secondary, source,
        "perTask": perTask[]{ "taskId": task._ref, taskKey, sessions, clicks, blueskyLikes, blueskyReposts, blueskyReplies, blueskyQuotes }
      }
    }`,
    { campaignId },
    { cache: 'no-store' },
  )
  if (!row) return null

  return {
    campaign: {
      _id: row._id,
      key: row.key ?? '',
      title: row.title ?? row.key ?? '',
      startDate: row.startDate ?? '',
      endDate: row.endDate ?? '',
      provisional: row.provisional === true,
      startMilestone: row.startMilestone ?? 'CONFERENCE_START',
      endMilestone: row.endMilestone ?? 'CONFERENCE_END',
      primaryOutcome: row.primaryOutcome ?? 'attributedSessions',
      outcomeTargetPage: row.outcomeTargetPage ?? null,
      target: row.target ?? null,
      optional: row.optional === true,
    },
    tasks: toTaskViews(row.tasks),
    // A stored reading only describes THIS Campaign if it measured the same
    // thing. The outcome is the obvious half; the WINDOW is the other, because
    // `strictWindow` counts cfpSubmissions and ticketsSoldInWindow strictly
    // inside the Campaign's dates — so after a window edit (or a reseed of the
    // same key with different dates) the old count would sit under the new
    // dates and read as current. Same rule as `sameMeasurementBasis` in the
    // Report. A pre-migration row carries none of these fields and is trusted,
    // since it predates the ability to edit a window at all.
    // A READING FROM A PREVIOUS INCARNATION OF THIS CAMPAIGN KEY.
    //
    // Deletion preserves Snapshots on purpose, and the delete dialog invites
    // the organizer to seed a new plan afterwards. The Template then recreates
    // Campaigns with the SAME stable keys, and this join matches on the key so
    // that history survives a Campaign being deleted — so the previous plan's
    // last reading reappeared as the new Campaign's "latest reading". With an
    // unchanged Outcome and window neither existing guard fired, so it rendered
    // with no annotation at all: a brand-new plan showing last cycle's numbers
    // as current.
    //
    // The key match stays — it is what preserves history — but a reading taken
    // against a different Campaign document says so. Only the seeder reproduces
    // a stable key; the Campaign editor mints `custom-<uuid>`, so a key that
    // matches across two documents means a reseed or a restore.
    snapshot: toLedgerSnapshot(
      row.snapshot,
      row.tasks ?? [],
      measuredWindow(row),
      measuredUnderAnotherMetric(row)
        ? (row.snapshot?.campaignPrimaryOutcome ?? null)
        : null,
      !!row.snapshot?.measuredCampaignId &&
        row.snapshot.measuredCampaignId !== row._id,
    ),
  }
}

/**
 * A stored reading with no `date` is not a reading. Everything else keeps its
 * nulls: an absent count means the source was unavailable, never zero (§2.4).
 */
function toLedgerSnapshot(
  raw: RawLedgerSnapshot | null,
  tasks: RawTaskView[],
  measured: LedgerSnapshot['measuredWindow'] = null,
  otherOutcome: Outcome | null = null,
  beforeReseed = false,
): LedgerSnapshot | null {
  if (!raw?.date) return null
  return {
    date: raw.date,
    measuredWindow: measured,
    measuredOutcome: otherOutcome,
    measuredBeforeReseed: beforeReseed,
    takenAt: raw.takenAt ?? null,
    source: {
      posthog: raw.source?.posthog ?? null,
      bluesky: raw.source?.bluesky ?? null,
    },
    // Only the PRIMARY values measured the Outcome. Dropping the whole reading
    // over an Outcome edit blanked the funnel and every per-Task row too — and
    // those come from the attributed window alone, so the Outcome cannot change
    // them. The ledger then said "No reading has been taken for this campaign
    // yet", which was simply untrue, until the next nightly snapshot. Same
    // principle as `measuredWindow`: keep what is still true, name what is not.
    primaryValue: otherOutcome ? null : (raw.primaryOutcomeValue ?? null),
    primaryAttributed: raw.primaryOutcomeAttributed !== false,
    primaryAttributedValue: otherOutcome
      ? null
      : (raw.primaryOutcomeAttributedValue ?? null),
    secondary: {
      attributedSessions: raw.secondary?.attributedSessions ?? null,
      checkoutClickThrough: raw.secondary?.checkoutClickThrough ?? null,
      blueskyInteractions: raw.secondary?.blueskyInteractions ?? null,
    },
    // Dropped wholesale across a reseed. These rows measured Tasks that no
    // longer exist, and the `taskKey` rebinding below would hand their numbers
    // to the freshly seeded Task that reused the key — so a never-published
    // draft displayed last cycle's sessions, clicks and Bluesky engagement.
    // The snapshot WRITER already refuses the mirror image of this
    // (`orphanedPublication` rows are filtered out of new perTask arrays);
    // the reader now agrees with it.
    perTask: (beforeReseed ? [] : (raw.perTask ?? []))
      .filter(
        (entry): entry is typeof entry & { taskId: string } => !!entry.taskId,
      )
      .map((entry) => ({
        taskId:
          (entry.taskKey &&
            tasks.find((task) => task.key === entry.taskKey)?._id) ||
          entry.taskId,
        sessions: entry.sessions ?? null,
        clicks: entry.clicks ?? null,
        blueskyInteractions: totalEngagement([
          {
            likes: entry.blueskyLikes ?? null,
            reposts: entry.blueskyReposts ?? null,
            replies: entry.blueskyReplies ?? null,
            quotes: entry.blueskyQuotes ?? null,
          },
        ]),
      })),
  }
}

/** Manual Tasks and optional Channel sibling are one structural edit. A failed
 * transaction cannot leave an unowned draft post or a false divergence marker. */
export async function createMarketingTask(
  records: TaskRecords,
  conferenceId: string,
  planRev?: string | null,
): Promise<boolean> {
  const conference = ref(conferenceId)
  const now = getCurrentDateTime()
  const tx = clientWrite.transaction()
  for (const post of records.posts)
    tx.create(postDocument(post, conference, now))
  for (const variant of records.variants)
    tx.create(variantDocument(variant, conference, now))
  for (const task of records.tasks) tx.create(taskDocument(task, conference))
  // COMPARE-AND-SET ON THE PLAN, when the caller read one.
  //
  // This makes Task creation and plan/Campaign deletion mutually exclusive in
  // BOTH directions. Deletion already guards the plan in its first bundle, so a
  // Task created after the delete started loses; without this, a Task whose
  // validation read happened BEFORE the delete and whose commit landed after it
  // still succeeded — creating a Task, post and variant holding a weak
  // reference to a Campaign that no longer exists, with no multi-chunk delete
  // required. The plan is the right document to guard: it is the parent both
  // operations already touch, and unlike the Campaign it is not held open by an
  // editor with a latched revision.
  //
  // The cost is that two organizers creating Tasks in the same plan at the same
  // moment conflict, and one is asked to retry. That is recoverable; an
  // orphaned Task with no Campaign is not visible anywhere it can be managed.
  for (const planId of new Set(records.tasks.map((task) => task.planId))) {
    tx.patch(planId, (patch) =>
      (planRev ? patch.ifRevisionId(planRev) : patch).set({
        structurallyEdited: true,
        updatedAt: now,
      }),
    )
  }
  return commitOrConflict(tx)
}
