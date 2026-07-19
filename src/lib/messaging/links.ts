/**
 * Client-safe pure helpers for messaging: the deterministic proposal-thread id
 * and the per-audience deep-link contract.
 *
 * These live OUTSIDE `./sanity` (which is `server-only`) so client components —
 * the conversation thread and inbox — can derive a proposal thread id and build
 * inbox links without pulling the server data layer into the browser bundle.
 * `./sanity` re-exports both so existing server importers are unaffected.
 */

import type { ConversationWithContext } from './types'

/**
 * The collective label shown as the message counterpart when the "other side"
 * of a thread is the whole organizer team rather than one identifiable person
 * (a speaker looking at a thread whose last author is not an organizer). Shared
 * so the data layer ({@link resolveCounterpart} in `./sanity`) and the inbox
 * avatar branch (`ConversationList.tsx`) agree on ONE string.
 */
export const ORGANIZERS_LABEL = 'Organizers'

/** Deterministic id for the single conversation attached to a proposal. */
export function proposalConversationId(proposalId: string): string {
  return `conversation.proposal.${proposalId}`
}

/**
 * Deterministic id for the SINGLE sponsor↔organizer conversation attached to a
 * `sponsorForConference` (messaging G2b). EXTENDS the id scheme alongside
 * {@link proposalConversationId} (`conversation.proposal.<proposalId>`): a
 * sponsor thread is `conversation.sponsor.<sfcId>`, created via
 * `createIfNotExists` so the portal-send and organizer-send paths converge on
 * one document (the maintainer-locked "one thread per sponsorForConference" UI).
 * The model stays multi-thread-general — this is the only id a sponsor thread
 * ever gets, so there is no special-casing beyond deriving THIS id.
 */
export function sponsorConversationId(sfcId: string): string {
  return `conversation.sponsor.${sfcId}`
}

/**
 * The longest prefix of `text` that is at most `max` UTF-16 code units long AND
 * ends on a grapheme-cluster boundary, so truncation never splits a multi-code-
 * unit cluster (emoji, flags, combined sequences) into a lone surrogate — which
 * renders as the replacement character (�).
 *
 * Uses `Intl.Segmenter` where available (every runtime this ships on has it);
 * falls back to a surrogate-pair-aware trim otherwise. Returns `text` unchanged
 * when it already fits. Callers append their own ellipsis, so this only ever
 * removes — never adds — characters.
 */
export function truncateToGraphemeBoundary(text: string, max: number): string {
  if (max <= 0) return ''
  if (text.length <= max) return text

  const SegmenterCtor = (
    Intl as unknown as { Segmenter?: typeof Intl.Segmenter }
  ).Segmenter
  if (SegmenterCtor) {
    const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' })
    let out = ''
    for (const { segment } of segmenter.segment(text)) {
      if (out.length + segment.length > max) break
      out += segment
    }
    return out
  }

  // Fallback: cut at `max`, but if that split a surrogate pair (the last kept
  // code unit is a high surrogate whose low half was excluded), drop it.
  let end = max
  const code = text.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return text.slice(0, end)
}

/**
 * The app-relative deep link to a conversation for a given audience. This is the
 * LINK CONTRACT the M2 routes are built against.
 *
 * - proposal + organizer → `/admin/proposals/<proposalId>#messages`
 * - proposal + speaker   → `/cfp/proposal/<proposalId>#messages`
 * - general  + organizer → `/admin/messages/<conversationId>`
 * - general  + speaker   → `/cfp/messages/<conversationId>`
 * - sponsor  + (either)  → `/admin/messages/<conversationId>` — a sponsor thread
 *   has NO speaker/CFP surface (the sponsor side is token-authed via the portal,
 *   never a session), so BOTH audience variants point at the admin thread. The
 *   only in-app consumer is the organizer hub/inbox; the sponsor reaches the
 *   thread through the portal, not this path (G2b).
 */
export function conversationLinkPath(
  conversation: Pick<
    ConversationWithContext,
    '_id' | 'conversationType' | 'proposalId'
  >,
  isOrganizer: boolean,
): string {
  if (conversation.conversationType === 'proposal' && conversation.proposalId) {
    return isOrganizer
      ? `/admin/proposals/${conversation.proposalId}#messages`
      : `/cfp/proposal/${conversation.proposalId}#messages`
  }
  // Sponsor threads are organizer-surface only (no speaker/CFP route).
  if (conversation.conversationType === 'sponsor') {
    return `/admin/messages/${conversation._id}`
  }
  return isOrganizer
    ? `/admin/messages/${conversation._id}`
    : `/cfp/messages/${conversation._id}`
}

/**
 * The app-relative deep link used in NEW-MESSAGE EMAILS (S8). Unlike
 * {@link conversationLinkPath} (the HUB/PUSH contract, which deep-links proposal
 * threads to the proposal page `#messages` fragment), email links ALWAYS point at
 * the dedicated thread pages:
 *
 * - organizer → `/admin/messages/<conversationId>`
 * - speaker   → `/cfp/messages/<conversationId>`
 *
 * WHY email differs: a message email is frequently opened while logged out, and
 * the auth redirect drops the URL fragment — so a proposal-thread email pointing
 * at `/cfp/proposal/<id>#messages` landed the speaker atop the proposal EDIT
 * form with the `#messages` anchor gone. The thread pages render proposal threads
 * fine by `conversationId`, and the C9 audience redirects cover a wrong-audience
 * link, so both audiences get a stable, fragment-free destination.
 */
export function conversationEmailLinkPath(
  conversation: Pick<ConversationWithContext, '_id'>,
  isOrganizer: boolean,
): string {
  return isOrganizer
    ? `/admin/messages/${conversation._id}`
    : `/cfp/messages/${conversation._id}`
}
