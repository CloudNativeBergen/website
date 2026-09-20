/**
 * STORED RECIPES (Templates spec §2.1). A Campaign carries its own Task
 * Recipes in `marketingCampaign.recipes[]`: the Trigger handlers, the
 * expansion cron and `plan.copy` read these and nothing else, so a plan is
 * frozen at the Recipes it was given. This is the one place that knows the
 * stored shape — the writer, the GROQ projection and the reader. Migration
 * 053 writes through it too.
 */

import type { Milestone } from './milestones'
import type { Anchor, Cadence, SubjectList, TaskRecipe } from './template/types'
import type { MarketingChannel, SubjectSource, TaskKind } from './types'

type StoredAnchor = { milestone?: Milestone | null; offsetDays?: number | null }

/** A Recipe as a GROQ projection returns it: every field may be null. */
export interface StoredRecipe {
  key?: string | null
  beat?: string | null
  title?: string | null
  kind?: TaskKind | null
  channel?: MarketingChannel | null
  subjectSource?: SubjectSource | null
  anchor?: StoredAnchor | null
  prerequisites?: (string | null)[] | null
  targetPage?: string | null
  skeleton?: string | null
  alt?: string | null
  instructions?: string | null
  cadence?: {
    from?: StoredAnchor | null
    to?: StoredAnchor | null
    perWeek?: Partial<Record<MarketingChannel, number | null>> | null
    subjects?: SubjectList | null
  } | null
}

export const RECIPE_PROJECTION = `recipes[]{
  key, beat, title, kind, channel, subjectSource,
  anchor{ milestone, offsetDays }, prerequisites, targetPage,
  skeleton, alt, instructions,
  cadence{ from{ milestone, offsetDays }, to{ milestone, offsetDays }, perWeek{ linkedin, bluesky }, subjects }
}`

/**
 * The array member written to Sanity. `_key` is derived from the Recipe key
 * rather than random so a re-run of migration 053 writes the same member, and
 * the escaping is INJECTIVE (`_` is escaped too, and every escape is a fixed
 * four hex digits, so none can swallow the character after it): two Recipe keys — unique
 * within a Campaign — can never share a `_key`.
 */
export function recipeToStored(recipe: TaskRecipe) {
  return {
    _key: recipe.key.replace(
      /[^a-zA-Z0-9-]/g,
      (c) => `_${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    ),
    _type: 'marketingRecipe' as const,
    ...recipe,
  }
}

function anchorFrom(stored: StoredAnchor | null | undefined): Anchor | null {
  return stored?.milestone
    ? { milestone: stored.milestone, offsetDays: stored.offsetDays ?? 0 }
    : null
}

function cadenceFrom(stored: StoredRecipe['cadence']): Cadence | null {
  const from = anchorFrom(stored?.from)
  const to = anchorFrom(stored?.to)
  if (!stored || !from || !to) return null
  const perWeek: Cadence['perWeek'] = {}
  for (const [channel, rate] of Object.entries(stored.perWeek ?? {})) {
    if (typeof rate === 'number') perWeek[channel as MarketingChannel] = rate
  }
  return {
    from,
    to,
    perWeek,
    ...(stored.subjects ? { subjects: stored.subjects } : {}),
  }
}

/** Null for a member that cannot be a Recipe (a half-filled Studio row). */
export function recipeFromStored(
  stored: StoredRecipe | null | undefined,
): TaskRecipe | null {
  if (!stored?.key || !stored.beat || !stored.kind) return null
  const anchor = anchorFrom(stored.anchor)
  const cadence = cadenceFrom(stored.cadence)
  const prerequisites = (stored.prerequisites ?? []).filter(
    (key): key is string => typeof key === 'string',
  )
  return {
    key: stored.key,
    beat: stored.beat,
    title: stored.title ?? stored.key,
    kind: stored.kind,
    ...(stored.channel ? { channel: stored.channel } : {}),
    ...(anchor ? { anchor } : {}),
    ...(prerequisites.length > 0 ? { prerequisites } : {}),
    ...(stored.targetPage ? { targetPage: stored.targetPage } : {}),
    subjectSource: stored.subjectSource ?? 'none',
    ...(stored.skeleton ? { skeleton: stored.skeleton } : {}),
    ...(stored.alt ? { alt: stored.alt } : {}),
    ...(stored.instructions ? { instructions: stored.instructions } : {}),
    ...(cadence ? { cadence } : {}),
  }
}

export function recipesFromStored(
  stored: (StoredRecipe | null)[] | null | undefined,
): TaskRecipe[] {
  return (stored ?? []).flatMap((r) => recipeFromStored(r) ?? [])
}

/**
 * Is this the key of a Task a subjectless cadence (the countdown) generated:
 * `<beat>:d<offset>:<channel>`, as `generatedTaskKey(recipe.key, 'd-30')`
 * builds it? Migration 053 uses it to mark the countdown Tasks that seed and
 * copy created before they recorded their keys.
 */
export function isSubjectlessKey(recipes: TaskRecipe[], key: string): boolean {
  return recipes.some((r) => {
    if (!r.cadence || r.subjectSource !== 'none') return false
    const channelAt = r.key.lastIndexOf(':')
    const head =
      channelAt === -1 ? `${r.key}:` : `${r.key.slice(0, channelAt)}:`
    const tail = channelAt === -1 ? '' : r.key.slice(channelAt)
    return (
      key.startsWith(head) &&
      key.endsWith(tail) &&
      /^d-?\d+$/.test(key.slice(head.length, key.length - tail.length))
    )
  })
}

/**
 * A published post's identity: `(utm_campaign, utm_content)`. A bare Task key
 * is not enough once one Recipe can sit on two Campaigns — the second
 * Campaign's Tasks would be dropped as "already sent".
 */
export function publishedPair(campaignKey: string, taskKey: string): string {
  return JSON.stringify([campaignKey, taskKey])
}

/** The published Task keys of ONE Campaign, out of the edition's pairs. */
export function publishedIn(
  pairs: ReadonlySet<string> | undefined,
  campaignKey: string,
): { has(taskKey: string): boolean } {
  return { has: (key) => !!pairs?.has(publishedPair(campaignKey, key)) }
}
