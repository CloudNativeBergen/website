import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import { checkinGraphQLClient } from '@/lib/tickets/graphql-client'
import { getEventDiscounts, createEventDiscount } from '@/lib/discounts/api'
import { speakerTicketCode } from '@/lib/speaker/ticket-code'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'

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
 * Idempotency: the coupon code is a deterministic hash of the speaker id, so a
 * re-confirm produces the same code. We list the event's existing discounts up
 * front and skip any speaker whose code is already present, so re-running never
 * mints a duplicate.
 *
 * Fire-and-forget: every failure is caught and logged. The event bus already
 * isolates handlers from one another; per-speaker try/catch additionally keeps
 * one speaker's failure from blocking the others.
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

  for (const speaker of event.speakers) {
    const email = speaker.email?.trim()
    if (!email) {
      console.warn(
        `[speakerTicket] Speaker ${speaker._id} has no email; skipping ticket issuance`,
      )
      continue
    }

    const code = speakerTicketCode(speaker._id)

    if (existingCodes.has(code)) {
      console.log(
        `[speakerTicket] Code ${code} already issued for speaker ${speaker._id}; skipping`,
      )
      continue
    }

    try {
      await createEventDiscount({
        eventId,
        discountCode: code,
        numberOfTickets: 1,
        ticketTypes: [],
      })

      // Guard against the same speaker appearing twice on one proposal.
      existingCodes.add(code)

      await sendSpeakerTicketEmail({
        speaker: { name: speaker.name, email },
        discountCode: code,
        registrationUrl,
        eventUrl,
        conference: event.conference,
      })

      console.log(
        `[speakerTicket] Issued and emailed speaker ticket code ${code} to ${email} for proposal ${event.proposal._id}`,
      )
    } catch (error) {
      console.error(
        `[speakerTicket] Failed to issue/email speaker ticket for speaker ${speaker._id} on proposal ${event.proposal._id}`,
        error,
      )
    }
  }
}
