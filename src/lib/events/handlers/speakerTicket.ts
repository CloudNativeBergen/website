import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { resolveTicketingProvider } from '@/lib/tickets/provider'
import type { PublicTicketType } from '@/lib/tickets/provider'
import { resolveSpeakerTicketType } from '@/lib/tickets/speakerStatus'
import { isAbsoluteHttpsUrl } from '@/lib/conference/validation'
import { normalizeEmail } from '@/lib/speaker/email'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

/**
 * Gives each confirmed speaker their complimentary ticket by asking the
 * ticketing provider to send them a personal invitation to the
 * invitation-gated "speaker" ticket type, then sending a heads-up email from
 * us telling them to look out for it.
 *
 * BOTH PATHS RUN. The provider sends its own per-person invitation (usage limit
 * 1), and we send our branded email carrying the conference's
 * `speakerRegistrationLink` — the shared Checkin invite link an organizer
 * pastes under Settings → Registration, because the API cannot return one
 * without also mailing its own invitation.
 *
 * WITH NO LINK CONFIGURED NOTHING IS SENT AT ALL, and the provider is never
 * contacted. Our email would carry no call to action and tell the speaker to
 * look for the provider's invitation — and in production that invitation was
 * accepted by the provider and then never delivered, leaving 35 speakers with a
 * message pointing at an email that does not exist. An invitation nobody is
 * told about is worse than none, so issuance refuses before minting one. A dead
 * link is worse still: the old code built `…/<eventId>?ticket=<id>`, a plain
 * store deep link with no invitation code, which against an invitation-gated
 * ticket type granted nothing.
 *
 * We never send our email unless the provider invitation actually went out, so
 * the "check your inbox" promise it makes is always true.
 *
 * Runs on the `confirm` action only. A confirmed speaker always earns
 * their comp ticket.
 *
 * Speakers are de-duplicated by their normalized email address — dirty data
 * (duplicate speaker documents, the same speaker listed twice) must never earn
 * one person more than one invitation.
 *
 * Delivery is guarded by a per-speaker `issuedSpeakerTickets` marker persisted
 * on the proposal, written only after a successful send.
 */
export interface SpeakerTicketIssuanceOptions {
  /**
   * Walk the whole flow — provider resolution, ticket-type lookup, dedupe —
   * and report what WOULD be sent without sending anything.
   *
   * The preview shown to an organizer before the bulk sweep is this same
   * function with this flag set, so the number they confirm cannot drift from
   * the number the send produces: there is one implementation of "who gets an
   * invitation", not two.
   */
  dryRun?: boolean
  /**
   * Restrict issuance to these speaker ids. Used by the per-speaker row action;
   * absent means every speaker on the proposal, as the sweep wants.
   */
  speakerIds?: string[]
  /**
   * Ignore an existing delivery marker. ONLY for the explicit per-speaker
   * "Send again" action, where an organizer has looked at an unclaimed
   * invitation and decided to re-send it. The sweep never sets this, so its
   * dedupe is unchanged.
   */
  resend?: boolean
  /**
   * Delivery markers from the speaker's OTHER confirmed talks.
   *
   * The marker is written on the proposal issuance ran for, so a speaker with
   * two confirmed talks carries it on one of them only. Reading
   * `event.proposal.issuedSpeakerTickets` alone therefore finds nothing when the
   * sweep reaches them through the other talk, and mails them again — while the
   * status column, which unions markers across talks, already says "Invited".
   * Callers that can see the whole programme pass the union here.
   */
  knownMarkers?: { speakerId?: string; email?: string }[]
}

export interface SpeakerTicketIssuanceResult {
  /** Invitations actually sent (in a dry run: invitations that would be sent). */
  sent: number
  /** Speakers whose provider invitation or heads-up email failed. */
  failed: number
  /** Speakers skipped because they already carry a delivery marker. */
  alreadyInvited: number
  /**
   * Issuance could not run at all — no speaker registration link on the conference,
   * no ticketing binding, no credentials, a provider that cannot send
   * invitations, an unreadable ticket-type list, or no invitation-gated
   * `/speaker/i` type to invite anyone to.
   *
   * SEPARATE FROM `sent: 0` ON PURPOSE. "Nobody is waiting" and "we could not
   * work out who is waiting" are the same zero, and the preview must not
   * report the second as the first — that would tell an organizer during an
   * outage that there is nobody left to chase.
   */
  blocked: boolean
  /**
   * WHY issuance is blocked, when the reason is one an organizer can fix
   * themselves. `'no-registration-link'` means the conference has no usable
   * speaker registration link; everything else leaves this undefined and reads as the
   * generic "ticketing could not be reached".
   *
   * Carried rather than inferred: the caller must be able to name the actual
   * cause in the UI, and "the provider is down" and "you have not pasted the
   * link yet" want different words and different actions.
   */
  blockedReason?: 'no-registration-link'
}

export async function handleSpeakerTicket(
  event: ProposalStatusChangeEvent,
  options: SpeakerTicketIssuanceOptions = {},
): Promise<SpeakerTicketIssuanceResult> {
  const result: SpeakerTicketIssuanceResult = {
    sent: 0,
    failed: 0,
    alreadyInvited: 0,
    blocked: false,
  }
  /** Issuance cannot run for this conference at all. */
  const blocked = () => ({ ...result, blocked: true })
  const onlySpeakers = options.speakerIds
    ? new Set(options.speakerIds)
    : undefined

  if (event.action !== Action.confirm) {
    return result
  }

  if (!event.speakers || event.speakers.length === 0) {
    console.warn(
      `[speakerTicket] No speakers found for proposal ${event.proposal._id}; nothing to issue`,
    )
    return result
  }

  // The organizer-configured Checkin "Send invitations" link for the speaker
  // ticket category. The API cannot hand one back without also sending its own
  // invitation, so it is pasted by hand under Settings → Registration.
  //
  // FIRST, BEFORE THE PROVIDER IS TOUCHED. Without it our email has no call to
  // action and can only tell the speaker to look for the provider's own
  // invitation — which in production Checkin accepted and never delivered. So
  // we refuse the whole run rather than mint provider invitations nobody is
  // told about: no invitation is recoverable, an unannounced one is not.
  //
  // VALIDATED HERE, not only at the tRPC boundary. The Sanity field is a bare
  // `type: 'string'` and scripts, migrations and imports write the document
  // directly, so a stored `"  "` or `http://…` would render as
  // `<a href="  ">Claim Your Speaker Ticket</a>`. Anything that is not an
  // absolute https URL is treated as NO LINK. Same rule as
  // `UpdateRegistrationSchema`, shared rather than restated.
  const configuredLink = event.conference.speakerRegistrationLink?.trim()
  const registrationUrl =
    configuredLink && isAbsoluteHttpsUrl(configuredLink)
      ? configuredLink
      : undefined
  if (!registrationUrl) {
    console.warn(
      `[speakerTicket] Conference "${event.conference.title}" has ` +
        (configuredLink
          ? 'a speakerRegistrationLink that is not an absolute https URL'
          : 'no speakerRegistrationLink') +
        '; refusing to issue speaker tickets. Nothing was sent and no provider ' +
        'invitation was created — set the link under Settings and run issuance again.',
    )
    return { ...result, blocked: true, blockedReason: 'no-registration-link' }
  }

  const ticketing = await resolveTicketingProvider(event.conference)
  if (!ticketing.configured) {
    console.log(
      `[speakerTicket] Conference "${event.conference.title}" has no ticketing binding; skipping speaker ticket code issuance`,
    )
    return blocked()
  }

  const { provider, eventRef } = ticketing

  if (eventRef.provider === 'tito') {
    console.log(
      `[speakerTicket] Ticketing provider "${provider.name}" is Tito, currently unsupported for automatic speaker tickets; skipping`,
    )
    return blocked()
  }

  if (!provider.isConfigured()) {
    console.log(
      `[speakerTicket] Ticketing provider "${provider.name}" has no API credentials; skipping speaker ticket invitation`,
    )
    return blocked()
  }

  // The whole flow hangs off the provider mailing the invitation: our own
  // email only tells the speaker to expect it. A provider that cannot send
  // one must abort here rather than promise an invitation nobody will send.
  const sendTicketInvitation = provider.sendTicketInvitation?.bind(provider)
  if (!sendTicketInvitation) {
    console.log(
      `[speakerTicket] Ticketing provider "${provider.name}" cannot send ticket invitations; skipping speaker ticket issuance`,
    )
    return blocked()
  }

  // Tenant-derived base URL (scheme-aware: http for localhost dev domains,
  // https otherwise) — never a hard-coded protocol or localhost fallback.
  const eventUrl = conferenceBaseUrl(event.conference)

  // Dynamically find the speaker ticket from the provider's raw ticket list,
  // identified by name and by requiring an invitation code.
  //
  // Resolved through the 30s per-event memo: the type belongs to the
  // conference, not the proposal, so a sweep over the whole programme asks the
  // provider once rather than once per talk — and the confirmation modal, which
  // dry-runs that same sweep, costs one lookup to open instead of one per talk.
  let speakerTicket: PublicTicketType | undefined
  try {
    speakerTicket = await resolveSpeakerTicketType(
      ticketing,
      event.conference.organization?._ref,
    )
  } catch (error) {
    console.error(
      `[speakerTicket] Failed to fetch public ticket types from provider`,
      error,
    )
    return blocked()
  }

  if (!speakerTicket) {
    console.warn(
      `[speakerTicket] Could not find a ticket named "speaker" that requires an invitation. Aborting speaker ticket issuance until it is created.`,
    )
    return blocked()
  }

  const speakerTicketId = speakerTicket.id

  // Speakers whose ticket email was already delivered on a previous run,
  // keyed both by speaker id and by normalized email so a duplicate speaker
  // document for an already-served person is also skipped. These are skipped
  // entirely.
  // This proposal's markers PLUS any the caller can see on the speaker's other
  // confirmed talks — a marker lives on the one proposal issuance ran for, so
  // this proposal alone is not the whole record of who has been invited.
  const markers = [
    ...(event.proposal.issuedSpeakerTickets ?? []),
    ...(options.knownMarkers ?? []),
  ]
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
    if (onlySpeakers && !onlySpeakers.has(speaker._id)) {
      continue
    }
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

    const markedForThisSpeaker = emailedSpeakerIds.has(speaker._id)
    const markedForThisAddress = emailedEmails.has(emailKey)

    if (markedForThisSpeaker || markedForThisAddress) {
      // `resend` overrides ONLY a marker belonging to the requested speaker
      // document. An address invited under a DIFFERENT speaker id is still one
      // person who already has their invitation — and that is exactly the row
      // an organizer is tempted to click, because `speakerTicketStatus` keys
      // `invited` on the speaker id and shows the duplicate document as "Not
      // invited". Honouring the button there would mail the same address twice.
      if (!(options.resend && markedForThisSpeaker)) {
        result.alreadyInvited++
        console.log(
          `[speakerTicket] Ticket already issued and emailed for speaker ${speaker._id}; skipping`,
        )
        continue
      }
    }

    // Nothing below this line runs in a dry run: the count is decided by the
    // same guards the real send obeys, so a preview cannot promise a send the
    // sweep would skip.
    if (options.dryRun) {
      result.sent++
      continue
    }

    // The provider invitation carries the actual claim link, so it must land
    // before we email the speaker to go look for it.
    try {
      await sendTicketInvitation(
        speakerTicketId,
        [email],
        `Welcome as a speaker at ${event.conference.title}!`,
      )
    } catch (error) {
      console.error(
        `[speakerTicket] Failed to send ticket invitation via provider to speaker ${speaker._id} (${email}) on proposal ${event.proposal._id}. ` +
          `No heads-up email was sent. Re-trigger issuance.`,
        error,
      )
      result.failed++
      continue
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
      result.failed++
      continue
    }

    result.sent++
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

  return result
}
