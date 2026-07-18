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
 */
export interface ConversationWithContext {
  _id: string
  conferenceId: string
  conversationType: ConversationType
  proposalId?: string
  proposalTitle?: string
  proposalSpeakerIds: string[]
  createdById: string
  subject: string
  createdAt: string
  lastMessageAt: string
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
