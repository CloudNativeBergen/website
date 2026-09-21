/**
 * Sanity access for organization-owned Plan Templates (Templates spec §2.4).
 * ONE DOCUMENT PER VERSION under a deterministic id, so a concurrent save of
 * the same Template cannot also become version n+1: the second `create` fails
 * the transaction. A later version is also written under a guard on VERSION 1
 * ({@link readTemplateHead}): a delete removes it and a rename moves its
 * revision, so a save racing either one loses instead of leaving an orphan
 * version or one under the old name. Every read is `ORG_FILTER`-scoped.
 *
 * `name` is unique per organization ATOMICALLY: a NAME LOCK document, whose id
 * is a hash of the organization and the normalized name, is `create`d in the
 * same transaction that first takes the name (version 1, or a rename's first
 * batch) — so two writers racing past `templateNameTaken` cannot both land.
 */

import 'server-only'
import { createHash } from 'node:crypto'
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
// A Template Version as this module writes it. The schema-only `planTemplate`
// of slice 1 had a string `version` and no `templateId`; nothing ever wrote
// one (production held none on 2026-09-21), but a hand-made document of that
// shape must not be listed as a Template that then cannot be opened.
const TEMPLATES = `_type == "planTemplate" && defined(templateId) && version >= 1 && ${LIVE}`

/**
 * The reservation of one name in one organization. Hashed, because a name is
 * free text and a document id is not; normalized the way `templateNameTaken`
 * compares, so casing and outer whitespace cannot get round it.
 */
function nameLockId(orgId: string, name: string): string {
  const hash = createHash('sha256')
    .update(`${orgId}\n${name.trim().toLowerCase()}`)
    .digest('hex')
  return `planTemplateName.${hash.slice(0, 32)}`
}

function nameLock(orgId: string, templateId: string, name: string) {
  return {
    _id: nameLockId(orgId, name),
    _type: 'planTemplateName' as const,
    organization: { _type: 'reference' as const, _ref: orgId },
    templateId,
    name: name.trim(),
  }
}

export function templateDocId(templateId: string, version: number): string {
  return `planTemplate.${templateId}.v${version}`
}

export interface TemplateVersion {
  templateId: string
  name: string
  version: number
  /** The edition this version's contents were saved from, if it still exists. */
  savedFromId: string | null
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
    savedFromId: string | null
    campaigns: StoredCampaign[] | null
  } | null>(
    clientReadUncached,
    { orgId },
    `*[${TEMPLATES} && _id == $id][0]{
      templateId, name, version, "savedFromId": savedFrom._ref,
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
    savedFromId: row.savedFromId ?? null,
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
 * the name of a NEW Template was taken first, or — for a later version — version 1 was deleted or renamed since `guard` was
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
  // A NEW Template takes its name here; a later version already holds it.
  if (input.version === 1)
    tx.create(nameLock(input.orgId, input.templateId, input.name))
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
/** Sanity's ceiling on one transaction, as `deletion/sanity.ts` batches to. */
const BATCH_SIZE = 50

/**
 * The versions still to handle, VERSION 1 FIRST: it is what a racing save is
 * guarded on, so it has to move in the first batch for the sweep to terminate.
 */
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
      `*[${TEMPLATES} && templateId == $templateId && name != $exceptName] | order(version asc)._id`,
      { templateId, exceptName: exceptName ?? null },
      { cache: 'no-store' },
    )) ?? []
  )
}

/** What rides in the very FIRST transaction of a sweep, with version 1. */
interface Prelude {
  stage: (tx: ReturnType<typeof clientWrite.transaction>) => void
  /**
   * How many mutations `stage` adds. They count against the ceiling, and the
   * exact number matters: the first transaction is the ATOMIC part of a delete
   * (version 1 and the name go in it), so every version that fits there is one
   * that a failed second commit cannot strand.
   */
  mutations: number
}

/**
 * One write per version, in transactions of at most {@link BATCH_SIZE}.
 * `'lost'` when the first transaction — the one carrying `prelude` — is refused.
 */
async function sweep(
  read: () => Promise<string[]>,
  stage: (tx: ReturnType<typeof clientWrite.transaction>, id: string) => void,
  prelude?: Prelude,
): Promise<number | 'lost'> {
  let done = 0
  let first = true
  for (let pass = 0; pass < MAX_SWEEPS; pass++) {
    const ids = await read()
    // Nothing to write is not nothing to CHECK: the prelude carries the guard,
    // and with no version left to sweep (the Template was deleted since its
    // head was read) it still has to be committed — and refused — rather than
    // the operation reporting success on a Template that is gone. One pass of
    // the inner loop below, with an empty batch.
    if (ids.length === 0 && !(first && prelude)) break
    for (let i = 0; i < Math.max(ids.length, 1);) {
      const tx = clientWrite.transaction()
      if (first) prelude?.stage(tx)
      const room = BATCH_SIZE - (first ? (prelude?.mutations ?? 0) : 0)
      for (const id of ids.slice(i, i + room)) stage(tx, id)
      i += room
      try {
        await tx.commit()
      } catch (error) {
        if (first && prelude && isLostRace(error)) return 'lost'
        throw error
      }
      first = false
    }
    done += ids.length
  }
  return done
}

/**
 * The guard a rename or a delete rides on: a no-op patch on version 1 at the
 * revision the caller READ the name at. Two renames of one Template both start
 * from the same old name; without this the loser still takes its new name and
 * the winner's reservation is never released — held for ever by nothing.
 */
function guardHead(
  tx: ReturnType<typeof clientWrite.transaction>,
  guard: TemplateHead['guard'],
  templateId: string,
) {
  tx.patch(guard.id, (p) =>
    p.ifRevisionId(guard.rev).setIfMissing({ templateId }),
  )
}

/**
 * The one patch a version ever gets (§2.4). Returns the versions renamed, or
 * why the first transaction was refused — nothing is renamed and no
 * reservation moves in either case:
 * - `'taken'`: the name is reserved by someone else. Read from the LOCK, which
 *   is what refused it — not from the Template documents, because a
 *   reservation nothing owns any more still holds the name, and "reload and
 *   try again" would then loop for ever.
 * - `'changed'`: this Template was renamed or deleted since `guard` was read.
 */
export async function renameTemplate(
  orgId: string,
  templateId: string,
  name: string,
  previousName: string,
  guard: TemplateHead['guard'],
): Promise<number | 'taken' | 'changed'> {
  const from = nameLockId(orgId, previousName)
  const to = nameLock(orgId, templateId, name)
  // A change of casing only keeps the reservation it already has.
  const moves = from !== to._id
  const renamed = await sweep(
    () => versionIds(orgId, templateId, name),
    (tx, id) => tx.patch(id, (p) => p.set({ name })),
    {
      mutations: moves ? 3 : 1,
      stage: (tx) => {
        guardHead(tx, guard, templateId)
        if (moves) tx.create(to).delete(from)
      },
    },
  )
  if (renamed !== 'lost') return renamed
  const holder = await scopedFetch<string | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "planTemplateName" && _id == $id][0].templateId`,
    { id: to._id },
    { cache: 'no-store' },
  )
  // Held by THIS Template: an identical rename won the race — a change, not a conflict.
  return moves && holder != null && holder !== templateId ? 'taken' : 'changed'
}

/**
 * The whole Template, every version, and its name with it — decided on the
 * head that was read, so the name freed is the one the Template really has.
 * Seeded plans keep their stamped origin.
 */
export function deleteTemplate(
  orgId: string,
  templateId: string,
  name: string,
  guard: TemplateHead['guard'],
): Promise<number | 'lost'> {
  return sweep(
    () => versionIds(orgId, templateId),
    (tx, id) => tx.delete(id),
    {
      mutations: 2,
      stage: (tx) => {
        guardHead(tx, guard, templateId)
        tx.delete(nameLockId(orgId, name))
      },
    },
  )
}
