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
  return isOrganizer
    ? `/admin/messages/${conversation._id}`
    : `/cfp/messages/${conversation._id}`
}
