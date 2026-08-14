/**
 * Right to erasure, Phase 1 — ANONYMISE IN PLACE (RunKonf/platform#52).
 *
 * The `speaker` document and every reference to it SURVIVE. Identifying fields
 * are overwritten; the operational records listed below are deleted or scrubbed.
 * Decided 2026-08-06 over two rejected alternatives, both recorded so neither
 * returns: weakening refs for a real delete (several consumers assume a speaker
 * resolves, so a missed read path becomes a public 500), and cascade delete
 * (destroys data belonging to people who requested nothing — a co-speaker's
 * talk, a reviewer's review).
 *
 * THE THREE PROPERTIES THIS MODULE IS BUILT AROUND
 *
 *  1. REPLACE, NEVER UNSET, for `name` / `slug` / `email`. Code throws on their
 *     absence — `SpeakerTable.tsx` (`speaker.name.toLowerCase()`),
 *     `formatSpeakerNames.ts` (`speaker.name.split(' ')`), `useProgramFilter.ts`
 *     — and unguarded `/speaker/${slug}` links would render
 *     `/speaker/undefined`. The null-crash sites are avoided BY CONSTRUCTION.
 *     `email` becomes an RFC 2606 `.invalid` address: undeliverable, and it can
 *     never be a verified OAuth email, so it can never re-match a login.
 *
 *  2. FIXED POINT. Every value is derived deterministically from `_id`, and
 *     `erasedAt` uses `setIfMissing` so a repeat preserves the ORIGINAL
 *     timestamp. {@link buildErasurePlan} emits only the ops that still change
 *     something, so a second run over an erased speaker produces an EMPTY plan
 *     and commits nothing. Run it twice: byte-identical convergence.
 *
 *  3. FAIL CLOSED ON THE TWO DESTRUCTIVE EDGES. The sole organizer of a
 *     conference is REFUSED (`conference.organizers[]` is `min(1)`; an org with
 *     no organizer is unmanageable). `bankingDetails` is scrubbed on UNPAID
 *     travel-support records ONLY, and "unpaid" means an explicitly recognised
 *     non-paid status — a missing or unknown status RETAINS, because deleting a
 *     paid record's banking details would destroy statutory accounting evidence
 *     (Norwegian bookkeeping, 5 years).
 *
 * STRUCTURE. A PURE core ({@link buildErasurePlan}, no I/O, fully unit-tested)
 * plus a thin {@link eraseSpeakerInPlace} wrapper that does the reads, one
 * transaction, the image-asset delete, cache revalidation and verification.
 * Mirrors `./merge.ts`, which is the closest existing operation.
 *
 * NOT ATOMIC END TO END, AND THAT IS DELIBERATE. Every document mutation is one
 * revision-guarded transaction, but the image ASSET delete cannot join it:
 * Sanity refuses to delete an asset while a reference to it is live, so the
 * unset must commit first. Idempotency is what covers the gap — a failed run is
 * re-run, not repaired.
 *
 * WHAT PHASE 1 DOES NOT ERASE — see `docs/SPEAKER_ERASURE_RUNBOOK.md`, which the
 * operator answers the data subject from. Badges, paid travel records and their
 * receipts, all free text (abstracts, outlines, review comments, message
 * bodies), Sanity revision history, and workshop-signup / volunteer records on
 * the attendee identity rail. "We erased your data" would be false.
 *
 * TENANCY. Erasure is GLOBAL by design: a speaker is a cross-org person
 * document and the right belongs to the person, not to any organizer. Every
 * read here is deliberately unscoped and annotated `groq-global:`.
 */

import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { normalizeEmail } from './email'

// ---------------------------------------------------------------------------
// Field policy
// ---------------------------------------------------------------------------

/** The placeholder every erased speaker renders as. */
export const ERASED_SPEAKER_NAME = 'Deleted speaker'

/**
 * RFC 2606 reserves `.invalid` — guaranteed never to resolve, so the address is
 * undeliverable AND can never be presented as a verified OAuth email. That is
 * what makes re-login produce a FRESH speaker document rather than re-attaching
 * the erased one. Correct semantics, not a bug (PRD §1).
 */
export const ERASED_EMAIL_DOMAIN = 'anonymous.invalid'

/** Characters of `_id` that form the deterministic suffix. */
const ID_SUFFIX_LENGTH = 8

/**
 * Fields UNSET on the speaker document. Verified field by field against
 * `sanity/schemaTypes/speaker.ts` on 2026-08-14, not taken from the PRD table.
 *
 *  - `knownEmails`, `providers` — the login match keys. Clearing both is what
 *    makes the erased document unreachable by a future sign-in.
 *  - `imageURL` — a GitHub/LinkedIn avatar URL encodes the account id.
 *  - `image` — the profile image REFERENCE. The asset document itself is
 *    deleted separately (see {@link eraseSpeakerInPlace}); unsetting the ref
 *    only removes the pointer, the photo stays live on `cdn.sanity.io`.
 *  - `consent.dataProcessing.ipAddress` — personal data. The surrounding
 *    `granted`/`grantedAt`/`privacyPolicyVersion` are RETAINED as proof of
 *    consent; minimality-versus-proof is an OPEN Phase 2 decision (PRD §1) and
 *    retaining is the conservative side of it.
 *
 * NOT UNSET: `_id` (referential identity — the point of the whole decision) and
 * `organizations` (tenancy guards read `organizations[]._ref`; unsetting it
 * makes the document unmanageable).
 */
export const ERASURE_UNSET_FIELDS = [
  'knownEmails',
  'providers',
  'imageURL',
  'image',
  'links',
  'bio',
  'title',
  'flags',
  'gender',
  'genderSelfDescribe',
  'country',
  'pushSubscriptions',
  'pushPreferences',
  'messagingEmailDefault',
  'consent.dataProcessing.ipAddress',
] as const

/**
 * Travel-support statuses that mean NOT PAID, enumerated positively.
 *
 * DELIBERATELY NOT `status !== 'paid'`. A missing, misspelt or future status
 * would satisfy that test and scrub the banking details of a record we cannot
 * prove is unpaid. The failure is asymmetric — retaining an unpaid record's
 * details is a privacy shortfall we can fix by hand; deleting a paid record's
 * details destroys accounting evidence we are legally obliged to keep. So the
 * unrecognised case RETAINS and is reported to the operator.
 *
 * Mirrors `TravelSupportStatus` in `@/lib/travel-support/types`, minus `paid`.
 */
export const UNPAID_TRAVEL_SUPPORT_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
] as const

/** Sanity document ids are safe to interpolate only if they look like this. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A raw Sanity reference object. */
interface SanityReference {
  _ref: string
  _key?: string
  _type?: string
}

/** Minimal shape of an unprojected speaker document. */
export interface ErasureSpeakerDoc {
  _id: string
  _type: string
  _rev?: string
  name?: string
  email?: string
  knownEmails?: (string | null | undefined)[]
  slug?: { _type?: string; current?: string } | string
  erasedAt?: string
  image?: { asset?: SanityReference }
  [key: string]: unknown
}

/** A talk carrying `issuedSpeakerTickets` entries, matched by string not ref. */
export interface TicketTalkDoc {
  _id: string
  _rev?: string
  issuedSpeakerTickets?: Array<{
    _key?: string
    speakerId?: string
    email?: string
  }>
}

/** Everything {@link buildErasurePlan} needs. Reads live in the wrapper. */
export interface ErasureInputs {
  speaker: ErasureSpeakerDoc | null
  /** `*[references($speakerId) && _id != $speakerId]`, unprojected. */
  referencingDocs: Array<Record<string, unknown>>
  /** Talks whose `issuedSpeakerTickets[]` name the subject by id or email. */
  ticketTalks: TicketTalkDoc[]
  /** `emailSignInToken` documents whose `identifier` is in the match-set. */
  signInTokens: Array<{ _id: string }>
  /**
   * `coSpeakerInvitation` documents whose `invitedEmail` is in the match-set.
   *
   * A SEPARATE READ, not derived from {@link referencingDocs}, and the reason is
   * the whole point of the PRD's note that these name "people who may have no
   * account at all": an invitation that was never accepted has `invitedBy`
   * pointing at the INVITER and no reference to the subject whatsoever, so
   * `references($speakerId)` cannot see it. Matching on the plaintext email is
   * the only way to reach it.
   */
  coSpeakerInvitations: Array<{ _id: string }>
  /** Ids of OTHER documents already holding the target slug. */
  slugConflictIds: string[]
  /** Erasure timestamp, injected so tests are deterministic. */
  now: string
}

/** One patch staged against a dependent document. */
export interface ErasureDocumentPatch {
  id: string
  type: string
  rev?: string
  set?: Record<string, unknown>
  unset?: string[]
  setIfMissing?: Record<string, unknown>
  append?: { path: string; items: unknown[] }
  /** Why, for the operator log. */
  reason: string
}

/** One dependent document deleted outright. */
export interface ErasureDocumentDelete {
  id: string
  type: string
  reason: string
}

/** A travel-support record whose banking details were NOT scrubbed, and why. */
export interface RetainedBankingRecord {
  id: string
  status: string
  reason: 'paid' | 'unrecognised-status'
}

/** The computed operation. Empty `refusals` means it may be committed. */
export interface ErasurePlan {
  speakerId: string
  targetName: string
  targetSlug: string
  targetEmail: string
  /** `.set()` on the speaker — only fields that still differ. */
  speakerSet: Record<string, unknown>
  /** `.setIfMissing()` on the speaker — `erasedAt` only. */
  speakerSetIfMissing: Record<string, unknown>
  /** `.unset()` on the speaker — only fields still present. */
  speakerUnset: string[]
  documentPatches: ErasureDocumentPatch[]
  documentDeletes: ErasureDocumentDelete[]
  /** Asset id to delete AFTER the transaction, or null. */
  imageAssetId: string | null
  retainedBanking: RetainedBankingRecord[]
  /** Conference ids whose caches must be revalidated. */
  affectedConferenceIds: string[]
  /** Non-empty ⇒ the operation must not run. */
  refusals: string[]
  /** True when nothing at all would be written — the fixed point. */
  noop: boolean
}

/** Thrown for precondition failures. */
export class ErasureValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErasureValidationError'
  }
}

// ---------------------------------------------------------------------------
// Deterministic values
// ---------------------------------------------------------------------------

function idSuffix(speakerId: string): string {
  return speakerId.slice(0, ID_SUFFIX_LENGTH)
}

/** `deleted-<first 8 of _id>` — deterministic, so a repeat is a no-op. */
export function erasedSlug(speakerId: string): string {
  return `deleted-${idSuffix(speakerId)}`
}

/** `deleted-<first 8 of _id>@anonymous.invalid`. */
export function erasedEmail(speakerId: string): string {
  return `deleted-${idSuffix(speakerId)}@${ERASED_EMAIL_DOMAIN}`
}

/**
 * The subject's email match-set: the display `email` plus every `knownEmails`
 * entry, normalised. This is what the email-keyed sweeps (co-speaker
 * invitations, sign-in tokens, issued speaker tickets) match on, and it is
 * DESTROYED by the same transaction that uses it — which is precisely why those
 * sweeps must share one transaction with the speaker patch.
 */
export function speakerEmailMatchSet(speaker: ErasureSpeakerDoc): string[] {
  const all = [speaker.email, ...(speaker.knownEmails ?? [])]
    .map((e) => normalizeEmail(typeof e === 'string' ? e : ''))
    .filter((e) => e.length > 0)
  return [...new Set(all)]
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isReference(value: unknown): value is SanityReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { _ref?: unknown })._ref === 'string'
  )
}

function refArray(value: unknown): SanityReference[] {
  return Array.isArray(value) ? value.filter(isReference) : []
}

function refPointsAt(value: unknown, id: string): boolean {
  return isReference(value) && value._ref === id
}

function currentSlug(speaker: ErasureSpeakerDoc): string | undefined {
  const { slug } = speaker
  if (typeof slug === 'string') return slug
  if (slug && typeof slug === 'object') return slug.current
  return undefined
}

/** True when the field is absent — `.unset()` on an absent field is a no-op. */
function isAbsent(doc: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.')
  let cursor: unknown = doc
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return true
    if (typeof cursor !== 'object') return true
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor === undefined
}

// ---------------------------------------------------------------------------
// The pure core
// ---------------------------------------------------------------------------

/**
 * Compute the whole operation without touching Sanity.
 *
 * Every op is emitted ONLY if it still changes something, which is what makes a
 * second run produce `noop: true` and commit nothing.
 *
 * NOTE FOR `src/server/tenancy.speakerRefs.test.ts`: this module never
 * CONSTRUCTS a speaker reference into `speakers[]` / `organizers[]` /
 * `featuredSpeakers[]`. It only FILTERS existing reference objects out of those
 * arrays, exactly as `./merge.ts` only repoints them — so, like merge, it
 * belongs in neither the construction set nor the guard set.
 */
export function buildErasurePlan(inputs: ErasureInputs): ErasurePlan {
  const {
    speaker,
    referencingDocs,
    ticketTalks,
    signInTokens,
    coSpeakerInvitations,
    now,
  } = inputs

  if (!speaker) {
    throw new ErasureValidationError('Speaker not found')
  }
  if (speaker._type !== 'speaker') {
    throw new ErasureValidationError(
      `Document ${speaker._id} is a ${speaker._type}, not a speaker`,
    )
  }
  if (speaker._id.startsWith('drafts.')) {
    throw new ErasureValidationError(
      'Refusing to erase a draft document; erase the published speaker',
    )
  }
  if (!SAFE_ID.test(speaker._id)) {
    throw new ErasureValidationError(
      `Speaker id ${JSON.stringify(speaker._id)} has an unexpected shape`,
    )
  }

  const speakerId = speaker._id
  const emails = speakerEmailMatchSet(speaker)
  const targetSlug = erasedSlug(speakerId)
  const targetEmail = erasedEmail(speakerId)

  const refusals: string[] = []
  const documentPatches: ErasureDocumentPatch[] = []
  const documentDeletes: ErasureDocumentDelete[] = []
  const retainedBanking: RetainedBankingRecord[] = []
  const affectedConferenceIds = new Set<string>()

  // --- the speaker document itself ----------------------------------------

  // REPLACE, never unset. Emitted only where the value still differs, so a
  // repeat writes nothing.
  const speakerSet: Record<string, unknown> = {}
  if (speaker.name !== ERASED_SPEAKER_NAME) {
    speakerSet.name = ERASED_SPEAKER_NAME
  }
  if (currentSlug(speaker) !== targetSlug) {
    speakerSet.slug = { _type: 'slug', current: targetSlug }
  }
  if (speaker.email !== targetEmail) {
    speakerSet.email = targetEmail
  }

  const speakerUnset = ERASURE_UNSET_FIELDS.filter(
    (field) => !isAbsent(speaker, field),
  ) as string[]

  // `setIfMissing` so a repeat PRESERVES the original erasure timestamp — the
  // date the request was answered is itself a record.
  const speakerSetIfMissing: Record<string, unknown> = speaker.erasedAt
    ? {}
    : { erasedAt: now }

  // A slug already held by ANOTHER document would produce two speakers on one
  // URL. Held by THIS document is the second run, and must pass.
  const foreignSlugHolders = inputs.slugConflictIds.filter(
    (id) => id !== speakerId,
  )
  if (foreignSlugHolders.length > 0) {
    refusals.push(
      `Target slug "${targetSlug}" is already used by ${foreignSlugHolders.join(', ')}`,
    )
  }

  const imageAssetId = isReference(speaker.image?.asset)
    ? speaker.image.asset._ref
    : null

  // --- dependent documents -------------------------------------------------

  for (const raw of referencingDocs) {
    const doc = raw as Record<string, unknown> & { _id: string; _type: string }
    const id = String(doc._id)
    const type = String(doc._type ?? 'unknown')
    const rev = typeof doc._rev === 'string' ? doc._rev : undefined
    if (id === speakerId) continue

    switch (type) {
      case 'conference': {
        const patch = planConferencePatch(doc, speakerId, rev, refusals)
        if (patch) documentPatches.push(patch)
        affectedConferenceIds.add(id)
        break
      }

      case 'imageGallery': {
        // UNTAG ONLY (owner decision, 2026-08-14). Conference photography is
        // group photography: deleting the frame would destroy an image of other
        // people who requested nothing, with no way to know who else is in it.
        // Same mechanism as `untagSpeakerFromImage` in `@/lib/gallery/sanity` —
        // drop the entry from `speakers[]` and leave a tombstone in
        // `untaggedSpeakers[]`. The tombstone is LOAD-BEARING and is why this
        // does not simply strip both arrays: `updateGalleryImage` reads it to
        // refuse a re-tag, so removing it would let an organizer re-tag the
        // erased person onto the photo later.
        const patch = planGalleryUntag(doc, speakerId, rev)
        if (patch) documentPatches.push(patch)
        break
      }

      case 'travelSupport': {
        // Only when the subject is the SUBJECT of the record. A `reviewedBy`
        // match is an organizer audit ref and is retained — it resolving to the
        // placeholder is anonymise-in-place working as intended.
        if (!refPointsAt(doc.speaker, speakerId)) break
        const status = typeof doc.status === 'string' ? doc.status : ''
        const unpaid = (
          UNPAID_TRAVEL_SUPPORT_STATUSES as readonly string[]
        ).includes(status)
        if (!unpaid) {
          retainedBanking.push({
            id,
            status: status || '(missing)',
            reason: status === 'paid' ? 'paid' : 'unrecognised-status',
          })
          break
        }
        if (doc.bankingDetails === undefined) break
        documentPatches.push({
          id,
          type,
          rev,
          // The WHOLE object, never a partial unset: `bankingDetails` requires
          // at least one of `iban`/`accountNumber`, so dropping those two
          // individually leaves a document that fails its own validation.
          unset: ['bankingDetails'],
          reason: `unpaid travel support (status=${status})`,
        })
        break
      }

      case 'notification': {
        // The subject's own inbox is deleted. A notification where the subject
        // is merely the ACTOR belongs to somebody else's inbox — the weak ref
        // is left to resolve to the placeholder rather than destroying another
        // person's record. Its free-text title may still name them; the hub
        // hard-deletes at 90 days. Stated in the runbook, not papered over.
        if (refPointsAt(doc.recipient, speakerId)) {
          documentDeletes.push({ id, type, reason: 'recipient is the subject' })
        }
        break
      }

      case 'conversationPreference':
      case 'dashboardConfig':
      case 'scheduledReminderLog': {
        if (refPointsAt(doc.speaker, speakerId)) {
          documentDeletes.push({ id, type, reason: 'owned by the subject' })
        }
        break
      }

      case 'coSpeakerInvitation': {
        // Matched by EMAIL, per PRD §3: `invitedEmail`/`invitedName` are plain
        // strings describing a person who may have no account at all, and
        // `invitedEmail` is `required().email()` so it cannot be blanked. An
        // invitation the subject SENT is left alone — `invitedBy` anonymises in
        // place and the invited person's data is not the subject's to erase.
        const invited = normalizeEmail(
          typeof doc.invitedEmail === 'string' ? doc.invitedEmail : '',
        )
        if (invited && emails.includes(invited)) {
          documentDeletes.push({
            id,
            type,
            reason: 'invitation addressed to the subject',
          })
        }
        break
      }

      default:
        // Everything else anonymises in place: `review.reviewer`,
        // `message.author`, `talk.speakers[]`, `invitationLetter.issuedBy`,
        // `sponsorActivity.createdBy`, `speakerBadge.speaker` (badges are
        // platform#46, explicitly out of Phase 1), and the conversation refs.
        break
    }
  }

  // --- issued speaker tickets (string-keyed, invisible to `references()`) ---

  for (const talk of ticketTalks) {
    const entries = talk.issuedSpeakerTickets ?? []
    const targets = entries.filter(
      (entry) =>
        entry.speakerId === speakerId ||
        (entry.email ? emails.includes(normalizeEmail(entry.email)) : false),
    )
    const keyed = targets.filter(
      (entry) => typeof entry._key === 'string' && SAFE_ID.test(entry._key),
    )
    if (keyed.length === 0) continue
    documentPatches.push({
      id: talk._id,
      type: 'talk',
      rev: talk._rev,
      unset: keyed.map(
        (entry) => `issuedSpeakerTickets[_key=="${entry._key}"]`,
      ),
      reason: 'issued speaker ticket carries a plaintext email snapshot',
    })
  }

  // --- email-keyed records with no reference to the subject at all ---------

  for (const token of signInTokens) {
    documentDeletes.push({
      id: token._id,
      type: 'emailSignInToken',
      reason: 'sign-in token for the subject’s address',
    })
  }

  // An UNACCEPTED invitation references only the inviter, so `references()`
  // never returns it. Deduplicated against the reference-derived ones above,
  // because an ACCEPTED invitation is found by both paths.
  const alreadyQueued = new Set(documentDeletes.map((d) => d.id))
  for (const invitation of coSpeakerInvitations) {
    if (alreadyQueued.has(invitation._id)) continue
    documentDeletes.push({
      id: invitation._id,
      type: 'coSpeakerInvitation',
      reason: 'invitation addressed to the subject (no reference to them)',
    })
  }

  const noop =
    refusals.length === 0 &&
    Object.keys(speakerSet).length === 0 &&
    Object.keys(speakerSetIfMissing).length === 0 &&
    speakerUnset.length === 0 &&
    documentPatches.length === 0 &&
    documentDeletes.length === 0 &&
    imageAssetId === null

  return {
    speakerId,
    targetName: ERASED_SPEAKER_NAME,
    targetSlug,
    targetEmail,
    speakerSet,
    speakerSetIfMissing,
    speakerUnset,
    documentPatches,
    documentDeletes,
    imageAssetId,
    retainedBanking,
    affectedConferenceIds: [...affectedConferenceIds],
    refusals,
    noop,
  }
}

/**
 * Remove the subject from a conference's curation arrays.
 *
 * REFUSES the last organizer. `conference.organizers[]` is `required().min(1)`,
 * and an organization with no organizer cannot be administered by anyone — the
 * erasure would strand the tenant. The operator appoints a replacement first.
 *
 * An organizer TEAM whose only member is the subject is REMOVED WHOLE rather
 * than left with an empty `members[]`, which is also `required().min(1)`. Teams
 * are documented as "a SOFT LENS for routing notifications, never an
 * access-control boundary", so an empty one routes to nobody; deleting it is
 * what min(1) is there to express. Reported to the operator either way.
 */
function planConferencePatch(
  doc: Record<string, unknown>,
  speakerId: string,
  rev: string | undefined,
  refusals: string[],
): ErasureDocumentPatch | null {
  const id = String(doc._id)
  const set: Record<string, unknown> = {}
  const reasons: string[] = []

  const organizers = refArray(doc.organizers)
  if (organizers.some((r) => r._ref === speakerId)) {
    const remaining = organizers.filter((r) => r._ref !== speakerId)
    if (remaining.length === 0) {
      refusals.push(
        `${speakerId} is the only organizer of conference ${id}; ` +
          'appoint a replacement organizer before erasing them ' +
          '(conference.organizers[] is min(1))',
      )
    } else {
      set.organizers = remaining
      reasons.push('organizers[]')
    }
  }

  const featured = refArray(doc.featuredSpeakers)
  if (featured.some((r) => r._ref === speakerId)) {
    set.featuredSpeakers = featured.filter((r) => r._ref !== speakerId)
    reasons.push('featuredSpeakers[]')
  }

  if (Array.isArray(doc.teams)) {
    const teams = doc.teams as Array<Record<string, unknown>>
    let teamsChanged = false
    const nextTeams: Array<Record<string, unknown>> = []
    for (const team of teams) {
      const members = refArray(team.members)
      if (!members.some((r) => r._ref === speakerId)) {
        nextTeams.push(team)
        continue
      }
      teamsChanged = true
      const remaining = members.filter((r) => r._ref !== speakerId)
      if (remaining.length === 0) {
        reasons.push(`team "${String(team.key ?? team.title ?? '?')}" removed`)
        continue
      }
      nextTeams.push({ ...team, members: remaining })
      reasons.push(`team "${String(team.key ?? team.title ?? '?')}" members`)
    }
    if (teamsChanged) set.teams = nextTeams
  }

  if (Object.keys(set).length === 0) return null
  return {
    id,
    type: 'conference',
    rev,
    set,
    reason: `curation: ${reasons.join(', ')}`,
  }
}

/** Drop the subject from `speakers[]`, tombstone them in `untaggedSpeakers[]`. */
function planGalleryUntag(
  doc: Record<string, unknown>,
  speakerId: string,
  rev: string | undefined,
): ErasureDocumentPatch | null {
  const id = String(doc._id)
  const tagged = refArray(doc.speakers).find((r) => r._ref === speakerId)
  const alreadyUntagged = refArray(doc.untaggedSpeakers).some(
    (r) => r._ref === speakerId,
  )
  if (!tagged && alreadyUntagged) return null

  const patch: ErasureDocumentPatch = {
    id,
    type: 'imageGallery',
    rev,
    reason: 'gallery untag (the photograph itself is retained)',
  }
  if (tagged) {
    // Prefer the `_key` selector the existing mechanism uses; fall back to
    // `_ref` when a legacy entry has no key. Both are validated before they
    // reach the interpolated selector.
    const selector =
      typeof tagged._key === 'string' && SAFE_ID.test(tagged._key)
        ? `speakers[_key=="${tagged._key}"]`
        : `speakers[_ref=="${speakerId}"]`
    patch.unset = [selector]
  }
  if (!alreadyUntagged) {
    patch.setIfMissing = { untaggedSpeakers: [] }
    patch.append = {
      path: 'untaggedSpeakers',
      // A tombstone pointing at the (surviving, anonymised) speaker document.
      // `untaggedSpeakers` is a STRONG ref in the schema, matching the existing
      // writer in `@/lib/gallery/sanity`.
      items: [
        {
          _type: 'reference',
          _ref: speakerId,
          _key: `untagged-${speakerId}`,
        },
      ],
    }
  }
  return patch
}

// ---------------------------------------------------------------------------
// The I/O wrapper
// ---------------------------------------------------------------------------

/** Options for {@link eraseSpeakerInPlace}. */
export interface EraseSpeakerOptions {
  speakerId: string
  /** Who ran it, for the audit log. Free text — an operator name or ticket id. */
  actor: string
  /** Compute and return the plan WITHOUT writing anything. */
  dryRun?: boolean
  /**
   * Cache revalidation. Injected because `revalidateTag` only works inside a
   * Next.js request/action scope — a `tsx` script has none. Omit and the
   * wrapper reports the tags it could not revalidate instead of pretending.
   */
  revalidate?: (tag: string) => void | Promise<void>
}

/** What the operator gets back. */
export interface EraseSpeakerResult {
  plan: ErasurePlan | null
  committed: boolean
  /** Image asset outcome: deleted, kept (still referenced), or absent. */
  imageAsset: {
    id: string | null
    deleted: boolean
    /** Remaining references found before the delete; -1 means the read failed. */
    remainingReferences: number
  }
  cache: { tags: string[]; revalidated: boolean; error: string | null }
  verification: ErasureVerification | null
  err: Error | null
}

/** The post-erasure verification query's answer. */
export interface ErasureVerification {
  clean: boolean
  residual: {
    /** Speaker fields that should be gone but are not. */
    speakerFields: string[]
    nameIsPlaceholder: boolean
    emailIsAnonymised: boolean
    slugIsAnonymised: boolean
    erasedAt: string | null
    notifications: number
    conversationPreferences: number
    dashboardConfigs: number
    reminderLogs: number
    coSpeakerInvitations: number
    signInTokens: number
    galleryTags: number
    curationEntries: number
    unpaidBankingDetails: number
    ticketEntries: number
    imageAsset: number
  }
}

const CACHE_TAGS = ['content:speakers', 'content:speaker-detail']

async function fetchErasureInputs(
  speakerId: string,
  now: string,
): Promise<ErasureInputs> {
  const speaker = await clientRead.fetch<ErasureSpeakerDoc | null>(
    // groq-global: erasure is a GLOBAL operation on a cross-org person
    // document. The right belongs to the data subject, not to any organizer,
    // and the caller is the platform operator — scoping this to one tenant
    // would make a lawful erasure impossible for a speaker who has spoken at
    // two conferences. See PRD §5 (RunKonf/platform#52).
    groq`*[_id == $speakerId][0]`,
    { speakerId },
    { cache: 'no-store' },
  )

  const emails = speaker ? speakerEmailMatchSet(speaker) : []
  const targetSlug = erasedSlug(speakerId)

  const [
    referencingDocs,
    ticketTalks,
    signInTokens,
    coSpeakerInvitations,
    slugConflicts,
  ] = await Promise.all([
    clientRead.fetch<Array<Record<string, unknown>>>(
      // groq-global: every inbound reference to the subject, in every
      // tenant. Enumerated generically, exactly as `mergeSpeakers` does.
      groq`*[references($speakerId) && _id != $speakerId]`,
      { speakerId },
      { cache: 'no-store' },
    ),
    clientRead.fetch<TicketTalkDoc[]>(
      // groq-global: `issuedSpeakerTickets[].speakerId` is a plain STRING,
      // so `references()` above cannot see these. Global for the same reason.
      groq`*[_type == "talk" && (
          $speakerId in issuedSpeakerTickets[].speakerId ||
          count(issuedSpeakerTickets[email in $emails]) > 0
        )]{ _id, _rev, issuedSpeakerTickets }`,
      { speakerId, emails },
      { cache: 'no-store' },
    ),
    emails.length > 0
      ? clientRead.fetch<Array<{ _id: string }>>(
          // groq-global: `emailSignInToken` is deliberately untenanted —
          // identity is platform-wide, keyed only on the email address.
          groq`*[_type == "emailSignInToken" && identifier in $emails]{ _id }`,
          { emails },
          { cache: 'no-store' },
        )
      : Promise.resolve([]),
    emails.length > 0
      ? clientRead.fetch<Array<{ _id: string }>>(
          // groq-global: an UNACCEPTED co-speaker invitation holds only the
          // invitee's plaintext email — no reference to them exists, so the
          // `references()` read above is blind to it. `lower()` because
          // `invitedEmail` is stored as typed, while the match-set is
          // normalised.
          groq`*[_type == "coSpeakerInvitation" && lower(invitedEmail) in $emails]{ _id }`,
          { emails },
          { cache: 'no-store' },
        )
      : Promise.resolve([]),
    clientRead.fetch<Array<{ _id: string }>>(
      // groq-global: a slug collision must be detected across ALL tenants —
      // speaker slugs share one public URL space.
      groq`*[_type == "speaker" && slug.current == $targetSlug]{ _id }`,
      { targetSlug },
      { cache: 'no-store' },
    ),
  ])

  return {
    speaker,
    referencingDocs: referencingDocs ?? [],
    ticketTalks: ticketTalks ?? [],
    signInTokens: signInTokens ?? [],
    coSpeakerInvitations: coSpeakerInvitations ?? [],
    slugConflictIds: (slugConflicts ?? []).map((d) => d._id),
    now,
  }
}

/**
 * Erase a speaker in place, or (with `dryRun`) preview the operation.
 *
 * Phases, in this order and for these reasons:
 *   1. READ everything and build the plan. Refusals abort here — nothing has
 *      been written, so a refused erasure leaves no half-state.
 *   2. ONE revision-guarded transaction for every document mutation. The
 *      email-keyed sweeps must share it with the speaker patch, because that
 *      patch destroys the very match-set they select on.
 *   3. DELETE the image asset — only now, because Sanity refuses to delete an
 *      asset with a live reference, and only if nothing else still points at it.
 *   4. Cache revalidation.
 *   5. The post-erasure verification query.
 *
 * Returns `{ err }` rather than throwing, matching `mergeSpeakers`.
 */
export async function eraseSpeakerInPlace(
  opts: EraseSpeakerOptions,
): Promise<EraseSpeakerResult> {
  const { speakerId, actor, dryRun = false, revalidate } = opts
  const empty: EraseSpeakerResult = {
    plan: null,
    committed: false,
    imageAsset: { id: null, deleted: false, remainingReferences: 0 },
    cache: { tags: [], revalidated: false, error: null },
    verification: null,
    err: null,
  }

  try {
    const inputs = await fetchErasureInputs(speakerId, new Date().toISOString())
    const plan = buildErasurePlan(inputs)

    if (plan.refusals.length > 0) {
      return {
        ...empty,
        plan,
        err: new ErasureValidationError(plan.refusals.join('; ')),
      }
    }
    if (dryRun) return { ...empty, plan }

    // --- phase 2: one transaction ------------------------------------------
    if (!plan.noop) {
      const tx = clientWrite.transaction()

      for (const patch of plan.documentPatches) {
        tx.patch(patch.id, (p) => {
          let applied = p
          if (patch.set) applied = applied.set(patch.set)
          if (patch.setIfMissing) {
            applied = applied.setIfMissing(patch.setIfMissing)
          }
          if (patch.unset) applied = applied.unset(patch.unset)
          if (patch.append) {
            applied = applied.insert(
              'after',
              `${patch.append.path}[-1]`,
              patch.append.items,
            )
          }
          // Revision-guarded: a concurrent edit to the arrays we rewrote makes
          // the WHOLE transaction 409 rather than clobber it. The operator
          // re-runs; the operation is idempotent, so that is always safe.
          return patch.rev ? applied.ifRevisionId(patch.rev) : applied
        })
      }

      const hasSpeakerOps =
        Object.keys(plan.speakerSet).length > 0 ||
        Object.keys(plan.speakerSetIfMissing).length > 0 ||
        plan.speakerUnset.length > 0
      if (hasSpeakerOps) {
        tx.patch(plan.speakerId, (p) => {
          let applied = p
          if (Object.keys(plan.speakerSetIfMissing).length > 0) {
            applied = applied.setIfMissing(plan.speakerSetIfMissing)
          }
          if (Object.keys(plan.speakerSet).length > 0) {
            applied = applied.set(plan.speakerSet)
          }
          if (plan.speakerUnset.length > 0) {
            applied = applied.unset(plan.speakerUnset)
          }
          return applied
        })
      }

      for (const del of plan.documentDeletes) tx.delete(del.id)

      await tx.commit()
    }

    // --- phase 3: the image asset ------------------------------------------
    const imageAsset = await deleteImageAssetIfOrphaned(plan.imageAssetId)

    // --- phase 4: caches ----------------------------------------------------
    const cache = await revalidateErasureTags(plan, revalidate)

    // --- phase 5: verification ---------------------------------------------
    const verification = await verifySpeakerErasure(plan.speakerId)

    console.info('[speaker-erasure] anonymised speaker in place', {
      actor,
      speakerId: plan.speakerId,
      // Deliberately NO personal data in the audit line — ids and counts only.
      patched: plan.documentPatches.length,
      deleted: plan.documentDeletes.length,
      retainedBanking: plan.retainedBanking.length,
      imageAssetDeleted: imageAsset.deleted,
      verificationClean: verification?.clean ?? null,
    })

    return {
      plan,
      committed: !plan.noop,
      imageAsset,
      cache,
      verification,
      err: null,
    }
  } catch (error) {
    if (!(error instanceof ErasureValidationError)) {
      console.error('Error erasing speaker:', error)
    }
    return { ...empty, err: error as Error }
  }
}

/**
 * Delete the profile image ASSET, not just the reference to it.
 *
 * Unsetting `speaker.image` removes the pointer; the photograph stays live and
 * publicly fetchable on `cdn.sanity.io` forever. It is only safe to delete once
 * NOTHING references the asset — a gallery image or another speaker may share
 * it — so the reference count is checked first and a non-zero count keeps the
 * asset and reports it. A failed count (`-1`) also keeps it: fail closed.
 */
async function deleteImageAssetIfOrphaned(
  assetId: string | null,
): Promise<EraseSpeakerResult['imageAsset']> {
  if (!assetId) return { id: null, deleted: false, remainingReferences: 0 }

  let remainingReferences = -1
  try {
    const result = await clientRead.fetch<{ n: number }>(
      // groq-global: an asset can be shared by documents in any tenant, so the
      // safety check must see all of them. A bare zero `count()` is wrapped in
      // an object because Sanity errors on a bare scalar count projection.
      groq`{ "n": count(*[references($assetId)]) }`,
      { assetId },
      { cache: 'no-store' },
    )
    remainingReferences = result?.n ?? -1
  } catch {
    return { id: assetId, deleted: false, remainingReferences: -1 }
  }

  if (remainingReferences !== 0) {
    return { id: assetId, deleted: false, remainingReferences }
  }

  try {
    await clientWrite.delete(assetId)
    return { id: assetId, deleted: true, remainingReferences: 0 }
  } catch {
    return { id: assetId, deleted: false, remainingReferences: 0 }
  }
}

async function revalidateErasureTags(
  plan: ErasurePlan,
  revalidate: EraseSpeakerOptions['revalidate'],
): Promise<EraseSpeakerResult['cache']> {
  const tags = [
    ...CACHE_TAGS,
    ...plan.affectedConferenceIds.map((id) => `sanity:conference-${id}`),
  ]
  if (!revalidate) {
    return {
      tags,
      revalidated: false,
      error:
        'no revalidate() supplied — `revalidateTag` needs a Next.js request ' +
        'scope. Invalidate these tags separately (see the runbook).',
    }
  }
  try {
    for (const tag of tags) await revalidate(tag)
    return { tags, revalidated: true, error: null }
  } catch (error) {
    return { tags, revalidated: false, error: (error as Error).message }
  }
}

/**
 * The post-erasure verification query. Run it as the last step of the runbook,
 * and again after any re-run. `clean: true` is the operator's evidence.
 *
 * It re-derives everything from `_id` and re-runs the SAME reads the erasure
 * uses, then counts what is left. That is deliberate on two counts: it is a
 * genuine independent check that can be run days later by someone else, and it
 * cannot drift from the operation, because a document type the sweep learns
 * about is automatically a document type the verification counts.
 *
 * It adds exactly one read of its own — the image asset — rather than a
 * projection full of nested `count(*[...])` roots, which the tenancy lint rule
 * cannot annotate (a comment cannot reach inside a template literal, so only
 * the first root in a literal can carry `groq-global:`).
 */
export async function verifySpeakerErasure(
  speakerId: string,
): Promise<ErasureVerification | null> {
  const targetSlug = erasedSlug(speakerId)
  const targetEmail = erasedEmail(speakerId)

  const inputs = await fetchErasureInputs(speakerId, new Date().toISOString())
  const doc = inputs.speaker
  if (!doc) return null

  const emails = speakerEmailMatchSet(doc)
  const assetId = isReference(doc.image?.asset) ? doc.image.asset._ref : null

  const byType = (type: string) =>
    inputs.referencingDocs.filter((d) => d._type === type)

  const notifications = byType('notification').filter((d) =>
    refPointsAt(d.recipient, speakerId),
  ).length
  const conversationPreferences = byType('conversationPreference').filter((d) =>
    refPointsAt(d.speaker, speakerId),
  ).length
  const dashboardConfigs = byType('dashboardConfig').filter((d) =>
    refPointsAt(d.speaker, speakerId),
  ).length
  const reminderLogs = byType('scheduledReminderLog').filter((d) =>
    refPointsAt(d.speaker, speakerId),
  ).length
  const galleryTags = byType('imageGallery').filter((d) =>
    refArray(d.speakers).some((r) => r._ref === speakerId),
  ).length
  const curationEntries = byType('conference').filter(
    (d) =>
      refArray(d.organizers).some((r) => r._ref === speakerId) ||
      refArray(d.featuredSpeakers).some((r) => r._ref === speakerId) ||
      (Array.isArray(d.teams) &&
        (d.teams as Array<Record<string, unknown>>).some((team) =>
          refArray(team.members).some((r) => r._ref === speakerId),
        )),
  ).length
  const unpaidBankingDetails = byType('travelSupport').filter(
    (d) =>
      refPointsAt(d.speaker, speakerId) &&
      (UNPAID_TRAVEL_SUPPORT_STATUSES as readonly string[]).includes(
        String(d.status ?? ''),
      ) &&
      d.bankingDetails !== undefined,
  ).length

  // Reference-borne AND email-borne invitations both count as residual.
  const invitationIds = new Set<string>([
    ...byType('coSpeakerInvitation')
      .filter((d) => {
        const invited = normalizeEmail(
          typeof d.invitedEmail === 'string' ? d.invitedEmail : '',
        )
        return invited.length > 0 && emails.includes(invited)
      })
      .map((d) => String(d._id)),
    ...inputs.coSpeakerInvitations.map((d) => d._id),
  ])

  const ticketEntries = inputs.ticketTalks.reduce(
    (total, talk) =>
      total +
      (talk.issuedSpeakerTickets ?? []).filter(
        (entry) =>
          entry.speakerId === speakerId ||
          (entry.email ? emails.includes(normalizeEmail(entry.email)) : false),
      ).length,
    0,
  )

  let imageAsset = 0
  if (assetId) {
    const found = await clientRead.fetch<{ n: number }>(
      // groq-global: the profile image asset is a dataset-wide document with no
      // tenant of its own. Counting it is how the runbook proves the photograph
      // is gone from the CDN and not merely unreferenced.
      groq`{ "n": count(*[_id == $assetId]) }`,
      { assetId },
      { cache: 'no-store' },
    )
    imageAsset = found?.n ?? 0
  }

  const speakerFields = ERASURE_UNSET_FIELDS.filter(
    (field) => !isAbsent(doc, field),
  ) as string[]

  const nameIsPlaceholder = doc.name === ERASED_SPEAKER_NAME
  const emailIsAnonymised = doc.email === targetEmail
  const slugIsAnonymised = currentSlug(doc) === targetSlug

  const residual = {
    speakerFields,
    nameIsPlaceholder,
    emailIsAnonymised,
    slugIsAnonymised,
    erasedAt: typeof doc.erasedAt === 'string' ? doc.erasedAt : null,
    notifications,
    conversationPreferences,
    dashboardConfigs,
    reminderLogs,
    coSpeakerInvitations: invitationIds.size,
    signInTokens: inputs.signInTokens.length,
    galleryTags,
    curationEntries,
    unpaidBankingDetails,
    ticketEntries,
    imageAsset,
  }

  const clean =
    speakerFields.length === 0 &&
    nameIsPlaceholder &&
    emailIsAnonymised &&
    slugIsAnonymised &&
    residual.erasedAt !== null &&
    notifications === 0 &&
    conversationPreferences === 0 &&
    dashboardConfigs === 0 &&
    reminderLogs === 0 &&
    residual.coSpeakerInvitations === 0 &&
    residual.signInTokens === 0 &&
    galleryTags === 0 &&
    curationEntries === 0 &&
    unpaidBankingDetails === 0 &&
    ticketEntries === 0 &&
    imageAsset === 0

  return { clean, residual }
}
