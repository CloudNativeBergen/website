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

/** Deterministic id for the single conversation attached to a proposal. */
export function proposalConversationId(proposalId: string): string {
  return `conversation.proposal.${proposalId}`
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
