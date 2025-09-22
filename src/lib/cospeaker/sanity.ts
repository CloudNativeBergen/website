import { groq } from 'next-sanity'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { CoSpeakerInvitationFull, InvitationStatus } from './types'

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

export async function getInvitationByToken(
  token: string,
): Promise<CoSpeakerInvitationFull | null> {
  const query = groq`*[
    _type == "coSpeakerInvitation" &&
    token == $invitationToken
  ][0] {
    _id,
    invitedEmail,
    invitedName,
    status,
    token,
    expiresAt,
    createdAt,
    _createdAt,
    _updatedAt,
    proposal-> { _id, title },
    invitedBy-> { _id, name, email }
  }`

  try {
    const invitation = await clientRead.fetch(
      query,
      { invitationToken: token },
      { cache: 'no-store' },
    )
    return invitation || null
  } catch (error) {
    console.error('Error fetching invitation by token:', error)
    return null
  }
}

export function isInvitationExpired(
  invitation: CoSpeakerInvitationFull,
): boolean {
  if (!invitation.expiresAt) return false
  return new Date(invitation.expiresAt) < new Date()
}

export function getInvitationDisplayStatus(
  invitation: CoSpeakerInvitationFull,
): InvitationStatus | 'expired' {
  if (invitation.status === 'pending' && isInvitationExpired(invitation)) {
    return 'expired'
  }
  return invitation.status
}
