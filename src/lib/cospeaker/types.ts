export const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
  'canceled',
] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export interface CoSpeakerInvitation {
  _id: string
  inviterEmail: string
  inviterName: string
  inviteeEmail: string
  inviteeName?: string
  proposalId: string
  proposalTitle: string
  status: InvitationStatus
  token: string
  expiresAt: string
  createdAt: string
  respondedAt?: string
  acceptedSpeakerId?: string
}

export interface InvitationTokenPayload {
  invitationId: string
  inviteeEmail: string
  proposalId: string
  expiresAt: number
}

export const CO_SPEAKER_LIMITS = {
  LIGHTNING_TALK: 0,
  PRESENTATION: 1,
  WORKSHOP: 3,
} as const

export function getInvitationStatusColor(status: InvitationStatus): string {
  switch (status) {
    case 'pending':
      return 'text-yellow-600'
    case 'accepted':
      return 'text-green-600'
    case 'declined':
      return 'text-red-600'
    case 'expired':
      return 'text-gray-500'
    case 'canceled':
      return 'text-gray-400'
    default:
      return 'text-gray-600'
  }
}

export function formatInvitationStatus(status: InvitationStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function isInvitationExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt) < new Date()
}

export function getCoSpeakerLimit(format: string): number {
  switch (format.toLowerCase()) {
    case 'lightning talk':
    case 'lightning':
      return CO_SPEAKER_LIMITS.LIGHTNING_TALK
    case 'presentation':
      return CO_SPEAKER_LIMITS.PRESENTATION
    case 'workshop':
      return CO_SPEAKER_LIMITS.WORKSHOP
    default:
      return CO_SPEAKER_LIMITS.PRESENTATION
  }
}

export function formatProposalFormat(format: string): string {
  const formats: Record<string, string> = {
    'lightning-talk': 'Lightning Talk (10 min)',
    'standard-talk': 'Standard Talk (40 min)',
    workshop: 'Workshop (2 hours)',
  }
  return formats[format] || format
}
