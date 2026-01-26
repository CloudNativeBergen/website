import { fetchEventTickets } from '@/lib/tickets/checkin'
import type { EventTicket } from '@/lib/tickets/types'

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
  customerId: number
  eventId: number
  contactEmail?: string
}): Promise<WorkshopEligibilityResult> {
  const contactEmail = params.contactEmail || 'contact@cloudnativebergen.dev'

  try {
    const tickets = await fetchEventTickets(params.customerId, params.eventId)

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
