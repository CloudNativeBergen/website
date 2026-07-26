import {
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
} from '@/lib/tickets/provider'
import type { EventTicket } from '@/lib/tickets/types'
import { platformFallbackContact } from '@/lib/email/from'

const WORKSHOP_ELIGIBLE_CATEGORIES = [
  'Workshop + Conference (2 days)',
  'Sponsor discount (workshop upgrade)',
  'Speaker ticket',
]

export interface WorkshopEligibilityResult {
  isEligible: boolean
  tickets: EventTicket[]
  eligibleTickets: EventTicket[]
  reason?: string
}

export async function checkWorkshopEligibility(params: {
  userEmail: string
  /** The domain-resolved conference; carries the checkin binding + tenant org. */
  conference: ConferenceTicketingBinding
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

    const eligibleTickets = userTickets.filter((ticket) =>
      WORKSHOP_ELIGIBLE_CATEGORIES.includes(ticket.category),
    )

    if (eligibleTickets.length === 0 && userTickets.length > 0) {
      return {
        isEligible: false,
        tickets: userTickets,
        eligibleTickets: [],
        reason: `No valid workshop ticket found. Please upgrade your ticket to include workshop access, or contact us at ${contactEmail} if you believe this is an error.`,
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
