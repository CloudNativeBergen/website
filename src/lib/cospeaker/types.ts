export const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
  'canceled',
] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export interface CoSpeakerInvitationMinimal {
  _id: string
  invitedEmail: string
  invitedName?: string
  status: InvitationStatus
  token: string
  expiresAt: string
  createdAt?: string
  respondedAt?: string
  declineReason?: string
}

export interface CoSpeakerInvitationFull extends CoSpeakerInvitationMinimal {
  _createdAt?: string
  _updatedAt?: string

  proposal?:
    | {
        _ref: string
        _type: 'reference'
      }
    | {
        _id: string
        title?: string
      }
  invitedBy?:
    | {
        _ref: string
        _type: 'reference'
      }
    | {
        _id: string
        name: string
        email: string
      }
  acceptedSpeaker?:
    | {
        _ref: string
        _type: 'reference'
      }
    | {
        _id: string
        name: string
        email: string
        image?: string
      }
}

export interface InvitationTokenPayload {
  invitationId: string
  invitedEmail: string
  proposalId: string
  expiresAt: number
}

export function formatProposalFormat(format: string): string {
  const formats: Record<string, string> = {
    'lightning-talk': 'Lightning Talk (10 min)',
    'standard-talk': 'Standard Talk (40 min)',
    workshop: 'Workshop (2 hours)',
  }
  return formats[format] || format
}

export function toMinimalInvitation(
  invitation: CoSpeakerInvitationFull,
): CoSpeakerInvitationMinimal {
  return {
    _id: invitation._id,
    invitedEmail: invitation.invitedEmail,
    invitedName: invitation.invitedName,
    status: invitation.status,
    token: invitation.token,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    respondedAt: invitation.respondedAt,
    declineReason: invitation.declineReason,
  }
}
