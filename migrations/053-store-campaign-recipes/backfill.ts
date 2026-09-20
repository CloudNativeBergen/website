import {
  isSubjectlessKey,
  recipesFromStored,
  recipeToStored,
  type StoredRecipe,
} from '../../src/lib/marketing/recipes'
import { BUILTIN_TEMPLATE } from '../../src/lib/marketing/template/builtin'
import type { PlanTemplate } from '../../src/lib/marketing/template/types'

type Doc = Record<string, unknown>

/** The version whose Recipes every plan seeded before 053 was resolved against. */
const BACKFILL_VERSION = '2026.1'

export const isLive = (id: string) =>
  !id.startsWith('drafts.') && !id.startsWith('versions.')

const refOf = (value: unknown) => (value as { _ref?: string } | undefined)?._ref

/**
 * What 053 writes on one Campaign, or null when there is nothing to write.
 *
 * `recipes` is set ONLY where a Campaign has none: a plan is frozen at the
 * Recipes it was given, so a re-run (or a run after an organizer edited a
 * Recipe) must never put the built-in wording back.
 *
 * `generatedKeys` gains the keys of the Campaign's EXISTING countdown Tasks.
 * Seed and copy used to expand the countdown without recording it, so without
 * this the first time the Recipe is put on the Campaign again every live
 * plan's countdown would be created twice.
 */
export function backfillCampaign(
  campaign: Doc,
  tasks: Doc[],
  template: PlanTemplate = BUILTIN_TEMPLATE,
): Record<string, unknown> | null {
  if (template.version !== BACKFILL_VERSION) {
    throw new Error(
      `053 backfills the ${BACKFILL_VERSION} Recipes, but the built-in Template is now ${template.version}. Pin the ${BACKFILL_VERSION} Recipes before running it.`,
    )
  }
  const builtin = template.campaigns.find((c) => c.key === campaign.key)
  if (!builtin) return null
  const fields: Record<string, unknown> = {}

  // "Has Recipes" is asked of the RAW array. Rows this code cannot read (a
  // half-filled Studio member) are still somebody's Recipes: normalizing first
  // read them as none, and the built-in was written over the top.
  const raw = Array.isArray(campaign.recipes)
    ? (campaign.recipes as StoredRecipe[])
    : []
  const stored = recipesFromStored(raw)
  const recipes = stored.length > 0 ? stored : builtin.recipes
  if (raw.length === 0) fields.recipes = builtin.recipes.map(recipeToStored)

  const marker = Array.isArray(campaign.generatedKeys)
    ? (campaign.generatedKeys as string[])
    : []
  const missing = tasks
    .filter(
      (t) =>
        refOf(t.campaign) === campaign._id &&
        refOf(t.conference) === refOf(campaign.conference),
    )
    .map((t) => t.key)
    .filter(
      (key): key is string =>
        typeof key === 'string' &&
        isSubjectlessKey(recipes, key) &&
        !marker.includes(key),
    )
  if (missing.length > 0) {
    fields.generatedKeys = [...marker, ...new Set(missing)]
  }
  return Object.keys(fields).length > 0 ? fields : null
}
