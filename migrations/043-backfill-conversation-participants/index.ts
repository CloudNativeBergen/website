import { defineMigration, at, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'

/**
 * ⚠️ MIGRATION NOT RUN — MAINTAINER DECISION REQUIRED. ⚠️
 *
 * Backfill the PARTY DATA MODEL (messaging G1) onto existing documents:
 *
 *   - `conversation.participants[]` — the GENERAL party representation derived
 *     from the legacy fields: proposal threads → one speaker party per proposal
 *     speaker + the organizers group; general threads → the creator + optional
 *     subjectSpeaker + the organizers group.
 *   - `message.authorParty` — the party form of the message author (a speaker
 *     party; G1 authors are always speaker docs).
 *
 * WHY: G1 introduces the party representation and DUAL-WRITES it going forward
 * (ensureProposalConversation / createGeneralConversation / addMessage), but
 * documents created BEFORE the dual-write landed carry only the legacy fields.
 * This migration reconstructs the party representation for them from the SAME
 * legacy fields the read resolver derives from, so that once G2 flips the read
 * path to prefer `participants[]`, every historical thread already carries the
 * bit-identical representation. It must be run by the maintainer BEFORE the G2
 * read-path flip.
 *
 * The derivation MIRRORS `deriveParties` / `partiesToStored` in
 * src/lib/messaging/sanity.ts VERBATIM (migrations do not resolve the `@/` alias
 * / `server-only` guard, so the pure bits are duplicated here — keep in sync with
 * that source). The written arrays are exactly what a legacy-only document
 * resolves to, and exactly what the live dual-write would have produced.
 *
 * SAFETY / IDEMPOTENCY: additive only — it never touches the legacy fields,
 * never changes a `_ref` target, never deletes anything, and skips DRAFTS. A
 * conversation that ALREADY carries a non-empty `participants[]`, and a message
 * that already carries an `authorParty`, are SKIPPED — so a re-run only patches
 * documents still missing the representation (e.g. a live dual-write that landed
 * between runs is left untouched). Human-pointing refs are written WEAK (per
 * 041) so a later GDPR erase never orphan-blocks.
 *
 * NOT RUN: run intentionally, after review, via the "Run Sanity Migration"
 * workflow (.github/workflows/run-migration.yml) with migration id
 * `043-backfill-conversation-participants`. The workflow exports a dataset
 * backup and performs a dry run first.
 */

/** The universal organizer group key. Mirrors ORGANIZERS_GROUP in types.ts. */
const ORGANIZERS_GROUP = 'organizers'

const isDraft = (id: string): boolean => id.startsWith('drafts.')

interface StoredRef {
  _type: 'reference'
  _ref: string
  _weak: true
}

function weakRef(ref: string): StoredRef {
  return { _type: 'reference', _ref: ref, _weak: true }
}

/**
 * A stored `conversationParticipant` speaker party for a `participants[]` array
 * item. `_key` is DETERMINISTIC (derived from the speaker ref) so a dry run and
 * the apply agree, and so the array stays stable on any re-derivation. The live
 * dual-write uses a random nanoid key instead; keys are array identity only and
 * carry no meaning, so the two coexist harmlessly.
 */
function speakerArrayParty(ref: string): Record<string, unknown> {
  return { _key: `speaker-${ref}`, partyType: 'speaker', speaker: weakRef(ref) }
}

/** The stored organizers-group party for a `participants[]` array item. */
function organizersGroupArrayParty(): Record<string, unknown> {
  return {
    _key: `group-${ORGANIZERS_GROUP}`,
    partyType: 'group',
    group: ORGANIZERS_GROUP,
  }
}

/** The stored `authorParty` speaker object (single field → NO `_key`). */
function authorPartyObject(ref: string): Record<string, unknown> {
  return { partyType: 'speaker', speaker: weakRef(ref) }
}

interface ConversationRow {
  _id: string
  conversationType?: string
  createdById?: string | null
  subjectSpeakerId?: string | null
  proposalSpeakerIds?: Array<string | null>
  hasParticipants?: boolean
}

/**
 * Derive the stored `participants[]` from a conversation's legacy fields —
 * mirrors `deriveParties` + `partiesToStored` in src/lib/messaging/sanity.ts.
 */
function deriveStoredParticipants(
  conv: ConversationRow,
): Record<string, unknown>[] {
  const parties: Record<string, unknown>[] = []
  if (conv.conversationType === 'proposal') {
    for (const ref of conv.proposalSpeakerIds ?? []) {
      if (ref) parties.push(speakerArrayParty(ref))
    }
  } else {
    // A weak creator/subject ref may be dangling after a GDPR erase; skip nulls.
    if (conv.createdById) parties.push(speakerArrayParty(conv.createdById))
    if (conv.subjectSpeakerId)
      parties.push(speakerArrayParty(conv.subjectSpeakerId))
  }
  parties.push(organizersGroupArrayParty())
  return parties
}

interface MessageDoc extends SanityDocument {
  author?: { _ref?: string } | null
  authorParty?: unknown
}

export default defineMigration({
  title:
    'Backfill conversation participants + message authorParty (party model G1)',
  description:
    'Reconstructs conversation.participants[] and message.authorParty from the ' +
    'legacy fields for documents predating the G1 dual-write, so the G2 read-path ' +
    'flip finds every historical thread already carrying the party representation. ' +
    'Additive, idempotent (skips docs already carrying the representation, skips ' +
    'drafts); mirrors deriveParties/partiesToStored verbatim. NOT RUN by default — ' +
    'run via the Run Sanity Migration workflow after maintainer review, before G2.',
  // The message pass drives off the streamed iterator (author is on the doc);
  // the conversation pass needs the proposal->speakers JOIN, so it uses an
  // explicit fetch. Both types are declared so the workflow streams messages.
  documentTypes: ['conversation', 'message'],

  async *migrate(documents, context) {
    // --- Conversations: explicit fetch (needs the proposal-speaker join) -----
    const conversations = await context.client.fetch<ConversationRow[]>(
      `*[_type == "conversation" && !(_id in path("drafts.**"))]{
        _id,
        conversationType,
        "createdById": createdBy._ref,
        "subjectSpeakerId": subjectSpeaker._ref,
        "proposalSpeakerIds": coalesce(proposal->speakers[]._ref, []),
        "hasParticipants": count(participants) > 0
      }`,
    )

    let convPatched = 0
    let convSkipped = 0
    for (const conv of conversations ?? []) {
      // Idempotency: a doc already carrying a non-empty participants[] (a live
      // dual-write, or a previous run) is left untouched.
      if (conv.hasParticipants) {
        convSkipped++
        continue
      }
      const participants = deriveStoredParticipants(conv)
      console.log(
        `  ✓ conversation ${conv._id}: writing ${participants.length} participant(s)`,
      )
      yield patch(conv._id, [at('participants', set(participants))])
      convPatched++
    }

    // --- Messages: streamed iterator (author is on the doc, no join needed) ---
    let msgPatched = 0
    let msgSkipped = 0
    let msgNoAuthor = 0
    for await (const rawDoc of documents()) {
      if (rawDoc._type !== 'message') continue
      const doc = rawDoc as MessageDoc
      if (isDraft(doc._id)) continue
      // Idempotency: already carries the party form of its author.
      if (doc.authorParty) {
        msgSkipped++
        continue
      }
      const authorRef = doc.author?._ref
      if (!authorRef) {
        // A dangling (erased) author leaves nothing to build a party from; the
        // legacy `author` ref is likewise dangling, so this is faithful.
        msgNoAuthor++
        continue
      }
      yield patch(doc._id, [
        at('authorParty', set(authorPartyObject(authorRef))),
      ])
      msgPatched++
    }

    console.log('\n=== Party-model backfill summary ===')
    console.log(
      `  conversations: ${convPatched} patched, ${convSkipped} skipped (already had participants)`,
    )
    console.log(
      `  messages:      ${msgPatched} patched, ${msgSkipped} skipped (already had authorParty), ${msgNoAuthor} skipped (no author ref)`,
    )
  },
})
