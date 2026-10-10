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
 *   two concurrent presses send once; a refusal, nobody to send to, or a send
 *   confirmed to have reached nobody spends no quota.
 * - RESEND'S BATCH API, {@link BATCH_SIZE} emails per request, paced at the
 *   account's 2 requests/second: a list of thousands finishes in seconds, well
 *   inside the function timeout. Permissive validation, so one bad address
 *   fails only itself; an idempotency key per batch, so a batch retried after
 *   a transient failure is not delivered twice.
 */

import type { Conference } from '@/lib/conference/types'
import {
  delay,
  EMAIL_CONFIG,
  isTransientError,
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
  /**
   * `failed`: confirmed not sent (the address or batch was rejected).
   * `unconfirmed`: the provider never answered after retries — those may or
   * may not have been delivered.
   */
  | { kind: 'sent'; sent: number; failed: number; unconfirmed: number }
  | { kind: 'email-unavailable' }
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
    return { kind: 'sent', sent: 0, failed: 0, unconfirmed: 0 }
  }

  let client: Awaited<ReturnType<typeof resolveEmailSender>>['client']
  try {
    ;({ client } = await resolveEmailSender(conference.organization?._ref))
  } catch (error) {
    console.error('Workshop instructions resend: no email sender:', error)
    release()
    return { kind: 'email-unavailable' }
  }
  let sent = 0
  let failed = 0
  let unconfirmed = 0
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
      const result = await retryWithBackoff(
        async () => {
          const response = await client.batch.send(emails, {
            batchValidation: 'permissive',
            idempotencyKey: `workshop-resend/${conference._id}/${now}/${i}`,
          })
          if (response.error) {
            // Keep the provider's name/status so a transient failure is retried
            // (safe: the idempotency key makes a repeat a no-op) and a
            // rejection is not.
            const wrapped = new Error(
              `Failed to send batch: ${response.error.message}`,
            ) as Error & { status?: number; resendErrorName?: string }
            const status = response.error.statusCode
            if (typeof status === 'number') wrapped.status = status
            wrapped.resendErrorName = response.error.name
            throw wrapped
          }
          return response.data
        },
        undefined,
        isTransientError,
      )
      const rejected = result?.errors?.length ?? 0
      sent += batch.length - rejected
      failed += rejected
    } catch (error) {
      console.error('Workshop instructions resend: batch failed:', error)
      // Still transient after the retries: the provider may have accepted it.
      if (isTransientError(error)) unconfirmed += batch.length
      else failed += batch.length
    }
  }
  // Confirmed to have reached nobody: the organizer may try again without
  // waiting the hour. Anything unconfirmed keeps the hour, so a second press
  // cannot double-send what may have gone.
  if (sent === 0 && unconfirmed === 0) release()
  return { kind: 'sent', sent, failed, unconfirmed }
}
