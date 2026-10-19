/**
 * REMIND THE HOLDERS WHO HAVE NOT SIGNED UP (#1334, spec
 * `docs/WORKSHOP_TICKETS_SPEC.md` §7; it replaced #1298's resend of the
 * sign-up instructions).
 *
 * An organizer presses "Remind people who haven't signed up" and every
 * workshop ticket holder without a sign-up gets one email asking them, if
 * they haven't picked their workshops yet, to do so.
 *
 * - THE JOIN'S GROUP, NOT A COPY OF IT. Recipients are `notSignedUp` of
 *   `readTicketHolders` (#1333), read fresh when the organizer confirms: the
 *   number beside the button and the emails a press sends are counted by one
 *   rule. A holder who is only on a waitlist has signed up, and is not in it.
 *   Someone can sign up between the press and the read, so the email never
 *   says the recipient has no seat.
 * - NO LINK, NO REMINDER. No ticket is read and nothing is sent while
 *   `workshopPortalUrl` has no link: the email exists to send people there.
 * - NOT AFTER REGISTRATION HAS CLOSED: the email would only say so. Checked
 *   before the link, so a closed conference is never told to fix its host.
 * - AT MOST ONCE AN HOUR PER CONFERENCE, across instances: the hour is
 *   reserved on the conference (`workshopReminderReservedAt`) with a
 *   revision-conditioned patch before the first ticket read, so two
 *   concurrent presses send once. A misfire guard against a double click, not
 *   a security control. A refusal, nobody to send to, or a send confirmed to
 *   have reached nobody releases the hour.
 * - THE LAST SEND IS STORED on the conference (`workshopReminderLastSentAt`,
 *   `workshopReminderLastSentCount`) after a send that reached at least one
 *   person, for the dialog to show. Written after the send and never retried:
 *   a failed write is logged and changes neither the send nor its outcome.
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
import { renderWorkshopReminder } from '@/lib/email/workshop'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { readTicketHolders } from './holders'
import { workshopRegistrationWindow } from './registration-window'
import { workshopPortalUrl } from './sign-in'

export const REMINDER_WINDOW_MS = 60 * 60 * 1000
/** Resend's batch API limit. */
export const BATCH_SIZE = 100

/**
 * Worth retrying, and — if still failing after the retries — of unknown
 * outcome rather than rejected: a transient failure, or Resend still
 * processing an earlier attempt under the same idempotency key (409).
 */
function mayStillDeliver(error: unknown): boolean {
  return (
    isTransientError(error) ||
    (error as { resendErrorName?: string } | null)?.resendErrorName ===
      'concurrent_idempotent_requests'
  )
}

export type ReminderOutcome =
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

// groq-global-scoped: $id is the conference the caller already resolved
const RESERVATION = groq`*[_type == "conference" && _id == $id][0]{ _rev, workshopReminderReservedAt }`
/** Bounded compare-and-swap rounds; a lost round re-reads the winner's write. */
const RESERVE_ATTEMPTS = 3

async function readReservation(id: string) {
  return clientReadUncached.fetch<{
    _rev: string
    workshopReminderReservedAt?: string
  } | null>(RESERVATION, { id }, { cache: 'no-store' })
}

/**
 * Reserve the hour on the conference: null when reserved, otherwise how long
 * until it may be. A read failure or lost contention refuses (the safe way).
 */
async function reserveHour(id: string, now: number): Promise<number | null> {
  for (let attempt = 0; attempt < RESERVE_ATTEMPTS; attempt++) {
    const doc = await readReservation(id)
    if (!doc) throw new Error(`Conference ${id} not found`)
    const previous = Date.parse(doc.workshopReminderReservedAt ?? '')
    if (!Number.isNaN(previous) && now - previous < REMINDER_WINDOW_MS)
      return previous + REMINDER_WINDOW_MS - now
    try {
      await clientWrite
        .patch(id)
        .ifRevisionId(doc._rev)
        .set({ workshopReminderReservedAt: new Date(now).toISOString() })
        .commit({ visibility: 'sync' })
      return null
    } catch (error) {
      if (attempt === RESERVE_ATTEMPTS - 1) throw error
    }
  }
  return null // unreachable: the last attempt returns or throws
}

/** Give the hour back, if it is still ours. Best effort: logged on failure. */
async function releaseHour(id: string, now: number): Promise<void> {
  try {
    const doc = await readReservation(id)
    if (doc?.workshopReminderReservedAt !== new Date(now).toISOString()) return
    await clientWrite
      .patch(id)
      .ifRevisionId(doc._rev)
      .unset(['workshopReminderReservedAt'])
      .commit({ visibility: 'sync' })
  } catch (error) {
    console.error('Workshop reminder: the hour was not released:', error)
  }
}

/**
 * Can a reminder go out? Either the reason it cannot, or the portal link to
 * send. The /admin/workshops page asks this too, so the button and the server
 * refuse for the same reasons.
 *
 * CLOSED IS CHECKED FIRST, and without the portal lookup: once registration
 * has closed, fixing the host would not bring the reminder back, so the
 * organizer must not be told it would.
 */
export async function reminderPortal(
  conference: Pick<Conference, 'title' | 'domains' | 'workshopRegistrationEnd'>,
  now: number = Date.now(),
): Promise<
  | { blocker: 'registration-closed' | 'portal-unavailable' }
  | { blocker: null; portalUrl: string }
> {
  // The rule sign-up applies, and the one the email is worded by: an email
  // rendered for this moment never meets a window that has closed.
  const window = workshopRegistrationWindow(conference, {
    now: new Date(now),
    earlyAccess: false,
  })
  if (window.status === 'closed') return { blocker: 'registration-closed' }
  const portalUrl = await workshopPortalUrl(conference)
  return portalUrl
    ? { blocker: null, portalUrl }
    : { blocker: 'portal-unavailable' }
}

export async function sendWorkshopReminder(
  conference: Conference & { _id: string },
  { note }: { note?: string },
  now: number = Date.now(),
): Promise<ReminderOutcome> {
  const portal = await reminderPortal(conference, now)
  if (portal.blocker) return { kind: portal.blocker }
  const { portalUrl } = portal

  // Reserve the hour before anything is read or sent; released below when
  // nothing went out.
  let retryAfterMs: number | null
  try {
    retryAfterMs = await reserveHour(conference._id, now)
  } catch (error) {
    // Sanity unreachable or contended: refuse rather than risk a double send.
    console.error('Workshop reminder: the hour could not be reserved:', error)
    return { kind: 'rate-limited', retryAfterMs: 60_000 }
  }
  if (retryAfterMs !== null) return { kind: 'rate-limited', retryAfterMs }

  const release = () => releaseHour(conference._id, now)

  // The sender before the ticket read: a press that cannot send reads nothing.
  let client: Awaited<ReturnType<typeof resolveEmailSender>>['client']
  try {
    ;({ client } = await resolveEmailSender(conference.organization?._ref))
  } catch (error) {
    console.error('Workshop reminder: no email sender:', error)
    await release()
    return { kind: 'email-unavailable' }
  }

  // Fresh, not the shared 30 s memo: this mails every holder without a
  // sign-up and then locks for an hour, so a ticket sold seconds ago must be
  // on the list. A failed sign-up read refuses like a failed ticket read:
  // without it, everyone would look not signed up.
  let join: Awaited<ReturnType<typeof readTicketHolders>>
  try {
    join = await readTicketHolders(conference, { fresh: true })
  } catch (error) {
    console.error('Workshop reminder: sign-ups could not be read:', error)
    join = null
  }
  if (!join) {
    await release()
    return { kind: 'ticketing-unavailable' }
  }

  const recipients = join.notSignedUp
  if (recipients.length === 0) {
    await release()
    return { kind: 'sent', sent: 0, failed: 0, unconfirmed: 0 }
  }

  let sent = 0
  let failed = 0
  let unconfirmed = 0
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    if (i > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    const batch = recipients.slice(i, i + BATCH_SIZE)
    const emails = batch.map(({ tickets }) => {
      const [ticket] = tickets
      // As registered, minus padding: the provider can hand back an address
      // with whitespace around it, which Resend rejects.
      const userEmail = ticket.registeredEmail.trim() || ticket.email
      return renderWorkshopReminder({
        userEmail,
        userName: tickets.find((t) => t.name)?.name || userEmail,
        conference,
        portalUrl,
        note,
        now,
      })
    })
    try {
      const result = await retryWithBackoff(
        async () => {
          const response = await client.batch.send(emails, {
            batchValidation: 'permissive',
            idempotencyKey: `workshop-reminder/${conference._id}/${now}/${i}`,
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
        mayStillDeliver,
      )
      const rejected = result?.errors?.length ?? 0
      if (rejected > 0) {
        // Index within the batch and the provider's reason; no address.
        console.error('Workshop reminder: recipients rejected:', {
          conferenceId: conference._id,
          batchStart: i,
          errors: result?.errors?.map(({ index, message }) => ({
            index,
            message,
          })),
        })
      }
      sent += batch.length - rejected
      failed += rejected
    } catch (error) {
      console.error('Workshop reminder: batch failed:', error)
      // Unresolved after the retries: the provider may have accepted it.
      if (mayStillDeliver(error)) unconfirmed += batch.length
      else failed += batch.length
    }
  }
  // Confirmed to have reached nobody: the organizer may try again without
  // waiting the hour. Anything unconfirmed keeps the hour, so a second press
  // cannot double-send what may have gone.
  if (sent === 0 && unconfirmed === 0) await release()
  if (sent > 0) await storeLastReminder(conference._id, now, sent)
  return { kind: 'sent', sent, failed, unconfirmed }
}

/**
 * The last send, for the dialog: once, after the send, never retried. A
 * failure is logged and nothing else: the emails have gone, and the organizer
 * is told what was sent either way.
 */
async function storeLastReminder(
  conferenceId: string,
  now: number,
  sent: number,
): Promise<void> {
  try {
    await clientWrite
      .patch(conferenceId)
      .set({
        workshopReminderLastSentAt: new Date(now).toISOString(),
        workshopReminderLastSentCount: sent,
      })
      .commit()
  } catch (error) {
    console.error('Workshop reminder: the last send was not stored:', error)
  }
}
