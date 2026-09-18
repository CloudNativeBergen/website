import {
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
} from '@/lib/tickets/provider'
import { typeKey, type TicketTypeRole } from '@/lib/tickets/classification'
import type { EventTicket } from '@/lib/tickets/types'
import { platformFallbackContact } from '@/lib/email/from'

/**
 * THE MIGRATION BRIDGE, and nothing else.
 *
 * These three names were hardcoded in TWO places — here and in the
 * ticket-sold webhook — as the rule for who may enter `/workshop` and who is
 * emailed the sign-in instructions. They are the FIRST conference's Checkin
 * type names: vendor-owned, renameable in the vendor UI, and meaningless to
 * every other tenant. A rename broke the two copies independently and
 * silently (the gate told a paying attendee to upgrade; the webhook simply
 * stopped mailing). `@/lib/tickets/entitlement` is the same bug, on the
 * counting path, written up in full.
 *
 * It survives ONLY so that deploying the configurable rule does not lock out
 * every existing attendee of every conference that has not declared anything
 * yet. It is consulted exactly when a conference declares NO
 * workshop-granting type, and it is never unioned with a declared set.
 *
 * DELETE IT when every conference with workshops enabled has at least one
 * `ticketTypeRoles` entry with `grantsWorkshop: true`. At that point the
 * legacy branch is dead code for every tenant, and removing it turns an
 * undeclared conference into an honest `'unclassified'` denial instead of a
 * guess made from another conference's vocabulary.
 */
const LEGACY_WORKSHOP_CATEGORIES = [
  'Workshop + Conference (2 days)',
  'Sponsor discount (workshop upgrade)',
  'Speaker ticket',
]

/**
 * What a ticket TYPE says about workshop access.
 *
 *  - `granted`      — this type grants it.
 *  - `denied`       — this type does not. The holder needs a different ticket.
 *  - `unclassified` — nobody at this conference has said either way. The
 *                     holder may well be entitled; an ORGANIZER has to answer.
 *                     Only reachable on a conference that HAS declared roles,
 *                     so it can never be handed to an attendee of a conference
 *                     still running on the bridge above.
 */
export type WorkshopAccess = 'granted' | 'denied' | 'unclassified'

/**
 * THE ONE RULE. The `/workshop` gate and the ticket-sold webhook both call
 * this and nothing else, so they cannot drift apart again.
 *
 * A CONFIGURED CONFERENCE IS AUTHORITATIVE: the moment any type declares
 * `grantsWorkshop: true`, the declared set is the whole answer. It is
 * deliberately NOT unioned with {@link LEGACY_WORKSHOP_CATEGORIES} — a union
 * would keep a renamed type working through the literal, which is precisely
 * the silent breakage this replaces.
 *
 * Names match the way `classifyTicket` matches them ({@link typeKey}: case-
 * and whitespace-insensitive), never by `includes` and never by `===`.
 *
 * Pure: no I/O. Callers pass `conference.ticketTypeRoles`.
 */
export function workshopAccessOf(
  ticketTypeName: string | null | undefined,
  ticketTypeRoles?: readonly TicketTypeRole[] | null,
): WorkshopAccess {
  const key = typeKey(ticketTypeName)
  // A ticket whose type the provider did not name cannot be matched against
  // anything — and must not match a malformed role entry with an empty name.
  if (!key) return 'denied'

  const roles = ticketTypeRoles ?? []
  const declaresWorkshop = roles.some((r) => r.grantsWorkshop === true)

  if (!declaresWorkshop) {
    // Unconfigured: today's behaviour, exactly. No `unclassified` from here —
    // an attendee of a bridge conference who simply lacks a workshop ticket
    // must not be told about our configuration.
    return LEGACY_WORKSHOP_CATEGORIES.some((name) => typeKey(name) === key)
      ? 'granted'
      : 'denied'
  }

  const role = roles.find((r) => typeKey(r.typeName) === key)
  if (!role) return 'unclassified'
  return role.grantsWorkshop === true ? 'granted' : 'denied'
}

export interface WorkshopEligibilityResult {
  isEligible: boolean
  tickets: EventTicket[]
  eligibleTickets: EventTicket[]
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
    ticketTypeRoles?: readonly TicketTypeRole[] | null
  }
  contactEmail?: string
}): Promise<WorkshopEligibilityResult> {
  const contactEmail = params.contactEmail || platformFallbackContact()

  try {
    // Route through the resolver (B7) so this tenant's per-org Checkin key is
    // honored instead of the platform env creds. An unconfigured conference
    // soft-fails to the same "unable to verify" result as a provider error.
    const ticketing = await resolveTicketingProvider(params.conference)
    if (!ticketing.configured) {
      return {
        isEligible: false,
        tickets: [],
        eligibleTickets: [],
        reason: `Unable to verify workshop ticket at this time. Please try again later or contact us at ${contactEmail} for assistance.`,
      }
    }
    const tickets = await ticketing.provider.fetchEventTickets(
      ticketing.eventRef,
    )

    const userTickets = tickets.filter(
      (ticket) =>
        ticket.crm.email.toLowerCase() === params.userEmail.toLowerCase(),
    )

    const roles = params.conference.ticketTypeRoles
    const eligibleTickets = userTickets.filter(
      (ticket) => workshopAccessOf(ticket.category, roles) === 'granted',
    )

    if (eligibleTickets.length === 0 && userTickets.length > 0) {
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

    if (eligibleTickets.length === 0 && userTickets.length === 0) {
      return {
        isEligible: false,
        tickets: [],
        eligibleTickets: [],
        reason: `No ticket found for your email address. Please purchase a workshop ticket to access workshops, or contact us at ${contactEmail} if you have any questions.`,
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
