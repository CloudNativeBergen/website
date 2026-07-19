/**
 * Speaker↔organizer messaging domain types (messaging M1).
 *
 * The thread model has two shapes (`proposal` / `general`); see
 * `sanity/schemaTypes/conversation.ts`. Access and recipient resolution are
 * always derived from SERVER-side ids (never trust a client-supplied speaker
 * id) — see `canAccessConversation` / `resolveRecipients` in `./sanity`.
 */

export type ConversationType = 'proposal' | 'general'

/** Per-conversation email delivery override. */
export type EmailOverride = 'default' | 'on' | 'off'

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
}

/** A single message in a thread. */
export interface Message {
  _id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
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
