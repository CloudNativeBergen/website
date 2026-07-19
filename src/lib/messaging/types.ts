/**
 * Speaker↔organizer messaging domain types (messaging M1).
 *
 * The thread model has two shapes (`proposal` / `general`); see
 * `sanity/schemaTypes/conversation.ts`. Access and recipient resolution are
 * always derived from SERVER-side ids (never trust a client-supplied speaker
 * id) — see `canAccessConversation` / `resolveRecipients` in `./sanity`.
 */

/**
 * The thread shapes. `proposal` / `general` are the original speaker↔organizer
 * shapes; `sponsor` (G2b) is a sponsor↔organizer thread — one per
 * `sponsorForConference`, whose non-organizer side is a `sponsor` participant
 * party (no speaker doc) reached only via the portal token, never a session.
 */
export type ConversationType = 'proposal' | 'general' | 'sponsor'

/**
 * Ticketing status of a thread for the ORGANIZER audience. `'open'` is the
 * default AND the meaning of an ABSENT `status` field — every read coalesces
 * undefined to `'open'`, so pre-ticketing threads need no migration.
 */
export type ConversationStatus = 'open' | 'resolved'

/**
 * The inbox views a caller can request. ORGANIZERS may use all of them;
 * SPEAKERS are restricted to `'active' | 'archived' | 'all'` (the router rejects
 * the organizer-only views for a non-organizer).
 *
 * ORGANIZER semantics:
 * - `active`      — status open (or absent) AND NOT globally archived AND NOT
 *                   per-user archived;
 * - `needs-reply` — active AND the last message's author is not an organizer;
 * - `unassigned`  — active AND no organizer is assigned to follow up;
 * - `mine`        — active AND assigned to the caller;
 * - `resolved`    — status resolved AND not archived (neither global nor per-user);
 * - `archived`    — globally OR per-user archived;
 * - `all`         — every conversation, no status/archive filter.
 *
 * SPEAKER semantics (global archive is an organizer-side hide, so speakers keep
 * seeing globally-archived threads and only their OWN preference archive hides):
 * - `active`   — NOT per-user archived;
 * - `archived` — per-user archived;
 * - `all`      — everything.
 */
export type ConversationView =
  | 'active'
  | 'needs-reply'
  | 'unassigned'
  | 'mine'
  | 'resolved'
  | 'archived'
  | 'all'

/** The views a non-organizer (speaker) is allowed to request. */
export const SPEAKER_ALLOWED_VIEWS: ConversationView[] = [
  'active',
  'archived',
  'all',
]

/** Per-conversation email delivery override. */
export type EmailOverride = 'default' | 'on' | 'off'

/** The universal organizer group key (the only group value produced in G1). */
export const ORGANIZERS_GROUP = 'organizers'

/**
 * A single PARTY of a conversation — the GENERAL representation of "who is on a
 * thread" (mirrors the `conversationParticipant` Sanity object). A discriminated
 * union on `partyType`, each member carrying EXACTLY ONE identity (`'speaker'`
 * and `'group'` are produced in G1; `'sponsor'` is reserved for G2):
 * - `speaker` → a speaker id (the dereferenced `speaker._ref`);
 * - `sponsor` → a `sponsorForConference` id (unused in G1; G2 begins using it);
 * - `group`   → a group KEY (e.g. `'organizers'`).
 *
 * In G1 this is dual-written alongside the legacy `createdBy`/`subjectSpeaker`/
 * `proposal` fields and is NOT yet the read source. See `resolveParticipants` in
 * `./sanity` for the derive-or-prefer resolver.
 */
export type ConversationParty =
  | { partyType: 'speaker'; speakerId: string }
  | { partyType: 'sponsor'; sponsorForConferenceId: string }
  | { partyType: 'group'; group: string }

/**
 * The loose value shape the `conversationParticipant` Sanity object validation
 * receives (a partially-filled party object from Studio or a write).
 */
export interface ConversationParticipantInput {
  partyType?: string
  speaker?: { _ref?: string } | null
  sponsorForConference?: { _ref?: string } | null
  group?: string | null
}

/**
 * Validate the discriminator↔identity congruence of a `conversationParticipant`:
 * EXACTLY ONE identity field must be present AND it must match `partyType`. Pure
 * (no Sanity imports) so the schema's `Rule.custom` and unit tests share ONE
 * implementation — the same extract-and-test idiom the sponsor CRM validations
 * use. Returns `true` when valid, otherwise a human-readable error string.
 *
 * An ABSENT `partyType` returns `true` here: the field carries its own
 * `Rule.required()`, so this validator never double-reports the missing
 * discriminator.
 */
export function validateConversationParticipant(
  value: ConversationParticipantInput | undefined,
): true | string {
  const v = value ?? {}
  const { partyType } = v
  if (!partyType) return true
  const hasSpeaker = Boolean(v.speaker?._ref)
  const hasSponsor = Boolean(v.sponsorForConference?._ref)
  const hasGroup = typeof v.group === 'string' && v.group.length > 0
  const present = [hasSpeaker, hasSponsor, hasGroup].filter(Boolean).length
  if (present !== 1) {
    return 'A participant must carry exactly one identity field (speaker, sponsorForConference, or group).'
  }
  if (partyType === 'speaker' && !hasSpeaker) {
    return 'A speaker party requires a speaker reference.'
  }
  if (partyType === 'sponsor' && !hasSponsor) {
    return 'A sponsor party requires a sponsorForConference reference.'
  }
  if (partyType === 'group' && !hasGroup) {
    return 'A group party requires a non-empty group key.'
  }
  return true
}

/** A speaker as needed for authorization decisions (server-derived). */
export interface AccessSpeaker {
  _id: string
  isOrganizer?: boolean
}

/**
 * A conversation plus the context needed to authorize access, resolve
 * recipients, and render a thread without a second round-trip.
 *
 * `proposalSpeakerIds` are the speaker `_ref`s on the referenced proposal
 * (empty for general threads). `createdById` is the thread starter.
 *
 * `subjectSpeakerId` is the speaker a general conversation is ABOUT/with, set
 * only when an ORGANIZER initiates the thread; speaker-created threads leave it
 * unset (the creator IS the subject speaker). Unused for proposal threads.
 */
export interface ConversationWithContext {
  _id: string
  conferenceId: string
  conversationType: ConversationType
  proposalId?: string
  proposalTitle?: string
  proposalSpeakerIds: string[]
  createdById: string
  subjectSpeakerId?: string
  subject: string
  createdAt: string
  lastMessageAt: string
  /**
   * Ticketing state, projected so the organizer thread header can render its
   * Resolve/Reopen, Assign and global-archive controls without a second
   * round-trip. `status` is coalesced (absent ⇒ `'open'`); `assignedTo` is the
   * dereffed organizer (null when unassigned); `archivedAt` is the GLOBAL archive
   * timestamp (globally archived iff `archivedAt >= lastMessageAt`). All optional
   * so the pre-ticketing shape still satisfies the type.
   */
  status?: ConversationStatus
  assignedTo?: ConversationAssignee | null
  archivedAt?: string | null
  /**
   * WHO globally archived the thread (deref of the weak `archivedBy` ref), so
   * the thread header can render "Archived by X" (S6). Set alongside
   * `archivedAt` and unset with it; null when the thread is not archived (or the
   * archiver speaker was erased). Only meaningful when `archivedAt` is set.
   */
  archivedBy?: ConversationArchiver | null
  /**
   * The GENERAL party representation (messaging party model, G1), projected from
   * the conversation's dual-written `participants[]` when present. OPTIONAL in
   * G1: the read path still DERIVES participants from the legacy fields (see
   * `resolveParticipants` in `./sanity`), so this is populated only for
   * conversations created (or backfilled by migration 043) since the dual-write
   * landed, and no consumer reads it yet. The read path flips to prefer it in G2.
   */
  participants?: ConversationParty[]
}

/** The organizer who globally archived a thread (deref of `archivedBy`). */
export interface ConversationArchiver {
  _id: string
  name: string
}

/** The newest message of a conversation, summarized for an inbox row (M6). */
export interface ConversationLastMessage {
  authorId: string
  authorName: string
  /** First ~120 chars of the message body (ellipsized when longer). */
  excerpt: string
}

/**
 * Who the conversation is "with" from the viewer's perspective (M6):
 * - ORGANIZER audience → the speaker side (proposal → first proposal speaker;
 *   general → subject speaker, else the creator);
 * - SPEAKER audience → the last message's author when that author is an
 *   organizer; otherwise the collective `'Organizers'` label with no image
 *   (no single counterpart exists on the organizer side).
 */
export interface ConversationCounterpart {
  name: string
  image?: string
}

/** The organizer assigned to follow up a thread (deref of `assignedTo`). */
export interface ConversationAssignee {
  _id: string
  name: string
  /**
   * The organizer's avatar URL when available (house
   * `coalesce(image.asset->url, imageURL)` pattern); undefined falls back to
   * initials in the assignee badge (S12 / V1k).
   */
  image?: string
}

/** A conversation as listed in an inbox. */
export interface ConversationListItem {
  _id: string
  conversationType: ConversationType
  subject: string
  proposalId?: string
  proposalTitle?: string
  createdAt: string
  lastMessageAt: string
  /**
   * The caller's unread `message_received` notification count for this
   * conversation (matches either audience link variant; the caller only ever
   * received one).
   */
  unreadCount: number
  /** Newest message summary; null for a conversation with no messages yet. */
  lastMessage: ConversationLastMessage | null
  /** Audience-aware "who" for the row (see {@link ConversationCounterpart}). */
  counterpart: ConversationCounterpart
  /**
   * The speaker an organizer-initiated general thread is ABOUT/with (the
   * conversation's `subjectSpeaker`); undefined for proposal or speaker-created
   * threads. Projected so the client can derive direct-thread identity (S10).
   */
  subjectSpeakerId?: string
  /**
   * DIRECT-THREAD IDENTITY (S10), VIEWER-RELATIVE: this thread personally
   * addresses the caller — the caller IS the conversation's `subjectSpeaker`
   * (an organizer-initiated thread about/to them) OR the caller is its
   * `assignedTo`. Computed server-side so the client stays dumb; drives the
   * distinct direct-vs-org-broadcast chip/accent and the Active-view grouping.
   */
  direct?: boolean
  // NOTE: the ticketing fields below are ALWAYS populated by the data layer
  // (`listConversationsForSpeaker`). They are declared optional ONLY so that
  // pre-ticketing fixtures/stories (owned by the T2 UI work) still satisfy the
  // type; runtime rows always carry them.
  /** Ticketing status, coalesced so an absent field reads as `'open'`. */
  status?: ConversationStatus
  /** The organizer responsible for follow-up; null when unassigned. */
  assignedTo?: ConversationAssignee | null
  /**
   * Whether this thread needs an organizer reply (ORGANIZER audience only): its
   * last message is from a non-organizer AND status is not resolved. Always
   * false for a speaker caller (needs-reply is an organizer-side concept).
   */
  needsReply?: boolean
  /**
   * Whether this thread is archived FOR THE CALLER's audience: for an organizer,
   * globally OR per-user archived; for a speaker, per-user archived only.
   */
  archived?: boolean
  /**
   * Whether the CALLER has muted this conversation (their per-user preference).
   * Projected so the inbox row can surface a mute glyph (V1g) — a muted thread
   * still appears in the list, it just receives no notifications on any channel.
   * Absent/false when unmuted.
   */
  muted?: boolean
}

/**
 * Per-view unread-independent CONVERSATION COUNTS for the inbox tab badges (S7).
 * ORGANIZERS get every tab; SPEAKERS only `active` + `archived` (the
 * organizer-only tabs are omitted — undefined — for a speaker caller).
 */
export interface ConversationViewCounts {
  active: number
  archived: number
  needsReply?: number
  unassigned?: number
  mine?: number
  resolved?: number
}

/** A single message in a thread. */
export interface Message {
  _id: string
  conversationId: string
  /**
   * The author speaker `_ref` (empty string for a SPONSOR-authored message,
   * which has no speaker doc — see {@link authorName}/{@link authorSponsorId}).
   */
  authorId: string
  body: string
  createdAt: string
  /**
   * Display-name snapshot for a SPONSOR-authored message (the contact person the
   * portal sender picked). Undefined for speaker/organizer authors — the thread
   * derives their name from the `authorId` speaker ref (G2b).
   */
  authorName?: string
  /**
   * The `sponsorForConference` id when this message was authored from the sponsor
   * portal (its `authorParty` is a `sponsor` party). Undefined for
   * speaker/organizer authors. Lets the thread render a "(Sponsor)" badge and
   * suppress the speaker-avatar lookup (G2b).
   */
  authorSponsorId?: string
}

/** A participant sub-object projected for a conversation view. */
export interface ConversationParticipant {
  _id: string
  name: string
  image?: string
  isOrganizer: boolean
}

/** A participant's per-conversation preference (normalized; never null). */
export interface ConversationPreference {
  muted: boolean
  emailOverride: EmailOverride
}

export const DEFAULT_CONVERSATION_PREFERENCE: ConversationPreference = {
  muted: false,
  emailOverride: 'default',
}
