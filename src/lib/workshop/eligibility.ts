import type { ConferenceTicketingBinding } from '@/lib/tickets/provider'
import {
  fetchEventTicketCandidates,
  type TicketCandidate,
} from '@/lib/tickets/speakerStatus'
import { canonicalEmail } from '@/lib/speaker/email'
import {
  type TicketTypeRole,
  workshopAccessOf,
} from '@/lib/tickets/classification'
export {
  workshopAccessOf,
  type WorkshopAccess,
} from '@/lib/tickets/classification'
import { platformFallbackContact } from '@/lib/email/from'
import { clientReadUncached } from '@/lib/sanity/client'

/**
 * THE ACCESS FIELD, READ LIVE — the other half of "one rule".
 *
 * `workshopAccessOf` is one function, but the two callers were reaching it with
 * `ticketTypeRoles` from two different places: the ticket-sold webhook from
 * `getConferenceByCheckinEventId` (uncached, live dataset) and the `/workshop`
 * gate from `getConferenceForCurrentDomain`, whose read is `'use cache'`d for
 * up to `CONFERENCE_CACHE_LIFE` (hours). `grantsWorkshop` is edited in
 * Sanity Studio, which revalidates NOTHING, so the two could hold different
 * answers for the whole cache lifetime: the webhook mails a sign-in link for a
 * type the gate then refuses. Same rule, different inputs — the same drift this
 * change removes, one layer down.
 *
 * So the gate re-reads THIS ONE FIELD, uncached, at decision time. Both paths
 * then evaluate the live document.
 *
 * WHAT IT COSTS: one extra Sanity request — a single-document, single-field
 * projection — per page render AND per attendee procedure call (#1294), for a
 * caller who holds a ticket OF ANY TYPE for this event. A caller with no ticket
 * at all is refused before this read (see {@link checkWorkshopEligibility}),
 * so an account alone cannot spend the live-API quota by calling the
 * procedures in a loop; it takes an order at the ticketing provider under the
 * same address. A short-TTL cache was considered and rejected: any TTL is a
 * window in which an access decision is knowably wrong, and there is nothing to
 * invalidate it with while Studio is a writer.
 *
 * (`conference.ticketTypeRoles` stays the fallback: an unreadable document or a
 * failed read keeps today's answer rather than locking out every attendee
 * during a Sanity blip. The write path in `server/routers/tickets.ts` still
 * revalidates `conferenceTag`, so the cached copy is also correct for the
 * admin-driven edit; this read exists for the Studio-driven one.)
 */
async function liveTicketTypeRoles(conference: {
  _id?: string
  ticketTypeRoles?: readonly TicketTypeRole[] | null
}): Promise<readonly TicketTypeRole[] | null | undefined> {
  if (!conference._id) return conference.ticketTypeRoles

  try {
    const live = await clientReadUncached.fetch<{
      ticketTypeRoles?: TicketTypeRole[] | null
    } | null>(
      // groq-global-scoped: keyed on the id of the conference the caller already
      // resolved from the request domain — it reads no document the caller was
      // not already holding.
      `*[_id == $conferenceId][0]{ ticketTypeRoles }`,
      { conferenceId: conference._id },
      { cache: 'no-store' },
    )
    // No document (deleted, or a draft-only id): nothing fresher to say.
    if (!live) return conference.ticketTypeRoles
    return live.ticketTypeRoles
  } catch (error) {
    console.error('Workshop gate: live ticketTypeRoles read failed:', error)
    return conference.ticketTypeRoles
  }
}

export interface WorkshopEligibilityResult {
  isEligible: boolean
  tickets: TicketCandidate[]
  eligibleTickets: TicketCandidate[]
  reason?: string
}

export async function checkWorkshopEligibility(params: {
  userEmail: string
  /**
   * The domain-resolved conference; carries the checkin binding + tenant org,
   * and `ticketTypeRoles` — the tenant's own answer to which types grant
   * workshop access ({@link workshopAccessOf}). Absent roles ⇒ the bridge.
   */
  conference: ConferenceTicketingBinding & {
    /** Needed for the live re-read of the access field; see {@link liveTicketTypeRoles}. */
    _id?: string
    ticketTypeRoles?: readonly TicketTypeRole[] | null
  }
  contactEmail?: string
}): Promise<WorkshopEligibilityResult> {
  const contactEmail = params.contactEmail || platformFallbackContact()

  try {
    // THE SHARED 30-SECOND MEMO, not a fetch of our own. The whole-event read is
    // one slow uncached provider request, and this check now runs on every
    // attendee action (#1294), not only on page render — so a registration
    // opening would otherwise issue one per click. The memo holds the in-flight
    // promise, so a burst shares a single read.
    //
    // `allowStale`: while that read is refreshing, or failing, the gate decides
    // from the last list that arrived (capped; see the option). Seats are
    // first-come, so nobody should lose one to a refresh they happened to land
    // on, and a provider blip must not refuse every ticket holder. What it
    // costs: a ticket bought just now is refused until the next refresh lands,
    // and a refunded one is honoured until then.
    //
    // It still routes through the resolver (B7), so this tenant's per-org
    // provider key is honored instead of the platform env creds. `null` is an
    // unconfigured conference, a conference with no owning org, or a provider
    // error — all the same "unable to verify" refusal.
    const tickets = await fetchEventTicketCandidates(params.conference, {
      allowStale: true,
    })
    if (!tickets) {
      return {
        isEligible: false,
        tickets: [],
        eligibleTickets: [],
        reason: `Unable to verify workshop ticket at this time. Please try again later or contact us at ${contactEmail} for assistance.`,
      }
    }

    // Matched on the address as registered, trimmed and lowercased — the same
    // comparison as before, and never the NFKC-normalized `email`. NFKC folds
    // distinct mailboxes together (`oﬃce@x.test` → `office@x.test`), which is
    // fine for finding a speaker's ticket and wrong for deciding whose ticket
    // this is. `toLowerCase()` is Unicode-aware, so it is not a pure ASCII fold
    // (U+212A KELVIN SIGN → `k`); that is kept deliberately, because an
    // ASCII-only fold would stop `Øyvind@` matching `øyvind@`.
    const userEmail = canonicalEmail(params.userEmail)
    const userTickets = userEmail
      ? tickets.filter(
          (ticket) => canonicalEmail(ticket.registeredEmail) === userEmail,
        )
      : []

    // NO TICKET: refused here, before the roles read below. The answer cannot
    // depend on the roles, and that read is an uncached Sanity request — a
    // caller without a ticket must not be able to make us spend one per call.
    if (userTickets.length === 0) {
      return {
        isEligible: false,
        tickets: [],
        eligibleTickets: [],
        reason: `No ticket found for ${params.userEmail}. If you bought your ticket in the last few minutes, wait a minute and reload this page. If it was bought with a different email address, contact us at ${contactEmail}. Otherwise please purchase a workshop ticket to access workshops.`,
      }
    }

    // LIVE, not the cached copy on the conference the page resolved — see
    // {@link liveTicketTypeRoles}. The webhook reads the same document uncached,
    // so the two paths decide from the same state.
    const roles = await liveTicketTypeRoles(params.conference)
    const eligibleTickets = userTickets.filter(
      (ticket) => workshopAccessOf(ticket.category, roles) === 'granted',
    )

    if (eligibleTickets.length === 0) {
      // TWO DIFFERENT DENIALS, because they need two different actions.
      // "Upgrade your ticket" is wrong — and insulting to someone who already
      // paid — when the real cause is that this conference has a ticket type
      // nobody has classified. Name that, and name whose job it is.
      const unclassified = userTickets.find(
        (ticket) => workshopAccessOf(ticket.category, roles) === 'unclassified',
      )

      return {
        isEligible: false,
        tickets: userTickets,
        eligibleTickets: [],
        reason: unclassified
          ? `Your ticket type “${unclassified.category}” has not been set up for workshop access yet. This is a configuration gap on our side, not a problem with your ticket — please contact us at ${contactEmail} so an organizer can mark which ticket types include workshop access.`
          : `No valid workshop ticket found. Please upgrade your ticket to include workshop access, or contact us at ${contactEmail} if you believe this is an error.`,
      }
    }

    return {
      isEligible: true,
      tickets: userTickets,
      eligibleTickets,
    }
  } catch (error) {
    console.error('Failed to check workshop eligibility:', error)
    return {
      isEligible: false,
      tickets: [],
      eligibleTickets: [],
      reason: `Unable to verify workshop ticket at this time. Please try again later or contact us at ${contactEmail} for assistance.`,
    }
  }
}
