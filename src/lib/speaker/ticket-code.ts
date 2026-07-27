import { createHmac } from 'node:crypto'
import { normalizeEmail } from './email'

/**
 * Prefix for the single-use 100%-off coupon codes issued to confirmed speakers
 * as their complimentary conference ticket.
 */
export const SPEAKER_TICKET_CODE_PREFIX = 'SPEAKER-'

/**
 * The server-side key the speaker ticket codes are derived with. A dedicated
 * secret can be provisioned via `SPEAKER_TICKET_CODE_SECRET`; otherwise the
 * auth secret is reused (same trust domain as the link-intent HMAC in
 * `@/lib/auth-link`). Throwing when neither is set keeps the failure loud and
 * early instead of silently minting forgeable codes.
 */
function ticketCodeSecret(): string {
  const dedicated = process.env.SPEAKER_TICKET_CODE_SECRET
  if (dedicated) return dedicated
  const fallback = process.env.AUTH_SECRET
  if (!fallback) {
    throw new Error(
      'speakerTicketCode requires SPEAKER_TICKET_CODE_SECRET or AUTH_SECRET to be set',
    )
  }
  // Rotating AUTH_SECRET (a routine operational action) would change every
  // derived code and break idempotency: already-confirmed speakers would get
  // NEW coupons minted on the next re-trigger. Warn so deployments are nudged
  // toward a dedicated secret that stays stable across auth rotations.
  console.warn(
    '[speakerTicket] SPEAKER_TICKET_CODE_SECRET is not set; falling back to AUTH_SECRET for ticket-code derivation. ' +
      'Rotating AUTH_SECRET will change all derived codes and can double-issue coupons — set SPEAKER_TICKET_CODE_SECRET.',
  )
  return fallback
}

/**
 * Derives a deterministic, single-use coupon code for a speaker from their
 * normalized email address.
 *
 * The code is an HMAC (keyed by a server-side secret) rather than a plain
 * hash: speaker ids are public (and emails guessable), so an unkeyed digest
 * would let anyone derive a valid 100%-off code. With the HMAC the code is
 * non-derivable without the secret, while staying deterministic so it can
 * double as an idempotency key: re-confirming the same speaker always yields
 * the same code, which lets the issuance handler detect an already-created
 * coupon in the ticketing provider and skip it rather than minting a
 * duplicate.
 *
 * Keying on the normalized email (not the speaker document id) means duplicate
 * speaker documents for the same person — the most common dirty-data case —
 * share one code, so one person never accumulates multiple comp coupons.
 */
export function speakerTicketCode(email: string): string {
  const shortId = createHmac('sha256', ticketCodeSecret())
    .update(normalizeEmail(email))
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()

  return `${SPEAKER_TICKET_CODE_PREFIX}${shortId}`
}
