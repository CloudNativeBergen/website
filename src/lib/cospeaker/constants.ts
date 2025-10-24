import { Format } from '@/lib/proposal/types'

export const COSPEAKER_API_ENDPOINTS = {
  INVITATION_CREATE: (proposalId: string) => `/api/invitation/${proposalId}`,
  INVITATION_RESPOND: '/api/invitation/respond',
  INVITATION_DELETE: (proposalId: string) => `/api/invitation/${proposalId}`,
} as const

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

/**
 * Get the maximum number of co-speakers allowed for a given format
 * @param format - The talk format
 * @returns The maximum number of co-speakers (excluding the primary speaker)
 */
export function getCoSpeakerLimit(format: Format): number {
  return CO_SPEAKER_LIMITS[format] ?? 1
}

/**
 * Get the total maximum number of speakers (including primary speaker) for a given format
 * @param format - The talk format
 * @returns The total maximum number of speakers
 */
export function getTotalSpeakerLimit(format: Format): number {
  return getCoSpeakerLimit(format) + 1
}

/**
 * Check if a format allows co-speakers
 * @param format - The talk format
 * @returns True if the format allows co-speakers
 */
export function allowsCoSpeakers(format: Format): boolean {
  return getCoSpeakerLimit(format) > 0
}

/**
 * Get a human-readable description of speaker limits for a format
 * @param format - The talk format
 * @returns A description string
 */
export function getSpeakerLimitDescription(format: Format): string {
  const coSpeakerLimit = getCoSpeakerLimit(format)

  if (coSpeakerLimit === 0) {
    return 'Single speaker only'
  }

  const total = getTotalSpeakerLimit(format)
  return `Up to ${total} speaker${total > 1 ? 's' : ''} (1 primary + ${coSpeakerLimit} co-speaker${coSpeakerLimit > 1 ? 's' : ''})`
}
