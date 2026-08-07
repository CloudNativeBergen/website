import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { normalizeEmail } from '@/lib/speaker/email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

/**
 * Triggers a ticket invitation via the provider for each confirmed speaker.
 *
 * Runs on the `confirm` action only. A confirmed speaker always earns
 * their comp ticket.
 *
 * Speakers are de-duplicated by their normalized email address — dirty data
 * (duplicate speaker documents, the same speaker listed twice) must never earn
 * one person more than one ticket email.
 *
 * Email delivery is guarded by a per-speaker `issuedSpeakerTickets` marker
 * persisted on the proposal, written only after a successful send.
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

  if (eventRef.provider === 'tito') {
    console.log(
      `[speakerTicket] Ticketing provider "${provider.name}" is Tito, currently unsupported for automatic speaker tickets; skipping`,
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

  let speakerTicketId: number | null = null

  // Dynamically find the speaker ticket from the provider's raw ticket list
  try {
    const { tickets } = await provider.fetchPublicTicketTypes(eventRef)
    // Identify the speaker ticket by name and requiring an invitation code
    const speakerTicket = tickets.find(
      (t) => t.requiresInvitation && /speaker/i.test(t.name),
    )

    if (speakerTicket) {
      speakerTicketId = speakerTicket.id
      console.log(
        `[speakerTicket] Found speaker ticket (ID: ${speakerTicket.id}), triggering ticket invitation via provider`,
      )
    } else {
      console.warn(
        `[speakerTicket] Could not find a ticket named "speaker" that requires an invitation. Aborting speaker ticket issuance until it is created.`,
      )
      return
    }
  } catch (error) {
    console.error(
      `[speakerTicket] Failed to fetch public ticket types from provider`,
      error,
    )
    return
  }

  // Speakers whose ticket email was already delivered on a previous run,
  // keyed both by speaker id and by normalized email so a duplicate speaker
  // document for an already-served person is also skipped. These are skipped
  // entirely.
  const markers = event.proposal.issuedSpeakerTickets ?? []
  const emailedSpeakerIds = new Set(
    markers.map((entry) => entry.speakerId).filter((id): id is string => !!id),
  )
  const emailedEmails = new Set(
    markers.map((entry) => normalizeEmail(entry.email)).filter(Boolean),
  )
  // Normalized emails already handled in THIS run — one email, one send, no
  // matter how many speaker entries share it.
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

    if (speakerTicketId && provider.sendTicketInvitation) {
      try {
        await provider.sendTicketInvitation(
          speakerTicketId,
          [email],
          `Welcome as a speaker at ${event.conference.title}!`,
        )
      } catch (error) {
        console.error(
          `[speakerTicket] Failed to send ticket invitation via provider to speaker ${speaker._id} (${email}) on proposal ${event.proposal._id}.`,
          error,
        )
        continue
      }
    } else {
      console.warn(
        `[speakerTicket] Ticket invitations not supported by provider or no speaker ticket found. Skipping delivery marker for speaker ${speaker._id}.`,
      )
      continue
    }

    emailedSpeakerIds.add(speaker._id)
    emailedEmails.add(emailKey)

    try {
      await recordSpeakerTicketEmailed(event.proposal._id, {
        speakerId: speaker._id,
        email: emailKey,
      })
    } catch (error) {
      console.error(
        `[speakerTicket] Sent ticket invitation to speaker ${speaker._id} via provider but failed to record the delivery marker on proposal ${event.proposal._id}; a re-trigger may re-send`,
        error,
      )
    }

    console.log(
      `[speakerTicket] Triggered ticket invitation via provider for speaker ${speaker._id} on proposal ${event.proposal._id}`,
    )
  }
}
