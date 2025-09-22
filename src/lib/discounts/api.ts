import { checkinQuery, checkinMutation } from '@/lib/tickets/graphql-client'
import type {
  EventDiscount,
  TicketType,
  EventDiscountsResponse,
  CreateEventDiscountInput,
  CreateEventDiscountResponse,
  DeleteEventDiscountResponse,
  ValidateDiscountCodeResponse,
} from './types'

export async function getEventDiscounts(
  eventId: number,
): Promise<{ discounts: EventDiscount[]; ticketTypes: TicketType[] }> {
  if (!eventId || eventId <= 0) {
    throw new Error('Valid event ID is required')
  }

  try {
    const query = `
      query findEventByIdQuery($id: Int!) {
        findEventById(id: $id) {
          id
          tickets {
            id
            name
            description
          }
          settings {
            discounts {
              trigger
              triggerValue
              type
              value
              affects
              affectsValue
              includeBooking
              modes
              tickets
              ticketsOnly
              times
              timesTotal
              startsAt
              stopsAt
            }
          }
        }
      }
    `

    const variables = { id: eventId }
    const responseData = await checkinQuery<EventDiscountsResponse>(
      query,
      variables,
    )

    const eventData = responseData.findEventById
    if (!eventData) {
      throw new Error(`Event with ID ${eventId} not found`)
    }

    return {
      discounts: eventData.settings?.discounts || [],
      ticketTypes: eventData.tickets || [],
    }
  } catch (error) {
    // Enhanced error context for debugging
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error('Failed to fetch event discounts:', {
      eventId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (errorMessage.toLowerCase().includes('authorize')) {
      throw new Error(
        `Access denied to event ${eventId}. This usually means:\n` +
          `1. The API credentials don't have access to this event\n` +
          `2. The event ID ${eventId} is incorrect or doesn't exist\n` +
          `3. The event belongs to a different organization\n` +
          `\nPlease verify the checkin_event_id in your conference settings.`,
      )
    }

    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch discounts for event ${eventId}: ${error.message}`,
      )
    }
    throw error
  }
}

export async function createEventDiscount(
  input: CreateEventDiscountInput,
): Promise<EventDiscount> {
  const { eventId, discountCode, numberOfTickets, ticketTypes } = input

  const ticketsParam =
    ticketTypes.length > 0
      ? `[${ticketTypes.map((id) => id).join(', ')}]`
      : '[]'

  const mutation = `
    mutation CreateEventDiscount {
      createEventDiscount(
        eventId: ${eventId}
        input: {
          trigger: coupon
          triggerValue: "${discountCode}"
          value: "100"
          affects: total
          affectsValue: ${numberOfTickets}
          includeBooking: false
          modes: default
          tickets: ${ticketsParam}
          ticketsOnly: false
          timesTotal: ${numberOfTickets}
          type: percent
        }
      ) {
        success
      }
    }
  `

  const responseData =
    await checkinMutation<CreateEventDiscountResponse>(mutation)

  const result = responseData.createEventDiscount
  if (!result.success) {
    throw new Error('Failed to create discount code')
  }

  return {
    trigger: 'coupon',
    type: 'percent',
    value: '100',
    triggerValue: discountCode,
    affects: 'first',
    includeBooking: false,
    affectsValue: numberOfTickets.toString(),
    modes: ['default'],
    tickets: ticketTypes,
    ticketsOnly: false,
    times: 0,
    timesTotal: 1,
  }
}

export async function deleteEventDiscount(
  eventId: number,
  discountCode: string,
): Promise<boolean> {
  const mutation = `
    mutation DeleteEventDiscount($eventId: Int!, $id: String!) {
      deleteEventDiscount(eventId: $eventId, id: $id) {
        success
      }
    }
  `

  const discountId = `coupon-${discountCode}`
  const variables = { eventId, id: discountId }

  const responseData = await checkinMutation<DeleteEventDiscountResponse>(
    mutation,
    variables,
  )

  const result = responseData.deleteEventDiscount
  return result.success
}

export async function validateDiscountCode(
  eventId: number,
  discountCode: string,
): Promise<{
  valid: boolean
  message: string
  usageCount?: number
  maxUsage?: number
}> {
  const query = `
    query ValidateEventCoupon($eventId: Int!, $coupon: String!) {
      eventCouponValidate(id: $eventId, coupon: $coupon) {
        valid
        message
        usageCount
        maxUsage
      }
    }
  `

  const variables = { eventId, coupon: discountCode }
  const responseData = await checkinQuery<ValidateDiscountCodeResponse>(
    query,
    variables,
  )

  return responseData.eventCouponValidate
}
