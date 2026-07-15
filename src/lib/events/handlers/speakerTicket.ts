import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import { checkinGraphQLClient } from '@/lib/tickets/graphql-client'
import { getEventDiscounts, createEventDiscount } from '@/lib/discounts/api'
import { speakerTicketCode } from '@/lib/speaker/ticket-code'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

/**
 * Issues each confirmed speaker a single-use 100%-off coupon in checkin.no as
 * their complimentary conference ticket and emails them the code plus a
 * registration link.
 *
 * Runs on the `confirm` action only, matching the Slack and audience handlers
 * that also act on confirmation (rather than gating on `shouldNotify`, which is
 * reserved for the accept/reject/waitlist speaker emails). A confirmed speaker
 * always earns their comp ticket.
 *
 * Idempotency is split across two guards so a delivery failure stays
 * recoverable:
 *
 * 1. Coupon creation is guarded by the event's existing discounts: the coupon
 *    code is a deterministic hash of the speaker id, so we skip
 *    `createEventDiscount` whenever that code already exists — a coupon is
 *    never minted twice for the same speaker.
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
 */
export async function handleSpeakerTicket(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  if (event.action !== Action.confirm) {
    return
  }

  if (!checkinGraphQLClient.isConfigured()) {
    console.log(
      '[speakerTicket] Checkin.no is not configured; skipping speaker ticket code issuance',
    )
    return
  }

  const eventId = event.conference.checkinEventId
  if (!eventId) {
    console.log(
      `[speakerTicket] Conference "${event.conference.title}" has no checkinEventId; skipping speaker ticket code issuance`,
    )
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    console.warn(
      `[speakerTicket] No speakers found for proposal ${event.proposal._id}; nothing to issue`,
    )
    return
  }

  // Fetch the event's existing discounts once so we can detect codes that were
  // already issued on a previous confirm. If this lookup fails we abort rather
  // than risk creating duplicates.
  let existingCodes: Set<string>
  try {
    const { discounts } = await getEventDiscounts(eventId)
    existingCodes = new Set(
      discounts
        .map((discount) => discount.triggerValue)
        .filter((code): code is string => !!code),
    )
  } catch (error) {
    console.error(
      `[speakerTicket] Failed to load existing discounts for event ${eventId}; skipping to avoid duplicate codes`,
      error,
    )
    return
  }

  const registrationUrl =
    event.conference.registrationLink || `https://${event.metadata.domain}`
  const eventUrl = `https://${event.metadata.domain}`

  // Speakers whose ticket email was already delivered on a previous run. These
  // are skipped entirely; a coupon without a marker is intentionally retried.
  const emailedSpeakerIds = new Set(
    (event.proposal.issuedSpeakerTickets ?? [])
      .map((entry) => entry.speakerId)
      .filter((id): id is string => !!id),
  )

  for (const speaker of event.speakers) {
    const email = speaker.email?.trim()
    if (!email) {
      console.warn(
        `[speakerTicket] Speaker ${speaker._id} has no email; skipping ticket issuance`,
      )
      continue
    }

    const code = speakerTicketCode(speaker._id)

    if (emailedSpeakerIds.has(speaker._id)) {
      console.log(
        `[speakerTicket] Ticket already issued and emailed for speaker ${speaker._id}; skipping`,
      )
      continue
    }

    // Create the coupon (guarded so it is never minted twice), then email it.
    // These are separate steps: an email failure must not roll back or hide the
    // coupon, and must leave the speaker recoverable (no delivery marker).
    if (!existingCodes.has(code)) {
      try {
        await createEventDiscount({
          eventId,
          discountCode: code,
          numberOfTickets: 1,
          ticketTypes: [],
        })
        // Guard against the same speaker appearing twice on one proposal.
        existingCodes.add(code)
      } catch (error) {
        console.error(
          `[speakerTicket] Failed to create checkin coupon for speaker ${speaker._id} on proposal ${event.proposal._id}; skipping`,
          error,
        )
        continue
      }
    } else {
      console.log(
        `[speakerTicket] Coupon ${code} already exists for speaker ${speaker._id} but was not yet emailed; resending`,
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

    // Guard against the same speaker appearing more than once on one proposal:
    // once emailed, skip any later occurrence in this same run so we neither
    // re-send nor append a duplicate-`_key` marker entry.
    emailedSpeakerIds.add(speaker._id)

    // Email delivered — record the marker so we never re-email this speaker.
    // A failure here only risks a duplicate email on a future re-trigger, which
    // is far less harmful than the send failure above, so we just log it.
    try {
      await recordSpeakerTicketEmailed(event.proposal._id, speaker._id, code)
    } catch (error) {
      console.error(
        `[speakerTicket] Emailed ticket code ${code} to ${email} but failed to record the delivery marker on proposal ${event.proposal._id}; a re-trigger may re-send`,
        error,
      )
    }

    console.log(
      `[speakerTicket] Issued and emailed speaker ticket code ${code} to ${email} for proposal ${event.proposal._id}`,
    )
  }
}
