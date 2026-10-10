/**
 * RESEND THE WORKSHOP SIGN-UP INSTRUCTIONS (#1298).
 *
 * The ticket-sold email leaves the portal link out while the conference's main
 * host cannot sign in, and nothing sends it again. Once the host can, an
 * organizer presses "Resend sign-up instructions" and every workshop ticket
 * holder gets the instructions with the link.
 *
 * - THE LINK FIRST. Nothing is read or sent while `workshopPortalUrl` has no
 *   link: the resend exists to deliver it.
 * - THE SAME RULE AS THE PORTAL. Holders are the event's tickets whose type
 *   grants workshops by the LIVE ticket-type roles (`liveTicketTypeRoles`,
 *   `workshopAccessOf`), one email per person (`canonicalEmail` of the address
 *   the ticket was bought under), sent to that address as registered.
 * - AT MOST ONCE AN HOUR PER CONFERENCE, best effort per instance (the
 *   announcement rail's pattern): a misfire guard against a double click, not
 *   a security control. The hour is reserved before the first ticket read, so
 *   two concurrent presses send once; a refusal spends no quota.
 */

import type { Conference } from '@/lib/conference/types'
import { sendWorkshopSignupInstructions } from '@/lib/email/workshop'
import { canonicalEmail } from '@/lib/speaker/email'
import { fetchEventTicketCandidates } from '@/lib/tickets/speakerStatus'
import { liveTicketTypeRoles, workshopAccessOf } from './eligibility'
import { workshopPortalUrl } from './sign-in'

export const RESEND_WINDOW_MS = 60 * 60 * 1000
/** Sends in flight at once — the announcement rail's figure. */
const EMAIL_CONCURRENCY = 3

export type ResendOutcome =
  | { kind: 'sent'; sent: number; failed: number }
  | { kind: 'portal-unavailable' }
  | { kind: 'ticketing-unavailable' }
  | { kind: 'rate-limited'; retryAfterMs: number }

/** conference id → when its last resend was accepted. */
const lastResend = new Map<string, number>()

export function __resetResendRateLimit(): void {
  lastResend.clear()
}

export async function resendWorkshopSignupInstructions(
  conference: Conference & { _id: string },
  now: number = Date.now(),
): Promise<ResendOutcome> {
  const portalUrl = await workshopPortalUrl(conference)
  if (!portalUrl) return { kind: 'portal-unavailable' }

  const previous = lastResend.get(conference._id)
  if (previous !== undefined && now - previous < RESEND_WINDOW_MS) {
    return {
      kind: 'rate-limited',
      retryAfterMs: previous + RESEND_WINDOW_MS - now,
    }
  }

  // Reserve the hour NOW, before the next await, so a concurrent resend sees
  // it; released if the ticket list cannot be read.
  lastResend.set(conference._id, now)

  const tickets = await fetchEventTicketCandidates(conference)
  if (!tickets) {
    if (lastResend.get(conference._id) === now)
      lastResend.delete(conference._id)
    return { kind: 'ticketing-unavailable' }
  }
  const roles = await liveTicketTypeRoles(conference)

  const holders = new Map<string, (typeof tickets)[number]>()
  for (const ticket of tickets) {
    if (workshopAccessOf(ticket.category, roles) !== 'granted') continue
    const key = canonicalEmail(ticket.registeredEmail || ticket.email)
    if (key && !holders.has(key)) holders.set(key, ticket)
  }

  const recipients = [...holders.values()]
  let sent = 0
  let failed = 0
  for (let i = 0; i < recipients.length; i += EMAIL_CONCURRENCY) {
    const results = await Promise.allSettled(
      recipients.slice(i, i + EMAIL_CONCURRENCY).map((ticket) => {
        const userEmail = ticket.registeredEmail || ticket.email
        return sendWorkshopSignupInstructions({
          userEmail,
          userName: ticket.name || userEmail,
          conference,
          ticketCategory: ticket.category,
          portalUrl,
        })
      }),
    )
    for (const result of results) {
      if (result.status === 'fulfilled' && !result.value.error) sent += 1
      else failed += 1
    }
  }
  return { kind: 'sent', sent, failed }
}
