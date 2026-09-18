/**
 * PLAN COPY — pure (spec §3.1 "Copy", #1017). Next year starts from this
 * year: last edition's Campaigns and Tasks become this edition's plan.
 *
 * - Each Task keeps its Milestone + offset; a hand-moved Task is re-anchored
 *   to the Milestone nearest the date it was moved to. Either way it is
 *   re-dated against the new edition with the fallback rule, so a Milestone
 *   the new edition has not set yet flags the date provisional.
 * - Trigger- and expansion-origin Tasks are NOT copied (their events and
 *   subjects belong to last year); the Campaigns' Triggers are, and the
 *   countdown is expanded afresh, as at seeding.
 * - Copy the organizer never edited is written again for the new edition;
 *   edited copy is kept, with only the tagged link swapped.
 * - Everything starts over: drafts and open Tasks, assigned to the organizer
 *   copying (the new plan's owner), no approvals, assets or reminders.
 */

import { osloTodayDateString } from '@/lib/time'
import { expandCampaignSubjectless } from './expansion'
import {
  appendRecords,
  conferenceValuesFor,
  daysBetween,
  emptyRecords,
  materializeTask,
  recipeSlotTime,
  resolveAnchor,
  slotAt,
  type ConferenceValuesSource,
} from './materialize'
import { taggedUrl } from './link'
import {
  MILESTONES,
  resolveAllMilestones,
  type Milestone,
  type MilestoneSource,
  type ResolvedMilestone,
} from './milestones'
import { resolvePlaceholders } from './placeholders'
import {
  planIdFor,
  type SeedCampaign,
  type SeedConference,
  type SeedPlan,
} from './seed'
import type { Anchor, PlanTemplate, TaskRecipe } from './template/types'
import type { MarketingChannel, TaskKind, TaskOrigin } from './types'

/** Origins that belong to the edition they were made in (§3.1). */
const NOT_COPIED: readonly TaskOrigin[] = ['trigger', 'expansion']

export interface CopySourceTask {
  _id: string
  campaignId: string
  key: string
  title: string
  kind: TaskKind
  channel: MarketingChannel | null
  milestone: Milestone | null
  offsetDays: number | null
  dueAt: string | null
  origin: TaskOrigin | null
  prerequisiteIds: string[]
  targetPage: string | null
  alt: string | null
  instructions: string | null
  /** True once an organizer saved the post with their own words (§3.1). */
  copyEdited: boolean | null
  variant: {
    body: string
    link: string | null
    scheduledAt: string | null
  } | null
}

export interface CopySource {
  plan: { _id: string }
  conference: MilestoneSource & ConferenceValuesSource
  campaigns: Omit<
    SeedCampaign,
    'planId' | 'conferenceId' | 'startDate' | 'endDate' | 'provisional'
  >[]
  tasks: CopySourceTask[]
}

export interface CopyInput {
  source: CopySource
  template: PlanTemplate
  conference: SeedConference
  ownerId: string
  now: string
  newId: (type: string) => string
  /**
   * Task keys already published in the TARGET edition, from the surviving
   * variants' tagged links. See `SeedInput.publishedKeys`: a whole-plan delete
   * keeps published posts on purpose, so copying a previous edition's plan over
   * the top re-offered posts this edition has already sent.
   */
  publishedKeys?: ReadonlySet<string>
}

export function copyTemplateVersion(sourcePlanId: string): string {
  return `copy:${sourcePlanId}`
}

/**
 * Did an organizer write this Task's copy themselves? The Task records it
 * when a save changes the body; for a Task from before that was recorded,
 * the skeleton's shape is the best evidence there is.
 */
function isEdited(task: CopySourceTask, skeleton: string | undefined): boolean {
  if (task.copyEdited === true) return true
  if (task.copyEdited === false) return false
  return !isTemplateText(task.variant?.body ?? null, skeleton)
}

/** A `{placeholder}` token in a copy skeleton. */
const PLACEHOLDER_TOKEN = /\{[a-zA-Z]+\}/

/**
 * Does this text still read as the Template's skeleton, whatever its
 * placeholders were filled in with? Compared by SHAPE — the skeleton's
 * literal text with every `{placeholder}` free to be anything — never by
 * re-rendering the skeleton with today's conference values, which drift (a
 * venue announced since seeding, a skeleton reworded in a later Template) and
 * would call untouched copy edited.
 */
export function isTemplateText(
  text: string | null,
  skeleton: string | undefined,
): boolean {
  if (text === null || !skeleton) return false
  // Scanned left to right rather than matched with a regex of `[\s\S]*?`
  // joins: same lazy semantics, linear in the text, and no skeleton — however
  // many placeholders a later Template puts side by side — can make the copy
  // mutation hang on backtracking.
  const literals = skeleton.split(PLACEHOLDER_TOKEN)
  const last = literals.length - 1
  // A skeleton with no placeholder at all is the text itself, exactly:
  // extending it ("Conference logo" → "Conference logo on blue") is an edit.
  if (last === 0) return text === literals[0]
  let at = 0
  for (const [index, literal] of literals.entries()) {
    if (index === 0) {
      if (!text.startsWith(literal)) return false
      at = literal.length
      continue
    }
    if (index === last) {
      // The tail must finish the text, and must not overlap what is matched.
      return literal === ''
        ? true
        : text.endsWith(literal) && text.length - literal.length >= at
    }
    if (literal === '') continue
    const found = text.indexOf(literal, at)
    if (found === -1) return false
    at = found + literal.length
  }
  return true
}

/**
 * The Milestone nearest a date, with the signed offset to it. Only Milestones
 * the source edition actually SET count: a fallback date is a guess, and a
 * Task anchored to a guess would follow nothing real. Ties go to the earlier
 * Milestone in the canonical order.
 */
export function reanchor(
  date: string,
  milestones: Record<Milestone, ResolvedMilestone>,
): Anchor {
  let best: Anchor | null = null
  for (const milestone of MILESTONES) {
    const m = milestones[milestone]
    if (m.provisional) continue
    const offsetDays = daysBetween(m.date, date)
    if (!best || Math.abs(offsetDays) < Math.abs(best.offsetDays)) {
      best = { milestone, offsetDays }
    }
  }
  // The six required Milestones are never provisional, so there is a best.
  return best!
}

function sourceDate(task: CopySourceTask): string | null {
  const at = task.kind === 'publishing' ? task.variant?.scheduledAt : task.dueAt
  return at ? osloTodayDateString(new Date(at)) : null
}

/**
 * The anchor a copied Task inherits. A stored Milestone + offset counts only
 * while it still explains where the Task sits: re-timing a publishing Task
 * from the post editor moves its variant without touching the anchor, and
 * setting a Milestone a Task was seeded against provisionally leaves the Task
 * where it was. When the two disagree, the date the organizer is looking at
 * wins and the Task re-anchors to the Milestone nearest it. A Task with no
 * date keeps its anchor, or failing that starts at its Campaign.
 */
function sourceAnchor(input: {
  task: CopySourceTask
  date: string | null
  sourceMilestones: Record<Milestone, ResolvedMilestone> | null
  campaign: SeedCampaign
}): Anchor {
  const { task, date, sourceMilestones, campaign } = input
  const stored: Anchor | null = task.milestone
    ? { milestone: task.milestone, offsetDays: task.offsetDays ?? 0 }
    : null
  if (!date || !sourceMilestones) {
    return (
      stored ?? {
        milestone: campaign.startMilestone,
        offsetDays: campaign.startOffsetDays,
      }
    )
  }
  if (stored && resolveAnchor(stored, sourceMilestones).date === date) {
    return stored
  }
  return reanchor(date, sourceMilestones)
}

function isSitePath(
  page: string | null | undefined,
  baseUrl: string,
): page is string {
  if (!page) return false
  try {
    taggedUrl({
      baseUrl,
      targetPage: page,
      channel: 'bluesky',
      campaignKey: 'x',
      taskKey: 'x',
    })
    return true
  } catch {
    return false
  }
}

export function copyPlan(input: CopyInput): SeedPlan {
  const { source, conference, ownerId, now, newId } = input
  const target = resolveAllMilestones(conference)
  let sourceMilestones: Record<Milestone, ResolvedMilestone> | null
  try {
    sourceMilestones = resolveAllMilestones(source.conference)
  } catch {
    // A source edition missing a required date cannot re-anchor hand-moved
    // Tasks; they fall back to their Campaign start below.
    sourceMilestones = null
  }
  const values = conferenceValuesFor(conference)
  const planId = planIdFor(conference._id)

  const plan = {
    _id: planId,
    conferenceId: conference._id,
    ownerId,
    templateVersion: copyTemplateVersion(source.plan._id),
    copiedFrom: source.plan._id,
    createdAt: now,
  }

  const campaigns: SeedCampaign[] = []
  const campaignById = new Map<string, SeedCampaign>()
  for (const c of source.campaigns) {
    const start = resolveAnchor(
      { milestone: c.startMilestone, offsetDays: c.startOffsetDays },
      target,
    )
    const end = resolveAnchor(
      { milestone: c.endMilestone, offsetDays: c.endOffsetDays },
      target,
    )
    const copied: SeedCampaign = {
      _id: newId('marketingCampaign'),
      planId,
      conferenceId: conference._id,
      key: c.key,
      title: c.title,
      startMilestone: c.startMilestone,
      startOffsetDays: c.startOffsetDays,
      endMilestone: c.endMilestone,
      endOffsetDays: c.endOffsetDays,
      startDate: start.date,
      endDate: end.date,
      provisional: start.provisional || end.provisional,
      primaryOutcome: c.primaryOutcome,
      outcomeTargetPage: c.outcomeTargetPage,
      target: c.target,
      triggers: c.triggers.map((t) => ({ ...t })),
      optional: c.optional,
    }
    campaigns.push(copied)
    campaignById.set(c._id, copied)
  }

  const tasks = source.tasks.filter(
    (t) =>
      !(t.origin && NOT_COPIED.includes(t.origin)) &&
      // Outreach recipients must be selected with standing in the new edition.
      t.kind !== 'speakerOutreach' &&
      t.kind !== 'sponsorOutreach' &&
      campaignById.has(t.campaignId) &&
      // Already sent in the TARGET edition — a whole-plan delete keeps
      // published posts on purpose, so copying over the top must not re-offer
      // them. Filtered HERE, before the id map below: skipping inside the loop
      // instead left an id minted for a Task that is never created, so any
      // copied Task whose prerequisite pointed at it carried a weak reference
      // to nothing and plan health reported it as waiting for ever.
      !(t.kind === 'publishing' && input.publishedKeys?.has(t.key)),
  )
  // A render whose every publishing dependant has already gone out is dropped
  // too. Copying only the posts away left the render behind with nothing to
  // feed: open work asking the organizer to recreate an asset no remaining Task
  // can use. Same rule the generator applies in `pendingRecipes`.
  const publishedKeys = input.publishedKeys
  const dependantsOf = (render: (typeof tasks)[number]) =>
    source.tasks.filter(
      (t) =>
        t.kind === 'publishing' &&
        t.campaignId === render.campaignId &&
        t.prerequisiteIds.includes(render._id),
    )
  const kept = publishedKeys
    ? tasks.filter((t) => {
        if (t.kind !== 'studioRender') return true
        const dependants = dependantsOf(t)
        return (
          dependants.length === 0 ||
          !dependants.every((d) => publishedKeys.has(d.key))
        )
      })
    : tasks
  const idBySource = new Map(kept.map((t) => [t._id, newId('marketingTask')]))
  const records = emptyRecords()

  for (const t of kept) {
    const campaign = campaignById.get(t.campaignId)!
    const templateCampaign = input.template.campaigns.find(
      (c) => c.key === campaign.key,
    )
    const templateRecipe = templateCampaign?.recipes.find(
      (r) => r.key === t.key,
    )

    const anchor = sourceAnchor({
      task: t,
      date: sourceDate(t),
      sourceMilestones,
      campaign,
    })
    const dated = resolveAnchor(anchor, target)

    const targetPage = isSitePath(t.targetPage, conference.baseUrl)
      ? t.targetPage
      : (templateRecipe?.targetPage ?? '/')
    const recipe: TaskRecipe = {
      key: t.key,
      beat: t.key.split(':')[0],
      title: t.title,
      kind: t.kind,
      ...(t.channel ? { channel: t.channel } : {}),
      subjectSource: 'none',
      ...(t.kind === 'publishing' ? { targetPage } : {}),
      ...(templateRecipe?.skeleton
        ? { skeleton: templateRecipe.skeleton }
        : {}),
      ...(t.instructions ? { instructions: t.instructions } : {}),
    }
    if (t.kind === 'publishing' && !t.channel) continue

    // Copy that still reads as the Template wrote it is written again for the
    // new edition; anything else is the organizer's and is kept — and the
    // copy carries the fact, so the edition after this one knows it too.
    const edited = isEdited(t, templateRecipe?.skeleton)
    let body: string | undefined
    if (t.kind === 'publishing') {
      const link = taggedUrl({
        baseUrl: conference.baseUrl,
        targetPage,
        channel: t.channel!,
        campaignKey: campaign.key,
        taskKey: t.key,
      })
      const v = t.variant
      if (v && edited) {
        body = v.link ? v.body.split(v.link).join(link) : v.body
      } else if (!templateRecipe?.skeleton) {
        body = v?.body ?? ''
      }
    }
    const alt =
      t.alt === null
        ? undefined
        : isTemplateText(t.alt, templateRecipe?.alt)
          ? resolvePlaceholders(templateRecipe!.alt!, values)
          : t.alt

    appendRecords(
      records,
      materializeTask({
        recipe,
        taskId: idBySource.get(t._id)!,
        key: t.key,
        campaign: { _id: campaign._id, key: campaign.key },
        planId,
        conference: { _id: conference._id, baseUrl: conference.baseUrl },
        values,
        at: slotAt(dated.date, recipeSlotTime(recipe)),
        anchor,
        provisional: dated.provisional,
        assigneeId: ownerId,
        prerequisiteIds: t.prerequisiteIds
          .map((id) => idBySource.get(id))
          .filter((id): id is string => id !== undefined),
        origin: 'copy',
        newId,
        ...(edited ? { copyEdited: true } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(alt !== undefined ? { alt } : {}),
      }),
    )
  }

  // The countdown is expansion-origin: expanded afresh for the new edition.
  for (const campaign of campaigns) {
    const templateCampaign = input.template.campaigns.find(
      (c) => c.key === campaign.key,
    )
    if (!templateCampaign) continue
    appendRecords(
      records,
      expandCampaignSubjectless({
        template: templateCampaign,
        milestones: target,
        now,
        campaign: { _id: campaign._id, key: campaign.key },
        planId,
        conference: { _id: conference._id, baseUrl: conference.baseUrl },
        values,
        assigneeId: ownerId,
        taskId: () => newId('marketingTask'),
        newId,
        publishedKeys: input.publishedKeys,
      }),
    )
  }

  return { plan, campaigns, ...records }
}
