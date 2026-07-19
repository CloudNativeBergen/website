import 'server-only'
import { nanoid } from 'nanoid'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { getOrganizerSpeakerIds } from '@/lib/notification/sanity'
import type {
  AccessSpeaker,
  ConversationListItem,
  ConversationParticipant,
  ConversationParty,
  ConversationPreference,
  ConversationStatus,
  ConversationView,
  ConversationViewCounts,
  ConversationWithContext,
  EmailOverride,
  Message,
} from './types'
import { DEFAULT_CONVERSATION_PREFERENCE, ORGANIZERS_GROUP } from './types'
import {
  proposalConversationId,
  sponsorConversationId,
  conversationLinkPath,
  truncateToGraphemeBoundary,
  ORGANIZERS_LABEL,
} from './links'

// Re-export the client-safe pure helpers so existing server importers keep
// their `./sanity` import surface (the definitions live in `./links`).
export { proposalConversationId, sponsorConversationId, conversationLinkPath }

/**
 * Server-only data layer for speaker↔organizer messaging (M1).
 *
 * DETERMINISTIC IDS (race-safe):
 * - a proposal thread has id `conversation.proposal.<proposalId>` and is created
 *   with `createIfNotExists`, so two concurrent starters converge on one doc;
 * - a preference has id `convpref.<conversationId>.<speakerId>` — ONE doc per
 *   pair, created with `createIfNotExists` + patch, so no array RMW race.
 *
 * SECURITY: actor/recipient ids are ALWAYS server-derived (`ctx.speaker._id`,
 * proposal speaker refs, organizer ids). No function here trusts a client to
 * say who they are.
 */

/** Deterministic id for the single (conversation, speaker) preference doc. */
export function conversationPreferenceId(
  conversationId: string,
  speakerId: string,
): string {
  return `convpref.${conversationId}.${speakerId}`
}

/** How many conversations / messages a single list page returns. */
const PAGE_SIZE = 20

const CONVERSATION_PROJECTION = `{
  "_id": _id,
  "conferenceId": conference._ref,
  conversationType,
  "proposalId": proposal._ref,
  "proposalTitle": proposal->title,
  "proposalSpeakerIds": coalesce(proposal->speakers[]._ref, []),
  "createdById": createdBy._ref,
  "subjectSpeakerId": subjectSpeaker._ref,
  subject,
  createdAt,
  lastMessageAt,
  "status": coalesce(status, 'open'),
  "assignedTo": assignedTo->{ _id, name },
  archivedAt,
  "archivedBy": archivedBy->{ _id, name },
  "participants": participants[]{
    partyType,
    "speakerId": speaker._ref,
    "sponsorForConferenceId": sponsorForConference._ref,
    group
  }
}`

// ---------------------------------------------------------------------------
// Inbox view filtering (GROQ predicates applied BEFORE pagination)
// ---------------------------------------------------------------------------
//
// Every view filter is folded into the base `*[...]` predicate, ANDed in BEFORE
// the `| order(...) [0...PAGE_SIZE]` slice. This is deliberate: per-user archive
// lives in a SEPARATE preference document, so excluding archived rows only after
// the slice would silently shrink pages. The correlated preference subquery
// below keeps the exclusion in the predicate where it belongs.

/**
 * Correlated per-user-archive probe. The deterministic preference doc
 * `convpref.<conversationId>.<callerId>` archives this thread FOR THE CALLER iff
 * its `archivedAt >= the conversation's lastMessageAt` — the same timestamp rule
 * as the global archive, so a newer message auto-resurfaces it with no extra
 * write. `^._id` / `^.lastMessageAt` reach out to the conversation being
 * filtered; `$speakerId` is the caller. `count()` is 0 or 1 (the id is unique).
 */
const PREF_ARCHIVED_SUBQUERY =
  "*[_id == 'convpref.' + ^._id + '.' + $speakerId && defined(archivedAt) && archivedAt >= ^.lastMessageAt]"
const NOT_USER_ARCHIVED = `count(${PREF_ARCHIVED_SUBQUERY}) == 0`
const USER_ARCHIVED = `count(${PREF_ARCHIVED_SUBQUERY}) > 0`

const STATUS_OPEN = "coalesce(status, 'open') == 'open'"
const STATUS_RESOLVED = "coalesce(status, 'open') == 'resolved'"
const STATUS_NOT_RESOLVED = "coalesce(status, 'open') != 'resolved'"
// Global archive: archived iff archivedAt >= lastMessageAt; a newer message
// pushes lastMessageAt past archivedAt → no longer archived (auto-resurface).
const NOT_GLOBALLY_ARCHIVED =
  '(!defined(archivedAt) || archivedAt < lastMessageAt)'
const GLOBALLY_ARCHIVED = '(defined(archivedAt) && archivedAt >= lastMessageAt)'
// The newest message's author (null when the thread has no messages yet).
// EXPORTED as the single home for this correlated projection so the stale-nudge
// job (nudge.ts) imports the SAME string — the last-author ordering can never
// drift between the inbox needs-reply filter and the nudge selection (R1).
export const LAST_AUTHOR_REF =
  '*[_type == "message" && conversation._ref == ^._id] | order(createdAt desc, _id desc)[0].author._ref'
// Needs an organizer reply: not resolved AND at least one organizer exists AND a
// message exists whose author is not an organizer. Uses $organizerIds — bound
// only for the `needs-reply` view. The `count($organizerIds) > 0` guard is
// LOAD-BEARING: with an empty organizer set `x in []` is false, so the negation
// would match EVERY thread vacuously (a misconfigured conference would flood the
// needs-reply view). No organizers means nobody can reply → needs-reply is empty
// (mirrors the JS derivation below and the nudge job's routing skip). (R2)
const NEEDS_REPLY = `${STATUS_NOT_RESOLVED} && count($organizerIds) > 0 && defined(${LAST_AUTHOR_REF}) && !(${LAST_AUTHOR_REF} in $organizerIds)`

/**
 * The non-organizer access scope: a speaker sees only conversations they
 * created, are the subject speaker of, or are a proposal-speaker on. Exported as
 * ONE string so the inbox list and the view-count projection (S7) apply the
 * IDENTICAL scope — the tab badges can never count threads the list wouldn't
 * show. Binds `$speakerId`.
 *
 * G2a DECISION — KEPT on the legacy fields (NOT flipped to `participants[]`).
 * This GROQ predicate keys on `createdBy`/`subjectSpeaker`/`proposal->speakers`,
 * which stay correct: dual-write + migration 043 keep `createdBy`/
 * `subjectSpeaker` in sync, and `proposal->speakers[]._ref` is the LIVE source
 * (dereferenced per query). A `participants[]`-based predicate would (a) be a
 * snapshot that could diverge for proposal speaker changes made through paths
 * G2a does not sync (e.g. an admin proposal edit), and (b) be unable to express
 * the derive-fallback the JS resolver provides for a participants-less doc — so
 * it could not match legacy semantics exactly. Correctness over purity: the
 * predicate keeps reading the live legacy fields; the JS authz/recipient path
 * (which CAN express the fallback) is the one that flipped.
 */
export const SPEAKER_SCOPE_PREDICATE =
  '(conversationType != "sponsor" && (createdBy._ref == $speakerId || subjectSpeaker._ref == $speakerId || $speakerId in proposal->speakers[]._ref))'
// ^ The `conversationType != "sponsor"` clause is DEFENCE-IN-DEPTH (G2b). A
// sponsor thread has no `createdBy`/`subjectSpeaker`/`proposal->speakers` that
// could name a speaker, so it is ALREADY excluded from a speaker's scope by the
// three field checks; the explicit type guard makes that guarantee independent
// of a future field change and is covered by a test. The sponsor side is
// token-authed via the portal and never reaches a speaker inbox.

/**
 * The RAW GROQ predicate for an inbox `view` (no leading ` && `, empty for
 * `all`), plus whether it references `$organizerIds` (only `needs-reply` does).
 * This is the single home for every view's filter so the inbox list
 * ({@link buildViewPredicate}) and the count-per-view projection
 * ({@link getConversationViewCounts}, S7) share EXACTLY the same predicates —
 * a badge count can never disagree with the list it labels. See
 * {@link ConversationView} for the full semantics; the ORGANIZER `active` set —
 * status open AND not globally archived AND not per-user archived — is the
 * shared base of the organizer-only views.
 */
export function rawViewPredicate(
  view: ConversationView,
  isOrganizer: boolean,
): { predicate: string; needsOrganizerIds: boolean } {
  if (!isOrganizer) {
    // Speakers: only their OWN preference archive hides a thread. Global archive
    // and status are organizer-side concepts a speaker never filters on.
    switch (view) {
      case 'archived':
        return { predicate: USER_ARCHIVED, needsOrganizerIds: false }
      case 'all':
        return { predicate: '', needsOrganizerIds: false }
      default: // 'active'
        return { predicate: NOT_USER_ARCHIVED, needsOrganizerIds: false }
    }
  }
  const active = `${STATUS_OPEN} && ${NOT_GLOBALLY_ARCHIVED} && ${NOT_USER_ARCHIVED}`
  switch (view) {
    case 'needs-reply':
      return {
        predicate: `${active} && ${NEEDS_REPLY}`,
        needsOrganizerIds: true,
      }
    case 'unassigned':
      return {
        predicate: `${active} && !defined(assignedTo)`,
        needsOrganizerIds: false,
      }
    case 'mine':
      return {
        predicate: `${active} && assignedTo._ref == $speakerId`,
        needsOrganizerIds: false,
      }
    case 'resolved':
      return {
        predicate: `${STATUS_RESOLVED} && ${NOT_GLOBALLY_ARCHIVED} && ${NOT_USER_ARCHIVED}`,
        needsOrganizerIds: false,
      }
    case 'archived':
      return {
        predicate: `(${GLOBALLY_ARCHIVED} || ${USER_ARCHIVED})`,
        needsOrganizerIds: false,
      }
    case 'all':
      return { predicate: '', needsOrganizerIds: false }
    default: // 'active'
      return { predicate: active, needsOrganizerIds: false }
  }
}

/**
 * Build the GROQ predicate FRAGMENT (leading ` && ...`, or empty for `all`) for
 * an inbox `view` — the inline form the list query ANDs into its base filter.
 * Thin wrapper over {@link rawViewPredicate}.
 */
function buildViewPredicate(
  view: ConversationView,
  isOrganizer: boolean,
): { predicate: string; needsOrganizerIds: boolean } {
  const { predicate, needsOrganizerIds } = rawViewPredicate(view, isOrganizer)
  return {
    predicate: predicate ? ` && ${predicate}` : '',
    needsOrganizerIds,
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (authz + recipient resolution). Server-derived ids only.
// ---------------------------------------------------------------------------

/**
 * Every participant of a conversation, as concrete speaker ids:
 * - proposal thread → the proposal's speakers ∪ organizers;
 * - general thread  → the creator ∪ subjectSpeaker ∪ organizers.
 * De-duplicated (a speaker who is also an organizer appears once). A general
 * thread's `subjectSpeaker` is the speaker an organizer targeted; it is absent
 * on speaker-created threads (where the creator IS the subject).
 *
 * READ FLIP (G2a): the id set is now expanded from the PARTY list
 * ({@link resolveParticipants}: dual-written `participants[]` preferred, legacy
 * derive as the safety-net fallback) rather than re-read straight off the legacy
 * fields. The `organizers` group expands via the caller-supplied `organizerIds`
 * at the SAME point the legacy logic seeded them, so WHO resolves is unchanged.
 * A `sponsor` party (reserved for G2b) carries no speaker id and is skipped by
 * the speaker system.
 */
export function resolveParticipantIds(
  conversation: Pick<
    ConversationWithContext,
    | 'conversationType'
    | 'proposalSpeakerIds'
    | 'createdById'
    | 'subjectSpeakerId'
    | 'participants'
  >,
  organizerIds: string[],
): string[] {
  const ids = new Set<string>()
  for (const party of resolveParticipants(conversation)) {
    if (party.partyType === 'speaker') {
      ids.add(party.speakerId)
    } else if (
      party.partyType === 'group' &&
      party.group === ORGANIZERS_GROUP
    ) {
      for (const id of organizerIds) ids.add(id)
    }
  }
  return Array.from(ids)
}

// ---------------------------------------------------------------------------
// Party model (G1 representation, G2a read flip).
//
// A conversation's participants are expressed as a list of PARTIES (speaker /
// sponsor / group). G1 introduced this representation and DUAL-WRITES it (below)
// alongside the legacy createdBy/subjectSpeaker/proposal fields; migration 043
// backfilled every existing document.
//
// G2a FLIPS the participant/authz READS onto {@link resolveParticipants}:
// `canAccessConversation`, `resolveParticipantIds` (⇒ `resolveRecipients`,
// `getConversationParticipants`) now prefer the stored `participants[]` and only
// DERIVE from the legacy fields as a safety-net fallback. The legacy fields and
// their projection are RETAINED (never removed) — they remain the fallback and
// still back the GROQ scope predicates, which stay on the legacy fields on
// purpose (they key on the LIVE `proposal->speakers[]`, and dual-write + 043
// keep them correct; a participants[]-based predicate could not express the
// derive fallback and would diverge for speaker edits G2a does not sync). The
// proposal thread's `participants[]` snapshot is kept in step with the live
// speaker set by {@link syncProposalConversationParticipants} on co-speaker
// add/remove. The `sponsor` party branch is exercised by SPONSOR features (G2b).
// ---------------------------------------------------------------------------

/**
 * Derive the party list from the LEGACY fields — the pre-party participant set,
 * in party form and in a STABLE order:
 * - proposal thread → one `speaker` party per proposal speaker, then the
 *   `organizers` group;
 * - general thread  → the creator, then the `subjectSpeaker` (when set), then
 *   the `organizers` group.
 *
 * The organizer team is ONE `group` party — NOT the expanded organizer id list.
 * Organizers are resolved from conference membership at read time, so a thread
 * records only THAT the organizer group is a party, never who is in it (mirrors
 * how `resolveParticipantIds` seeds the set with the live organizer ids rather
 * than storing them). This is the exact set `resolveParticipantIds` expresses,
 * with organizers collapsed to their group.
 */
function deriveParties(
  conversation: Pick<
    ConversationWithContext,
    | 'conversationType'
    | 'proposalSpeakerIds'
    | 'createdById'
    | 'subjectSpeakerId'
  >,
): ConversationParty[] {
  const parties: ConversationParty[] = []
  if (conversation.conversationType === 'proposal') {
    for (const id of conversation.proposalSpeakerIds) {
      parties.push({ partyType: 'speaker', speakerId: id })
    }
  } else if (conversation.conversationType === 'sponsor') {
    // A sponsor thread's non-organizer party is a `sponsor` party whose id
    // (the `sponsorForConference`) is NOT expressible from the legacy fields —
    // so it is ALWAYS written into `participants[]` at creation
    // ({@link ensureSponsorConversation}) and the stored array is authoritative.
    // This derive branch is unreachable for a real sponsor thread (they never
    // lack `participants[]`); it returns just the organizers group so a
    // hypothetical participants-less sponsor doc still resolves to a valid,
    // speaker-free party set rather than a bogus empty-id speaker party.
  } else {
    parties.push({ partyType: 'speaker', speakerId: conversation.createdById })
    if (conversation.subjectSpeakerId) {
      parties.push({
        partyType: 'speaker',
        speakerId: conversation.subjectSpeakerId,
      })
    }
  }
  parties.push({ partyType: 'group', group: ORGANIZERS_GROUP })
  return parties
}

/**
 * The G1 party RESOLVER: PREFERS the dual-written `participants[]` when present
 * and non-empty, otherwise DERIVES the identical set from the legacy fields
 * ({@link deriveParties}).
 *
 * This is the seam the read path flips onto in G2. In G1 no legacy read consumer
 * calls it — they keep their current logic — but the dual-write below constructs
 * the stored `participants[]` THROUGH this resolver (on a participants-less
 * context, so it takes the derive branch), which GUARANTEES the written array is
 * exactly what a legacy-only document resolves to. Tests prove the equivalence
 * `resolveParticipants(legacy) === resolveParticipants(dual-written)` for every
 * thread shape.
 */
export function resolveParticipants(
  conversation: Pick<
    ConversationWithContext,
    | 'conversationType'
    | 'proposalSpeakerIds'
    | 'createdById'
    | 'subjectSpeakerId'
    | 'participants'
  >,
): ConversationParty[] {
  if (conversation.participants && conversation.participants.length > 0) {
    return conversation.participants
  }
  return deriveParties(conversation)
}

/** A `participants[]` row as PROJECTED by GROQ (before {@link normalizeParties}). */
interface RawParty {
  partyType?: string | null
  speakerId?: string | null
  sponsorForConferenceId?: string | null
  group?: string | null
}

/**
 * Normalize the GROQ-projected `participants[]` into the {@link ConversationParty}
 * union, dropping any malformed / dangling row (e.g. a `speaker` party whose weak
 * ref was erased leaves `speakerId` null). Returns `undefined` for an
 * absent/empty array so {@link resolveParticipants} falls back to the legacy
 * derivation rather than treating "no parties" as a real empty set.
 */
function normalizeParties(
  raw: RawParty[] | null | undefined,
): ConversationParty[] | undefined {
  if (!raw || raw.length === 0) return undefined
  const parties: ConversationParty[] = []
  for (const p of raw) {
    if (p.partyType === 'speaker' && p.speakerId) {
      parties.push({ partyType: 'speaker', speakerId: p.speakerId })
    } else if (p.partyType === 'sponsor' && p.sponsorForConferenceId) {
      parties.push({
        partyType: 'sponsor',
        sponsorForConferenceId: p.sponsorForConferenceId,
      })
    } else if (p.partyType === 'group' && p.group) {
      parties.push({ partyType: 'group', group: p.group })
    }
  }
  return parties.length > 0 ? parties : undefined
}

/**
 * Serialize a {@link ConversationParty} to its stored `conversationParticipant`
 * object shape. Human-pointing refs (`speaker`, `sponsorForConference`) are WEAK
 * so a later GDPR erase never orphan-blocks — consistent with every other
 * messaging ref. Used for the single-object `message.authorParty`; array items
 * add a `_key` (see {@link partiesToStored}).
 */
function partyToStored(party: ConversationParty): Record<string, unknown> {
  if (party.partyType === 'speaker') {
    return {
      partyType: 'speaker',
      speaker: { ...createReference(party.speakerId), _weak: true },
    }
  }
  if (party.partyType === 'sponsor') {
    return {
      partyType: 'sponsor',
      sponsorForConference: {
        ...createReference(party.sponsorForConferenceId),
        _weak: true,
      },
    }
  }
  return { partyType: 'group', group: party.group }
}

/** Serialize parties for a `participants[]` array (each item needs a `_key`). */
function partiesToStored(
  parties: ConversationParty[],
): Record<string, unknown>[] {
  return parties.map((party) => ({ _key: nanoid(), ...partyToStored(party) }))
}

/**
 * The recipients of a new message: all participants EXCEPT the actor (an actor
 * is never notified about their own message — mirrors the hub's actor-exclusion
 * rule).
 */
export function resolveRecipients(
  conversation: Pick<
    ConversationWithContext,
    | 'conversationType'
    | 'proposalSpeakerIds'
    | 'createdById'
    | 'subjectSpeakerId'
    | 'participants'
  >,
  actorId: string,
  organizerIds: string[],
): string[] {
  return resolveParticipantIds(conversation, organizerIds).filter(
    (id) => id !== actorId,
  )
}

/**
 * Whether `speaker` may read/write `conversation`:
 * - any organizer; OR
 * - a proposal thread where the speaker is on the proposal; OR
 * - a general thread the speaker created OR is the subject speaker of (an
 *   organizer-initiated general thread targets a `subjectSpeaker`).
 *
 * READ FLIP (G2a): a non-organizer's access is now decided by SPEAKER-party
 * membership of the resolved party set ({@link resolveParticipants}:
 * `participants[]` preferred, legacy derive fallback) rather than a direct read
 * of the legacy fields. For a proposal thread the speaker parties ARE the
 * proposal speakers; for a general thread they are the creator (+ subject
 * speaker) — the same set the legacy field checks expressed. Organizer access
 * still short-circuits on the server-derived `isOrganizer` flag (the
 * `organizers` group party is never expanded here).
 */
export function canAccessConversation(
  conversation: Pick<
    ConversationWithContext,
    | 'conversationType'
    | 'proposalSpeakerIds'
    | 'createdById'
    | 'subjectSpeakerId'
    | 'participants'
  >,
  speaker: AccessSpeaker,
): boolean {
  if (speaker.isOrganizer) return true
  return resolveParticipants(conversation).some(
    (party) => party.partyType === 'speaker' && party.speakerId === speaker._id,
  )
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The proposal fields needed to authorize + seed a proposal conversation. */
export async function getProposalForConversation(proposalId: string): Promise<{
  conferenceId: string | null
  title: string | null
  speakerIds: string[]
} | null> {
  const result = await clientReadUncached.fetch<{
    conferenceId: string | null
    title: string | null
    speakerIds: string[] | null
  } | null>(
    `*[_type == "talk" && _id == $proposalId][0]{
      "conferenceId": conference._ref,
      title,
      "speakerIds": coalesce(speakers[]._ref, [])
    }`,
    { proposalId },
    { cache: 'no-store' },
  )
  if (!result) return null
  return {
    conferenceId: result.conferenceId,
    title: result.title,
    speakerIds: result.speakerIds ?? [],
  }
}

/**
 * The raw shape of {@link CONVERSATION_PROJECTION}: identical to
 * {@link ConversationWithContext} except `participants` arrives in the projected
 * {@link RawParty} shape (normalized below).
 */
type RawConversationWithContext = Omit<
  ConversationWithContext,
  'participants'
> & { participants?: RawParty[] | null }

/** A single conversation with its authorization/recipient context. */
export async function getConversationById(
  id: string,
): Promise<ConversationWithContext | null> {
  const result =
    await clientReadUncached.fetch<RawConversationWithContext | null>(
      `*[_type == "conversation" && _id == $id][0]${CONVERSATION_PROJECTION}`,
      { id },
      { cache: 'no-store' },
    )
  if (!result) return null
  return {
    ...result,
    proposalSpeakerIds: result.proposalSpeakerIds ?? [],
    // Party model (G1): projected alongside the legacy fields. No legacy read
    // consumer uses it yet; it powers the G2 read-path flip.
    participants: normalizeParties(result.participants),
  }
}

/**
 * The participant speaker docs for a conversation (id, name, image, organizer
 * flag), used to render a thread header.
 */
export async function getConversationParticipants(
  conversation: ConversationWithContext,
): Promise<ConversationParticipant[]> {
  const organizerIds = await getOrganizerSpeakerIds()
  const ids = resolveParticipantIds(conversation, organizerIds)
  if (ids.length === 0) return []
  const organizerSet = new Set(organizerIds)
  const speakers = await clientReadUncached.fetch<
    { _id: string; name: string; image?: string }[]
  >(
    `*[_type == "speaker" && _id in $ids]{
      _id,
      name,
      "image": coalesce(image.asset->url, imageURL)
    }`,
    { ids },
    { cache: 'no-store' },
  )
  return (speakers ?? []).map((s) => ({
    _id: s._id,
    name: s.name,
    image: s.image,
    isOrganizer: organizerSet.has(s._id),
  }))
}

/**
 * A speaker's inbox, newest activity first, keyset-paginated by `before` (the
 * `lastMessageAt` of the last item on the previous page).
 *
 * - organizers see EVERY conversation for the conference;
 * - a speaker sees only conversations they created, are a proposal-speaker on,
 *   or are the subject speaker of (an organizer-initiated general thread).
 *
 * Each row carries the caller's `unreadCount`: their unread `message_received`
 * notifications for that conversation. Rather than N per-row subqueries we run
 * ONE extra fetch of the caller's unread message links and count them in JS
 * against each row's two audience link variants (the caller only ever received
 * one variant, so matching both is simplest and correct). That fetch is SCOPED
 * to the current page's conversations (`link in $pageLinks`, ≤ 2×PAGE_SIZE
 * links) rather than the whole conference — an unscoped fetch with a fixed cap
 * silently zeroed page rows for a caller (e.g. an organizer) whose conference-
 * wide unread count exceeded the cap.
 *
 * Each row also carries Who/What metadata (M6):
 * - `lastMessage`: the newest message's author + a ~120-char excerpt (null for
 *   a conversation with no messages yet);
 * - `counterpart`: who the row is "with" for the caller's audience —
 *   ORGANIZERS see the speaker side (proposal → first proposal speaker;
 *   general → subject speaker, else the creator); SPEAKERS see the last
 *   message's author when that author is an organizer, else the collective
 *   'Organizers' label with no image (the organizer side has no single
 *   counterpart, so a label is the honest rendering).
 */
export async function listConversationsForSpeaker({
  speakerId,
  isOrganizer,
  conferenceId,
  before,
  beforeId,
  view = 'active',
}: {
  speakerId: string
  isOrganizer: boolean
  conferenceId: string
  before?: string
  beforeId?: string
  view?: ConversationView
}): Promise<ConversationListItem[]> {
  // `$speakerId` is ALWAYS bound now: besides the non-organizer access scope, it
  // keys the correlated per-user-archive probe (organizers archive per-user too)
  // and the `mine` view. An unused binding (e.g. the `all` view) is harmless.
  const params: Record<string, unknown> = { conferenceId, speakerId }
  let cursor = ''
  if (before) {
    // Compound keyset cursor: order by (lastMessageAt desc, _id desc) so rows
    // that share an exact `lastMessageAt` are totally ordered and none is
    // skipped at a page boundary. Callers that only pass `before` (no
    // `beforeId`) keep the original strict-less-than behaviour.
    if (beforeId) {
      cursor =
        ' && (lastMessageAt < $before || (lastMessageAt == $before && _id < $beforeId))'
      params.before = before
      params.beforeId = beforeId
    } else {
      cursor = ' && lastMessageAt < $before'
      params.before = before
    }
  }

  let scope = ''
  if (!isOrganizer) {
    scope = ` && ${SPEAKER_SCOPE_PREDICATE}`
  }

  // Resolve the organizer id set UP FRONT for organizers: the `needs-reply`
  // view's GROQ filter needs it as a param, and every organizer row derives
  // `needsReply` in JS from it. It is cached (getOrganizerSpeakerIds), so the
  // second-batch reuse below costs nothing. Speakers resolve it in the second
  // batch (their counterpart rendering needs it) and never filter on needsReply.
  const organizerIdsUpFront = isOrganizer
    ? await getOrganizerSpeakerIds()
    : null

  const { predicate: viewPredicate, needsOrganizerIds } = buildViewPredicate(
    view,
    isOrganizer,
  )
  if (needsOrganizerIds) {
    params.organizerIds = organizerIdsUpFront ?? []
  }

  // `lastMessage` is a correlated subquery (newest message per conversation) so
  // the whole page stays ONE fetch; `speakerSide*` pre-resolves the speaker-side
  // counterpart (organizer audience) via the house
  // `coalesce(image.asset->url, imageURL)` speaker-image pattern.
  const query = `*[_type == "conversation" && conference._ref == $conferenceId${scope}${cursor}${viewPredicate}] | order(lastMessageAt desc, _id desc) [0...${PAGE_SIZE}] {
    "_id": _id,
    conversationType,
    subject,
    "proposalId": proposal._ref,
    "proposalTitle": proposal->title,
    "subjectSpeakerId": subjectSpeaker._ref,
    createdAt,
    lastMessageAt,
    "status": coalesce(status, 'open'),
    "assignedTo": assignedTo->{ _id, name, "image": coalesce(image.asset->url, imageURL) },
    archivedAt,
    "lastMessage": *[_type == "message" && conversation._ref == ^._id] | order(createdAt desc) [0] {
      "authorId": author._ref,
      "authorName": author->name,
      "authorImage": coalesce(author->image.asset->url, author->imageURL),
      body
    },
    "speakerSideName": select(
      conversationType == "sponsor" => coalesce(participants[partyType == "sponsor"][0].sponsorForConference->sponsor->name, subject),
      conversationType == "proposal" => proposal->speakers[0]->name,
      defined(subjectSpeaker) => subjectSpeaker->name,
      createdBy->name
    ),
    // Sponsor logos are stored as inline SVG (not a URL usable in an <img>), so a
    // sponsor row deliberately has no counterpart image and falls back to an
    // initials avatar (the "else initial" branch) — the select() has no sponsor
    // case, so a sponsor thread yields null here.
    "speakerSideImage": select(
      conversationType == "proposal" => coalesce(proposal->speakers[0]->image.asset->url, proposal->speakers[0]->imageURL),
      defined(subjectSpeaker) => coalesce(subjectSpeaker->image.asset->url, subjectSpeaker->imageURL),
      coalesce(createdBy->image.asset->url, createdBy->imageURL)
    )
  }`

  const results = await clientReadUncached.fetch<RawConversationRow[]>(
    query,
    params,
    { cache: 'no-store' },
  )
  const rows = results ?? []
  if (rows.length === 0) return []

  // ONE extra read, SCOPED to THIS page's conversations via `link in $pageLinks`
  // (both audience variants per row → ≤ 2×PAGE_SIZE links). This replaces an
  // unscoped conference-wide fetch with a fixed [0...500] cap that silently
  // zeroed page rows once a caller's total unread count crossed the cap
  // (organizers see EVERY conversation). Since M5 a collapsed notification
  // represents `count` unread messages (absent = 1, which also covers
  // pre-collapse per-message documents), so we SUM `coalesce(count, 1)` per link
  // in JS rather than counting documents.
  //
  // A SPEAKER caller additionally needs the organizer id set to decide whether
  // the last message's author is "an organizer" (their counterpart); organizers
  // don't (their counterpart is the pre-resolved speaker side), so their path
  // stays at two fetches.
  const pageLinks = rows.flatMap((row) => [
    conversationLinkPath(row, true),
    conversationLinkPath(row, false),
  ])
  // The caller's OWN preference docs for exactly this page's conversations,
  // fetched by their deterministic ids (`convpref.<convId>.<callerId>`). Used to
  // derive the DISPLAY `archived` boolean per row (the correlated subquery above
  // does the pre-pagination FILTERING; this cheap page-scoped read supplies the
  // per-user archive timestamp for the returned rows). Runs in the SAME parallel
  // batch as the unread fetch.
  const prefIds = rows.map((row) =>
    conversationPreferenceId(row._id, speakerId),
  )
  const [unreadRows, prefRows, organizerIds] = await Promise.all([
    clientReadUncached.fetch<{ link: string | null; count: number }[]>(
      `*[_type == "notification" && recipient._ref == $speakerId && conference._ref == $conferenceId && notificationType == "message_received" && !defined(readAt) && link in $pageLinks]{ link, "count": coalesce(count, 1) }`,
      { speakerId, conferenceId, pageLinks },
      { cache: 'no-store' },
    ),
    clientReadUncached.fetch<
      {
        conversationId: string | null
        archivedAt: string | null
        muted: boolean | null
      }[]
    >(
      `*[_type == "conversationPreference" && _id in $prefIds]{ "conversationId": conversation._ref, archivedAt, muted }`,
      { prefIds },
      { cache: 'no-store' },
    ),
    isOrganizer
      ? Promise.resolve<string[]>(organizerIdsUpFront ?? [])
      : getOrganizerSpeakerIds(),
  ])
  const organizerSet = new Set(organizerIds)
  const linkCounts = new Map<string, number>()
  for (const row of unreadRows ?? []) {
    if (row.link) {
      linkCounts.set(row.link, (linkCounts.get(row.link) ?? 0) + row.count)
    }
  }
  // Per-user archive timestamp keyed by conversation id (null archivedAt ignored).
  const prefArchivedAt = new Map<string, string>()
  // The caller's mute preference keyed by conversation id (V1g row mute glyph).
  const prefMuted = new Map<string, boolean>()
  for (const pref of prefRows ?? []) {
    if (pref.conversationId && pref.archivedAt) {
      prefArchivedAt.set(pref.conversationId, pref.archivedAt)
    }
    if (pref.conversationId && pref.muted) {
      prefMuted.set(pref.conversationId, true)
    }
  }

  const items = rows.map((row) => {
    // Match EITHER audience variant; the caller received only one of them.
    const unreadCount =
      (linkCounts.get(conversationLinkPath(row, true)) ?? 0) +
      (linkCounts.get(conversationLinkPath(row, false)) ?? 0)
    // A body that trims to nothing (only whitespace) produces an empty excerpt:
    // return no lastMessage at all so the row renders without a blank snippet
    // line, rather than an object carrying an empty string.
    const excerpt = row.lastMessage ? excerptOf(row.lastMessage.body ?? '') : ''
    // Timestamp archive semantics (both audiences): archived iff the archive
    // stamp is at least as recent as the last message; a newer message
    // auto-resurfaces the thread. A speaker sees ONLY their per-user archive; an
    // organizer sees the global archive OR their own per-user archive.
    const userArchiveStamp = prefArchivedAt.get(row._id)
    const userArchived =
      userArchiveStamp != null && userArchiveStamp >= row.lastMessageAt
    const globallyArchived =
      row.archivedAt != null && row.archivedAt >= row.lastMessageAt
    const archived = isOrganizer
      ? globallyArchived || userArchived
      : userArchived
    // needs-reply is an ORGANIZER concept: last message from a non-organizer and
    // not resolved. Always false for a speaker caller. The `organizerSet.size > 0`
    // guard mirrors the GROQ `count($organizerIds) > 0` guard: with NO organizers
    // (misconfigured conference or a transient organizer-fetch failure)
    // `!organizerSet.has(...)` is vacuously true, which would flag every thread —
    // nobody can reply, so needs-reply must be FALSE. (R2)
    const needsReply =
      isOrganizer &&
      organizerSet.size > 0 &&
      row.status !== 'resolved' &&
      row.lastMessage != null &&
      !organizerSet.has(row.lastMessage.authorId)
    // DIRECT-THREAD IDENTITY (S10), viewer-relative: the caller is personally
    // addressed — they ARE the subject speaker (organizer-initiated thread
    // about/to them) OR they are the assignee.
    const subjectSpeakerId = row.subjectSpeakerId ?? undefined
    const direct =
      subjectSpeakerId === speakerId || row.assignedTo?._id === speakerId
    return {
      _id: row._id,
      conversationType: row.conversationType,
      subject: row.subject,
      proposalId: row.proposalId,
      proposalTitle: row.proposalTitle,
      subjectSpeakerId,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
      unreadCount,
      lastMessage:
        row.lastMessage && excerpt
          ? {
              authorId: row.lastMessage.authorId,
              authorName: row.lastMessage.authorName ?? 'Unknown',
              excerpt,
            }
          : null,
      counterpart: resolveCounterpart(row, isOrganizer, organizerSet),
      status: row.status,
      assignedTo: row.assignedTo
        ? {
            _id: row.assignedTo._id,
            name: row.assignedTo.name,
            image: row.assignedTo.image ?? undefined,
          }
        : null,
      needsReply,
      archived,
      muted: prefMuted.get(row._id) ?? false,
      direct,
    }
  })

  // ACTIVE-VIEW DIRECT GROUPING (S10b, organizer audience only): float direct
  // threads above non-direct ones. A STABLE partition WITHIN the fetched page —
  // the base fetch already orders by (lastMessageAt desc, _id desc), so recency
  // is preserved inside each group. TRADEOFF: because keyset pagination pages by
  // lastMessageAt, this groups direct-first only within each page, not globally
  // across page boundaries; a fully global grouping would need a second sort key
  // in the cursor. Accepted (maintainer): the first page — where it matters most
  // — is correctly grouped, and within-page recency is intact.
  if (isOrganizer && view === 'active') {
    const directRows = items.filter((item) => item.direct)
    const rest = items.filter((item) => !item.direct)
    return [...directRows, ...rest]
  }
  return items
}

/** A raw inbox row as projected by GROQ, before counterpart/excerpt mapping. */
type RawConversationRow = Omit<
  ConversationListItem,
  | 'unreadCount'
  | 'lastMessage'
  | 'counterpart'
  | 'assignedTo'
  | 'needsReply'
  | 'archived'
  | 'muted'
  | 'subjectSpeakerId'
  | 'direct'
> & {
  // `subjectSpeaker._ref` — null for proposal / speaker-created threads.
  subjectSpeakerId: string | null
  lastMessage: {
    authorId: string
    authorName: string | null
    authorImage: string | null
    body: string | null
  } | null
  speakerSideName: string | null
  speakerSideImage: string | null
  // GROQ coalesces `status` to 'open'; `assignedTo`/`archivedAt` are null when
  // unset (or, for a weak assignee ref, when the speaker was erased).
  status: ConversationStatus
  assignedTo: { _id: string; name: string; image: string | null } | null
  archivedAt: string | null
}

/** Inbox snippet length — roughly two lines of a mobile row. */
const EXCERPT_LENGTH = 120

function excerptOf(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= EXCERPT_LENGTH) return trimmed
  // Grapheme-safe cut so an emoji straddling the cap can't become a lone
  // surrogate (�) at the boundary.
  return `${truncateToGraphemeBoundary(trimmed, EXCERPT_LENGTH).trimEnd()}…`
}

/**
 * The audience-aware counterpart of an inbox row (see the
 * {@link listConversationsForSpeaker} doc for the full rules).
 */
function resolveCounterpart(
  row: RawConversationRow,
  isOrganizer: boolean,
  organizerSet: Set<string>,
): { name: string; image?: string } {
  if (isOrganizer) {
    return {
      name: row.speakerSideName ?? 'Speaker',
      image: row.speakerSideImage ?? undefined,
    }
  }
  const author = row.lastMessage
  if (author && organizerSet.has(author.authorId) && author.authorName) {
    return { name: author.authorName, image: author.authorImage ?? undefined }
  }
  return { name: ORGANIZERS_LABEL }
}

/**
 * Conversation COUNTS per inbox view for the tab badges (S7). ORGANIZERS get
 * `{ active, needsReply, mine, resolved, archived }`; SPEAKERS get
 * `{ active, archived }` (the organizer-only tabs are omitted).
 *
 * ONE GROQ round trip: a single object projection whose fields are each a
 * `count(*[<base> && <viewPredicate>])`, reusing the EXACT predicate strings the
 * inbox list applies ({@link rawViewPredicate} + {@link SPEAKER_SCOPE_PREDICATE})
 * so a badge can never disagree with the list it labels. The correlated
 * per-user-archive / last-author subqueries inside those predicates use `^`,
 * which resolves to the conversation being counted (one nesting level, exactly
 * as in the list query).
 *
 * COST: bounded and cheap — the counts scan only this conference's conversation
 * set (`conference._ref == $conferenceId`, plus the speaker scope for a
 * non-organizer), no pagination, no document bodies fetched; the per-view
 * `count()`s are evaluated server-side in the one request. It is meant to be
 * called alongside the first inbox page, not polled hot.
 */
export async function getConversationViewCounts({
  speakerId,
  isOrganizer,
  conferenceId,
}: {
  speakerId: string
  isOrganizer: boolean
  conferenceId: string
}): Promise<ConversationViewCounts> {
  const params: Record<string, unknown> = { conferenceId, speakerId }
  const base = `_type == "conversation" && conference._ref == $conferenceId`
  const scope = isOrganizer ? '' : ` && ${SPEAKER_SCOPE_PREDICATE}`

  // Build one `count()` field per relevant view from the shared predicates.
  const views: ConversationView[] = isOrganizer
    ? ['active', 'needs-reply', 'unassigned', 'mine', 'resolved', 'archived']
    : ['active', 'archived']
  // Stable field keys (the enum's hyphenated names aren't valid identifiers).
  const KEY: Record<string, keyof ConversationViewCounts> = {
    active: 'active',
    'needs-reply': 'needsReply',
    unassigned: 'unassigned',
    mine: 'mine',
    resolved: 'resolved',
    archived: 'archived',
  }

  const fields: string[] = []
  for (const view of views) {
    const { predicate, needsOrganizerIds } = rawViewPredicate(view, isOrganizer)
    if (needsOrganizerIds) params.organizerIds = await getOrganizerSpeakerIds()
    const filter = predicate ? ` && ${predicate}` : ''
    fields.push(`"${KEY[view]}": count(*[${base}${scope}${filter}])`)
  }

  const result = await clientReadUncached.fetch<Partial<
    Record<keyof ConversationViewCounts, number>
  > | null>(`{ ${fields.join(', ')} }`, params, { cache: 'no-store' })

  const counts: ConversationViewCounts = {
    active: result?.active ?? 0,
    archived: result?.archived ?? 0,
  }
  if (isOrganizer) {
    counts.needsReply = result?.needsReply ?? 0
    counts.unassigned = result?.unassigned ?? 0
    counts.mine = result?.mine ?? 0
    counts.resolved = result?.resolved ?? 0
  }
  return counts
}

/** A message row as projected by {@link listMessages} (before normalization). */
interface RawMessageRow {
  _id: string
  conversationId: string
  authorId: string | null
  body: string
  createdAt: string
  authorName?: string | null
  authorSponsorId?: string | null
}

/**
 * A conversation's messages, NEWEST first, keyset-paginated by `before` (the
 * `createdAt` of the last item on the previous page). M2 reverses for display.
 */
export async function listMessages({
  conversationId,
  before,
  beforeId,
}: {
  conversationId: string
  before?: string
  beforeId?: string
}): Promise<Message[]> {
  const params: Record<string, unknown> = { conversationId }
  let cursor = ''
  if (before) {
    // Compound keyset cursor: order by (createdAt desc, _id desc) so messages
    // that share an exact `createdAt` (bulk / same-instant writes) are totally
    // ordered and none is skipped at a page boundary. Callers that only pass
    // `before` (no `beforeId`) keep the original strict-less-than behaviour.
    if (beforeId) {
      cursor =
        ' && (createdAt < $before || (createdAt == $before && _id < $beforeId))'
      params.before = before
      params.beforeId = beforeId
    } else {
      cursor = ' && createdAt < $before'
      params.before = before
    }
  }

  const query = `*[_type == "message" && conversation._ref == $conversationId${cursor}] | order(createdAt desc, _id desc) [0...${PAGE_SIZE}] {
    "_id": _id,
    "conversationId": conversation._ref,
    "authorId": coalesce(author._ref, ""),
    body,
    createdAt,
    authorName,
    "authorSponsorId": authorParty.sponsorForConference._ref
  }`

  const results = await clientReadUncached.fetch<RawMessageRow[]>(
    query,
    params,
    { cache: 'no-store' },
  )
  return (results ?? []).map((row) => ({
    _id: row._id,
    conversationId: row.conversationId,
    authorId: row.authorId ?? '',
    body: row.body,
    createdAt: row.createdAt,
    ...(row.authorName ? { authorName: row.authorName } : {}),
    ...(row.authorSponsorId ? { authorSponsorId: row.authorSponsorId } : {}),
  }))
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Ensure the single proposal conversation exists (deterministic id +
 * `createIfNotExists`, so the create is race-safe) and return its id. `subject`
 * is stored explicitly, defaulted to the proposal title.
 */
export async function ensureProposalConversation({
  conferenceId,
  proposalId,
  proposalTitle,
  createdById,
  proposalSpeakerIds,
}: {
  conferenceId: string
  proposalId: string
  proposalTitle: string
  createdById: string
  /**
   * The proposal's current speaker ids (party model, G1). Passed by the router
   * from the proposal it already fetched, so the dual-written `participants[]`
   * snapshots the proposal's speakers at thread creation — exactly what the
   * legacy read path derives from `proposal->speakers[]._ref` for a fresh thread.
   */
  proposalSpeakerIds: string[]
}): Promise<string> {
  const id = proposalConversationId(proposalId)
  const now = new Date().toISOString()
  // Party model (G1): dual-write `participants[]` alongside the legacy fields,
  // constructed THROUGH the read resolver (participants-less context → derive
  // branch) so the stored array is exactly what a legacy-only doc resolves to.
  const participants = partiesToStored(
    resolveParticipants({
      conversationType: 'proposal',
      proposalSpeakerIds,
      createdById,
    }),
  )
  await clientWrite
    .transaction()
    .createIfNotExists({
      _id: id,
      _type: 'conversation',
      conference: createReference(conferenceId),
      conversationType: 'proposal',
      proposal: { ...createReference(proposalId), _weak: true },
      createdBy: createReference(createdById),
      subject: (proposalTitle || 'Proposal').slice(0, 200),
      createdAt: now,
      lastMessageAt: now,
      participants,
    })
    .commit()
  return id
}

/**
 * Ensure the SINGLE sponsor↔organizer conversation for a `sponsorForConference`
 * exists and return its id (messaging G2b). Deterministic id
 * `conversation.sponsor.<sfcId>` + `createIfNotExists`, so the portal-send and
 * organizer-send paths converge on ONE document (the maintainer-locked
 * "one thread per sponsorForConference" UI; the model stays multi-thread-general
 * — this is simply the only thread a sponsor ever gets).
 *
 * PARTICIPANTS are the sponsor party + the organizers group, written directly
 * (NOT through {@link deriveParties}, which can't reconstruct a sponsor party
 * from the legacy fields — `participants[]` is authoritative for sponsor
 * threads). `subject` is the sponsor company name (snapshotted so the thread
 * renders without a deref, mirroring the proposal-title snapshot).
 *
 * CREATED-BY: unset for a PORTAL-initiated thread (a sponsor has no speaker doc;
 * schema `createdBy` relaxed to optional for exactly this). An ORGANIZER-
 * initiated thread passes `createdById` (the acting organizer) so the audit
 * trail still names a human when one exists — the cleaner of the two documented
 * options (relax-to-optional + acting-organizer-when-known).
 */
export async function ensureSponsorConversation({
  conferenceId,
  sponsorForConferenceId,
  sponsorName,
  createdById,
}: {
  conferenceId: string
  sponsorForConferenceId: string
  sponsorName: string
  /** The acting organizer for an ORG-initiated thread; omitted portal-side. */
  createdById?: string
}): Promise<string> {
  const id = sponsorConversationId(sponsorForConferenceId)
  const now = new Date().toISOString()
  const participants = partiesToStored([
    { partyType: 'sponsor', sponsorForConferenceId },
    { partyType: 'group', group: ORGANIZERS_GROUP },
  ])
  await clientWrite
    .transaction()
    .createIfNotExists({
      _id: id,
      _type: 'conversation',
      conference: createReference(conferenceId),
      conversationType: 'sponsor',
      subject: (sponsorName || 'Sponsor').slice(0, 200),
      createdAt: now,
      lastMessageAt: now,
      participants,
      ...(createdById ? { createdBy: createReference(createdById) } : {}),
    })
    .commit()
  return id
}

/**
 * SNAPSHOT SYNC (G2a): re-derive a proposal thread's dual-written
 * `participants[]` from the proposal's CURRENT speaker set and patch it onto the
 * conversation. Call AFTER a co-speaker add/remove commits so the flipped read
 * path (which now PREFERS `participants[]`) resolves the LIVE speaker set rather
 * than the snapshot captured when the thread was first created — the divergence
 * flagged by the #564 badge.
 *
 * NO-OP when the proposal has no conversation thread yet: threads are created
 * lazily on the first message, so a co-speaker change on a never-messaged
 * proposal must NOT conjure a thread — we only PATCH an existing doc, never
 * create one (hence the existence probe rather than `createIfNotExists`).
 * NEVER-FAIL: a sync failure must never fail the (already committed) co-speaker
 * mutation, mirroring the `deleteMessageNotificationsFor` cleanup contract.
 */
export async function syncProposalConversationParticipants(
  proposalId: string,
  proposalSpeakerIds: string[],
): Promise<void> {
  try {
    const id = proposalConversationId(proposalId)
    const existingId = await clientReadUncached.fetch<string | null>(
      `*[_type == "conversation" && _id == $id][0]._id`,
      { id },
      { cache: 'no-store' },
    )
    if (!existingId) return
    // Re-derive THROUGH the resolver on a participants-less context (derive
    // branch), so the written array is exactly what the legacy read would yield
    // for these speakers — the same construction ensureProposalConversation uses.
    const participants = partiesToStored(
      resolveParticipants({
        conversationType: 'proposal',
        proposalSpeakerIds,
        createdById: '',
      }),
    )
    await clientWrite.patch(id).set({ participants }).commit()
  } catch (error) {
    console.error('Failed to sync proposal conversation participants:', error)
  }
}

/**
 * Create a free-standing general conversation (random id) and return its id.
 *
 * `subjectSpeakerId` is set ONLY when an organizer initiates a thread targeting
 * a speaker — it records who the conversation is ABOUT/with. Speaker-created
 * threads omit it (the creator IS the subject speaker).
 */
export async function createGeneralConversation({
  conferenceId,
  createdById,
  subject,
  subjectSpeakerId,
}: {
  conferenceId: string
  createdById: string
  subject: string
  subjectSpeakerId?: string
}): Promise<string> {
  const id = `conversation.${nanoid()}`
  const now = new Date().toISOString()
  // Party model (G1): dual-write `participants[]` (creator + optional subject
  // speaker + organizers group), constructed THROUGH the read resolver so it
  // matches the legacy derivation exactly.
  const participants = partiesToStored(
    resolveParticipants({
      conversationType: 'general',
      proposalSpeakerIds: [],
      createdById,
      subjectSpeakerId,
    }),
  )
  await clientWrite.create({
    _id: id,
    _type: 'conversation',
    conference: createReference(conferenceId),
    conversationType: 'general',
    createdBy: createReference(createdById),
    ...(subjectSpeakerId
      ? { subjectSpeaker: createReference(subjectSpeakerId) }
      : {}),
    subject: subject.slice(0, 200),
    createdAt: now,
    lastMessageAt: now,
    participants,
  })
  return id
}

/** Whether a speaker document with this id exists (server-side validation). */
export async function speakerExists(speakerId: string): Promise<boolean> {
  const id = await clientReadUncached.fetch<string | null>(
    `*[_type == "speaker" && _id == $speakerId][0]._id`,
    { speakerId },
    { cache: 'no-store' },
  )
  return Boolean(id)
}

/**
 * Append a message AND bump the parent conversation's `lastMessageAt` in ONE
 * transaction (the two must never drift apart). Returns the created message.
 *
 * REOPEN-ON-REPLY (S3): pass `reopen: true` to ALSO set the conversation's
 * `status` back to `'open'` in the SAME transaction. The router sets this when a
 * NON-organizer replies to a `resolved` thread, so the speaker's follow-up
 * re-enters the organizer needs-reply queue atomically with the message write (no
 * window where the message exists but the thread is still resolved). Organizer
 * replies never pass it (an organizer answering a resolved thread keeps it
 * resolved).
 */
export async function addMessage({
  conversationId,
  authorId,
  sponsorAuthor,
  body,
  reopen = false,
}: {
  conversationId: string
  /**
   * The SPEAKER/organizer author id. Provide this OR {@link sponsorAuthor},
   * never both. A speaker author writes the legacy `author` ref plus a speaker
   * `authorParty`.
   */
  authorId?: string
  /**
   * A SPONSOR author (portal side, G2b): no speaker doc exists, so the message
   * stores a `sponsor` `authorParty` plus an `authorName` snapshot (the contact
   * person the sender picked) and leaves the `author` ref UNSET. Provide this OR
   * {@link authorId}, never both.
   */
  sponsorAuthor?: { sponsorForConferenceId: string; authorName: string }
  body: string
  reopen?: boolean
}): Promise<Message> {
  const now = new Date().toISOString()
  const messageId = `message.${nanoid()}`

  // Build the author fields for the two shapes. A speaker author keeps the
  // legacy `author` ref + speaker `authorParty` (unchanged); a sponsor author
  // sets a `sponsor` `authorParty` + `authorName` snapshot with NO `author` ref
  // (relaxed to optional in the schema for exactly this case).
  const authorFields: Record<string, unknown> = sponsorAuthor
    ? {
        authorParty: partyToStored({
          partyType: 'sponsor',
          sponsorForConferenceId: sponsorAuthor.sponsorForConferenceId,
        }),
        authorName: sponsorAuthor.authorName,
      }
    : {
        author: createReference(authorId as string),
        authorParty: partyToStored({
          partyType: 'speaker',
          speakerId: authorId as string,
        }),
      }

  await clientWrite
    .transaction()
    .create({
      _id: messageId,
      _type: 'message',
      conversation: createReference(conversationId),
      body,
      createdAt: now,
      ...authorFields,
    })
    .patch(conversationId, (patch) =>
      patch.set(
        reopen
          ? { lastMessageAt: now, status: 'open' }
          : { lastMessageAt: now },
      ),
    )
    .commit()

  return {
    _id: messageId,
    conversationId,
    authorId: sponsorAuthor ? '' : (authorId as string),
    body,
    createdAt: now,
    ...(sponsorAuthor
      ? {
          authorName: sponsorAuthor.authorName,
          authorSponsorId: sponsorAuthor.sponsorForConferenceId,
        }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Ticketing mutations (organizer-side thread state). Authz is enforced by the
// router BEFORE any of these run; they are pure writes.
// ---------------------------------------------------------------------------

/** Set a conversation's ticketing status ('open' | 'resolved'). */
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus,
): Promise<void> {
  await clientWrite.patch(conversationId).set({ status }).commit()
}

/**
 * Assign (or, with `assigneeId === null`, unassign) the organizer responsible
 * for a conversation. The assignee ref is WEAK so erasing a speaker (GDPR)
 * doesn't orphan-block their deletion — consistent with the schema.
 */
export async function setConversationAssignee(
  conversationId: string,
  assigneeId: string | null,
): Promise<void> {
  if (assigneeId === null) {
    await clientWrite.patch(conversationId).unset(['assignedTo']).commit()
    return
  }
  await clientWrite
    .patch(conversationId)
    .set({ assignedTo: { ...createReference(assigneeId), _weak: true } })
    .commit()
}

/**
 * Set/clear the GLOBAL organizer archive. Archiving stamps `archivedAt = now`
 * AND records `archivedBy` (the organizer who archived it) for the audit trail
 * (S6); because a thread is globally archived IFF `archivedAt >= lastMessageAt`,
 * a later message auto-resurfaces it with no further write. Unarchiving unsets
 * BOTH fields together (a cleared archive has no archiver). The `archiverId` ref
 * is WEAK so erasing a speaker (GDPR) doesn't orphan-block their deletion —
 * consistent with the other speaker refs on this doc.
 *
 * `archiverId` is required only when ARCHIVING (it records `archivedBy` for the
 * "Archived for everyone by X" audit line, V1f); it is IGNORED — and may be
 * omitted — when unarchiving, which clears both fields (V1-r3b). A cleared
 * archive has no archiver, so there is nothing to attribute.
 */
export async function setConversationArchived(
  conversationId: string,
  archived: boolean,
  archiverId?: string,
): Promise<void> {
  if (archived) {
    // The audit line ("Archived for everyone by X") depends on attribution —
    // an anonymous archive must be a programming error, not a silent row.
    if (!archiverId) {
      throw new Error('setConversationArchived: archiverId required to archive')
    }
    await clientWrite
      .patch(conversationId)
      .set({
        archivedAt: new Date().toISOString(),
        // The ref is WEAK so a later GDPR erase of that organizer never
        // orphan-blocks this doc.
        archivedBy: { ...createReference(archiverId), _weak: true },
      })
      .commit()
    return
  }
  await clientWrite
    .patch(conversationId)
    .unset(['archivedAt', 'archivedBy'])
    .commit()
}

// ---------------------------------------------------------------------------
// Preferences (doc-per-pair; no array RMW)
// ---------------------------------------------------------------------------

function normalizePreference(
  raw: { muted?: boolean; emailOverride?: string } | null | undefined,
): ConversationPreference {
  const emailOverride = raw?.emailOverride
  return {
    muted: raw?.muted ?? DEFAULT_CONVERSATION_PREFERENCE.muted,
    emailOverride:
      emailOverride === 'on' || emailOverride === 'off'
        ? emailOverride
        : DEFAULT_CONVERSATION_PREFERENCE.emailOverride,
  }
}

/** One participant's (normalized) preference for a conversation. */
export async function getConversationPreference(
  conversationId: string,
  speakerId: string,
): Promise<ConversationPreference> {
  const id = conversationPreferenceId(conversationId, speakerId)
  const raw = await clientReadUncached.fetch<{
    muted?: boolean
    emailOverride?: string
  } | null>(
    `*[_type == "conversationPreference" && _id == $id][0]{ muted, emailOverride }`,
    { id },
    { cache: 'no-store' },
  )
  return normalizePreference(raw)
}

/**
 * The preferences of MANY participants in ONE query (used by the fan-out to
 * decide mute/email per recipient). Returns a map keyed by speaker id;
 * participants without a doc are simply absent (caller falls back to default).
 */
export async function getConversationPreferencesFor(
  conversationId: string,
  speakerIds: string[],
): Promise<Map<string, ConversationPreference>> {
  const map = new Map<string, ConversationPreference>()
  if (speakerIds.length === 0) return map
  const rows = await clientReadUncached.fetch<
    { speakerId: string; muted?: boolean; emailOverride?: string }[]
  >(
    `*[_type == "conversationPreference" && conversation._ref == $conversationId && speaker._ref in $speakerIds]{
      "speakerId": speaker._ref,
      muted,
      emailOverride
    }`,
    { conversationId, speakerIds },
    { cache: 'no-store' },
  )
  for (const row of rows ?? []) {
    map.set(row.speakerId, normalizePreference(row))
  }
  return map
}

/**
 * Upsert a participant's preference: `createIfNotExists` seeds the single
 * doc-per-pair with defaults, then a patch sets only the provided fields. This
 * is the race-safe alternative to editing a shared preferences array.
 */
export async function setConversationPreference({
  conversationId,
  speakerId,
  muted,
  emailOverride,
  archived,
}: {
  conversationId: string
  speakerId: string
  muted?: boolean
  emailOverride?: EmailOverride
  archived?: boolean
}): Promise<ConversationPreference> {
  const id = conversationPreferenceId(conversationId, speakerId)
  const set: Record<string, unknown> = {}
  const unset: string[] = []
  if (muted !== undefined) set.muted = muted
  if (emailOverride !== undefined) set.emailOverride = emailOverride
  // PER-USER archive: same timestamp semantics as the global archive — stamp
  // `archivedAt = now` to archive (a later message auto-resurfaces it), unset to
  // un-archive.
  if (archived !== undefined) {
    if (archived) set.archivedAt = new Date().toISOString()
    else unset.push('archivedAt')
  }

  const tx = clientWrite.transaction().createIfNotExists({
    _id: id,
    _type: 'conversationPreference',
    conversation: createReference(conversationId),
    speaker: createReference(speakerId),
    muted: false,
    emailOverride: 'default',
  })
  if (Object.keys(set).length > 0 || unset.length > 0) {
    tx.patch(id, (patch) => {
      let next = patch
      if (Object.keys(set).length > 0) next = next.set(set)
      if (unset.length > 0) next = next.unset(unset)
      return next
    })
  }
  await tx.commit()

  return getConversationPreference(conversationId, speakerId)
}

/**
 * Unread message counts for a set of proposal threads, keyed by `proposalId`,
 * for ONE caller (the speaker journey badge, V2b). Proposal threads deep-link to
 * a deterministic per-audience path (`/cfp/proposal/<id>#messages` for a speaker,
 * `/admin/proposals/<id>#messages` for an organizer) and unread state lives in
 * the caller's own `message_received` notifications (M5-collapsed: each carries
 * `count` unread messages, absent = 1). So we build BOTH audience link variants
 * for every requested proposal and run ONE bounded GROQ over the caller's unread
 * message notifications, summing `coalesce(count, 1)` per link back onto its
 * proposal.
 *
 * COST: exactly one round trip regardless of how many proposals are asked about
 * (zero proposals → no fetch). Reads ONLY the caller's own notifications
 * (`recipient._ref == $speakerId`), so a client naming arbitrary proposal ids can
 * never learn another user's unread state — no IDOR. The id set is de-duped and
 * capped so the `link in $links` set stays bounded.
 */
export async function getUnreadCountsByProposalIds({
  speakerId,
  conferenceId,
  proposalIds,
}: {
  speakerId: string
  conferenceId: string
  proposalIds: string[]
}): Promise<Record<string, number>> {
  const ids = Array.from(new Set(proposalIds)).slice(0, 200)
  if (ids.length === 0) return {}
  // Map each audience link variant back to its proposal; the caller only ever
  // received one variant, so matching both is simplest and correct.
  const linkToProposal = new Map<string, string>()
  for (const id of ids) {
    linkToProposal.set(
      conversationLinkPath(
        { _id: '', conversationType: 'proposal', proposalId: id },
        false,
      ),
      id,
    )
    linkToProposal.set(
      conversationLinkPath(
        { _id: '', conversationType: 'proposal', proposalId: id },
        true,
      ),
      id,
    )
  }
  const links = Array.from(linkToProposal.keys())
  const rows = await clientReadUncached.fetch<
    { link: string | null; count: number }[]
  >(
    `*[_type == "notification" && recipient._ref == $speakerId && conference._ref == $conferenceId && notificationType == "message_received" && !defined(readAt) && link in $links]{ link, "count": coalesce(count, 1) }`,
    { speakerId, conferenceId, links },
    { cache: 'no-store' },
  )
  const counts: Record<string, number> = {}
  for (const row of rows ?? []) {
    if (!row.link) continue
    const proposalId = linkToProposal.get(row.link)
    if (!proposalId) continue
    counts[proposalId] = (counts[proposalId] ?? 0) + row.count
  }
  return counts
}
