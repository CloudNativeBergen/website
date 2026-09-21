/**
 * View-model for the Recipe Library on a Campaign (Templates spec §4.2, §5):
 * which built-in Campaigns a plan is still missing, how an attached Recipe
 * reads in one line, and the small edits ↔ form-state moves. Pure.
 */

import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/server/_app'
import type { RecipeEdits } from '@/lib/marketing/library'
import { seedsAtCreation } from '@/lib/marketing/seed'
import { BUILTIN_TEMPLATE, type Anchor } from '@/lib/marketing/template'
import {
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  type MarketingChannel,
} from '@/lib/marketing/types'
import { MILESTONE_LABELS } from '../timeline-model'

type CampaignOutputs = inferRouterOutputs<AppRouter>['marketing']['campaign']
/** One row of `campaign.recipes.library`: what the form needs to offer. */
export type LibraryEntryView = CampaignOutputs['recipes']['library'][number]

/** "Conference −28 d", or just the Milestone when the offset is zero. */
export function anchorWords({ milestone, offsetDays }: Anchor): string {
  const label = MILESTONE_LABELS[milestone]
  if (offsetDays === 0) return label
  return `${label} ${offsetDays < 0 ? '−' : '+'}${Math.abs(offsetDays)} d`
}

/** "1 Task", "12 Tasks". */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function windowWords(window: { from: Anchor; to: Anchor }): string {
  return `${anchorWords(window.from)} → ${anchorWords(window.to)}`
}

/** A built-in Campaign the plan can still be given, described in words. */
export interface BuiltinOffer {
  key: string
  title: string
  optional: boolean
  /** "CFP opens → CFP closes +1 d". */
  window: string
  /** Tasks it creates straight away. */
  tasks: number
  /** The Trigger-driven and recurring Recipes it carries, by name. */
  recipes: string[]
}

/**
 * The built-in Campaigns this plan does not already have (§4.2). Matched on
 * `key`, which is the Campaign's `utm_campaign` and its ledger identity — the
 * same thing the server refuses a second time.
 */
export function missingBuiltins(
  campaignKeys: readonly string[],
): BuiltinOffer[] {
  const present = new Set(campaignKeys)
  return BUILTIN_TEMPLATE.campaigns
    .filter((campaign) => !present.has(campaign.key))
    .map((campaign) => ({
      key: campaign.key,
      title: campaign.title,
      optional: campaign.optional,
      window: windowWords({ from: campaign.start, to: campaign.end }),
      tasks: campaign.recipes.filter(seedsAtCreation).length,
      recipes: [
        ...new Set(
          campaign.recipes
            .filter((r) => !seedsAtCreation(r) && r.kind === 'publishing')
            .map((r) => r.title),
        ),
      ],
    }))
}

/**
 * One line under an attached Recipe: its Channels with their rate, then its
 * window — "LinkedIn 2/week · Bluesky 3/week · Speakers notified +7 d →
 * Conference −7 d". A non-recurring Recipe has neither rate nor window.
 */
export function recipeSummary(edits: RecipeEdits): string {
  const channels = MARKETING_CHANNELS.flatMap((channel) => {
    const chosen = edits.channels[channel]
    if (!chosen) return []
    const rate = chosen.perWeek === undefined ? '' : ` ${chosen.perWeek}/week`
    return [`${MARKETING_CHANNEL_LABELS[channel]}${rate}`]
  })
  return [...channels, ...(edits.window ? [windowWords(edits.window)] : [])]
    .join(' · ')
    .trim()
}

/**
 * Switch a Channel on or off. On, it comes back with the Library's copy for
 * that Channel, so enabling one never leaves an empty skeleton behind.
 */
export function toggleChannel(
  edits: RecipeEdits,
  channel: MarketingChannel,
  on: boolean,
  defaults: RecipeEdits,
): RecipeEdits {
  const channels = { ...edits.channels }
  if (on) channels[channel] = defaults.channels[channel] ?? { skeleton: '' }
  else delete channels[channel]
  return { ...edits, channels }
}

export function patchChannel(
  edits: RecipeEdits,
  channel: MarketingChannel,
  patch: Partial<{ skeleton: string; perWeek: number }>,
): RecipeEdits {
  const current = edits.channels[channel]
  if (!current) return edits
  return {
    ...edits,
    channels: { ...edits.channels, [channel]: { ...current, ...patch } },
  }
}
