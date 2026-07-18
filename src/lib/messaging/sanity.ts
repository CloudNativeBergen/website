import 'server-only'
import { nanoid } from 'nanoid'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import { getOrganizerSpeakerIds } from '@/lib/notification/sanity'
import type {
  AccessSpeaker,
  ConversationListItem,
  ConversationParticipant,
  ConversationPreference,
  ConversationWithContext,
  EmailOverride,
  Message,
} from './types'
import { DEFAULT_CONVERSATION_PREFERENCE } from './types'
import { proposalConversationId, conversationLinkPath } from './links'

// Re-export the client-safe pure helpers so existing server importers keep
// their `./sanity` import surface (the definitions live in `./links`).
export { proposalConversationId, conversationLinkPath }

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
  subject,
  createdAt,
  lastMessageAt
}`

// ---------------------------------------------------------------------------
// Pure helpers (authz + recipient resolution). Server-derived ids only.
// ---------------------------------------------------------------------------

/**
 * Every participant of a conversation:
 * - proposal thread → the proposal's speakers ∪ organizers;
 * - general thread  → the creator ∪ organizers.
 * De-duplicated (a speaker who is also an organizer appears once).
 */
export function resolveParticipantIds(
  conversation: Pick<
    ConversationWithContext,
    'conversationType' | 'proposalSpeakerIds' | 'createdById'
  >,
  organizerIds: string[],
): string[] {
  const ids = new Set<string>(organizerIds)
  if (conversation.conversationType === 'proposal') {
    for (const id of conversation.proposalSpeakerIds) ids.add(id)
  } else {
    ids.add(conversation.createdById)
  }
  return Array.from(ids)
}

/**
 * The recipients of a new message: all participants EXCEPT the actor (an actor
 * is never notified about their own message — mirrors the hub's actor-exclusion
 * rule).
 */
export function resolveRecipients(
  conversation: Pick<
    ConversationWithContext,
    'conversationType' | 'proposalSpeakerIds' | 'createdById'
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
 * - a general thread the speaker created.
 */
export function canAccessConversation(
  conversation: Pick<
    ConversationWithContext,
    'conversationType' | 'proposalSpeakerIds' | 'createdById'
  >,
  speaker: AccessSpeaker,
): boolean {
  if (speaker.isOrganizer) return true
  if (conversation.conversationType === 'proposal') {
    return conversation.proposalSpeakerIds.includes(speaker._id)
  }
  return conversation.createdById === speaker._id
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

/** A single conversation with its authorization/recipient context. */
export async function getConversationById(
  id: string,
): Promise<ConversationWithContext | null> {
  const result = await clientReadUncached.fetch<ConversationWithContext | null>(
    `*[_type == "conversation" && _id == $id][0]${CONVERSATION_PROJECTION}`,
    { id },
    { cache: 'no-store' },
  )
  if (!result) return null
  return { ...result, proposalSpeakerIds: result.proposalSpeakerIds ?? [] }
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
 * - a speaker sees only conversations they created or are a proposal-speaker on.
 */
export async function listConversationsForSpeaker({
  speakerId,
  isOrganizer,
  conferenceId,
  before,
}: {
  speakerId: string
  isOrganizer: boolean
  conferenceId: string
  before?: string
}): Promise<ConversationListItem[]> {
  const params: Record<string, unknown> = { conferenceId }
  let cursor = ''
  if (before) {
    cursor = ' && lastMessageAt < $before'
    params.before = before
  }

  let scope = ''
  if (!isOrganizer) {
    scope =
      ' && (createdBy._ref == $speakerId || $speakerId in proposal->speakers[]._ref)'
    params.speakerId = speakerId
  }

  const query = `*[_type == "conversation" && conference._ref == $conferenceId${scope}${cursor}] | order(lastMessageAt desc) [0...${PAGE_SIZE}] {
    "_id": _id,
    conversationType,
    subject,
    "proposalId": proposal._ref,
    "proposalTitle": proposal->title,
    createdAt,
    lastMessageAt
  }`

  const results = await clientReadUncached.fetch<ConversationListItem[]>(
    query,
    params,
    { cache: 'no-store' },
  )
  return results ?? []
}

/**
 * A conversation's messages, NEWEST first, keyset-paginated by `before` (the
 * `createdAt` of the last item on the previous page). M2 reverses for display.
 */
export async function listMessages({
  conversationId,
  before,
}: {
  conversationId: string
  before?: string
}): Promise<Message[]> {
  const params: Record<string, unknown> = { conversationId }
  let cursor = ''
  if (before) {
    cursor = ' && createdAt < $before'
    params.before = before
  }

  const query = `*[_type == "message" && conversation._ref == $conversationId${cursor}] | order(createdAt desc) [0...${PAGE_SIZE}] {
    "_id": _id,
    "conversationId": conversation._ref,
    "authorId": author._ref,
    body,
    createdAt
  }`

  const results = await clientReadUncached.fetch<Message[]>(query, params, {
    cache: 'no-store',
  })
  return results ?? []
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
}: {
  conferenceId: string
  proposalId: string
  proposalTitle: string
  createdById: string
}): Promise<string> {
  const id = proposalConversationId(proposalId)
  const now = new Date().toISOString()
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
    })
    .commit()
  return id
}

/** Create a free-standing general conversation (random id) and return its id. */
export async function createGeneralConversation({
  conferenceId,
  createdById,
  subject,
}: {
  conferenceId: string
  createdById: string
  subject: string
}): Promise<string> {
  const id = `conversation.${nanoid()}`
  const now = new Date().toISOString()
  await clientWrite.create({
    _id: id,
    _type: 'conversation',
    conference: createReference(conferenceId),
    conversationType: 'general',
    createdBy: createReference(createdById),
    subject: subject.slice(0, 200),
    createdAt: now,
    lastMessageAt: now,
  })
  return id
}

/**
 * Append a message AND bump the parent conversation's `lastMessageAt` in ONE
 * transaction (the two must never drift apart). Returns the created message.
 */
export async function addMessage({
  conversationId,
  authorId,
  body,
}: {
  conversationId: string
  authorId: string
  body: string
}): Promise<Message> {
  const now = new Date().toISOString()
  const messageId = `message.${nanoid()}`

  await clientWrite
    .transaction()
    .create({
      _id: messageId,
      _type: 'message',
      conversation: createReference(conversationId),
      author: createReference(authorId),
      body,
      createdAt: now,
    })
    .patch(conversationId, (patch) => patch.set({ lastMessageAt: now }))
    .commit()

  return { _id: messageId, conversationId, authorId, body, createdAt: now }
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
}: {
  conversationId: string
  speakerId: string
  muted?: boolean
  emailOverride?: EmailOverride
}): Promise<ConversationPreference> {
  const id = conversationPreferenceId(conversationId, speakerId)
  const set: Record<string, unknown> = {}
  if (muted !== undefined) set.muted = muted
  if (emailOverride !== undefined) set.emailOverride = emailOverride

  const tx = clientWrite.transaction().createIfNotExists({
    _id: id,
    _type: 'conversationPreference',
    conversation: createReference(conversationId),
    speaker: createReference(speakerId),
    muted: false,
    emailOverride: 'default',
  })
  if (Object.keys(set).length > 0) {
    tx.patch(id, (patch) => patch.set(set))
  }
  await tx.commit()

  return getConversationPreference(conversationId, speakerId)
}
