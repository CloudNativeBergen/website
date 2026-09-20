/**
 * Sanity access for organization-owned Plan Templates (Templates spec §2.4).
 * ONE DOCUMENT PER VERSION under a deterministic id, so a concurrent save of
 * the same Template cannot also become version n+1: the second `create` fails
 * the transaction. Every read is `ORG_FILTER`-scoped.
 */

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  RECIPE_PROJECTION,
  recipeToStored,
  recipesFromStored,
  storedKey,
  type StoredRecipe,
} from '../recipes'
import { triggerMember } from '../sanity'
import type { Milestone } from '../milestones'
import type { Anchor, CampaignRecipe } from '../template/types'
import type { CampaignTrigger, Outcome } from '../types'

const LIVE = `!(_id in path("drafts.**")) && !(_id in path("versions.**"))`
const TEMPLATES = `_type == "planTemplate" && ${LIVE}`

export function templateDocId(templateId: string, version: number): string {
  return `planTemplate.${templateId}.v${version}`
}

export interface TemplateVersion {
  templateId: string
  name: string
  version: number
  campaigns: CampaignRecipe[]
}

export interface TemplateSummary {
  templateId: string
  name: string
  latestVersion: number
  /** Campaigns in the latest version. */
  campaigns: number
  savedAt: string | null
}

export interface TemplateVersionSummary {
  version: number
  savedAt: string | null
  savedByName: string | null
  savedFromTitle: string | null
  restoredFrom: number | null
}

type StoredAnchor = { milestone?: Milestone | null; offsetDays?: number | null }
interface StoredCampaign {
  key: string | null
  title: string | null
  start: StoredAnchor | null
  end: StoredAnchor | null
  primaryOutcome: Outcome | null
  outcomeTargetPage: string | null
  target: { shareOfCapacity?: number | null } | null
  optional: boolean | null
  triggers: CampaignTrigger[] | null
  recipes: StoredRecipe[] | null
}

const anchorFrom = (stored: StoredAnchor | null): Anchor | null =>
  stored?.milestone
    ? { milestone: stored.milestone, offsetDays: stored.offsetDays ?? 0 }
    : null

/** A Campaign that cannot anchor its window is left out rather than guessed. */
function campaignFromStored(c: StoredCampaign): CampaignRecipe[] {
  const start = anchorFrom(c.start)
  const end = anchorFrom(c.end)
  if (!c.key || !start || !end || !c.primaryOutcome) return []
  return [
    {
      key: c.key,
      title: c.title ?? c.key,
      start,
      end,
      primaryOutcome: c.primaryOutcome,
      ...(c.outcomeTargetPage
        ? { outcomeTargetPage: c.outcomeTargetPage }
        : {}),
      ...(typeof c.target?.shareOfCapacity === 'number'
        ? { target: { shareOfCapacity: c.target.shareOfCapacity } }
        : {}),
      optional: c.optional === true,
      triggers: (c.triggers ?? []).filter((t) => t?.event && t.taskRecipeKey),
      recipes: recipesFromStored(c.recipes),
    },
  ]
}

export async function getTemplateVersion(
  orgId: string,
  templateId: string,
  version: number,
): Promise<TemplateVersion | null> {
  const row = await scopedFetch<{
    templateId: string
    name: string | null
    version: number
    campaigns: StoredCampaign[] | null
  } | null>(
    clientReadUncached,
    { orgId },
    `*[${TEMPLATES} && _id == $id][0]{
      templateId, name, version,
      campaigns[]{
        key, title, start{ milestone, offsetDays }, end{ milestone, offsetDays },
        primaryOutcome, outcomeTargetPage, target{ shareOfCapacity }, optional,
        "triggers": triggers[]{ event, taskRecipeKey }, ${RECIPE_PROJECTION}
      }
    }`,
    { id: templateDocId(templateId, version) },
    { cache: 'no-store' },
  )
  if (!row) return null
  return {
    templateId: row.templateId,
    name: row.name ?? 'Untitled Template',
    version: row.version,
    campaigns: (row.campaigns ?? []).flatMap(campaignFromStored),
  }
}

/** Every Template of the organization at its latest version, by name. */
export async function listTemplates(orgId: string): Promise<TemplateSummary[]> {
  const rows = await scopedFetch<
    {
      templateId: string
      name: string | null
      version: number
      campaigns: number
      savedAt: string | null
    }[]
  >(
    clientReadUncached,
    { orgId },
    `*[${TEMPLATES}] | order(version desc){
      templateId, name, version, "campaigns": count(campaigns), savedAt
    }`,
    {},
    { cache: 'no-store' },
  )
  const latest = new Map<string, TemplateSummary>()
  for (const row of rows ?? []) {
    if (latest.has(row.templateId)) continue
    latest.set(row.templateId, {
      templateId: row.templateId,
      name: row.name ?? 'Untitled Template',
      latestVersion: row.version,
      campaigns: row.campaigns ?? 0,
      savedAt: row.savedAt ?? null,
    })
  }
  return [...latest.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function listTemplateVersions(
  orgId: string,
  templateId: string,
): Promise<TemplateVersionSummary[]> {
  const rows = await scopedFetch<TemplateVersionSummary[]>(
    clientReadUncached,
    { orgId },
    `*[${TEMPLATES} && templateId == $templateId] | order(version desc){
      version, savedAt, "savedByName": savedBy->name,
      "savedFromTitle": savedFrom->title, "restoredFrom": restoredFrom
    }`,
    { templateId },
    { cache: 'no-store' },
  )
  return (rows ?? []).map((row) => ({
    version: row.version,
    savedAt: row.savedAt ?? null,
    savedByName: row.savedByName ?? null,
    savedFromTitle: row.savedFromTitle ?? null,
    restoredFrom: row.restoredFrom ?? null,
  }))
}

/** `name` is unique per organization (§2.4), whatever its casing. */
export async function templateNameTaken(
  orgId: string,
  name: string,
  exceptTemplateId?: string,
): Promise<boolean> {
  const taken = await scopedFetch<number>(
    clientReadUncached,
    { orgId },
    `count(*[${TEMPLATES} && lower(name) == $name && templateId != $except])`,
    { name: name.toLowerCase(), except: exceptTemplateId ?? '' },
    { cache: 'no-store' },
  )
  return (taken ?? 0) > 0
}

function isAlreadyExists(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return statusCode === 409 || message.includes('already exists')
}

/**
 * Write a version. False when that version already exists: another save of the
 * same Template got there first, and the caller reports a conflict.
 */
export async function createTemplateVersion(input: {
  orgId: string
  templateId: string
  name: string
  version: number
  campaigns: CampaignRecipe[]
  savedFrom: string
  savedBy: string
  savedAt: string
  restoredFrom?: number
}): Promise<boolean> {
  const weakRef = (id: string) => ({
    _type: 'reference' as const,
    _ref: id,
    _weak: true,
  })
  const tx = clientWrite.transaction().create({
    _id: templateDocId(input.templateId, input.version),
    _type: 'planTemplate',
    organization: { _type: 'reference', _ref: input.orgId },
    templateId: input.templateId,
    name: input.name,
    version: input.version,
    savedFrom: weakRef(input.savedFrom),
    savedBy: weakRef(input.savedBy),
    savedAt: input.savedAt,
    ...(input.restoredFrom !== undefined
      ? { restoredFrom: input.restoredFrom }
      : {}),
    campaigns: input.campaigns.map((c) => ({
      _key: storedKey(c.key),
      _type: 'planTemplateCampaign',
      key: c.key,
      title: c.title,
      start: c.start,
      end: c.end,
      primaryOutcome: c.primaryOutcome,
      ...(c.outcomeTargetPage
        ? { outcomeTargetPage: c.outcomeTargetPage }
        : {}),
      ...(c.target ? { target: c.target } : {}),
      optional: c.optional,
      triggers: c.triggers.map(triggerMember),
      recipes: c.recipes.map(recipeToStored),
    })),
  })
  try {
    await tx.commit()
    return true
  } catch (error) {
    if (isAlreadyExists(error)) return false
    throw error
  }
}

async function versionIds(orgId: string, templateId: string) {
  return (
    (await scopedFetch<string[]>(
      clientReadUncached,
      { orgId },
      `*[${TEMPLATES} && templateId == $templateId]._id`,
      { templateId },
      { cache: 'no-store' },
    )) ?? []
  )
}

/** The one patch a version ever gets (§2.4). Returns the versions renamed. */
export async function renameTemplate(
  orgId: string,
  templateId: string,
  name: string,
): Promise<number> {
  const ids = await versionIds(orgId, templateId)
  if (ids.length === 0) return 0
  const tx = clientWrite.transaction()
  for (const id of ids) tx.patch(id, (p) => p.set({ name }))
  await tx.commit()
  return ids.length
}

/** The whole Template, every version. Seeded plans keep their stamped origin. */
export async function deleteTemplate(
  orgId: string,
  templateId: string,
): Promise<number> {
  const ids = await versionIds(orgId, templateId)
  if (ids.length === 0) return 0
  const tx = clientWrite.transaction()
  for (const id of ids) tx.delete(id)
  await tx.commit()
  return ids.length
}
