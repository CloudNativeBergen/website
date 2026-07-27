import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { speakerTicketCode } from '@/lib/speaker/ticket-code'
import { normalizeEmail } from '@/lib/speaker/email'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

/** Redacts a coupon code for logging: last four characters only. */
function redactCode(code: string): string {
  return `…${code.slice(-4)}`
}

/**
 * Issues each confirmed speaker a single-use 100%-off coupon in the
 * conference's ticketing provider as their complimentary conference ticket and
 * emails them the code plus a registration link.
 *
 * Runs on the `confirm` action only, matching the Slack and audience handlers
 * that also act on confirmation (rather than gating on `shouldNotify`, which is
 * reserved for the accept/reject/waitlist speaker emails). A confirmed speaker
 * always earns their comp ticket.
 *
 * The provider is resolved through the ticketing provider abstraction
 * (`resolveTicketingProvider`), never a vendor API directly. The discount
 * surface is Checkin-shaped (numeric event id); a provider without discount
 * support (Tito) is skipped with a log line rather than failing the handler.
 *
 * Speakers are de-duplicated by their normalized email address — dirty data
 * (duplicate speaker documents, the same speaker listed twice) must never earn
 * one person more than one comp code. The coupon code itself is an HMAC of the
 * normalized email (see `speakerTicketCode`), so duplicate documents also
 * collapse onto a single coupon across proposals.
 *
 * Idempotency is split across two guards so a delivery failure stays
 * recoverable:
 *
 * 1. Coupon creation is guarded by the event's existing discounts: the coupon
 *    code is deterministic per email, so we skip `createDiscount` whenever
 *    that code already exists (compared case-insensitively, matching the
 *    vendor's coupon semantics) — a coupon is never minted twice for the same
 *    person.
 * 2. Email delivery is guarded by a per-speaker `issuedSpeakerTickets` marker
 *    persisted on the proposal, written only after a successful send. A coupon
 *    that exists without a matching marker means an earlier email failed, so a
 *    re-trigger re-sends the email (reusing the existing coupon) instead of
 *    treating the speaker as done.
 *
 * Fire-and-forget: every failure is caught and logged. The event bus already
 * isolates handlers from one another; per-speaker try/catch additionally keeps
 * one speaker's failure from blocking the others. A coupon created but not
 * emailed logs an actionable error (speaker id + code) so an organizer can
 * recover manually if needed.
 *
 * The code is a single-use free-ticket credential, so routine log lines only
 * ever include its last four characters (`redactCode`) — enough to correlate
 * with the provider's coupon list, useless to redeem. The one exception is the
 * send-failure error, where the full code is exactly what the operator needs
 * for manual recovery.
 */
export async function handleSpeakerTicket(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  if (event.action !== Action.confirm) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    console.warn(
      `[speakerTicket] No speakers found for proposal ${event.proposal._id}; nothing to issue`,
    )
    return
  }

  const ticketing = await resolveTicketingProvider(event.conference)
  if (!ticketing.configured) {
    console.log(
      `[speakerTicket] Conference "${event.conference.title}" has no ticketing binding; skipping speaker ticket code issuance`,
    )
    return
  }

  const { provider, eventRef } = ticketing

  // The discount surface rides Checkin's numeric event id; a provider without
  // it (Tito's ref carries slugs, and its discount methods unsupported-error)
  // simply doesn't get automatic comp codes.
  if (eventRef.provider === 'tito') {
    console.log(
      `[speakerTicket] Ticketing provider "${provider.name}" does not support discount codes; skipping speaker ticket code issuance`,
    )
    return
  }
  const eventId = eventRef.eventId

  if (!provider.isConfigured()) {
    console.log(
      `[speakerTicket] Ticketing provider "${provider.name}" has no API credentials; skipping speaker ticket code issuance`,
    )
    return
  }

  // Fetch the event's existing discounts once so we can detect codes that were
  // already issued on a previous confirm. The vendor matches coupon codes
  // case-insensitively, so the lookup set is normalized to upper case. If this
  // lookup fails we abort rather than risk creating duplicates.
  let existingCodes: Set<string>
  try {
    const { discounts } = await provider.listDiscounts(eventId)
    existingCodes = new Set(
      discounts
        .map((discount) => discount.triggerValue)
        .filter((code): code is string => !!code)
        .map((code) => code.toUpperCase()),
    )
  } catch (error) {
    console.error(
      `[speakerTicket] Failed to load existing discounts for event ${eventId}; skipping to avoid duplicate codes`,
      error,
    )
    return
  }

  // Tenant-derived base URL (scheme-aware: http for localhost dev domains,
  // https otherwise) — never a hard-coded protocol or localhost fallback.
  const eventUrl = conferenceBaseUrl(event.conference)
  const registrationUrl = event.conference.registrationLink || eventUrl

  // Speakers whose ticket email was already delivered on a previous run,
  // keyed both by speaker id and by normalized email so a duplicate speaker
  // document for an already-served person is also skipped. These are skipped
  // entirely; a coupon without a marker is intentionally retried.
  const markers = event.proposal.issuedSpeakerTickets ?? []
  const emailedSpeakerIds = new Set(
    markers.map((entry) => entry.speakerId).filter((id): id is string => !!id),
  )
  const emailedEmails = new Set(
    markers.map((entry) => normalizeEmail(entry.email)).filter(Boolean),
  )
  // Normalized emails already handled in THIS run — one email, one code, one
  // send, no matter how many speaker entries share it.
  const handledEmails = new Set<string>()

  for (const speaker of event.speakers) {
    const email = speaker.email?.trim()
    if (!email) {
      console.warn(
        `[speakerTicket] Speaker ${speaker._id} has no email; skipping ticket issuance`,
      )
      continue
    }
    const emailKey = normalizeEmail(email)

    if (handledEmails.has(emailKey)) {
      console.log(
        `[speakerTicket] Email ${email} already handled in this run (duplicate speaker entry); skipping speaker ${speaker._id}`,
      )
      continue
    }
    handledEmails.add(emailKey)

    if (emailedSpeakerIds.has(speaker._id) || emailedEmails.has(emailKey)) {
      console.log(
        `[speakerTicket] Ticket already issued and emailed for speaker ${speaker._id}; skipping`,
      )
      continue
    }

    let code: string
    try {
      code = speakerTicketCode(email)
    } catch (error) {
      // Missing HMAC secret — a deployment problem that affects every
      // speaker, so abort the whole handler with one loud log line.
      console.error(
        `[speakerTicket] Cannot derive ticket codes; skipping speaker ticket issuance for proposal ${event.proposal._id}`,
        error,
      )
      return
    }

    // Create the coupon (guarded so it is never minted twice), then email it.
    // These are separate steps: an email failure must not roll back or hide the
    // coupon, and must leave the speaker recoverable (no delivery marker).
    if (!existingCodes.has(code.toUpperCase())) {
      try {
        await provider.createDiscount({
          eventId,
          discountCode: code,
          numberOfTickets: 1,
          ticketTypes: [],
        })
        existingCodes.add(code.toUpperCase())
      } catch (error) {
        console.error(
          `[speakerTicket] Failed to create ticketing coupon for speaker ${speaker._id} on proposal ${event.proposal._id}; skipping`,
          error,
        )
        continue
      }
    } else {
      console.log(
        `[speakerTicket] Coupon ${redactCode(code)} already exists for speaker ${speaker._id} but was not yet emailed; resending`,
      )
    }

    try {
      await sendSpeakerTicketEmail({
        speaker: { name: speaker.name, email },
        discountCode: code,
        registrationUrl,
        eventUrl,
        conference: event.conference,
      })
    } catch (error) {
      // The coupon exists but the speaker was not told. Do NOT record a
      // delivery marker, so a later re-trigger re-sends. Log everything an
      // organizer needs to recover manually in the meantime.
      console.error(
        `[speakerTicket] Coupon ${code} was created for speaker ${speaker._id} (${email}) on proposal ${event.proposal._id} but the ticket email FAILED to send. ` +
          `The speaker has NOT received their code. Re-trigger issuance or send code ${code} to ${email} manually.`,
        error,
      )
      continue
    }

    emailedSpeakerIds.add(speaker._id)
    emailedEmails.add(emailKey)

    // Email delivered — record the marker so we never re-email this speaker.
    // The marker deliberately carries no coupon code: proposal reads project
    // the whole talk to every co-speaker, so a stored code would leak. The
    // provider stays the source of truth and the code is re-derivable from the
    // email. A failure here only risks a duplicate email on a future
    // re-trigger, which is far less harmful than the send failure above, so we
    // just log it.
    try {
      await recordSpeakerTicketEmailed(event.proposal._id, {
        speakerId: speaker._id,
        email: emailKey,
      })
    } catch (error) {
      console.error(
        `[speakerTicket] Emailed ticket code ${redactCode(code)} to speaker ${speaker._id} but failed to record the delivery marker on proposal ${event.proposal._id}; a re-trigger may re-send`,
        error,
      )
    }

    console.log(
      `[speakerTicket] Issued and emailed speaker ticket code ${redactCode(code)} to speaker ${speaker._id} for proposal ${event.proposal._id}`,
    )
  }
}
