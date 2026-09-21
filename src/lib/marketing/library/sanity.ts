/**
 * Sanity access for the Recipe Library and for built-in Campaigns added on
 * demand (Templates spec §4.2, §5). Both writers are compare-and-set: Recipes
 * on the Campaign revision the form loaded, a new built-in Campaign on the
 * plan revision the "at most once" check read.
 */

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import type { TaskRecords } from '../materialize'
import {
  RECIPE_PROJECTION,
  recipeToStored,
  recipesFromStored,
  type StoredRecipe,
} from '../recipes'
import {
  campaignDocument,
  commitOrConflict,
  postDocument,
  taskDocument,
  triggerMember,
  variantDocument,
} from '../sanity'
import type { SeedPlan } from '../seed'
import type { TaskRecipe } from '../template/types'
import type { CampaignTrigger } from '../types'

const LIVE = `!(_id in path("drafts.**")) && !(_id in path("versions.**"))`

export interface RecipeCampaign {
  _id: string
  _rev: string
  key: string
  planId: string
  planOwnerId: string | null
  recipes: TaskRecipe[]
  triggers: CampaignTrigger[]
  generatedKeys: string[]
}

export async function readCampaignRecipes(
  campaignId: string,
  conferenceId: string,
): Promise<RecipeCampaign | null> {
  const row = await scopedFetch<{
    _id: string
    _rev: string
    key: string | null
    planId: string | null
    planOwnerId: string | null
    recipes: StoredRecipe[] | null
    triggers: CampaignTrigger[] | null
    generatedKeys: string[] | null
  } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingCampaign" && _id == $campaignId && plan->conference._ref == $conferenceId && ${LIVE}][0]{
      _id, _rev, key, "planId": plan._ref, "planOwnerId": plan->owner._ref,
      ${RECIPE_PROJECTION}, "triggers": triggers[]{ event, taskRecipeKey }, generatedKeys
    }`,
    { campaignId },
    { cache: 'no-store' },
  )
  if (!row?.key || !row.planId) return null
  return {
    _id: row._id,
    _rev: row._rev,
    key: row.key,
    planId: row.planId,
    planOwnerId: row.planOwnerId ?? null,
    recipes: recipesFromStored(row.recipes),
    triggers: (row.triggers ?? []).filter((t) => t?.event && t.taskRecipeKey),
    generatedKeys: row.generatedKeys ?? [],
  }
}

/**
 * Add and remove Recipes (and the Triggers pointing at them) on a Campaign,
 * BY KEY: a row this call does not name is not touched, so a static Recipe, a
 * half-filled Studio row or a Trigger of another beat survives exactly as it
 * is stored. (Checked against `@sanity/mutator`: a filter `unset` leaves the
 * other members alone, and `append` lands on an array `setIfMissing` just
 * made.) FORWARD-ONLY (§5.3): no Task is read, patched or deleted here, and
 * `generatedKeys[]` is only ever appended to — with the keys of `records`, the
 * Tasks a subjectless Recipe expands into at the moment it is attached,
 * created in this same transaction.
 */
export async function saveCampaignRecipes(input: {
  campaignId: string
  rev: string
  planId: string
  conferenceId: string
  /** Recipe keys to take off the Campaign, with the Triggers that name them. */
  removeKeys: string[]
  recipes: TaskRecipe[]
  triggers: CampaignTrigger[]
  records: TaskRecords
}): Promise<boolean> {
  const now = getCurrentDateTime()
  const conference = { _type: 'reference' as const, _ref: input.conferenceId }
  const tx = clientWrite.transaction()
  for (const p of input.records.posts)
    tx.create(postDocument(p, conference, now))
  for (const v of input.records.variants)
    tx.create(variantDocument(v, conference, now))
  for (const t of input.records.tasks) tx.create(taskDocument(t, conference))
  // Two patches, applied in order: the removal carries the compare-and-set,
  // so an edited Recipe is never stored twice.
  tx.patch(input.campaignId, (p) =>
    p
      .ifRevisionId(input.rev)
      .setIfMissing({ recipes: [], triggers: [], generatedKeys: [] })
      .unset(
        input.removeKeys.flatMap((key) => [
          `recipes[key==${JSON.stringify(key)}]`,
          `triggers[taskRecipeKey==${JSON.stringify(key)}]`,
        ]),
      ),
  )
  tx.patch(input.campaignId, (p) =>
    p
      .set({ updatedAt: now })
      .append('recipes', input.recipes.map(recipeToStored))
      .append('triggers', input.triggers.map(triggerMember))
      .append(
        'generatedKeys',
        input.records.tasks.map((t) => t.key),
      ),
  )
  tx.patch(input.planId, (p) =>
    p.set({ structurallyEdited: true, updatedAt: now }),
  )
  return commitOrConflict(tx)
}

export interface PlanForBuiltin {
  planId: string
  planRev: string
  ownerId: string | null
  campaignKeys: string[]
}

/** The plan, its revision and the Campaign keys it has, in one read. */
export async function readPlanForBuiltin(
  conferenceId: string,
): Promise<PlanForBuiltin | null> {
  const row = await scopedFetch<{
    planId: string
    planRev: string
    ownerId: string | null
    campaignKeys: (string | null)[] | null
  } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingPlan" && ${LIVE}][0]{
      "planId": _id, "planRev": _rev, "ownerId": owner._ref,
      "campaignKeys": *[_type == "marketingCampaign" && conference._ref == $conferenceId && plan._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].key
    }`,
    {},
    { cache: 'no-store' },
  )
  if (!row) return null
  return {
    ...row,
    campaignKeys: (row.campaignKeys ?? []).filter(
      (key): key is string => typeof key === 'string',
    ),
  }
}

/**
 * Commit a built-in Campaign expanded by the seeding path onto an EXISTING
 * plan. Compare-and-set on the plan revision the "at most once" check read:
 * two organizers adding the same Campaign cannot both land, because the first
 * commit moves the plan's revision.
 */
export async function commitBuiltinCampaign(
  seed: SeedPlan,
  planRev: string,
): Promise<boolean> {
  const now = getCurrentDateTime()
  const conference = {
    _type: 'reference' as const,
    _ref: seed.plan.conferenceId,
  }
  const tx = clientWrite.transaction()
  for (const c of seed.campaigns) tx.create(campaignDocument(c, conference))
  for (const p of seed.posts) tx.create(postDocument(p, conference, now))
  for (const v of seed.variants) tx.create(variantDocument(v, conference, now))
  for (const t of seed.tasks) tx.create(taskDocument(t, conference))
  tx.patch(seed.plan._id, (p) =>
    p.ifRevisionId(planRev).set({ structurallyEdited: true, updatedAt: now }),
  )
  return commitOrConflict(tx)
}
