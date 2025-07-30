import { groq } from 'next-sanity'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { CoSpeakerInvitationFull, InvitationStatus } from './types'

/**
 * Get pending invitations for a proposal
 */
export async function getPendingInvitationsForProposal(
  proposalId: string,
): Promise<CoSpeakerInvitationFull[]> {
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    proposal._ref == $proposalId &&
    status == "pending"
  ] {
    ...,
    inviter-> { _id, name, email },
    proposal-> { _id, title }
  } | order(_createdAt desc)`

  try {
    const invitations = await clientRead.fetch(
      query,
      { proposalId },
      { cache: 'no-store' },
    )
    return invitations || []
  } catch (error) {
    console.error('Error fetching pending invitations:', error)
    return []
  }
}

/**
 * Get all invitations for a proposal (for display in proposal cards)
 */
export async function getInvitationsForProposal(
  proposalId: string,
): Promise<CoSpeakerInvitationFull[]> {
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    proposal._ref == $proposalId
  ] {
    _id,
    inviteeName,
    inviteeEmail,
    status,
    expiresAt,
    _createdAt,
    acceptedSpeaker-> { _id, name, email }
  } | order(_createdAt desc)`

  try {
    const invitations = await clientRead.fetch(
      query,
      { proposalId },
      { cache: 'no-store' },
    )
    return invitations || []
  } catch (error) {
    console.error('Error fetching invitations for proposal:', error)
    console.error('[getInvitationsForProposal] Error details:', {
      proposalId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      environment: typeof window !== 'undefined' ? 'browser' : 'server',
    })
    return []
  }
}

/**
 * Get invitations for multiple proposals (batch fetch for performance)
 */
export async function getInvitationsForProposals(
  proposalIds: string[],
): Promise<Record<string, CoSpeakerInvitationFull[]>> {
  if (!proposalIds.length) return {}

  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    proposal._ref in $proposalIds
  ] {
    _id,
    inviteeName,
    inviteeEmail,
    status,
    expiresAt,
    _createdAt,
    "proposalId": proposal._ref,
    acceptedSpeaker-> { _id, name, email }
  } | order(_createdAt desc)`

  try {
    const invitations = await clientRead.fetch(
      query,
      { proposalIds },
      { cache: 'no-store' },
    )

    // Group invitations by proposal ID
    const invitationsByProposal: Record<string, CoSpeakerInvitationFull[]> = {}

    for (const invitation of invitations || []) {
      const proposalId = invitation.proposalId
      if (!invitationsByProposal[proposalId]) {
        invitationsByProposal[proposalId] = []
      }
      invitationsByProposal[proposalId].push(invitation)
    }

    return invitationsByProposal
  } catch (error) {
    console.error('Error fetching invitations for proposals:', error)
    return {}
  }
}

/**
 * Check if an invitation is expired
 */
export function isInvitationExpired(
  invitation: CoSpeakerInvitationFull,
): boolean {
  if (!invitation.expiresAt) return false
  return new Date(invitation.expiresAt) < new Date()
}

/**
 * Get display status for an invitation considering expiry
 */
export function getInvitationDisplayStatus(
  invitation: CoSpeakerInvitationFull,
): InvitationStatus | 'expired' {
  if (invitation.status === 'pending' && isInvitationExpired(invitation)) {
    return 'expired'
  }
  return invitation.status
}
