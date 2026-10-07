import 'server-only'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import type { ConferenceTenant } from '@/lib/features/platform-default'
import type { ConferenceTicketingBinding } from '@/lib/tickets/provider'
import type { TicketTypeRole } from '@/lib/tickets/classification'
import type { TicketCandidate } from '@/lib/tickets/speakerStatus'
import { platformFallbackContact } from '@/lib/email/from'
import { checkWorkshopEligibility } from './eligibility'

/**
 * THE ONE DECISION for "may this attendee use the workshop portal for this
 * conference" (#1294). The `/workshop` page and every attendee procedure
 * (`workshop.signup`, `workshop.cancelSignup`, `workshop.getMySignups`) call
 * this and nothing else, so the page and the API cannot disagree.
 *
 * It used to be decided on the page only. The procedures accepted any signed-in
 * WorkOS session, and a WorkOS account is free to create — it proves an email
 * address, not a ticket.
 *
 * ORDER, cheapest first, each one fail-closed:
 *
 *  1. Workshops are enabled for the conference's organization.
 *  2. The attendee's email is VERIFIED. The ticket is matched on the email, so
 *     an unverified address would let anyone claim another holder's ticket by
 *     typing it into the sign-up form.
 *  3. A ticket for this conference whose category grants workshop access
 *     (`checkWorkshopEligibility` → `workshopAccessOf`). A conference with no
 *     ticketing configured REFUSES here; it does not skip the check.
 *
 * The caller must already hold the domain-resolved conference and a WorkOS
 * identity taken from the sealed session — never client input.
 */
export type WorkshopPortalDenial =
  'feature-disabled' | 'email-unverified' | 'no-eligible-ticket'

export type WorkshopPortalAccess =
  | { allowed: true }
  | {
      allowed: false
      denial: WorkshopPortalDenial
      /** Attendee-facing explanation; safe to show as-is. */
      reason: string
      /** The attendee's own tickets, when the ticket check got that far. */
      tickets: TicketCandidate[]
    }

export async function decideWorkshopPortalAccess(params: {
  conference: ConferenceTenant &
    ConferenceTicketingBinding & {
      _id?: string
      ticketTypeRoles?: readonly TicketTypeRole[] | null
      contactEmail?: string
    }
  user: { email: string; emailVerified: boolean }
}): Promise<WorkshopPortalAccess> {
  const { conference, user } = params
  const contactEmail = conference.contactEmail || platformFallbackContact()

  if (!(await isWorkshopsEnabledForConference(conference))) {
    return {
      allowed: false,
      denial: 'feature-disabled',
      reason: 'Workshop signup is not available for this conference.',
      tickets: [],
    }
  }

  if (user.emailVerified !== true) {
    return {
      allowed: false,
      denial: 'email-unverified',
      reason: `Your email address ${user.email} has not been verified, so we cannot match it to a ticket. Please contact us at ${contactEmail} for assistance.`,
      tickets: [],
    }
  }

  const eligibility = await checkWorkshopEligibility({
    userEmail: user.email,
    conference,
    contactEmail,
  })
  if (!eligibility.isEligible) {
    return {
      allowed: false,
      denial: 'no-eligible-ticket',
      reason:
        eligibility.reason ??
        `No valid workshop ticket found. Contact us at ${contactEmail} if you believe this is an error.`,
      tickets: eligibility.tickets,
    }
  }

  return { allowed: true }
}
