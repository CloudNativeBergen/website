import { Format } from '@/lib/proposal/types'

/**
 * Co-speaker limits based on talk format
 * These limits define the maximum number of co-speakers allowed for each format
 * Note: This is in addition to the primary speaker
 */
export const CO_SPEAKER_LIMITS = {
  [Format.lightning_10]: 0,
  [Format.presentation_20]: 1,
  [Format.presentation_25]: 1,
  [Format.presentation_40]: 2,
  [Format.presentation_45]: 2,
  [Format.workshop_120]: 3,
  [Format.workshop_240]: 3,
} as const

export function getCoSpeakerLimit(format: Format): number {
  return CO_SPEAKER_LIMITS[format] ?? 1
}

export function getTotalSpeakerLimit(format: Format): number {
  return getCoSpeakerLimit(format) + 1
}

export function allowsCoSpeakers(format: Format): boolean {
  return getCoSpeakerLimit(format) > 0
}

/** Number of days a co-speaker invitation stays valid after creation */
export const INVITATION_VALID_DAYS = 14

/**
 * Whether an invitation can no longer be responded to: either it was
 * already marked expired, or it is still pending but past its expiry date.
 */
export function isInvitationExpired(inv: {
  status: string
  expiresAt: string
}): boolean {
  return (
    inv.status === 'expired' ||
    (inv.status === 'pending' && new Date(inv.expiresAt) < new Date())
  )
}

export function getSpeakerLimitDescription(format: Format): string {
  const coSpeakerLimit = getCoSpeakerLimit(format)

  if (coSpeakerLimit === 0) {
    return 'Single speaker only'
  }

  const total = getTotalSpeakerLimit(format)
  return `Up to ${total} speaker${total > 1 ? 's' : ''} (1 primary + ${coSpeakerLimit} co-speaker${coSpeakerLimit > 1 ? 's' : ''})`
}
