/**
 * TASK MATERIALIZATION — pure. One recipe plus a date becomes the records a
 * Task consists of: the Task, and for a publishing Task its post and draft
 * variant with the tagged link (spec §2.3, §3.4). Seeding, the recurring
 * expansion, the Triggers and the plan copy all build Tasks through here, so
 * a Task looks the same whichever of them created it.
 *
 * No `node:crypto` here: the admin stories import seeding. Ids come in.
 */

import { formatConferenceDateLong, osloLocalInputToIso } from '@/lib/time'
import type { VariantStatus } from '@/lib/social/types'
import { taggedUrl } from './link'
import type { Milestone, ResolvedMilestone } from './milestones'
import {
  eventTagFor,
  resolvePlaceholders,
  type Placeholder,
} from './placeholders'
import type { Anchor, TaskRecipe } from './template/types'
import type {
  MarketingChannel,
  TaskKind,
  TaskOrigin,
  TaskStatus,
} from './types'

/** Wall-clock slot per Channel in Europe/Oslo (playbook §2: LinkedIn mornings, Bluesky evenings). */
export const CHANNEL_SLOT: Record<MarketingChannel, string> = {
  linkedin: '08:00',
  bluesky: '18:00',
}
export const WORK_SLOT = '09:00'

/** Adds whole days to a YYYY-MM-DD string in UTC, so no DST shift leaks in. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  )
}

export function resolveAnchor(
  anchor: Anchor,
  milestones: Record<Milestone, ResolvedMilestone>,
): { date: string; provisional: boolean } {
  const m = milestones[anchor.milestone]
  return {
    date: addDaysToDate(m.date, anchor.offsetDays),
    provisional: m.provisional,
  }
}

/** A YYYY-MM-DD date at an Oslo wall-clock time, as an ISO instant. */
export function slotAt(date: string, time: string): string {
  const iso = osloLocalInputToIso(`${date}T${time}`)
  if (!iso) throw new Error(`Cannot place ${date} ${time} in Oslo time`)
  return iso
}

/**
 * The Oslo time a Task is placed at on its day: its Channel's slot for a
 * publishing Task, the work slot otherwise. Seeding, re-dating and manual
 * creation all ask here, so a re-date never moves a Task it just placed.
 */
export function slotTimeFor(task: {
  kind: TaskKind
  channel?: MarketingChannel | null
}): string {
  return task.kind === 'publishing' && task.channel
    ? CHANNEL_SLOT[task.channel]
    : WORK_SLOT
}

/** The slice of a conference the copy skeletons read. */
export interface ConferenceValuesSource {
  title: string
  city: string
  venueName?: string | null
  startDate?: string | null
}

export type PlaceholderValues = Partial<Record<Placeholder, string>>

export function conferenceValuesFor(
  conference: ConferenceValuesSource,
): PlaceholderValues {
  return {
    event: conference.title,
    date: formatConferenceDateLong(conference.startDate ?? ''),
    // No venue yet: say so rather than doubling the city ("at Bergen, Bergen").
    venue: conference.venueName || 'a venue to be announced',
    city: conference.city,
    eventTag: eventTagFor(conference.title),
  }
}

/**
 * A generated Task's key: the recipe key with the discriminator (a subject id,
 * or a countdown day) before the Channel — `speakerCard:<speakerId>:bluesky`,
 * `speakerCardRender:<speakerId>` (spec §2.3).
 */
export function generatedTaskKey(recipeKey: string, discriminator: string) {
  const channelAt = recipeKey.lastIndexOf(':')
  return channelAt === -1
    ? `${recipeKey}:${discriminator}`
    : `${recipeKey.slice(0, channelAt)}:${discriminator}${recipeKey.slice(channelAt)}`
}

/** The beat a Task key belongs to: everything before the first `:`. */
export function beatOf(taskKey: string): string {
  return taskKey.split(':')[0]
}

export interface SubjectLink {
  _id: string
  type: 'speaker' | 'sponsor' | 'talk'
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
  /** Absent for Trigger-created Tasks and Tasks dated by hand (§2.3). */
  milestone?: Milestone
  offsetDays?: number
  /** ISO datetime; only for non-publishing Kinds. */
  dueAt?: string
  provisional: boolean
  /** Last instant computed by the plan; diverging dates are organizer-owned. */
  plannedAt: string
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
  subject?: SubjectLink
  /** The copy is an organizer's own words, not the Template's (§3.1). */
  copyEdited?: boolean
  /** Seeded from a Template Recipe that kept an edition's literal copy. */
  verbatimCopy?: boolean
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

export interface TaskRecords {
  tasks: SeedTask[]
  posts: SeedPost[]
  variants: SeedVariant[]
}

export const emptyRecords = (): TaskRecords => ({
  tasks: [],
  posts: [],
  variants: [],
})

export function appendRecords(into: TaskRecords, from: TaskRecords): void {
  into.tasks.push(...from.tasks)
  into.posts.push(...from.posts)
  into.variants.push(...from.variants)
}

export interface MaterializeInput {
  recipe: TaskRecipe
  taskId: string
  key: string
  campaign: { _id: string; key: string }
  planId: string
  conference: { _id: string; baseUrl: string }
  values: PlaceholderValues
  /** ISO instant: the variant's time, or the Task's `dueAt`. */
  at: string
  anchor: Anchor | null
  provisional: boolean
  assigneeId: string
  prerequisiteIds: string[]
  subject?: SubjectLink
  origin: TaskOrigin
  /** Id source for the post and variant; receives the document type. */
  newId: (type: string) => string
  /** Overrides for the body/alt (a copied Task keeps its edited copy). */
  body?: string
  alt?: string
  /** Carried onto the Task, so the NEXT copy knows the copy is theirs. */
  copyEdited?: boolean
}

export function materializeTask(input: MaterializeInput): TaskRecords {
  const { recipe: r, conference } = input
  const task: SeedTask = {
    _id: input.taskId,
    campaignId: input.campaign._id,
    planId: input.planId,
    conferenceId: conference._id,
    key: input.key,
    title: r.title,
    kind: r.kind,
    channel: r.channel ?? null,
    ...(input.anchor
      ? {
          milestone: input.anchor.milestone,
          offsetDays: input.anchor.offsetDays,
        }
      : {}),
    provisional: input.provisional,
    plannedAt: input.at,
    assigneeId: input.assigneeId,
    prerequisiteIds: input.prerequisiteIds,
    origin: input.origin,
    ...(input.subject ? { subject: input.subject } : {}),
    ...(input.copyEdited ? { copyEdited: true } : {}),
    ...(r.verbatim ? { verbatimCopy: true } : {}),
  }
  const alt =
    input.alt ?? (r.alt ? resolvePlaceholders(r.alt, input.values) : undefined)
  if (alt) task.alt = alt

  // Task metadata for EVERY Kind: a post's instructions ("tag the speaker")
  // are read in the Task editor exactly as a checklist's are.
  if (r.instructions) task.instructions = r.instructions

  if (r.kind !== 'publishing') {
    if (r.targetPage) task.targetPage = r.targetPage
    task.dueAt = input.at
    task.status = 'open'
    return { tasks: [task], posts: [], variants: [] }
  }

  const channel = r.channel!
  const link = taggedUrl({
    baseUrl: conference.baseUrl,
    targetPage: r.targetPage!,
    channel,
    campaignKey: input.campaign.key,
    taskKey: input.key,
  })
  const body =
    input.body ??
    resolvePlaceholders(r.skeleton ?? '', { ...input.values, url: link })
  const postId = input.newId('socialPost')
  const variantId = input.newId('socialPostVariant')
  task.postId = postId
  task.variantId = variantId
  task.targetPage = r.targetPage
  return {
    tasks: [task],
    posts: [
      {
        _id: postId,
        conferenceId: conference._id,
        body,
        defaultScheduledAt: input.at,
        createdBy: input.assigneeId,
      },
    ],
    variants: [
      {
        _id: variantId,
        conferenceId: conference._id,
        postId,
        platform: channel,
        body,
        link,
        scheduledAt: input.at,
        status: 'draft',
      },
    ],
  }
}
