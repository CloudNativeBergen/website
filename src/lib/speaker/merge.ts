/**
 * Speaker merge (identity Phase 3).
 *
 * An ADMIN-only, destructive operation that folds a duplicate ("loser") speaker
 * document into a canonical ("survivor") one:
 *  1. Every inbound reference to the loser is repointed to the survivor.
 *  2. Identity fields (`providers`, `knownEmails`) are unioned onto the survivor
 *     and the loser's display email is folded into the survivor's match-set.
 *  3. Scalar fields fill ONLY the survivor's gaps (survivor wins deterministically).
 *  4. The loser document is deleted — all in one atomic Sanity transaction so
 *     nothing dangles.
 *
 * This module is split into a PURE core (fully unit-testable, no I/O) plus a
 * thin {@link mergeSpeakers} wrapper that performs the Sanity reads and the
 * single write transaction. The pure core is what the tests exercise.
 *
 * SECURITY / CORRECTNESS notes:
 *  - `conference.organizers[]` is one of the repointed reference sites, so the
 *    computed `isOrganizer` flag is preserved when the loser was an organizer.
 *  - `slug` is NEVER changed — the survivor keeps its live public URL.
 *  - Draft documents are rejected; only published `speaker` docs may be merged.
 */

import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { normalizeEmail, uniqueEmails } from './email'

/** Minimal shape of a raw (unprojected) speaker document used by the merge. */
export interface MergeSpeakerDoc {
  _id: string
  _type: string
  name?: string
  email?: string
  slug?: { _type?: string; current?: string } | string
  providers?: (string | null | undefined)[]
  knownEmails?: (string | null | undefined)[]
  bio?: string
  title?: string
  links?: unknown[]
  flags?: unknown[]
  consent?: unknown
  image?: unknown
  imageURL?: string
  [key: string]: unknown
}

/** A raw Sanity reference object: `{ _ref, _key?, _type? }`. */
interface SanityReference {
  _ref: string
  _key?: string
  _type?: string
}

/** Thrown for precondition failures (self-merge, missing / non-speaker docs). */
export class MergeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MergeValidationError'
  }
}

function isReference(value: unknown): value is SanityReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { _ref?: unknown })._ref === 'string'
  )
}

/**
 * Deep-transform a JSON value, repointing every reference to `loserId` so it
 * points at `survivorId` instead. Within arrays, references to the survivor are
 * deduplicated (survivor already present, or a repointed loser entry now
 * duplicates it) — the first occurrence is kept so its `_key` survives.
 *
 * Returns the SAME reference when nothing below it changed, which lets callers
 * detect changed top-level fields by identity comparison.
 */
function transformValue(
  value: unknown,
  loserId: string,
  survivorId: string,
  counter: { count: number },
): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const mapped = value.map((item) => {
      const next = transformValue(item, loserId, survivorId, counter)
      if (next !== item) changed = true
      return next
    })

    // Collapse duplicate references to the survivor into a single entry.
    let seenSurvivor = false
    const deduped: unknown[] = []
    for (const item of mapped) {
      if (isReference(item) && item._ref === survivorId) {
        if (seenSurvivor) {
          changed = true
          continue
        }
        seenSurvivor = true
      }
      deduped.push(item)
    }

    return changed ? deduped : value
  }

  if (isReference(value)) {
    if (value._ref === loserId) {
      counter.count += 1
      return { ...value, _ref: survivorId }
    }
    return value
  }

  if (typeof value === 'object' && value !== null) {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      const next = transformValue(child, loserId, survivorId, counter)
      if (next !== child) changed = true
      out[key] = next
    }
    return changed ? out : value
  }

  return value
}

/** Result of repointing a single referencing document. */
export interface RepointedDocument {
  /** The transformed document (same reference if unchanged). */
  doc: Record<string, unknown>
  /** Top-level keys whose value changed and must be `.set()` on the patch. */
  changedKeys: string[]
  /** Number of individual loser references that were repointed. */
  repointed: number
}

/**
 * Repoint every reference to `loserId` inside `doc` to `survivorId`, generically
 * (works for array refs, single refs, and refs nested in objects). Returns the
 * changed top-level keys so a minimal `.set()` patch can be built.
 */
export function repointReferencesInDocument(
  doc: Record<string, unknown>,
  loserId: string,
  survivorId: string,
): RepointedDocument {
  const counter = { count: 0 }
  const transformed = transformValue(
    doc,
    loserId,
    survivorId,
    counter,
  ) as Record<string, unknown>

  const changedKeys: string[] = []
  if (transformed !== doc) {
    for (const key of Object.keys(transformed)) {
      if (transformed[key] !== doc[key]) changedKeys.push(key)
    }
  }

  return { doc: transformed, changedKeys, repointed: counter.count }
}

/** A `before`/`after` view of a normalized string-list identity field. */
export interface IdentityFieldChange {
  before: string[]
  after: string[]
}

/** The computed patch to apply to the survivor, plus a preview-friendly view. */
export interface SurvivorFieldMerge {
  /** Only the fields that actually change (used to build the survivor patch). */
  set: Record<string, unknown>
  identity: {
    providers: IdentityFieldChange
    knownEmails: IdentityFieldChange
    email: { before: string; after: string }
  }
  /** Scalar fields that were empty on the survivor and filled from the loser. */
  filledFromLoser: string[]
}

/** Scalar/opaque fields the survivor keeps; the loser only fills gaps. */
const SCALAR_FILL_FIELDS = [
  'bio',
  'title',
  'links',
  'flags',
  'consent',
  'image',
  'imageURL',
] as const

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function stringList(
  values: (string | null | undefined)[] | undefined,
): string[] {
  return (values ?? []).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

/**
 * Compute the identity union + scalar reconciliation to apply to the survivor.
 *
 * - `providers`: deduplicated union.
 * - `knownEmails`: normalized, deduplicated union of both match-sets PLUS both
 *   display emails (so the loser's address becomes a future match key).
 * - `email` (display): keep the survivor's unless empty, then fall back to the
 *   loser's. The survivor's `slug` is intentionally never touched.
 * - Scalars: keep the survivor's; fill from the loser only where the survivor's
 *   value is empty. Deterministic — the admin picked the survivor deliberately.
 */
export function computeSurvivorFieldMerge(
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
): SurvivorFieldMerge {
  const set: Record<string, unknown> = {}
  const filledFromLoser: string[] = []

  // providers — deduplicated union, survivor order first.
  const providersBefore = stringList(survivor.providers)
  const providersAfter = Array.from(
    new Set([...providersBefore, ...stringList(loser.providers)]),
  )
  if (providersAfter.length !== providersBefore.length) {
    set.providers = providersAfter
  }

  // knownEmails — normalized union incl. both display emails.
  const knownBefore = uniqueEmails(survivor.knownEmails ?? [])
  const knownAfter = uniqueEmails([
    ...(survivor.knownEmails ?? []),
    ...(loser.knownEmails ?? []),
    survivor.email,
    loser.email,
  ])
  if (knownAfter.length !== knownBefore.length) {
    set.knownEmails = knownAfter
  }

  // display email — preserve survivor's; only fall back to loser's when empty.
  const emailBefore = survivor.email ?? ''
  const emailAfter = isEmptyValue(survivor.email)
    ? (loser.email ?? '')
    : survivor.email!
  if (emailAfter !== emailBefore && !isEmptyValue(emailAfter)) {
    set.email = emailAfter
  }

  // scalar fields — survivor kept, loser fills gaps only.
  for (const field of SCALAR_FILL_FIELDS) {
    if (isEmptyValue(survivor[field]) && !isEmptyValue(loser[field])) {
      set[field] = loser[field]
      filledFromLoser.push(field)
    }
  }

  return {
    set,
    identity: {
      providers: { before: providersBefore, after: providersAfter },
      knownEmails: { before: knownBefore, after: knownAfter },
      email: {
        before: normalizeEmail(emailBefore),
        after: normalizeEmail(emailAfter),
      },
    },
    filledFromLoser,
  }
}

/**
 * Reject merges that must never proceed: self-merge, missing documents, draft
 * documents, or non-speaker documents.
 */
export function assertMergeable(
  survivor: MergeSpeakerDoc | null | undefined,
  loser: MergeSpeakerDoc | null | undefined,
): asserts survivor is MergeSpeakerDoc {
  if (!survivor?._id) {
    throw new MergeValidationError('Survivor speaker not found')
  }
  if (!loser?._id) {
    throw new MergeValidationError('Loser speaker not found')
  }
  if (survivor._id === loser._id) {
    throw new MergeValidationError('Cannot merge a speaker into itself')
  }
  if (survivor._id.startsWith('drafts.') || loser._id.startsWith('drafts.')) {
    throw new MergeValidationError('Cannot merge draft speaker documents')
  }
  if (survivor._type !== 'speaker' || loser._type !== 'speaker') {
    throw new MergeValidationError('Both documents must be speakers')
  }
}

/** Per-referencing-document patch produced by the plan. */
export interface MergeDocumentPatch {
  id: string
  type: string
  set: Record<string, unknown>
  repointed: number
}

/**
 * Human-readable summary of a merge — returned by the dry-run preview and, after
 * a successful merge, describing exactly what was written.
 */
export interface MergePreview {
  survivorId: string
  loserId: string
  /** Number of documents that will have (or had) a reference repointed. */
  referencingDocCount: number
  /** Per document `_type`, how many individual references were repointed. */
  referenceRepointsByType: Record<string, number>
  fieldChanges: {
    providers: IdentityFieldChange
    knownEmails: IdentityFieldChange
    email: { before: string; after: string }
    filledFromLoser: string[]
  }
  willDeleteLoserId: string
}

/** The full, precomputed plan for a merge (pure — no I/O performed). */
export interface MergePlan {
  survivorId: string
  loserId: string
  survivorSet: Record<string, unknown>
  documentPatches: MergeDocumentPatch[]
  summary: MergePreview
}

/**
 * Build the complete merge plan from already-fetched documents. Pure and
 * deterministic: the dry-run preview and the committed write are produced from
 * exactly this function, so they can never diverge.
 */
export function buildMergePlan(
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
  referencingDocs: Array<Record<string, unknown>>,
): MergePlan {
  assertMergeable(survivor, loser)

  const fieldMerge = computeSurvivorFieldMerge(survivor, loser)

  const documentPatches: MergeDocumentPatch[] = []
  const referenceRepointsByType: Record<string, number> = {}

  for (const doc of referencingDocs) {
    // The loser is deleted, and the survivor's own fields are handled separately.
    if (doc._id === loser._id || doc._id === survivor._id) continue

    const {
      changedKeys,
      doc: transformed,
      repointed,
    } = repointReferencesInDocument(doc, loser._id, survivor._id)
    if (repointed === 0 || changedKeys.length === 0) continue

    const set: Record<string, unknown> = {}
    for (const key of changedKeys) set[key] = transformed[key]

    const type = String(doc._type ?? 'unknown')
    documentPatches.push({ id: String(doc._id), type, set, repointed })
    referenceRepointsByType[type] =
      (referenceRepointsByType[type] ?? 0) + repointed
  }

  const summary: MergePreview = {
    survivorId: survivor._id,
    loserId: loser._id,
    referencingDocCount: documentPatches.length,
    referenceRepointsByType,
    fieldChanges: {
      providers: fieldMerge.identity.providers,
      knownEmails: fieldMerge.identity.knownEmails,
      email: fieldMerge.identity.email,
      filledFromLoser: fieldMerge.filledFromLoser,
    },
    willDeleteLoserId: loser._id,
  }

  return {
    survivorId: survivor._id,
    loserId: loser._id,
    survivorSet: fieldMerge.set,
    documentPatches,
    summary,
  }
}

/** Options for {@link mergeSpeakers}. */
export interface MergeSpeakersOptions {
  survivorId: string
  loserId: string
  /** The organizer performing the merge (for the audit log). */
  actor: { _id: string; name?: string }
  /** When true, compute and return the preview WITHOUT writing anything. */
  dryRun?: boolean
}

/** Result of {@link mergeSpeakers}. */
export interface MergeSpeakersResult {
  preview: MergePreview | null
  committed: boolean
  err: Error | null
}

async function fetchRawSpeaker(id: string): Promise<MergeSpeakerDoc | null> {
  return clientRead.fetch<MergeSpeakerDoc | null>(
    groq`*[_id == $id][0]`,
    { id },
    { cache: 'no-store' },
  )
}

/**
 * Merge the `loser` speaker into the `survivor` speaker (or, with `dryRun`,
 * preview the operation). Reference repointing, the survivor field patch and the
 * loser deletion all happen in ONE atomic Sanity transaction, with the delete
 * ordered last so no inbound reference dangles.
 */
export async function mergeSpeakers(
  opts: MergeSpeakersOptions,
): Promise<MergeSpeakersResult> {
  const { survivorId, loserId, actor, dryRun = false } = opts

  try {
    if (survivorId === loserId) {
      throw new MergeValidationError('Cannot merge a speaker into itself')
    }

    const [survivor, loser] = await Promise.all([
      fetchRawSpeaker(survivorId),
      fetchRawSpeaker(loserId),
    ])

    // Enumerate every inbound reference to the loser generically (mirrors
    // deleteProposal), then repoint each one to the survivor.
    const referencingDocs =
      (await clientRead.fetch<Array<Record<string, unknown>>>(
        groq`*[references($loserId) && _id != $loserId]`,
        { loserId },
        { cache: 'no-store' },
      )) ?? []

    const plan = buildMergePlan(
      survivor as MergeSpeakerDoc,
      loser as MergeSpeakerDoc,
      referencingDocs,
    )

    if (dryRun) {
      return { preview: plan.summary, committed: false, err: null }
    }

    const transaction = clientWrite.transaction()
    for (const patch of plan.documentPatches) {
      transaction.patch(patch.id, (p) => p.set(patch.set))
    }
    if (Object.keys(plan.survivorSet).length > 0) {
      transaction.patch(survivorId, (p) => p.set(plan.survivorSet))
    }
    // Delete the loser LAST so all inbound references are already repointed.
    transaction.delete(loserId)
    await transaction.commit()

    // Audit log: who merged what, and the shape of the change.
    console.info('[speaker-merge] merged duplicate speaker', {
      actor: actor._id,
      actorName: actor.name,
      survivorId,
      loserId,
      referencingDocCount: plan.summary.referencingDocCount,
      referenceRepointsByType: plan.summary.referenceRepointsByType,
      filledFromLoser: plan.summary.fieldChanges.filledFromLoser,
    })

    return { preview: plan.summary, committed: true, err: null }
  } catch (error) {
    if (!(error instanceof MergeValidationError)) {
      console.error('Error merging speakers:', error)
    }
    return { preview: null, committed: false, err: error as Error }
  }
}
