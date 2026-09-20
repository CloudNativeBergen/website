/**
 * SAVE AS TEMPLATE — pure (Templates spec §6.1, §6.2). A plan becomes
 * Campaigns and Recipes, NEVER Tasks: a Task seeded or copied is represented
 * by the static Recipe it came from, a manual Task becomes a static Recipe
 * here, and Library Recipes are kept as stored. Seeding from the result is
 * therefore the same `expandTemplate` as seeding from the built-in.
 *
 * Out: assignees, status, approvals, assets, published posts, outreach Tasks,
 * and every Trigger- or expansion-origin Task (its Recipe is saved, the
 * instances are not). Campaign and Task keys are preserved.
 */

import {
  isEdited,
  isTemplateText,
  sourceAnchor,
  sourceDate,
  type CopySource,
  type CopySourceTask,
} from '../copy'
import { resolveAllMilestones, type ResolvedMilestones } from '../milestones'
import { CONFERENCE_PLACEHOLDERS, unknownTokens } from '../placeholders'
import { seedsAtCreation } from '../seed'
import type { Anchor, CampaignRecipe, TaskRecipe } from '../template/types'

export interface SaveSource extends CopySource {
  /** For saving a Target as a share of capacity (§6.1). */
  ticketCapacity: number | null
}

/** What the organizer decided in the review list, by Task id. */
export interface SaveDecisions {
  anchors?: Record<string, Anchor>
  copy?: Record<string, string>
}

export type ReviewItem = {
  taskId: string
  title: string
  campaignTitle: string
} & (
  | { type: 'anchor'; anchor: Anchor; date: string | null }
  | { type: 'copy'; text: string }
)

type SourceCampaign = SaveSource['campaigns'][number]

/** The Tasks a Template represents: not outreach, not generated instances. */
function savedTasks(source: SaveSource, campaign: SourceCampaign) {
  return source.tasks.filter(
    (t) =>
      t.campaignId === campaign._id &&
      t.origin !== 'trigger' &&
      t.origin !== 'expansion' &&
      t.kind !== 'speakerOutreach' &&
      t.kind !== 'sponsorOutreach' &&
      !(t.kind === 'publishing' && !t.channel),
  )
}

function milestonesOf(source: SaveSource): ResolvedMilestones | null {
  try {
    return resolveAllMilestones(source.conference)
  } catch {
    return null
  }
}

const anchorOf = (
  task: CopySourceTask,
  campaign: SourceCampaign,
  milestones: ResolvedMilestones | null,
) =>
  sourceAnchor({
    task,
    date: sourceDate(task),
    sourceMilestones: milestones,
    campaign,
  })

/** The post as written, with this edition's tagged link back as `{url}`. */
function literalCopy(task: CopySourceTask): string {
  const v = task.variant
  if (!v) return ''
  return v.link ? v.body.split(v.link).join('{url}') : v.body
}

/**
 * Copy that is one edition's own words: written by hand, or seeded from a
 * Template that kept it verbatim and never rewritten since — which is asked
 * about again on every save, so the flag cannot wear off by being ignored.
 */
const carriesLiteralCopy = (task: CopySourceTask, stored?: TaskRecipe) =>
  task.kind === 'publishing' &&
  literalCopy(task) !== '' &&
  (!stored?.skeleton || stored.verbatim || isEdited(task, stored.skeleton))

/** Exactly the Tasks that need a decision before the plan is saved (§6.2). */
export function savePreview(source: SaveSource): ReviewItem[] {
  const milestones = milestonesOf(source)
  return source.campaigns.flatMap((campaign) =>
    savedTasks(source, campaign).flatMap((task): ReviewItem[] => {
      const about = {
        taskId: task._id,
        title: task.title,
        campaignTitle: campaign.title,
      }
      const stored = campaign.recipes.find((r) => r.key === task.key)
      return [
        ...(task.milestone === null
          ? [
              {
                ...about,
                type: 'anchor' as const,
                anchor: anchorOf(task, campaign, milestones),
                date: sourceDate(task),
              },
            ]
          : []),
        ...(carriesLiteralCopy(task, stored)
          ? [{ ...about, type: 'copy' as const, text: literalCopy(task) }]
          : []),
      ]
    }),
  )
}

/**
 * Why the literal copy cannot be saved; empty when it can. A static Task has
 * no subject, so only conference placeholders can ever be filled in (§6.2) —
 * checked on the text that WILL be saved, rewritten or not.
 */
export function copyIssues(
  source: SaveSource,
  decisions: SaveDecisions,
): string[] {
  return savePreview(source).flatMap((item) => {
    if (item.type !== 'copy') return []
    const unknown = unknownTokens(
      decisions.copy?.[item.taskId] ?? item.text,
      CONFERENCE_PLACEHOLDERS,
    )
    return unknown.length > 0
      ? [
          `${item.title}: ${unknown.join(', ')} cannot be filled in for a Task like this one.`,
        ]
      : []
  })
}

export function buildTemplate(
  source: SaveSource,
  decisions: SaveDecisions,
): CampaignRecipe[] {
  const milestones = milestonesOf(source)
  return source.campaigns.map((campaign) => {
    const tasks = savedTasks(source, campaign)
    const keyById = new Map(tasks.map((t) => [t._id, t.key]))
    const staticRecipe = (task: CopySourceTask): TaskRecipe => {
      const stored = campaign.recipes.find((r) => r.key === task.key)
      const literal = carriesLiteralCopy(task, stored)
      const rewritten = decisions.copy?.[task._id]
      const skeleton = literal
        ? (rewritten ?? literalCopy(task))
        : stored?.skeleton
      const alt =
        task.alt !== null && !isTemplateText(task.alt, stored?.alt)
          ? task.alt
          : stored?.alt
      const prerequisites = task.prerequisiteIds.flatMap(
        (id) => keyById.get(id) ?? [],
      )
      const targetPage = task.targetPage ?? stored?.targetPage
      return {
        key: task.key,
        beat: stored?.beat ?? task.key.split(':')[0],
        title: task.title,
        kind: task.kind,
        ...(task.channel ? { channel: task.channel } : {}),
        anchor:
          (task.milestone === null ? decisions.anchors?.[task._id] : null) ??
          anchorOf(task, campaign, milestones),
        ...(prerequisites.length > 0 || stored?.prerequisites
          ? { prerequisites }
          : {}),
        ...(targetPage ? { targetPage } : {}),
        subjectSource: 'none',
        ...(skeleton ? { skeleton } : {}),
        ...(literal &&
        (rewritten === undefined ||
          rewritten.trim() === literalCopy(task).trim())
          ? { verbatim: true }
          : {}),
        ...(alt ? { alt } : {}),
        ...(task.instructions ? { instructions: task.instructions } : {}),
      }
    }
    const taskByKey = new Map(tasks.map((t) => [t.key, t]))
    const stored = new Set(campaign.recipes.map((r) => r.key))
    const capacity = source.ticketCapacity
    return {
      key: campaign.key,
      title: campaign.title,
      start: {
        milestone: campaign.startMilestone,
        offsetDays: campaign.startOffsetDays,
      },
      end: {
        milestone: campaign.endMilestone,
        offsetDays: campaign.endOffsetDays,
      },
      primaryOutcome: campaign.primaryOutcome,
      ...(campaign.outcomeTargetPage
        ? { outcomeTargetPage: campaign.outcomeTargetPage }
        : {}),
      ...(campaign.target !== null && capacity
        ? { target: { shareOfCapacity: campaign.target / capacity } }
        : {}),
      optional: campaign.optional,
      triggers: campaign.triggers.map((t) => ({ ...t })),
      recipes: [
        // In stored order: a static Recipe follows its Task (and goes with it
        // when the Task was deleted), a Library Recipe is kept as it stands.
        ...campaign.recipes.flatMap((r) => {
          if (!seedsAtCreation(r)) return [structuredClone(r)]
          const task = taskByKey.get(r.key)
          return task ? [staticRecipe(task)] : []
        }),
        // Manual Tasks have no stored Recipe: they become one here.
        ...tasks.filter((t) => !stored.has(t.key)).map(staticRecipe),
      ],
    }
  })
}
