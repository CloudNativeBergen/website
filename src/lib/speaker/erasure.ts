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
 *  - `ticketEmailGrants` — the provenance trail for addresses an ORGANIZER
 *    added to `knownEmails` off a ticket. Each entry holds the subject's own
 *    address twice (normalized and as registered), so clearing `knownEmails`
 *    without this one would leave the erased address sitting beside it.
 *  - `imageURL` — a GitHub/LinkedIn avatar URL encodes the account id.
 *  - `image` — the profile image REFERENCE. The asset document itself is
 *    deleted separately (see {@link eraseSpeakerInPlace}); unsetting the ref
 *    only removes the pointer, the photo stays live on `cdn.sanity.io`.
 *  - `mergedWith` — the duplicate-merge recovery trail. Each entry holds a copy
 *    of a speaker record that a merge deleted, so leaving it would keep name,
 *    email, bio and possibly gender/country alive on a document we have just
 *    told someone was erased. This unset covers the case where the SUBJECT is
 *    the survivor. The other direction — the subject is the person a merge
 *    DELETED, and their data now lives inside somebody else's trail — is not
 *    reachable by id (that document is gone) and not reachable by GROQ inside
 *    the `snapshot` JSON string either, so it has its own email-keyed sweep:
 *    see {@link MERGE_TRAIL_ERASURE} and `mergeTrailDocs`.
 *  - `socialTagOptOut` / `socialTagOptOutAt` — a refusal to be @-mentioned in
 *    posts, and when it was made. `links` (the accounts it is ABOUT) is unset
 *    on the line above, so the pair describes nothing after an erasure; the
 *    timestamp is itself a dated fact about a person we have said is gone.
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
  'ticketEmailGrants',
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
  'socialTagOptOut',
  'socialTagOptOutAt',
  'mergedWith',
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

/**
 * THE EMAIL-KEYED CLASS — the blind spot this operation has to defend against.
 *
 * `*[references($speakerId)]` finds everything that points AT the subject. It is
 * structurally blind to a document that records a person by their PLAINTEXT
 * EMAIL ADDRESS instead of by reference, because there is no reference to
 * follow. Such a document typically exists precisely because the person may not
 * have an account yet — an invitation to an address is the canonical shape — so
 * this is not an edge case, it is the normal state of an unaccepted invite.
 *
 * The failure mode is the worst one this operation has: the sweep completes,
 * `verifySpeakerErasure` reports CLEAN, and a document carrying the person's
 * address (and, for invitations, a LIVE BEARER TOKEN to their mailbox) survives.
 * We would have told them it was gone.
 *
 * TWO of these have already been missed at review — `coSpeakerInvitation`, and
 * `organizerInvitation`, which shipped in #880 three days before this operation
 * was written and had a production count of ZERO, so no test or query could have
 * noticed it. A count of zero is the DANGEROUS case, not the safe one: an
 * invite-gated launch means the first real use creates the hole.
 *
 * WHEN YOU ADD A DOCUMENT TYPE WITH AN EMAIL FIELD, decide whether it can hold a
 * SPEAKER's address. If it can, add it here AND to the query in
 * {@link fetchErasureInputs}. `erasure.emailKeyed.test.ts` scans every schema for
 * email-shaped fields and fails until the new one is recorded with a
 * disposition, so the next one is caught at REVIEW rather than by an erasure
 * that silently under-delivers.
 */
export const EMAIL_KEYED_ERASURE_SITES = [
  { type: 'coSpeakerInvitation', field: 'invitedEmail' },
  { type: 'organizerInvitation', field: 'invitedEmail' },
  { type: 'emailSignInToken', field: 'identifier' },
] as const

/**
 * THE MERGE TRAIL — the email-keyed class in its second shape (#1027).
 *
 * `speaker.mergedWith[]` (see `sanity/schemaTypes/speaker.ts`) keeps a copy of
 * every duplicate a merge deleted, on the SURVIVOR. For the survivor that is
 * covered: {@link ERASURE_UNSET_FIELDS} drops the whole array. For the person
 * who was merged AWAY it is not, and the gap is exactly the one the email-keyed
 * class exists for, arrived at from a new direction:
 *
 *  - their speaker document was DELETED, so `*[references($speakerId)]` has
 *    nothing to follow and their id resolves to nothing;
 *  - their name, address and bio sit inside `snapshot`, a JSON STRING, which
 *    GROQ cannot look inside at all.
 *
 * WHOSE DATA THIS ACTUALLY REACHES, stated precisely because the obvious story
 * is wrong. A CORRECT duplicate merge leaves the person a live survivor
 * document, and an erasure request from them lands on it and unsets `mergedWith`
 * wholesale — no sweep needed. What this sweep is for is the MIS-MERGE: two
 * different people folded together, so X's record now sits in Y's trail. X still
 * has (or later creates) their own document, X requests erasure, and the copy of
 * X inside Y's `mergedWith` is reached by nothing — no reference leads to it and
 * the values are inside a JSON string. Without this the tool reports done over
 * it. "Their id no longer resolves" describes the mechanism; it does not
 * discharge the obligation.
 *
 * The sweep runs from the subject's LIVE speaker document: no live document
 * means {@link buildErasurePlan} throws `Speaker not found` and nothing runs at
 * all. The runbook says what the operator does in that case.
 *
 * So the merge writes {@link MERGE_TRAIL_EMAIL_FIELD}: the deleted person's
 * normalised match set, as a TYPED ARRAY, which GROQ can select on. This sweep
 * uses it, and REDACTS rather than deletes — see {@link redactMergeTrailEntry}
 * for what survives and why.
 *
 * `actorId` is swept alongside it. An organizer who RAN a merge has their name
 * denormalised into `actorName` on the survivor; that one is reachable by id, so
 * it needs no email key, but it is the same field on the same entry and is
 * redacted in the same patch.
 */
export const MERGE_TRAIL_ERASURE = {
  type: 'speaker',
  field: 'mergedWith',
  emailField: 'loserEmails',
} as const

/** The typed match key inside a `mergedWith[]` entry. */
export const MERGE_TRAIL_EMAIL_FIELD = MERGE_TRAIL_ERASURE.emailField

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

/** One `mergedWith[]` entry, as far as erasure cares. */
export interface MergeTrailEntry {
  _key?: string
  actorId?: string
  actorName?: string
  loserEmails?: (string | null | undefined)[]
  snapshot?: string
  [key: string]: unknown
}

/** A speaker carrying a merge trail that names the subject. */
export interface MergeTrailDoc {
  _id: string
  _rev?: string
  mergedWith?: MergeTrailEntry[]
}

/** Everything {@link buildErasurePlan} needs. Reads live in the wrapper. */
export interface ErasureInputs {
  speaker: ErasureSpeakerDoc | null
  /** `*[references($speakerId) && _id != $speakerId]`, unprojected. */
  referencingDocs: Array<Record<string, unknown>>
  /** Talks whose `issuedSpeakerTickets[]` name the subject by id or email. */
  ticketTalks: TicketTalkDoc[]
  /**
   * Documents matched by the subject's PLAINTEXT EMAIL rather than by a
   * reference — see {@link EMAIL_KEYED_ERASURE_SITES}. A SEPARATE READ, because
   * {@link referencingDocs} is structurally blind to them: an unaccepted
   * invitation points at the INVITER and holds no reference to the subject at
   * all.
   */
  emailKeyedDocs: Array<{ _id: string; _type: string }>
  /**
   * OTHER speakers whose `mergedWith[]` trail carries the subject — as the
   * person a merge deleted (matched on `loserEmails`) or as the organizer who
   * ran it (matched on `actorId`). See {@link MERGE_TRAIL_ERASURE}.
   */
  mergeTrailDocs: MergeTrailDoc[]
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
  /**
   * The `_rev` the speaker document was read at, so its patch can be
   * revision-guarded like every dependent patch. Without this the speaker is the
   * ONE document a concurrent edit could be silently clobbered on — exactly the
   * case the guard exists for, since a profile save is the most likely
   * concurrent write of all.
   */
  speakerRev?: string
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

/** Union of two match sets, normalised and deduplicated. */
function mergeEmailSets(a: string[], b: string[]): string[] {
  return [
    ...new Set(
      [...a, ...b].map((e) => normalizeEmail(e)).filter((e) => e.length > 0),
    ),
  ]
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
  const { speaker, referencingDocs, ticketTalks, emailKeyedDocs, now } = inputs

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

  const speakerRev = typeof speaker._rev === 'string' ? speaker._rev : undefined

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

  // Deduplicated against the reference-derived deletes above, because an
  // ACCEPTED invitation is reachable by BOTH paths while an unaccepted one is
  // reachable only here.
  const alreadyQueued = new Set(documentDeletes.map((d) => d.id))
  for (const doc of emailKeyedDocs) {
    if (alreadyQueued.has(doc._id)) continue
    alreadyQueued.add(doc._id)
    documentDeletes.push({
      id: doc._id,
      type: doc._type,
      reason:
        doc._type === 'emailSignInToken'
          ? 'sign-in token for the subject’s address'
          : 'addressed to the subject by email, with no reference to them ' +
            '(carries their plaintext address and a live bearer token)',
    })
  }

  // --- the merge trail on OTHER speakers ----------------------------------

  // The subject's own trail is unset with the rest of the speaker patch; this
  // is the other direction — their data copied onto somebody ELSE by a merge
  // that deleted one of their documents. See {@link MERGE_TRAIL_ERASURE}.
  for (const doc of inputs.mergeTrailDocs) {
    if (doc._id === speakerId) continue
    const patch = planMergeTrailRedaction(doc, speakerId, emails, now, refusals)
    if (patch) documentPatches.push(patch)
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
    speakerRev,
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

/**
 * REDACT, don't delete — what an erasure does to one `mergedWith[]` entry.
 *
 * The entry is somebody else's audit record as well as the subject's data: it
 * is how an organizer explains why two profiles became one, and it is the only
 * account of a deletion that has already happened. Dropping it whole would
 * destroy that account to satisfy a right that only reaches the PERSONAL parts
 * of it.
 *
 * So the SHAPE survives and the VALUES go. Kept: `mergedAt`, `actorId`,
 * `survivorId`, `loserId`, and the snapshot's `fields` (which side each choice
 * came from, and why) and `references` (how many documents were repointed).
 * None of that is the subject's data — ids are already the anonymised or
 * dangling kind this whole operation is built on, and a repoint count describes
 * the operation rather than the person.
 *
 * Dropped: `snapshot.loser` — the copy of their deleted document, name, email,
 * bio and all — and `loserEmails`, the match key, which is itself their
 * addresses. Losing the key is why the sweep is idempotent: after one run there
 * is nothing of that person left to match.
 *
 * An UNPARSEABLE snapshot is replaced outright. It cannot be redacted
 * selectively, and a blob we cannot read is not a blob we can promise is clean.
 *
 * Returns `null` when the snapshot already holds none of the parts this call
 * would drop. That, not a string compare, is what makes the sweep idempotent:
 * the marker it writes carries a timestamp, so comparing the rewritten JSON
 * against the stored one would report a difference on every later run and the
 * verification query would call a clean document dirty forever.
 */
export function redactMergeTrailSnapshot(
  snapshot: unknown,
  now: string,
  opts: { dropLoser: boolean; dropSurvivorBefore: boolean },
): string | null {
  const redactedAt = { loserRedactedAt: now }
  if (typeof snapshot !== 'string' || snapshot.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(snapshot)
  } catch {
    return JSON.stringify({ ...redactedAt, unreadable: true })
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return JSON.stringify({ ...redactedAt, unreadable: true })
  }
  const rest = { ...(parsed as Record<string, unknown>) }
  const dropping =
    (opts.dropLoser && rest.loser !== undefined) ||
    (opts.dropSurvivorBefore && rest.survivorBefore !== undefined)
  if (!dropping) return null
  if (opts.dropLoser) delete rest.loser
  if (opts.dropSurvivorBefore) delete rest.survivorBefore
  return JSON.stringify({ ...rest, ...redactedAt })
}

/**
 * Redact the subject out of one other speaker's merge trail.
 *
 * THREE WAYS the subject can appear in an entry, and all three are swept:
 *
 *  1. THE DELETED PERSON — `snapshot.loser` is their whole record. Found by
 *     `loserEmails`, the typed key written for this (see
 *     {@link MERGE_TRAIL_ERASURE}); nothing else can reach it.
 *  2. THE SURVIVOR OF AN EARLIER MERGE IN THE SAME CHAIN — `survivorBefore`
 *     holds the values that merge overwrote on THEM. Reached by following the
 *     chain: any entry whose `survivorId` is a document id case 1 just proved
 *     the subject used. Without this step, A→B then B→C leaves B's overwritten
 *     bio on C after erasing B.
 *  3. THE ORGANIZER WHO RAN A MERGE — `actorName`, denormalised. Reachable by
 *     id, but it is the same entry and the same patch, so it is done here.
 *     `actorId` is RETAINED and resolves to the anonymised placeholder, exactly
 *     like `review.reviewer` and every other in-place-anonymised audit ref.
 *
 * Returns `null` when nothing is left to change, which is what makes a second
 * run a no-op.
 */
function planMergeTrailRedaction(
  doc: MergeTrailDoc,
  speakerId: string,
  emails: string[],
  now: string,
  refusals: string[],
): ErasureDocumentPatch | null {
  const entries = Array.isArray(doc.mergedWith) ? doc.mergedWith : []

  const isSubjectLoser = (entry: MergeTrailEntry) =>
    (entry.loserEmails ?? []).some(
      (value) =>
        typeof value === 'string' && emails.includes(normalizeEmail(value)),
    )

  // Every document id this person has had: the one being erased, plus the
  // dangling ids of the duplicates merged away from them.
  const subjectIds = new Set<string>([speakerId])
  for (const entry of entries) {
    if (isSubjectLoser(entry) && typeof entry.loserId === 'string') {
      subjectIds.add(entry.loserId)
    }
  }

  const set: Record<string, unknown> = {}
  const unset: string[] = []
  const reasons: string[] = []

  for (const entry of entries) {
    const dropLoser = isSubjectLoser(entry)
    const dropSurvivorBefore =
      typeof entry.survivorId === 'string' && subjectIds.has(entry.survivorId)
    const dropActorName =
      typeof entry.actorId === 'string' &&
      subjectIds.has(entry.actorId) &&
      entry.actorName !== undefined
    if (!dropLoser && !dropSurvivorBefore && !dropActorName) continue

    const key = entry._key
    if (typeof key !== 'string' || !SAFE_ID.test(key)) {
      // Loud, not silent: an entry we cannot address is an entry we cannot
      // clear, and reporting the erasure clean over it is the failure this
      // whole module is built to avoid.
      refusals.push(
        `Speaker ${doc._id} has a mergedWith entry naming the subject whose ` +
          `_key ${JSON.stringify(key)} cannot be safely selected; clear it by hand`,
      )
      continue
    }
    const path = `${MERGE_TRAIL_ERASURE.field}[_key=="${key}"]`

    if (dropLoser || dropSurvivorBefore) {
      const redacted = redactMergeTrailSnapshot(entry.snapshot, now, {
        dropLoser,
        dropSurvivorBefore,
      })
      if (redacted !== null) {
        set[`${path}.snapshot`] = redacted
        reasons.push(dropLoser ? `${key} snapshot` : `${key} survivorBefore`)
      }
    }
    if (dropLoser && (entry.loserEmails?.length ?? 0) > 0) {
      unset.push(`${path}.${MERGE_TRAIL_EMAIL_FIELD}`)
      // Named, so the reason never renders with an empty tail: an entry whose
      // snapshot is already redacted still has its match key cleared here, and
      // that is the whole of what the patch does.
      reasons.push(`${key} ${MERGE_TRAIL_EMAIL_FIELD}`)
    }
    if (dropActorName) {
      unset.push(`${path}.actorName`)
      reasons.push(`${key} actorName`)
    }
  }

  if (Object.keys(set).length === 0 && unset.length === 0) return null
  return {
    id: doc._id,
    type: 'speaker',
    rev: doc._rev,
    ...(Object.keys(set).length > 0 ? { set } : {}),
    ...(unset.length > 0 ? { unset } : {}),
    reason: `merge trail redaction: ${reasons.join(', ')}`,
  }
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
    /**
     * Invitations that record the subject by plaintext email — `coSpeakerInvitation`
     * AND `organizerInvitation`. Counted together because they are one class
     * with one failure mode (see EMAIL_KEYED_ERASURE_SITES).
     */
    emailKeyedInvitations: number
    signInTokens: number
    /**
     * Entries in ANOTHER speaker's `mergedWith[]` that still carry the subject
     * — as the deleted duplicate, as the survivor of an earlier merge in the
     * same chain, or by denormalised organizer name. See
     * {@link MERGE_TRAIL_ERASURE}. Counted by re-running the same planner, so
     * it cannot drift from what the sweep actually does.
     */
    mergeTrailEntries: number
    galleryTags: number
    curationEntries: number
    unpaidBankingDetails: number
    ticketEntries: number
    imageAsset: number
  }
}

const CACHE_TAGS = ['content:speakers', 'content:speaker-detail']

/**
 * @param priorEmails Addresses to match on IN ADDITION to whatever the speaker
 *   document holds now. Only the verification pass supplies them, and only
 *   because the erasure it verifies has already destroyed the match set the
 *   email-keyed reads select on — see {@link verifySpeakerErasure}.
 */
async function fetchErasureInputs(
  speakerId: string,
  now: string,
  priorEmails: string[] = [],
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

  const emails = mergeEmailSets(
    speaker ? speakerEmailMatchSet(speaker) : [],
    priorEmails,
  )
  const targetSlug = erasedSlug(speakerId)

  const [
    referencingDocs,
    ticketTalks,
    emailKeyedDocs,
    mergeTrailDocs,
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
      //
      // `lower()` because the match-set is normalised while
      // `issuedSpeakerTickets[].email` is a snapshot written from
      // `marker.email` and keeps whatever casing the address was sent with. A
      // case-sensitive compare would silently leave a plaintext ticket email
      // behind: the TypeScript filter never sees a document this read misses.
      groq`*[_type == "talk" && (
          $speakerId in issuedSpeakerTickets[].speakerId ||
          count(issuedSpeakerTickets[lower(email) in $emails]) > 0
        )]{ _id, _rev, issuedSpeakerTickets }`,
      { speakerId, emails },
      { cache: 'no-store' },
    ),
    emails.length > 0
      ? clientRead.fetch<Array<{ _id: string; _type: string }>>(
          // groq-global: THE EMAIL-KEYED CLASS (see
          // EMAIL_KEYED_ERASURE_SITES). These record the subject by plaintext
          // ADDRESS and hold NO reference to them, so the `references()` read
          // above is structurally blind to them. They are platform-wide by
          // nature: an invitation or a sign-in token is addressed to a person,
          // not scoped to a tenant. `lower()` on every field because the
          // match-set is normalised and these are stored as typed.
          //
          // Every entry in EMAIL_KEYED_ERASURE_SITES must appear below;
          // `erasure.emailKeyed.test.ts` fails if one does not.
          groq`*[
            (_type == "coSpeakerInvitation" && lower(invitedEmail) in $emails) ||
            (_type == "organizerInvitation" && lower(invitedEmail) in $emails) ||
            (_type == "emailSignInToken" && lower(identifier) in $emails)
          ]{ _id, _type }`,
          { emails },
          { cache: 'no-store' },
        )
      : Promise.resolve([]),
    clientRead.fetch<MergeTrailDoc[]>(
      // groq-global: THE MERGE TRAIL (see MERGE_TRAIL_ERASURE). A duplicate
      // can be merged away by any tenant the person spoke for, and the
      // erasure right is the person's, not that tenant's — same argument as
      // every other read here.
      //
      // Matched two ways because the subject appears two ways. `loserEmails`
      // is the typed match set written for exactly this sweep: the deleted
      // person holds no reference and their address is inside a JSON string
      // GROQ cannot read. `actorId` is the organizer who ran the merge, whose
      // name is denormalised into the same entry.
      //
      // No `lower()`: `loserEmails` is written already normalised by
      // `buildMergeHistory`, from the same `normalizeEmail` that builds
      // `$emails` — one writer, one form. Pinned by `erasure.emailKeyed.test.ts`.
      groq`*[_type == "speaker" && _id != $speakerId && (
          count(mergedWith[count(loserEmails[@ in $emails]) > 0]) > 0 ||
          count(mergedWith[actorId == $speakerId]) > 0
        )]{ _id, _rev, mergedWith }`,
      { speakerId, emails },
      { cache: 'no-store' },
    ),
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
    emailKeyedDocs: emailKeyedDocs ?? [],
    mergeTrailDocs: mergeTrailDocs ?? [],
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
          // Revision-guarded like every dependent patch: a profile save landing
          // between our read and this commit must 409 the whole transaction, not
          // be silently overwritten by a stale erasure.
          return plan.speakerRev
            ? applied.ifRevisionId(plan.speakerRev)
            : applied
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
    // The PRE-erasure match set is threaded through: phase 2 has just destroyed
    // it on the document, and without it every email-keyed count — the merge
    // trail included — would select on the anonymised placeholder and report 0
    // over live data. This is the one moment those addresses still exist.
    const verification = await verifySpeakerErasure(
      plan.speakerId,
      inputs.speaker ? speakerEmailMatchSet(inputs.speaker) : [],
    )

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
 * WHAT `_id` ALONE CANNOT RE-DERIVE — read this before trusting a `CLEAN` from a
 * standalone run. Every EMAIL-KEYED count (invitations, sign-in tokens, ticket
 * entries, and the merge trail matched on `loserEmails`) selects on the
 * subject's address match set, and a successful erasure DESTROYS that match set:
 * `email` is replaced with the anonymised placeholder and `knownEmails` is
 * unset. Re-deriving it from the erased document yields the placeholder, which
 * matches nothing — so those counts come back 0 whether or not residual data is
 * there, and the merge trail is then covered only by the `actorId` path.
 *
 * Hence `priorEmails`: {@link eraseSpeakerInPlace} passes the match set it read
 * BEFORE the transaction, and only then does the email-keyed side of this
 * function check what it claims to check. A later `--verify` run has no way to
 * recover those addresses — by design, since nothing of them is left — so it
 * proves the reference-borne and field-level residuals only. The runbook says so
 * in the operator's words.
 *
 * It adds exactly one read of its own — the image asset — rather than a
 * projection full of nested `count(*[...])` roots, which the tenancy lint rule
 * cannot annotate (a comment cannot reach inside a template literal, so only
 * the first root in a literal can carry `groq-global:`).
 *
 * @param priorEmails The subject's match set as read before the erasure.
 */
export async function verifySpeakerErasure(
  speakerId: string,
  priorEmails: string[] = [],
): Promise<ErasureVerification | null> {
  const targetSlug = erasedSlug(speakerId)
  const targetEmail = erasedEmail(speakerId)

  const inputs = await fetchErasureInputs(
    speakerId,
    new Date().toISOString(),
    priorEmails,
  )
  const doc = inputs.speaker
  if (!doc) return null

  const emails = mergeEmailSets(speakerEmailMatchSet(doc), priorEmails)
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

  // Reference-borne AND email-borne invitations both count as residual. The
  // email-keyed side is what catches an UNACCEPTED invitation, which holds no
  // reference for `references()` to have found.
  const invitationIds = new Set<string>([
    ...byType('coSpeakerInvitation')
      .filter((d) => {
        const invited = normalizeEmail(
          typeof d.invitedEmail === 'string' ? d.invitedEmail : '',
        )
        return invited.length > 0 && emails.includes(invited)
      })
      .map((d) => String(d._id)),
    ...inputs.emailKeyedDocs
      .filter((d) => d._type !== 'emailSignInToken')
      .map((d) => d._id),
  ])
  const signInTokens = inputs.emailKeyedDocs.filter(
    (d) => d._type === 'emailSignInToken',
  ).length

  // Re-run the planner rather than re-implement its rules: a patch it would
  // still emit IS the residual. An entry whose `_key` it refuses to select is
  // residual too — it is data we could not clear, which is the case this
  // verification exists to surface.
  const mergeTrailRefusals: string[] = []
  const mergeTrailEntries =
    inputs.mergeTrailDocs.filter(
      (d) =>
        d._id !== speakerId &&
        planMergeTrailRedaction(
          d,
          speakerId,
          emails,
          inputs.now,
          mergeTrailRefusals,
        ) !== null,
    ).length + mergeTrailRefusals.length

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
    emailKeyedInvitations: invitationIds.size,
    signInTokens,
    mergeTrailEntries,
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
    residual.emailKeyedInvitations === 0 &&
    signInTokens === 0 &&
    mergeTrailEntries === 0 &&
    galleryTags === 0 &&
    curationEntries === 0 &&
    unpaidBankingDetails === 0 &&
    ticketEntries === 0 &&
    imageAsset === 0

  return { clean, residual }
}
