import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { normalizeEmail } from '@/lib/speaker/email'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

/**
 * Sends each confirmed speaker an email with a secret link to the free
 * speaker ticket category in the conference's ticketing provider.
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

  // Tenant-derived base URL (scheme-aware: http for localhost dev domains,
  // https otherwise) — never a hard-coded protocol or localhost fallback.
  const eventUrl = conferenceBaseUrl(event.conference)
  let registrationUrl = event.conference.registrationLink || eventUrl
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
      registrationUrl = `https://event.checkin.no/${eventId}?ticket=${speakerTicket.id}`
      console.log(
        `[speakerTicket] Found speaker ticket (ID: ${speakerTicket.id}), using direct link`,
      )
    } else {
      console.warn(
        `[speakerTicket] Could not find a ticket named "speaker" that requires an invitation. Falling back to default registration link.`,
      )
    }
  } catch (error) {
    console.error(
      `[speakerTicket] Failed to fetch public ticket types from provider`,
      error,
    )
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
    }

    try {
      await sendSpeakerTicketEmail({
        speaker: { name: speaker.name, email },
        registrationUrl,
        eventUrl,
        conference: event.conference,
      })
    } catch (error) {
      console.error(
        `[speakerTicket] Failed to send ticket email to speaker ${speaker._id} (${email}) on proposal ${event.proposal._id}. ` +
          `The speaker has NOT received their link. Re-trigger issuance.`,
        error,
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
        `[speakerTicket] Emailed ticket link to speaker ${speaker._id} but failed to record the delivery marker on proposal ${event.proposal._id}; a re-trigger may re-send`,
        error,
      )
    }

    console.log(
      `[speakerTicket] Issued and emailed speaker ticket link to speaker ${speaker._id} for proposal ${event.proposal._id}`,
    )
  }
}
