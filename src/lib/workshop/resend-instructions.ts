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
 * - NOT AFTER REGISTRATION HAS CLOSED: the email would only say so.
 * - AT MOST ONCE AN HOUR PER CONFERENCE, best effort per instance (the
 *   announcement rail's pattern): a misfire guard against a double click, not
 *   a security control. The hour is reserved before the first ticket read, so
 *   two concurrent presses send once; a refusal, or nobody to send to, spends
 *   no quota.
 * - RESEND'S BATCH API, {@link BATCH_SIZE} emails per request, paced at the
 *   account's 2 requests/second: a list of thousands finishes in seconds, well
 *   inside the function timeout. Permissive validation, so one bad address
 *   fails only itself; an idempotency key per batch, so a retried batch is
 *   not delivered twice.
 */

import type { Conference } from '@/lib/conference/types'
import {
  delay,
  EMAIL_CONFIG,
  resolveEmailSender,
  retryWithBackoff,
} from '@/lib/email/config'
import { renderWorkshopSignupInstructions } from '@/lib/email/workshop'
import { canonicalEmail } from '@/lib/speaker/email'
import { fetchEventTicketCandidates } from '@/lib/tickets/speakerStatus'
import { liveTicketTypeRoles, workshopAccessOf } from './eligibility'
import { workshopPortalUrl } from './sign-in'

export const RESEND_WINDOW_MS = 60 * 60 * 1000
/** Resend's batch API limit. */
export const BATCH_SIZE = 100

export type ResendOutcome =
  | { kind: 'sent'; sent: number; failed: number }
  | { kind: 'portal-unavailable' }
  | { kind: 'registration-closed' }
  | { kind: 'ticketing-unavailable' }
  | { kind: 'rate-limited'; retryAfterMs: number }

/** conference id → when its last resend was accepted. */
const lastResend = new Map<string, number>()

export function __resetResendRateLimit(): void {
  lastResend.clear()
}

/**
 * Why a resend cannot run, or null: no working portal link, or registration
 * has closed. The /admin/workshops page asks this too, so the button and the
 * server refuse for the same reasons.
 */
export function resendBlocker(
  conference: Pick<Conference, 'workshopRegistrationEnd'>,
  portalUrl: string | null,
  now: number = Date.now(),
): 'portal-unavailable' | 'registration-closed' | null {
  if (!portalUrl) return 'portal-unavailable'
  const endsAt = conference.workshopRegistrationEnd
  if (endsAt && new Date(endsAt).getTime() < now) return 'registration-closed'
  return null
}

export async function resendWorkshopSignupInstructions(
  conference: Conference & { _id: string },
  now: number = Date.now(),
): Promise<ResendOutcome> {
  const portalUrl = await workshopPortalUrl(conference)
  const blocker = resendBlocker(conference, portalUrl, now)
  if (blocker || !portalUrl) return { kind: blocker ?? 'portal-unavailable' }

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

  const release = () => {
    if (lastResend.get(conference._id) === now)
      lastResend.delete(conference._id)
  }

  const tickets = await fetchEventTicketCandidates(conference)
  if (!tickets) {
    release()
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
  if (recipients.length === 0) {
    release()
    return { kind: 'sent', sent: 0, failed: 0 }
  }

  const { client } = await resolveEmailSender(conference.organization?._ref)
  let sent = 0
  let failed = 0
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    if (i > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    const batch = recipients.slice(i, i + BATCH_SIZE)
    const emails = batch.map((ticket) => {
      const userEmail = ticket.registeredEmail || ticket.email
      return renderWorkshopSignupInstructions({
        userEmail,
        userName: ticket.name || userEmail,
        conference,
        ticketCategory: ticket.category,
        portalUrl,
        resent: true,
      })
    })
    try {
      const result = await retryWithBackoff(async () => {
        const response = await client.batch.send(emails, {
          batchValidation: 'permissive',
          idempotencyKey: `workshop-resend/${conference._id}/${now}/${i}`,
        })
        if (response.error) {
          throw new Error(`Failed to send batch: ${response.error.message}`)
        }
        return response.data
      })
      const rejected = result?.errors?.length ?? 0
      sent += batch.length - rejected
      failed += rejected
    } catch (error) {
      console.error('Workshop instructions resend: batch failed:', error)
      failed += batch.length
    }
  }
  return { kind: 'sent', sent, failed }
}
