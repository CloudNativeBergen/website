/**
 * View-model for organization-owned Plan Templates (Templates spec §6). Pure:
 * how the Save-as-Template review list is grouped, which of the organizer's
 * answers are worth sending, the strict placeholder rule the dialog enforces
 * live, and a Template Campaign's window in words.
 */

import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'
import type { ReviewItem, SaveDecisions } from '@/lib/marketing/plan-templates'
import {
  CONFERENCE_PLACEHOLDERS,
  unknownTokens,
} from '@/lib/marketing/placeholders'
import type { Anchor } from '@/lib/marketing/template'
import { windowWords } from '../recipes'

type TemplateOutputs = inferRouterOutputs<AppRouter>['marketing']['template']
export type TemplateSummary = TemplateOutputs['list'][number]
export type TemplateVersionRow = TemplateOutputs['versions'][number]
export type TemplatePreview = TemplateOutputs['preview']
export type PreviewCampaign = TemplatePreview['campaigns'][number]

export type AnchorReview = Extract<ReviewItem, { type: 'anchor' }>
export type CopyReview = Extract<ReviewItem, { type: 'copy' }>

/** What the organizer is answering right now, by Task id. */
export interface ReviewDrafts {
  anchors: Record<string, Anchor>
  copy: Record<string, string>
}

/**
 * The review list split by the decision it asks for (§6.2). One Task can be in
 * both lists — an unanchored Task that also carries literal copy — so the two
 * are keyed independently, never merged by Task.
 */
export function groupReview(items: readonly ReviewItem[]): {
  anchors: AnchorReview[]
  copy: CopyReview[]
} {
  return {
    anchors: items.filter(
      (item): item is AnchorReview => item.type === 'anchor',
    ),
    copy: items.filter((item): item is CopyReview => item.type === 'copy'),
  }
}

// The server's rule, mirrored so the refusal is shown while typing rather than
// after a round trip: a static Task has no subject, so only a conference
// placeholder can ever be filled in (§6.2).
/** Why this rewritten copy cannot be saved, by Task id; absent when it can. */
export function copyIssues(
  items: readonly CopyReview[],
  drafts: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    items.flatMap((item): (readonly [string, string])[] => {
      const text = drafts[item.taskId] ?? item.text
      if (!text.trim())
        return [
          [item.taskId, 'Write the copy, or put the original back.'] as const,
        ]
      const unknown = unknownTokens(text, CONFERENCE_PLACEHOLDERS)
      return unknown.length > 0
        ? [
            [
              item.taskId,
              `${unknown.join(', ')} cannot be filled in for a Task like this one.`,
            ] as const,
          ]
        : []
    }),
  )
}

export const sameAnchor = (a: Anchor, b: Anchor): boolean =>
  a.milestone === b.milestone && a.offsetDays === b.offsetDays

/**
 * Only what the organizer actually CHANGED (§6.2). The server derives the
 * suggested anchor itself and saves untouched copy verbatim, so echoing either
 * back would be the same value with one more way to get it wrong — and
 * `verbatim` (the flag that makes the seeded Task ask for review) is set
 * exactly when no copy decision arrives for that Task.
 */
export function saveDecisions(
  review: readonly ReviewItem[],
  drafts: ReviewDrafts,
): SaveDecisions {
  const { anchors, copy } = groupReview(review)
  const changedAnchors = Object.fromEntries(
    anchors.flatMap((item) => {
      const draft = drafts.anchors[item.taskId]
      return draft && !sameAnchor(draft, item.anchor)
        ? [[item.taskId, draft] as const]
        : []
    }),
  )
  const changedCopy = Object.fromEntries(
    copy.flatMap((item) => {
      const draft = drafts.copy[item.taskId]
      return draft !== undefined && draft !== item.text
        ? [[item.taskId, draft] as const]
        : []
    }),
  )
  return {
    ...(Object.keys(changedAnchors).length > 0
      ? { anchors: changedAnchors }
      : {}),
    ...(Object.keys(changedCopy).length > 0 ? { copy: changedCopy } : {}),
  }
}

/** "CFP opens → CFP closes +1 d", for a Campaign of a Template Version. */
export const previewWindowWords = (campaign: PreviewCampaign): string =>
  windowWords({ from: campaign.start, to: campaign.end })

/** The Campaigns a version offers to leave out at seed time (§3). */
export const optionalPreviewCampaigns = (
  preview: TemplatePreview | undefined,
): PreviewCampaign[] => (preview?.campaigns ?? []).filter((c) => c.optional)

/**
 * The optional Campaigns to create, in the version's own order. The dialog
 * tracks the UNTICKED ones so switching to another version keeps the default
 * "everything on" for Campaigns that version has and this one did not.
 */
export const includeOptional = (
  preview: TemplatePreview | undefined,
  excluded: ReadonlySet<string>,
): string[] =>
  optionalPreviewCampaigns(preview)
    .filter((c) => !excluded.has(c.key))
    .map((c) => c.key)
