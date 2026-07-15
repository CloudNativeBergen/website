import { createHash } from 'node:crypto'

/**
 * Prefix for the single-use 100%-off coupon codes issued to confirmed speakers
 * as their complimentary conference ticket.
 */
export const SPEAKER_TICKET_CODE_PREFIX = 'SPEAKER-'

/**
 * Derives a deterministic, single-use coupon code for a speaker.
 *
 * The code embeds a short, stable hash of the speaker's id so it can double as
 * an idempotency key: re-confirming the same speaker always yields the same
 * code, which lets the issuance handler detect an already-created coupon in
 * checkin.no and skip it rather than minting a duplicate.
 */
export function speakerTicketCode(speakerId: string): string {
  const shortId = createHash('sha256')
    .update(speakerId)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()

  return `${SPEAKER_TICKET_CODE_PREFIX}${shortId}`
}
