/**
 * Speaker merge (identity Phase 3).
 *
 * An ADMIN-only, destructive operation that folds a duplicate ("loser") speaker
 * document into a canonical ("survivor") one:
 *  1. Every inbound reference to the loser is repointed to the survivor.
 *  2. Identity fields (`providers`, `knownEmails`) are unioned onto the survivor.
 *     Display emails are NOT folded into `knownEmails` (#808): that verified
 *     match-set has one writer, the login path.
 *  3. Scalar fields fill ONLY the survivor's gaps (survivor wins deterministically).
 *  4. A recovery entry is appended to the survivor's own `mergedWith[]` — the
 *     complete deleted document, the survivor values overwritten, and the field
 *     choices made. The loser's own entries are carried forward, so a chain of
 *     merges keeps its whole trail.
 *  5. The loser document is deleted — all in one atomic Sanity transaction so
 *     nothing dangles.
 *
 * THERE IS NO UNDO, by decision. The snapshot is for a human to recover FROM;
 * nothing here reverses a merge. The trail lives ON the survivor so it is
 * org-scoped, erased and retention-bounded by construction — see the
 * `mergedWith` field in `sanity/schemaTypes/speaker.ts`.
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
import { canonicalEmail, normalizeEmail, uniqueEmails } from './email'

/** Minimal shape of a raw (unprojected) speaker document used by the merge. */
export interface MergeSpeakerDoc {
  _id: string
  _type: string
  _rev?: string
  name?: string
  email?: string
  slug?: { _type?: string; current?: string } | string
  providers?: (string | null | undefined)[]
  knownEmails?: (string | null | undefined)[]
  bio?: string
  title?: string
  links?: unknown[]
  flags?: unknown[]
  organizations?: unknown[]
  gender?: string
  genderSelfDescribe?: string
  country?: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/**
 * `_key` prefix minted by `recordSpeakerTicketEmailed`
 * (`src/lib/proposal/data/sanity.ts`): the array key ENCODES the speaker id, so
 * repointing `speakerId` without rewriting the key would leave the marker
 * invisible to that writer's own `_key` lookup and it would append a second one.
 */
const SPEAKER_TICKET_KEY_PREFIX = 'speaker-ticket-'

/**
 * `talk.issuedSpeakerTickets[].speakerId` is a plain STRING, not a reference
 * (`sanity/schemaTypes/talk.ts`), so the generic reference walk cannot see it. A
 * merge that leaves the dead loser id there either lets the survivor be issued a
 * SECOND complimentary speaker ticket or blocks a legitimate re-issue, because
 * `speakerTicket`'s skip-set is keyed on exactly this field.
 *
 * COLLISION (both speakers hold a marker on the same talk): they collapse into
 * ONE survivor entry — two entries naming the same speaker is not a state any
 * writer here can produce, and `_key` is derived from the speaker id, so two
 * would also mean two identical keys (an invalid Sanity array). The FIRST entry
 * wins, consistent with the reference dedup above; entries are only ever
 * appended, so first == earliest `emailedAt` — the delivery that actually
 * happened first. The dropped entry's `email` snapshot is not needed to keep the
 * erasure sweep correct: it matches talks by `speakerId` as well as by email.
 */
function repointIssuedSpeakerTickets(
  entries: unknown[],
  loserId: string,
  survivorId: string,
  counter: { count: number },
): unknown[] {
  let changed = false
  let keptSurvivorEntry = false
  const out: unknown[] = []
  for (const entry of entries) {
    const speakerId = isRecord(entry) ? entry.speakerId : undefined
    if (speakerId !== loserId && speakerId !== survivorId) {
      out.push(entry)
      continue
    }
    if (speakerId === loserId) counter.count += 1
    if (keptSurvivorEntry) {
      changed = true
      continue
    }
    keptSurvivorEntry = true
    const canonicalKey = `${SPEAKER_TICKET_KEY_PREFIX}${survivorId}`
    if (speakerId === survivorId) {
      // The survivor's OWN entry is kept as-is except for its `_key`: a legacy
      // key (`speaker-ticket-legacy` exists in the wild, see
      // `erasure.test.ts`) is invisible to `recordSpeakerTicketEmailed`'s
      // `_key` lookup, which would then APPEND a second entry for the same
      // speakerId — the two-entries state this function's contract says no
      // writer can produce. Normalizing here is what keeps that true.
      if (isRecord(entry) && entry._key !== canonicalKey) {
        changed = true
        out.push({ ...entry, _key: canonicalKey })
      } else {
        out.push(entry)
      }
      continue
    }
    changed = true
    out.push({
      ...(entry as Record<string, unknown>),
      speakerId: survivorId,
      _key: canonicalKey,
    })
  }
  return changed ? out : entries
}

/**
 * `conversation.participants[]` holds `conversationParticipant` OBJECTS that
 * WRAP a speaker reference, so the array dedup in {@link transformValue} (which
 * only collapses items that ARE references) leaves a thread both speakers were
 * on with two identical survivor parties.
 *
 * COLLISION: the two parties collapse into one; the FIRST is kept so its `_key`
 * survives, matching the reference dedup. NOTHING is combined because a
 * `conversationParticipant` carries NO per-participant state — it is a
 * `partyType` discriminator plus exactly one identity field
 * (`sanity/schemaTypes/conversationParticipant.ts`). Mute, archive, unread and
 * last-read live in the per-speaker `conversationPreference` /
 * `notification.message.` documents, which the deterministic-id reconciliation
 * below already merges.
 */
function dedupeParticipants(items: unknown[], survivorId: string): unknown[] {
  let seenSurvivor = false
  let changed = false
  const out: unknown[] = []
  for (const item of items) {
    const speaker = isRecord(item) ? item.speaker : undefined
    if (isReference(speaker) && speaker._ref === survivorId) {
      if (seenSurvivor) {
        changed = true
        continue
      }
      seenSurvivor = true
    }
    out.push(item)
  }
  return changed ? out : items
}

/**
 * The speaker-identity sites the generic reference walk cannot reconcile on its
 * own: a speaker id stored as a plain string, and a reference wrapped in an
 * object inside an array. Runs AFTER {@link transformValue}, so the participant
 * refs it dedups have already been repointed to the survivor.
 */
function reconcileSpeakerKeyedArrays(
  doc: Record<string, unknown>,
  loserId: string,
  survivorId: string,
  counter: { count: number },
): Record<string, unknown> {
  let out = doc

  if (doc._type === 'talk' && Array.isArray(doc.issuedSpeakerTickets)) {
    const next = repointIssuedSpeakerTickets(
      doc.issuedSpeakerTickets,
      loserId,
      survivorId,
      counter,
    )
    if (next !== doc.issuedSpeakerTickets) {
      out = { ...out, issuedSpeakerTickets: next }
    }
  }

  if (doc._type === 'conversation' && Array.isArray(doc.participants)) {
    const next = dedupeParticipants(doc.participants, survivorId)
    if (next !== doc.participants) out = { ...out, participants: next }
  }

  return out
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
  const transformed = reconcileSpeakerKeyedArrays(
    transformValue(doc, loserId, survivorId, counter) as Record<
      string,
      unknown
    >,
    loserId,
    survivorId,
    counter,
  )

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

/** Which of the two documents a field's value is taken from. */
export type MergeSide = 'survivor' | 'loser'

/**
 * The fields the operator may steer, and the ONLY keys accepted in
 * `fieldSelections`. A selection names a SIDE, never a value: the server
 * re-reads both documents and resolves the side against them, so the merge
 * mutation can never be used to write operator-supplied content into a speaker.
 *
 * `image` is the PROFILE PICTURE AS A WHOLE — it governs the `image` (uploaded
 * asset) and `imageURL` (provider avatar) fields TOGETHER, and there is no
 * separate `imageURL` key. Every read of a speaker picture in this repo is
 * `coalesce(image.asset->url, imageURL)`, so the two are not independent
 * choices: picking the survivor's `imageURL` while the loser's uploaded `image`
 * lands next to it would display the loser's picture anyway. One choice, one
 * rendered result. See {@link MergePictureValue}.
 */
export const SELECTABLE_MERGE_FIELDS = [
  'email',
  'name',
  'bio',
  'title',
  'image',
  'gender',
  'country',
] as const
export type SelectableMergeField = (typeof SELECTABLE_MERGE_FIELDS)[number]

/** Operator overrides, per field. Absent → the recommendation is applied. */
export type MergeFieldSelections = Partial<
  Record<SelectableMergeField, MergeSide>
>

/**
 * Why a side was recommended. Machine-readable so the UI can render the phrasing
 * (and so a test can assert the RULE, not a sentence).
 */
export type MergeFieldReason =
  /** The other side is empty — nothing to weigh. */
  | 'only-value'
  /** The address is in that document's provider-verified `knownEmails`. */
  | 'verified-known-account'
  /** That document has `providers[]` — a real login, not a typed placeholder. */
  | 'has-linked-account'
  /** That side's picture is an UPLOADED asset, not a provider avatar URL. */
  | 'uploaded-picture'
  /** That side's text is longer — a written bio beats a one-word stub. */
  | 'longer-text'
  /** Both sides have a value and no signal separates them; survivor wins. */
  | 'survivor-default'

/**
 * The candidate value for the `image` row: a speaker's picture is the PAIR
 * (uploaded asset, provider avatar URL), because that is what
 * `coalesce(image.asset->url, imageURL)` renders. `undefined` when the side has
 * neither.
 */
export interface MergePictureValue {
  /** The raw Sanity image object (`{ asset: { _ref } }`), when uploaded. */
  image?: unknown
  /** The provider avatar URL, when that is all the side has. */
  imageURL?: string
}

/** One reviewable field: both candidate values, the recommendation, the choice. */
export interface MergeFieldChoice {
  field: SelectableMergeField
  /** For `image` this is a {@link MergePictureValue}; otherwise the raw field. */
  survivorValue: unknown
  loserValue: unknown
  recommended: MergeSide
  reason: MergeFieldReason
  /** The side actually applied — `recommended` unless the operator overrode it. */
  selected: MergeSide
}

/** Fields merged as a UNION of both sides; no choice is meaningful. */
export const UNION_MERGE_FIELDS = [
  'providers',
  'knownEmails',
  'links',
  'flags',
  'organizations',
] as const
export type UnionMergeField = (typeof UNION_MERGE_FIELDS)[number]

/** The computed patch to apply to the survivor, plus a preview-friendly view. */
export interface SurvivorFieldMerge {
  /** Only the fields that actually change (used to build the survivor patch). */
  set: Record<string, unknown>
  /**
   * Fields to UNSET on the survivor. The ONLY producer is the `image` choice —
   * see {@link applyPictureChoice} for why the picture cannot honour an operator
   * choice with `set` alone. Every other field obeys the never-unset policy.
   */
  unset: string[]
  identity: {
    providers: IdentityFieldChange
    knownEmails: IdentityFieldChange
    email: { before: string; after: string }
  }
  /** Per-field review rows: candidates, recommendation, reason, chosen side. */
  fields: MergeFieldChoice[]
  /** Before/after for every unioned multi-value field. */
  unions: Record<UnionMergeField, { before: unknown[]; after: unknown[] }>
  /** Fields whose applied value came from the loser document. */
  filledFromLoser: string[]
}

/**
 * Scalar/opaque fields the survivor keeps by default; the loser fills gaps (and
 * the operator may flip any of them). `links`/`flags` used to live here — they
 * are ARRAYS, so gap-fill destroyed the loser's whole set whenever the survivor
 * had any value at all. They are unioned now.
 *
 * NOTE: `consent` is deliberately NOT merged at all. A GDPR consent record
 * belongs to the specific person/session that granted it; copying the loser's
 * consent onto the survivor would mis-attribute a consent artifact.
 *
 * `genderSelfDescribe` is not independently selectable: it is only meaningful
 * next to the `gender` value it describes, so it travels with whichever side
 * `gender` is taken from — with two limits that follow from the never-UNSET
 * policy, stated here rather than papered over:
 *
 *  1. it travels only when that side's `gender` was actually APPLIED. A selected
 *     side with an empty `gender` is a no-op (the survivor keeps its own), and
 *     its self-description stays behind with it.
 *  2. an ORPHAN can survive: selecting a loser `gender` of e.g. 'Male' onto a
 *     survivor holding 'Prefer to self-describe' plus text replaces the gender
 *     but leaves the now-meaningless text, because this function never unsets a
 *     field. Clearing it would be the first UNSET in the merge; the orphan is
 *     cosmetic, a lost value is not, so the policy wins. Fixing it means giving
 *     the merge an explicit unset channel.
 */
const GENDER_COMPANION_FIELD = 'genderSelfDescribe'

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

/** Deduplicated union of two string arrays, survivor order first. */
function unionStrings(a: unknown, b: unknown): string[] {
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        )
      : []
  return Array.from(new Set([...list(a), ...list(b)]))
}

/**
 * Union two reference arrays, deduplicated by `_ref`, survivor entries first.
 *
 * Array items in Sanity need a UNIQUE `_key`; the loser's keys were minted in a
 * different document and can collide with the survivor's, so a colliding (or
 * missing) key is replaced by one derived deterministically from the `_ref`.
 * Deterministic matters: the dry-run preview and the committed write are the
 * same function, and a random key would make them differ.
 *
 * The derived key is itself de-collided by suffix, because stripping non-alnum
 * characters is not injective — `org.a` and `org-a` are different documents that
 * both strip to `orga`, and two identical `_key`s are an invalid Sanity array.
 */
function unionReferences(a: unknown, b: unknown): unknown[] {
  const items = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
  const seenRefs = new Set<string>()
  const seenKeys = new Set<string>()
  const out: unknown[] = []
  for (const item of items) {
    if (!isReference(item)) continue
    if (seenRefs.has(item._ref)) continue
    seenRefs.add(item._ref)
    let key = item._key
    if (!key || seenKeys.has(key)) {
      const base = `merged-${item._ref.replace(/[^A-Za-z0-9]/g, '')}`
      key = base
      for (let n = 2; seenKeys.has(key); n += 1) key = `${base}-${n}`
    }
    seenKeys.add(key)
    out.push({ ...item, _key: key })
  }
  return out
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function hasLogin(doc: MergeSpeakerDoc): boolean {
  return stringList(doc.providers).length > 0
}

/**
 * Which document's DISPLAY email to keep.
 *
 * The reported bug: `email` used to follow whichever document won
 * {@link pickSurvivor} (ranked on confirmed talks → talks → age — no email
 * signal at all). The organizer-created placeholder usually holds the talks
 * while the provider-verified login document holds none, so the typed
 * placeholder address overwrote the real one and the real one was deleted with
 * the loser.
 *
 * The evidence this ranks on, strongest first:
 *  1. only one side has an address at all;
 *  2. the address appears in that document's `knownEmails` — the match-set only
 *     the login paths write, so it is provably provider-verified;
 *  3. that document has `providers[]` — someone actually signed in as it, so its
 *     address is at least account-backed rather than typed by an organizer.
 * Otherwise the survivor keeps its own (the operator chose the survivor).
 */
function recommendEmail(
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
): { recommended: MergeSide; reason: MergeFieldReason } {
  const survivorEmail = normalizeEmail(survivor.email)
  const loserEmail = normalizeEmail(loser.email)
  if (survivorEmail && !loserEmail) {
    return { recommended: 'survivor', reason: 'only-value' }
  }
  if (!survivorEmail && loserEmail) {
    return { recommended: 'loser', reason: 'only-value' }
  }
  if (!survivorEmail && !loserEmail) {
    return { recommended: 'survivor', reason: 'survivor-default' }
  }

  const survivorVerified = uniqueEmails(survivor.knownEmails ?? []).includes(
    survivorEmail,
  )
  const loserVerified = uniqueEmails(loser.knownEmails ?? []).includes(
    loserEmail,
  )
  if (survivorVerified !== loserVerified) {
    return {
      recommended: survivorVerified ? 'survivor' : 'loser',
      reason: 'verified-known-account',
    }
  }

  if (!survivorVerified) {
    const survivorLogin = hasLogin(survivor)
    const loserLogin = hasLogin(loser)
    if (survivorLogin !== loserLogin) {
      return {
        recommended: survivorLogin ? 'survivor' : 'loser',
        reason: 'has-linked-account',
      }
    }
  }

  return { recommended: 'survivor', reason: 'survivor-default' }
}

/** Gap-fill recommendation: the survivor keeps its value unless it has none. */
function recommendScalar(
  survivorValue: unknown,
  loserValue: unknown,
): { recommended: MergeSide; reason: MergeFieldReason } {
  if (isEmptyValue(survivorValue) && !isEmptyValue(loserValue)) {
    return { recommended: 'loser', reason: 'only-value' }
  }
  if (!isEmptyValue(survivorValue) && isEmptyValue(loserValue)) {
    return { recommended: 'survivor', reason: 'only-value' }
  }
  return { recommended: 'survivor', reason: 'survivor-default' }
}

/**
 * `name` (#1027 item 8). It used to be non-negotiable — the survivor's name
 * always won — which loses to the commonest duplicate shape in this dataset: an
 * organizer types "J. Doe" into `speaker.admin.create`, the person later signs in
 * and their provider supplies "Jane Doe". When one side has a LINKED ACCOUNT and
 * the other does not, the linked one's name came from the provider (or from the
 * person editing their own profile) and the other was typed on their behalf.
 */
function recommendName(
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
): { recommended: MergeSide; reason: MergeFieldReason } {
  const gap = recommendScalar(survivor.name, loser.name)
  if (gap.reason === 'only-value') return gap
  if (isEmptyValue(survivor.name) && isEmptyValue(loser.name)) return gap

  const survivorLogin = hasLogin(survivor)
  if (survivorLogin !== hasLogin(loser)) {
    return {
      recommended: survivorLogin ? 'survivor' : 'loser',
      reason: 'has-linked-account',
    }
  }
  return { recommended: 'survivor', reason: 'survivor-default' }
}

/**
 * `bio` (#1027 item 8). Gap-fill made a one-word placeholder beat a written
 * biography whenever the placeholder happened to sit on the survivor. Length is
 * a crude signal but the right one here: nobody writes a LONGER bio by accident,
 * and the operator sees both and can flip it.
 */
function recommendText(
  survivorValue: unknown,
  loserValue: unknown,
): { recommended: MergeSide; reason: MergeFieldReason } {
  const gap = recommendScalar(survivorValue, loserValue)
  if (gap.reason !== 'survivor-default') return gap
  const length = (value: unknown) =>
    typeof value === 'string' ? value.trim().length : 0
  const survivorLength = length(survivorValue)
  const loserLength = length(loserValue)
  if (loserLength > survivorLength) {
    return { recommended: 'loser', reason: 'longer-text' }
  }
  if (survivorLength > loserLength) {
    return { recommended: 'survivor', reason: 'longer-text' }
  }
  return gap
}

/** The picture a side actually has, or `undefined` when it has none. */
function pictureValue(doc: MergeSpeakerDoc): MergePictureValue | undefined {
  const hasImage = !isEmptyValue(doc.image)
  const hasUrl = !isEmptyValue(doc.imageURL)
  if (!hasImage && !hasUrl) return undefined
  return {
    ...(hasImage ? { image: doc.image } : {}),
    ...(hasUrl ? { imageURL: doc.imageURL } : {}),
  }
}

/**
 * `image` (#1027 item 8). Gap-fill over the two fields SEPARATELY meant a stale
 * provider avatar on the survivor survived next to a hand-uploaded asset folded
 * in from the loser — and since every read is
 * `coalesce(image.asset->url, imageURL)`, the loser's upload then rendered
 * regardless of what the survivor "kept". So the picture is one choice, and an
 * UPLOADED asset beats a provider avatar URL: somebody chose the upload, the
 * avatar is whatever the OAuth profile happened to hold at first sign-in.
 */
function recommendPicture(
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
): { recommended: MergeSide; reason: MergeFieldReason } {
  const survivorPicture = pictureValue(survivor)
  const loserPicture = pictureValue(loser)
  if (survivorPicture && !loserPicture) {
    return { recommended: 'survivor', reason: 'only-value' }
  }
  if (!survivorPicture && loserPicture) {
    return { recommended: 'loser', reason: 'only-value' }
  }
  if (!survivorPicture && !loserPicture) {
    return { recommended: 'survivor', reason: 'survivor-default' }
  }
  const survivorUploaded = !isEmptyValue(survivor.image)
  if (survivorUploaded !== !isEmptyValue(loser.image)) {
    return {
      recommended: survivorUploaded ? 'survivor' : 'loser',
      reason: 'uploaded-picture',
    }
  }
  return { recommended: 'survivor', reason: 'survivor-default' }
}

/**
 * Apply the `image` choice to BOTH picture fields, so the survivor's rendered
 * picture becomes exactly the selected side's.
 *
 * THE ONE UNSET IN THIS MODULE, and it is load-bearing rather than tidy: the
 * survivor keeping an uploaded `image` while the operator picked the loser's
 * `imageURL` is not a harmless leftover — `coalesce(image.asset->url, imageURL)`
 * would go on rendering the asset, so the choice the operator made in the
 * preview would be silently ignored. A UI that shows a decision it does not
 * make is worse than a lost field, and the discarded value is now captured in
 * the merge log's `survivorBefore`.
 *
 * Choosing a side that has NO picture at all is still a no-op (the survivor
 * keeps its own) — the never-unset policy holds wherever a choice would only
 * destroy.
 */
function applyPictureChoice(
  survivor: MergeSpeakerDoc,
  source: MergeSpeakerDoc,
  set: Record<string, unknown>,
  unset: string[],
): boolean {
  if (!pictureValue(source)) return false
  let changed = false
  for (const field of ['image', 'imageURL'] as const) {
    const next = source[field]
    if (!isEmptyValue(next)) {
      if (!sameJson(next, survivor[field])) {
        set[field] = next
        changed = true
      }
    } else if (!isEmptyValue(survivor[field])) {
      unset.push(field)
      changed = true
    }
  }
  return changed
}

/**
 * Compute the identity union + scalar reconciliation to apply to the survivor.
 *
 * - `providers`: deduplicated union.
 * - `knownEmails`: normalized, deduplicated union of the two accounts' existing
 *   match-sets ONLY. Display emails are NOT folded in (#808) — that would let an
 *   unverified organizer-written `email` become a verified match key.
 * - `links`, `flags`, `organizations`: deduplicated unions. These are ARRAYS —
 *   gap-filling them destroyed the loser's whole set whenever the survivor had
 *   any value (a lost `requiresTravelFunding` flag is real data loss).
 * - `email` (display) and the other scalars: a RECOMMENDED side per field, which
 *   `selections` may override. `email`'s recommendation is verification-aware
 *   (see {@link recommendEmail}); the rest gap-fill (survivor keeps its value
 *   unless empty). The survivor's `slug` is intentionally never touched.
 *
 * `selections` only ever names a SIDE — the values come from the two documents
 * read here, never from the caller — so it cannot be used to write chosen
 * content into a speaker document. A selected side whose value is empty is a
 * no-op: this function never UNSETS a field the survivor already has, with the
 * single documented exception of the picture pair (see
 * {@link applyPictureChoice}), where a leftover would override the operator's
 * own choice at render time.
 */
export function computeSurvivorFieldMerge(
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
  selections: MergeFieldSelections = {},
): SurvivorFieldMerge {
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  const filledFromLoser: string[] = []

  // providers — deduplicated union, survivor order first.
  const providersBefore = stringList(survivor.providers)
  const providersAfter = Array.from(
    new Set([...providersBefore, ...stringList(loser.providers)]),
  )
  if (providersAfter.length !== providersBefore.length) {
    set.providers = providersAfter
  }

  // knownEmails — normalized union of ONLY the two accounts' existing verified
  // match-sets.
  //
  // SECURITY (#808): the display `email` is DELIBERATELY excluded from this
  // union. `knownEmails` is the verified login match-set (`findSpeakersByEmails`
  // in `./sanity.ts` treats it as verified-owned), whereas the display `email`
  // has an UNVERIFIED writer: `speaker.admin.create` stamps an organizer-typed
  // address before anyone signs in. Folding display emails in here let an
  // organizer create a throwaway with an attacker-chosen `email`, merge it into
  // a victim they hold, and land that address in the victim's VERIFIED set — a
  // cross-tenant account-takeover primitive. The verified set's only legitimate
  // writers are the login paths (`linkProviderToSpeaker` / `getOrCreateSpeaker` /
  // `getOrCreateSpeakerForVerifiedEmail`). Any address dropped by narrowing this
  // union was therefore not provably verified AT THE MERGE BOUNDARY: the
  // provider-id fast path does not refresh `knownEmails` on a returning login,
  // and self-service `updateProfileEmail` writes the display `email` only, so a
  // legitimate loser can hold a verified display address that never reached
  // `knownEmails`. Dropping it costs at worst a recoverable dedup miss (the
  // loser's `providers[]` still merge, so no login is orphaned) — the opposite
  // asymmetry (admitting an unverified address into the verified set) is the
  // account-takeover, so failing closed here is the correct trade. Making the
  // fast path refresh `knownEmails` would erase even that dedup miss (follow-up).
  const knownBefore = uniqueEmails(survivor.knownEmails ?? [])
  const knownAfter = uniqueEmails([
    ...(survivor.knownEmails ?? []),
    ...(loser.knownEmails ?? []),
  ])
  if (knownAfter.length !== knownBefore.length) {
    set.knownEmails = knownAfter
  }

  // links / flags — deduplicated unions of two string arrays.
  const linksAfter = unionStrings(survivor.links, loser.links)
  const linksBefore = unionStrings(survivor.links, undefined)
  if (!sameJson(survivor.links ?? [], linksAfter) && linksAfter.length > 0) {
    set.links = linksAfter
  }
  const flagsAfter = unionStrings(survivor.flags, loser.flags)
  const flagsBefore = unionStrings(survivor.flags, undefined)
  if (!sameJson(survivor.flags ?? [], flagsAfter) && flagsAfter.length > 0) {
    set.flags = flagsAfter
  }

  // organizations — union of tenant memberships, deduplicated by `_ref`. A
  // person merged out of one org must not lose membership of the other.
  const orgsAfter = unionReferences(survivor.organizations, loser.organizations)
  const orgsBefore = unionReferences(survivor.organizations, undefined)
  if (!sameJson(survivor.organizations ?? [], orgsAfter) && orgsAfter.length) {
    set.organizations = orgsAfter
  }

  // Per-field choices: email by the verification-aware rule, the rest gap-fill.
  // An explicit `selections` entry overrides the recommendation.
  const fields: MergeFieldChoice[] = []
  for (const field of SELECTABLE_MERGE_FIELDS) {
    const isPicture = field === 'image'
    const survivorValue = isPicture ? pictureValue(survivor) : survivor[field]
    const loserValue = isPicture ? pictureValue(loser) : loser[field]
    const { recommended, reason } =
      field === 'email'
        ? recommendEmail(survivor, loser)
        : field === 'name'
          ? recommendName(survivor, loser)
          : field === 'bio'
            ? // `title` deliberately stays plain gap-fill: length says nothing
              // useful about a job title ("CTO" is not worse than "Chief
              // Technology Officer, EMEA"), so there is no signal to rank on.
              recommendText(survivor[field], loser[field])
            : isPicture
              ? recommendPicture(survivor, loser)
              : recommendScalar(survivorValue, loserValue)
    const selected = selections[field] ?? recommended
    fields.push({
      field,
      survivorValue,
      loserValue,
      recommended,
      reason,
      selected,
    })

    const source = selected === 'loser' ? loser : survivor
    // The picture is applied across BOTH of its fields at once, so it has its
    // own apply step — see {@link applyPictureChoice}.
    if (isPicture) {
      if (
        applyPictureChoice(survivor, source, set, unset) &&
        selected === 'loser'
      ) {
        filledFromLoser.push(field)
      }
      continue
    }
    // The display `email` is a STORED recipient address (#684): write it in its
    // canonical form, exactly as `updateProfileEmail` does, or the next login
    // resolves the canonical address to no document and spawns a duplicate.
    const raw = source[field]
    const value =
      field === 'email' && typeof raw === 'string' ? canonicalEmail(raw) : raw
    // Never UNSET: choosing a side that has nothing leaves the survivor's value.
    if (isEmptyValue(value)) continue
    if (!sameJson(value, survivorValue)) set[field] = value
    if (selected === 'loser' && !sameJson(value, survivorValue)) {
      filledFromLoser.push(field)
    }
    // `genderSelfDescribe` travels with whichever side `gender` was taken from
    // — but only when that side's `gender` was actually applied (the empty-value
    // `continue` above already skipped it otherwise). See the note on
    // {@link GENDER_COMPANION_FIELD} for the orphan case this cannot fix.
    if (field === 'gender') {
      const companion = source[GENDER_COMPANION_FIELD]
      if (
        !isEmptyValue(companion) &&
        !sameJson(companion, survivor[GENDER_COMPANION_FIELD])
      ) {
        set[GENDER_COMPANION_FIELD] = companion
        if (selected === 'loser') filledFromLoser.push(GENDER_COMPANION_FIELD)
      }
    }
  }

  const emailBefore = survivor.email ?? ''
  const emailAfter = isEmptyValue(set.email)
    ? emailBefore
    : (set.email as string)

  return {
    set,
    unset,
    identity: {
      providers: { before: providersBefore, after: providersAfter },
      knownEmails: { before: knownBefore, after: knownAfter },
      email: {
        before: normalizeEmail(emailBefore),
        after: normalizeEmail(emailAfter),
      },
    },
    fields,
    unions: {
      providers: { before: providersBefore, after: providersAfter },
      knownEmails: { before: knownBefore, after: knownAfter },
      links: { before: linksBefore, after: linksAfter },
      flags: { before: flagsBefore, after: flagsAfter },
      organizations: { before: orgsBefore, after: orgsAfter },
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

// ---------------------------------------------------------------------------
// Deterministic-id doc reconciliation (QR-M4)
//
// Some messaging docs use a DETERMINISTIC id that ENCODES the speaker/recipient
// id as the trailing segment: `<prefix>.<conversationId>.<speakerId>`:
//   - conversationPreference → `convpref.<conv>.<speakerId>`
//   - collapsed message notification → `notification.message.<conv>.<recipientId>`
//   - recurring reminder marker → `reminder.<key>.<conferenceId>.<speakerId>`
//   - day-of reminder marker → `reminder.day-of.<conferenceId>.<speakerId>.<date>`
//     (the ONE id whose speaker segment is not the last one — see
//     `reminderLogId` / `dayOfLogId` in `src/lib/reminders/marker.ts`)
// A plain reference repoint (the generic path) rewrites the inner ref to the
// survivor but LEAVES the doc keyed by the loser id. If the survivor already
// holds the canonical-id sibling for the same conversation, BOTH docs then point
// at the survivor and:
//   - listConversations sums `coalesce(count,1)` across both notification links →
//     DOUBLED unread;
//   - getConversationPreference reads ONLY the canonical id → a mute recorded on
//     the loser-suffixed pref is SILENTLY IGNORED;
//   - the reminder cron's `createIfNotExists` against the SURVIVOR-keyed marker
//     finds nothing → every recurring reminder the loser already received is
//     RE-SENT, and a day-of ping goes out twice.
// So these docs must be RECONCILED onto the survivor's canonical id (merged when
// it exists, recreated otherwise) and the loser-suffixed doc deleted — never left
// repointed-but-loser-keyed.
// ---------------------------------------------------------------------------

const DETERMINISTIC_ID_PREFIXES = [
  'convpref.',
  'notification.message.',
  'reminder.',
] as const

/** The one deterministic id that appends a segment AFTER the speaker id. */
const DAY_OF_REMINDER_PREFIX = 'reminder.day-of.'

/**
 * The SURVIVOR-keyed id for a deterministic doc keyed by the LOSER, or `null`
 * when `id` is not such a doc — i.e. `null` means the generic reference repoint
 * is the correct handling. (A notification whose recipient is a THIRD speaker
 * but whose ACTOR is the loser ends with that third speaker's id, so it is NOT a
 * collision and keeps the generic actor repoint.)
 */
function canonicalDeterministicId(
  loserDocId: string,
  loserId: string,
  survivorId: string,
): string | null {
  if (!DETERMINISTIC_ID_PREFIXES.some((p) => loserDocId.startsWith(p))) {
    return null
  }
  if (loserDocId.endsWith(`.${loserId}`)) {
    return loserDocId.slice(0, loserDocId.length - loserId.length) + survivorId
  }
  // Day-of markers carry a trailing `.<date>`, so the speaker id sits in the
  // middle. Restricted to that prefix on purpose: a mid-id match is only
  // unambiguous where the shape is known — and here that shape is
  // `<prefix><conferenceId>.<speakerId>.<date>`, which resolves to ONE candidate
  // only because conference ids are dot-free (Sanity ids are, and the search
  // starts at the prefix so the marker name itself cannot match). A dotted
  // conference id would reintroduce the ambiguity.
  if (loserDocId.startsWith(DAY_OF_REMINDER_PREFIX)) {
    const segment = `.${loserId}.`
    const at = loserDocId.indexOf(segment, DAY_OF_REMINDER_PREFIX.length - 1)
    if (at !== -1) {
      return (
        loserDocId.slice(0, at + 1) +
        survivorId +
        loserDocId.slice(at + segment.length - 1)
      )
    }
  }
  return null
}

/** A sane ceiling so a merge can never mint an absurd unread badge count. */
const MERGED_UNREAD_COUNT_CAP = 999

function toPositiveCount(value: unknown): number {
  return typeof value === 'number' && value > 0 ? value : 1
}

/** A reminder send counter: absent or nonsense counts as zero sends. */
function toSendCount(value: unknown): number {
  return typeof value === 'number' && value > 0 ? value : 0
}

/** The later of two (optional) ISO timestamps — ISO strings sort lexically. */
function laterIso(a: unknown, b: unknown): string | undefined {
  const av = typeof a === 'string' ? a : undefined
  const bv = typeof b === 'string' ? b : undefined
  if (av && bv) return av >= bv ? av : bv
  return av ?? bv
}

/** Strip Sanity system meta so a fetched doc can be re-created under a new id. */
function stripSystemMeta(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const clone = { ...doc }
  delete clone._rev
  delete clone._createdAt
  delete clone._updatedAt
  return clone
}

/**
 * The reconciliation of ONE loser-suffixed deterministic doc onto the survivor's
 * canonical id. The loser doc is ALWAYS deleted (`deleteId`); the canonical doc
 * is either MERGED (`mergeSet`/`mergeUnset` patched onto an existing survivor
 * doc) or RECREATED (`createDoc`).
 */
export interface DeterministicReconciliation {
  /** The loser-suffixed doc id to delete. */
  deleteId: string
  /** The canonical (survivor-suffixed) id being written/merged. */
  canonicalId: string
  /** MERGE: fields to `.set()` on the existing canonical doc (may be empty). */
  mergeSet?: Record<string, unknown>
  /** MERGE: keys to `.unset()` on the canonical doc (e.g. clear `readAt`). */
  mergeUnset?: string[]
  /** RECREATE: the full doc to create under the canonical id (survivor refs). */
  createDoc?: Record<string, unknown>
}

/**
 * Reconcile one loser deterministic doc against the survivor's canonical doc.
 * Pure: given the two docs it decides MERGE vs RECREATE deterministically.
 *
 * MERGE rules:
 *  - conversationPreference: the more-restrictive MUTE wins (`||`); an archive on
 *    either side is preserved (latest `archivedAt`); the survivor's email
 *    override is kept.
 *  - message notification: UNREAD if EITHER side is unread; the two unread piles
 *    are SUMMED (clamped) so the survivor's badge reflects both, never doubles.
 *  - scheduledReminderLog: the send counts are SUMMED and the LATEST `lastSentAt`
 *    wins — both sides of the gate move in the "do not send again" direction.
 *    The two markers record mails delivered to the SAME person (once per
 *    duplicate account), so the sum is the number of reminders they actually
 *    received, and `shouldSendReminder` retires the reminder that much sooner.
 *    Taking the max instead would credit the person one send they did get, and
 *    an earlier `lastSentAt` would re-open the spacing window immediately.
 *
 *    ITS COST, PLAINLY: the re-firing reminders cap at `maxSends: 2`
 *    (`src/lib/reminders/registry.ts`), so 1 + 1 hits the cap exactly and
 *    retires the reminder for good — as does any single-shot one. If the two
 *    accounts carried DIFFERENT addresses and the person only reads one inbox,
 *    they saw one reminder and will now get none. SUM is still the default —
 *    over-mailing a confirmed speaker is the worse failure, and the alternative
 *    re-sends mail this person demonstrably already received — but the silent
 *    case is real, not hypothetical.
 */
export function reconcileDeterministicDoc(
  loserDoc: Record<string, unknown>,
  survivorDoc: Record<string, unknown> | undefined,
  loserId: string,
  survivorId: string,
): DeterministicReconciliation {
  const deleteId = String(loserDoc._id)
  // Non-null for every doc the callers route here (they select docs BY this
  // function returning an id); falling back to `deleteId` keeps a misrouted doc
  // from being recreated under some other document's id.
  const canonicalId =
    canonicalDeterministicId(deleteId, loserId, survivorId) ?? deleteId

  // RECREATE: no canonical sibling — carry the loser doc over under the canonical
  // id with every loser ref repointed to the survivor.
  if (!survivorDoc) {
    const { doc } = repointReferencesInDocument(loserDoc, loserId, survivorId)
    const createDoc = { ...stripSystemMeta(doc), _id: canonicalId }
    return { deleteId, canonicalId, createDoc }
  }

  // MERGE onto the existing canonical doc.
  if (deleteId.startsWith('notification.message.')) {
    const survivorUnread = !survivorDoc.readAt
    const loserUnread = !loserDoc.readAt
    const mergeSet: Record<string, unknown> = {}
    const mergeUnset: string[] = []
    if (survivorUnread || loserUnread) {
      // Keep unread if EITHER was unread; sum the two unread piles (clamped).
      const summed =
        (survivorUnread ? toPositiveCount(survivorDoc.count) : 0) +
        (loserUnread ? toPositiveCount(loserDoc.count) : 0)
      mergeSet.count = Math.min(Math.max(summed, 1), MERGED_UNREAD_COUNT_CAP)
      if (survivorDoc.readAt) mergeUnset.push('readAt')
    }
    // Both already read → leave the survivor doc's readAt/count untouched.
    return { deleteId, canonicalId, mergeSet, mergeUnset }
  }

  // scheduledReminderLog — the gate is (count < maxSends) AND (spacing elapsed),
  // so summing the counts and keeping the later send time is the answer that
  // cannot re-send a reminder either document already delivered.
  if (deleteId.startsWith('reminder.')) {
    const mergeSet: Record<string, unknown> = {}
    const summedCount =
      toSendCount(survivorDoc.count) + toSendCount(loserDoc.count)
    if (summedCount !== survivorDoc.count) mergeSet.count = summedCount
    const lastSentAt = laterIso(survivorDoc.lastSentAt, loserDoc.lastSentAt)
    if (lastSentAt && lastSentAt !== survivorDoc.lastSentAt) {
      mergeSet.lastSentAt = lastSentAt
    }
    return { deleteId, canonicalId, mergeSet }
  }

  // conversationPreference.
  const mergeSet: Record<string, unknown> = {}
  const mergedMuted = Boolean(survivorDoc.muted) || Boolean(loserDoc.muted)
  if (mergedMuted !== Boolean(survivorDoc.muted)) mergeSet.muted = mergedMuted
  const mergedArchivedAt = laterIso(survivorDoc.archivedAt, loserDoc.archivedAt)
  if (mergedArchivedAt && mergedArchivedAt !== survivorDoc.archivedAt) {
    mergeSet.archivedAt = mergedArchivedAt
  }
  return { deleteId, canonicalId, mergeSet }
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
  /**
   * Deterministic-id docs (convpref / message notification) reconciled onto the
   * survivor's canonical id rather than repointed in place (QR-M4).
   */
  reconciledDeterministicDocCount: number
  fieldChanges: {
    providers: IdentityFieldChange
    knownEmails: IdentityFieldChange
    email: { before: string; after: string }
    filledFromLoser: string[]
  }
  /** Per-field review rows — both candidates, the recommendation and its reason. */
  fields: MergeFieldChoice[]
  /** Before/after for every unioned multi-value field. */
  unions: Record<UnionMergeField, { before: unknown[]; after: unknown[] }>
  willDeleteLoserId: string
}

/** The full, precomputed plan for a merge (pure — no I/O performed). */
export interface MergePlan {
  survivorId: string
  loserId: string
  survivorSet: Record<string, unknown>
  /** Keys to unset on the survivor — only ever the picture pair. */
  survivorUnset: string[]
  documentPatches: MergeDocumentPatch[]
  /** Deterministic-id docs reconciled onto the survivor's canonical id (QR-M4). */
  deterministicReconciliations: DeterministicReconciliation[]
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
  /**
   * The survivor's CANONICAL deterministic docs (convpref / message notification)
   * for the conversations the loser also has one in — fetched by the wrapper from
   * the canonical ids of the loser's collision docs. Absent ones simply take the
   * RECREATE branch. Defaults to `[]` so existing 3-arg callers/tests are
   * unaffected. (QR-M4)
   */
  survivorDeterministicDocs: Array<Record<string, unknown>> = [],
  /** Operator per-field overrides (side only — never values). */
  fieldSelections: MergeFieldSelections = {},
): MergePlan {
  assertMergeable(survivor, loser)

  const fieldMerge = computeSurvivorFieldMerge(survivor, loser, fieldSelections)

  const documentPatches: MergeDocumentPatch[] = []
  const referenceRepointsByType: Record<string, number> = {}
  // Loser-suffixed deterministic docs are pulled OUT of the generic repoint (it
  // would strand them under the loser key) and reconciled onto the canonical id.
  const deterministicLoserDocs: Array<{
    doc: Record<string, unknown>
    canonicalId: string
  }> = []

  for (const doc of referencingDocs) {
    // The loser is deleted, and the survivor's own fields are handled separately.
    if (doc._id === loser._id || doc._id === survivor._id) continue

    const canonicalId = canonicalDeterministicId(
      String(doc._id),
      loser._id,
      survivor._id,
    )
    if (canonicalId) {
      deterministicLoserDocs.push({ doc, canonicalId })
      continue
    }

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

  const survivorDeterministicById = new Map(
    survivorDeterministicDocs.map((doc) => [String(doc._id), doc]),
  )
  const deterministicReconciliations: DeterministicReconciliation[] =
    deterministicLoserDocs.map(({ doc, canonicalId }) =>
      reconcileDeterministicDoc(
        doc,
        survivorDeterministicById.get(canonicalId),
        loser._id,
        survivor._id,
      ),
    )

  const summary: MergePreview = {
    survivorId: survivor._id,
    loserId: loser._id,
    referencingDocCount: documentPatches.length,
    referenceRepointsByType,
    reconciledDeterministicDocCount: deterministicReconciliations.length,
    fieldChanges: {
      providers: fieldMerge.identity.providers,
      knownEmails: fieldMerge.identity.knownEmails,
      email: fieldMerge.identity.email,
      filledFromLoser: fieldMerge.filledFromLoser,
    },
    fields: fieldMerge.fields,
    unions: fieldMerge.unions,
    willDeleteLoserId: loser._id,
  }

  return {
    survivorId: survivor._id,
    loserId: loser._id,
    survivorSet: fieldMerge.set,
    survivorUnset: fieldMerge.unset,
    documentPatches,
    deterministicReconciliations,
    summary,
  }
}

/** The speaker field holding the merge recovery trail, and its item `_type`. */
export const MERGE_HISTORY_FIELD = 'mergedWith'
const MERGE_HISTORY_ITEM_TYPE = 'speakerMergeRecord'

/**
 * How many entries the survivor keeps. Each carries a full copy of a deleted
 * speaker (~1-5 KB of JSON), and a speaker can be merged into repeatedly.
 *
 * ponytail: hard cap at 10 entries — roughly 50 KB worst case, far under
 * Sanity's per-document ceiling, and merging one person eleven times is already
 * pathological. Oldest entries are dropped whole. Upgrade path if a real
 * dataset ever gets near it: keep the metadata rows forever and strip only
 * `snapshot` beyond the most recent few, or move the overflow to a separate
 * (then separately org-scoped and separately erased) document.
 */
export const MERGE_HISTORY_MAX_ENTRIES = 10

/** One entry of the survivor's {@link MERGE_HISTORY_FIELD} trail. */
export interface SpeakerMergeRecord {
  _key: string
  _type: string
  mergedAt: string
  actorId: string
  actorName?: string
  survivorId: string
  loserId: string
  snapshot: string
}

function existingMergeHistory(doc: MergeSpeakerDoc): SpeakerMergeRecord[] {
  const value = doc[MERGE_HISTORY_FIELD]
  return Array.isArray(value) ? (value as SpeakerMergeRecord[]) : []
}

/**
 * The survivor's complete merge trail AFTER this merge (#1027 item 9): the new
 * entry, plus the survivor's own history, plus the LOSER's history carried
 * forward — newest first, capped.
 *
 * CARRY-FORWARD is what makes a chain of merges survive. A → B then B → C would
 * otherwise delete A's record along with B; the loser's entries move onto the
 * new survivor instead, so C holds the whole chain. Each entry keeps the
 * `survivorId` it was written with, so a carried-forward one still says which
 * document it was originally folded into.
 *
 * ORDER IS CARRY-FORWARD, THEN CAP: the two histories are interleaved by
 * `mergedAt` (ISO strings sort lexically) and only then truncated, so the cap
 * drops the globally oldest entries rather than one side's.
 *
 * Pure, so a test can assert the whole shape without going near Sanity.
 */
export function buildMergeHistory(
  plan: MergePlan,
  survivor: MergeSpeakerDoc,
  loser: MergeSpeakerDoc,
  actor: { _id: string; name?: string },
  mergedAt: string,
): SpeakerMergeRecord[] {
  // Exactly the survivor fields this merge overwrote or cleared — what a manual
  // recovery needs to put the survivor back, next to the loser it lost.
  const survivorBefore: Record<string, unknown> = {}
  for (const key of [...Object.keys(plan.survivorSet), ...plan.survivorUnset]) {
    survivorBefore[key] = survivor[key]
  }

  // The loser is deleted whole, so its own trail is copied out first —
  // `snapshot.loser` below must not carry a nested copy of it (that is how a
  // chain of merges would grow quadratically).
  const carriedForward = existingMergeHistory(loser)
  const loserSnapshot = { ...loser }
  delete loserSnapshot[MERGE_HISTORY_FIELD]

  const entry: SpeakerMergeRecord = {
    // Deterministic, and unique by construction: the loser is deleted by this
    // transaction, so no second entry can ever name the same id.
    _key: `merge-${plan.loserId}`,
    _type: MERGE_HISTORY_ITEM_TYPE,
    mergedAt,
    actorId: actor._id,
    ...(actor.name ? { actorName: actor.name } : {}),
    survivorId: plan.survivorId,
    loserId: plan.loserId,
    snapshot: JSON.stringify({
      // The COMPLETE deleted document, as stored. The recovery artifact.
      loser: loserSnapshot,
      survivorBefore,
      fields: plan.summary.fields.map((f) => ({
        field: f.field,
        selected: f.selected,
        recommended: f.recommended,
        reason: f.reason,
        overridden: f.selected !== f.recommended,
      })),
      references: {
        referencingDocCount: plan.summary.referencingDocCount,
        referenceRepointsByType: plan.summary.referenceRepointsByType,
        reconciledDeterministicDocCount:
          plan.summary.reconciledDeterministicDocCount,
      },
    }),
  }

  const history = [...existingMergeHistory(survivor), ...carriedForward].sort(
    (a, b) => String(b.mergedAt ?? '').localeCompare(String(a.mergedAt ?? '')),
  )
  // A `_key` must be unique within the array; two histories minted theirs in
  // different documents, so drop a collision rather than write an invalid array.
  const seen = new Set([entry._key])
  const deduped = history.filter((item) => {
    if (seen.has(item._key)) return false
    seen.add(item._key)
    return true
  })
  return [entry, ...deduped].slice(0, MERGE_HISTORY_MAX_ENTRIES)
}

/** Options for {@link mergeSpeakers}. */
export interface MergeSpeakersOptions {
  survivorId: string
  loserId: string
  /** The organizer performing the merge (recorded in the merge trail). */
  actor: { _id: string; name?: string }
  /** When true, compute and return the preview WITHOUT writing anything. */
  dryRun?: boolean
  /**
   * Per-field operator overrides. Each entry names only WHICH DOCUMENT a field
   * comes from; the values are read here, server-side, from the two speaker
   * documents. Absent fields take the recommendation.
   */
  fieldSelections?: MergeFieldSelections
}

/** Result of {@link mergeSpeakers}. */
export interface MergeSpeakersResult {
  preview: MergePreview | null
  committed: boolean
  err: Error | null
}

async function fetchRawSpeaker(id: string): Promise<MergeSpeakerDoc | null> {
  return clientRead.fetch<MergeSpeakerDoc | null>(
    // groq-global-scoped: a speaker is a GLOBAL person document with no
    // `conference`/`organization` ref to filter on — tenancy is the
    // `organizations[]` membership array, which `requireSpeakerInCurrentOrg`
    // checks. Both `mergeSpeakers` entry points (`speaker.mergePreview` and
    // `speaker.merge` in `src/server/routers/speaker.ts`) call it on the
    // survivor AND the loser — the loser with `requireExclusive` — before this
    // module reads anything, so neither id can be a foreign speaker.
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
  const {
    survivorId,
    loserId,
    actor,
    dryRun = false,
    fieldSelections = {},
  } = opts

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
    //
    // The second clause catches a talk that names the loser ONLY in
    // `issuedSpeakerTickets[].speakerId` — a plain string `references()` cannot
    // see, so a talk the loser was removed from after a ticket was issued would
    // otherwise keep the dead id. Mirrors the erasure sweep's predicate in
    // `./erasure.ts`.
    //
    // groq-global: deliberately unscoped — the transaction must repoint EVERY
    // inbound tie, including another tenant's. What keeps that safe is not the
    // loser id (an id bounds WHICH speaker, never WHOSE documents): it is
    // `requireSpeakerInCurrentOrg(loserId, { requireExclusive: true })`, whose
    // `foreignReferencingDocCount === 0` arm proves no document outside this org
    // matches THIS predicate before the merge is authorized. That probe carries
    // the ticket-marker arm for exactly this reason — the two predicates must be
    // widened together or the guard stops bounding what the transaction touches.
    const referencingDocs =
      (await clientRead.fetch<Array<Record<string, unknown>>>(
        groq`*[(references($loserId) ||
          (_type == "talk" && $loserId in issuedSpeakerTickets[].speakerId)
        ) && _id != $loserId]`,
        { loserId },
        { cache: 'no-store' },
      )) ?? []

    // QR-M4: for every loser-suffixed deterministic doc (convpref / message
    // notification), also fetch the survivor's CANONICAL sibling so the plan can
    // MERGE (mute/unread) rather than strand a repointed loser-keyed doc. One
    // extra bounded read, only when such docs exist.
    const survivorDeterministicIds = referencingDocs
      .map((doc) =>
        canonicalDeterministicId(String(doc._id), loserId, survivorId),
      )
      .filter((id): id is string => id !== null)
    const survivorDeterministicDocs =
      survivorDeterministicIds.length > 0
        ? ((await clientRead.fetch<Array<Record<string, unknown>>>(
            groq`*[_id in $ids]`,
            { ids: survivorDeterministicIds },
            { cache: 'no-store' },
          )) ?? [])
        : []

    const plan = buildMergePlan(
      survivor as MergeSpeakerDoc,
      loser as MergeSpeakerDoc,
      referencingDocs,
      survivorDeterministicDocs,
      fieldSelections,
    )

    if (dryRun) {
      return { preview: plan.summary, committed: false, err: null }
    }

    // The recovery trail (#1027 item 9), folded into the survivor's OWN patch so
    // it lands in the same transaction as the merge it describes: a failed merge
    // leaves no entry, and a committed merge always has one. Built AFTER the
    // dry-run return so `plan.survivorSet` stays the value the preview showed —
    // only the write carries the trail, and `mergedAt` never makes the dry run
    // and the commit disagree.
    plan.survivorSet[MERGE_HISTORY_FIELD] = buildMergeHistory(
      plan,
      survivor as MergeSpeakerDoc,
      loser as MergeSpeakerDoc,
      actor,
      new Date().toISOString(),
    )

    // Guard each referencing-doc repoint with the revision we read, so a
    // concurrent edit to that doc's arrays (e.g. someone adds a co-speaker
    // between our read and commit) makes the WHOLE transaction fail with a 409
    // rather than silently clobbering their change with our stale full-array
    // `.set()`. The admin simply retries the merge. Atomic + now isolated.
    const revById = new Map(
      referencingDocs.map((d) => [d._id as string, d._rev as string]),
    )
    const transaction = clientWrite.transaction()
    for (const patch of plan.documentPatches) {
      const rev = revById.get(patch.id)
      transaction.patch(patch.id, (p) => {
        const applied = p.set(patch.set)
        return rev ? applied.ifRevisionId(rev) : applied
      })
    }
    if (
      Object.keys(plan.survivorSet).length > 0 ||
      plan.survivorUnset.length > 0
    ) {
      // Revision-guarded for the SAME reason every referencing-doc patch is: the
      // survivor's own fields were read at plan time, and the operator's per-field
      // choices were made against that snapshot. A profile edit landing in between
      // (the speaker changing their own email, say) must 409 the transaction — not
      // be silently clobbered by a stale `.set()`.
      const survivorRev = (survivor as MergeSpeakerDoc | null)?._rev
      transaction.patch(survivorId, (p) => {
        let applied = p
        if (Object.keys(plan.survivorSet).length > 0) {
          applied = applied.set(plan.survivorSet)
        }
        if (plan.survivorUnset.length > 0) {
          applied = applied.unset(plan.survivorUnset)
        }
        return typeof survivorRev === 'string'
          ? applied.ifRevisionId(survivorRev)
          : applied
      })
    }
    // QR-M4: reconcile deterministic docs onto the survivor's canonical id.
    // RECREATE with `create` (not createOrReplace): the survivor had NO canonical
    // sibling at read time, so a concurrent creation must 409 the whole tx (admin
    // retries → MERGE branch) rather than clobber fresh survivor state. Each
    // loser-suffixed doc is deleted so none survives repointed-but-loser-keyed.
    for (const rec of plan.deterministicReconciliations) {
      if (rec.createDoc) {
        transaction.create(
          rec.createDoc as { _type: string } & Record<string, unknown>,
        )
      } else if (
        (rec.mergeSet && Object.keys(rec.mergeSet).length > 0) ||
        (rec.mergeUnset && rec.mergeUnset.length > 0)
      ) {
        transaction.patch(rec.canonicalId, (p) => {
          let applied = p
          if (rec.mergeSet && Object.keys(rec.mergeSet).length > 0) {
            applied = applied.set(rec.mergeSet)
          }
          if (rec.mergeUnset && rec.mergeUnset.length > 0) {
            applied = applied.unset(rec.mergeUnset)
          }
          return applied
        })
      }
      transaction.delete(rec.deleteId)
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
      // Where the full snapshot of the deleted document now lives.
      mergeHistoryEntry: `${survivorId}.${MERGE_HISTORY_FIELD}[_key=="merge-${loserId}"]`,
      referencingDocCount: plan.summary.referencingDocCount,
      referenceRepointsByType: plan.summary.referenceRepointsByType,
      reconciledDeterministicDocCount:
        plan.summary.reconciledDeterministicDocCount,
      filledFromLoser: plan.summary.fieldChanges.filledFromLoser,
      // Which side each reviewable field came from, and whether the operator
      // overrode the recommendation — the answer to "who chose this email?".
      fieldSides: Object.fromEntries(
        plan.summary.fields.map((f) => [
          f.field,
          f.selected === f.recommended
            ? f.selected
            : `${f.selected} (override)`,
        ]),
      ),
    })

    return { preview: plan.summary, committed: true, err: null }
  } catch (error) {
    if (!(error instanceof MergeValidationError)) {
      console.error('Error merging speakers:', error)
    }
    return { preview: null, committed: false, err: error as Error }
  }
}
