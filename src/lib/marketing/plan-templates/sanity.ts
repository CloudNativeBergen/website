/**
 * Sanity access for organization-owned Plan Templates (Templates spec §2.4).
 * ONE DOCUMENT PER VERSION under a deterministic id, so a concurrent save of
 * the same Template cannot also become version n+1: the second `create` fails
 * the transaction. A later version is also written under a guard on VERSION 1
 * ({@link readTemplateHead}): a delete removes it and a rename moves its
 * revision, so a save racing either one loses instead of leaving an orphan
 * version or one under the old name. Every read is `ORG_FILTER`-scoped.
 *
 * NOT closed: `name` is unique per organization by check-then-create, so two
 * NEW Templates given the same name at the same instant can both land.
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

export interface TemplateHead {
  name: string
  nextVersion: number
  /** Version 1 at the revision read: see {@link createTemplateVersion}. */
  guard: { id: string; rev: string }
}

/** What a new version of an existing Template is written against, in one read. */
export async function readTemplateHead(
  orgId: string,
  templateId: string,
): Promise<TemplateHead | null> {
  const rows = await scopedFetch<
    { _id: string; _rev: string; name: string | null; version: number }[]
  >(
    clientReadUncached,
    { orgId },
    `*[${TEMPLATES} && templateId == $templateId]{ _id, _rev, name, version }`,
    { templateId },
    { cache: 'no-store' },
  )
  const first = (rows ?? []).find((r) => r.version === 1)
  if (!first) return null
  return {
    name: first.name ?? 'Untitled Template',
    nextVersion: Math.max(...rows.map((r) => r.version)) + 1,
    guard: { id: first._id, rev: first._rev },
  }
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

/** The version exists already, or the guard on version 1 did not hold. */
function isLostRace(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    statusCode === 409 ||
    message.includes('already exists') ||
    message.includes('not found') ||
    (message.includes('revision') && message.includes('mismatch'))
  )
}

/**
 * Write a version. False when the race was lost: that version already exists,
 * or — for a later version — version 1 was deleted or renamed since `guard` was
 * read. The guard is a no-op patch in the SAME transaction, so the create
 * cannot land without it.
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
  guard?: TemplateHead['guard']
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
      // The member types `planTemplate` declares, not the Campaign's.
      triggers: c.triggers.map((t) => ({
        ...triggerMember(t),
        _type: 'planTemplateTrigger' as const,
      })),
      recipes: c.recipes.map((r) => ({
        ...recipeToStored(r),
        _type: 'planTemplateRecipe' as const,
      })),
    })),
  })
  const { guard } = input
  if (guard)
    tx.patch(guard.id, (p) =>
      p.ifRevisionId(guard.rev).setIfMissing({ templateId: input.templateId }),
    )
  try {
    await tx.commit()
    return true
  } catch (error) {
    if (isLostRace(error)) return false
    throw error
  }
}

/**
 * A rename or a delete reads the version ids and then writes them: a version
 * saved IN BETWEEN is on neither list. So both sweep again until a pass finds
 * nothing left to do. That terminates, because the first pass already moved
 * version 1 — renamed it (its revision changes) or deleted it — and every later
 * save is written under a guard on exactly that ({@link readTemplateHead}), so
 * it can no longer land under the old name, or at all.
 */
const MAX_SWEEPS = 5

async function versionIds(
  orgId: string,
  templateId: string,
  /** Only the versions NOT already called this. */
  exceptName?: string,
) {
  return (
    (await scopedFetch<string[]>(
      clientReadUncached,
      { orgId },
      `*[${TEMPLATES} && templateId == $templateId && name != $exceptName]._id`,
      { templateId, exceptName: exceptName ?? null },
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
  let renamed = 0
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    const ids = await versionIds(orgId, templateId, name)
    if (ids.length === 0) break
    const tx = clientWrite.transaction()
    for (const id of ids) tx.patch(id, (p) => p.set({ name }))
    await tx.commit()
    renamed += ids.length
  }
  return renamed
}

/** The whole Template, every version. Seeded plans keep their stamped origin. */
export async function deleteTemplate(
  orgId: string,
  templateId: string,
): Promise<number> {
  let deleted = 0
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    const ids = await versionIds(orgId, templateId)
    if (ids.length === 0) break
    const tx = clientWrite.transaction()
    for (const id of ids) tx.delete(id)
    await tx.commit()
    deleted += ids.length
  }
  return deleted
}
