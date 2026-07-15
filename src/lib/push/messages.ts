import { Action } from '@/lib/proposal/types'
import type { PushCategory, PushMessagePayload } from './types'

/**
 * Pure builders that map a domain event to a push payload and the preference
 * category it belongs to (issue #444). Kept side-effect-free so they can be
 * unit-tested without any network or Sanity access.
 */

/**
 * Map a proposal-status action to the push category it notifies, or `null` when
 * the action is not push-worthy. Decisions (accept/reject/waitlist) belong to
 * `proposalDecisions`; a confirmation belongs to `talkConfirmed`.
 */
export function categoryForAction(action: Action): PushCategory | null {
  switch (action) {
    case Action.accept:
    case Action.reject:
    case Action.waitlist:
      return 'proposalDecisions'
    case Action.confirm:
      return 'talkConfirmed'
    default:
      return null
  }
}

/** Build the same-origin deep link to a proposal in the speaker dashboard. */
export function proposalUrl(proposalId: string): string {
  return `/cfp/proposal/${proposalId}`
}

/**
 * Build the notification title + body for a proposal-status change. Contains
 * only what the recipient is already entitled to see (their own proposal title
 * and the conference name).
 */
export function buildProposalStatusMessage(params: {
  action: Action
  proposalId: string
  proposalTitle: string
  conferenceTitle: string
}): PushMessagePayload | null {
  const category = categoryForAction(params.action)
  if (!category) return null

  const title = params.proposalTitle
  const url = proposalUrl(params.proposalId)

  switch (params.action) {
    case Action.accept:
      return {
        title: 'Your talk was accepted 🎉',
        body: `"${title}" has been accepted for ${params.conferenceTitle}.`,
        url,
        tag: 'proposal-decision',
      }
    case Action.reject:
      return {
        title: 'Update on your proposal',
        body: `A decision has been made on "${title}".`,
        url,
        tag: 'proposal-decision',
      }
    case Action.waitlist:
      return {
        title: 'Your talk is waitlisted',
        body: `"${title}" has been placed on the waitlist for ${params.conferenceTitle}.`,
        url,
        tag: 'proposal-decision',
      }
    case Action.confirm:
      return {
        title: 'Talk confirmed ✅',
        body: `Your participation for "${title}" is confirmed.`,
        url,
        tag: 'talk-confirmed',
      }
    default:
      return null
  }
}

/** Build the notification for a co-speaker invitation. */
export function buildCoSpeakerInviteMessage(params: {
  inviterName: string
  proposalTitle: string
}): PushMessagePayload {
  return {
    title: 'Co-speaker invitation',
    body: `${params.inviterName} invited you to co-present "${params.proposalTitle}".`,
    // The invitee responds via the tokenised link in their email; the dashboard
    // is the safe same-origin landing spot from a push tap.
    url: '/cfp/list',
    tag: 'cospeaker-invite',
  }
}
