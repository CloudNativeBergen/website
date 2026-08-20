import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  EventTicket,
  EventTicketWithoutDate,
  CheckinPayOrder,
  EventTicketsResponse,
  CheckinPayOrderResponse,
  EventOrderUser as EventOrder,
  AllEventOrderUsersResponse,
} from '@/lib/tickets/types'
import type {
  EventDiscount,
  TicketType,
  EventDiscountsResponse,
  CreateEventDiscountInput,
  CreateEventDiscountResponse,
  DeleteEventDiscountResponse,
} from '@/lib/discounts/types'
import type {
  EventRef,
  PublicEventInfo,
  PublicTicketType,
  TicketingProvider,
  TicketingProviderCredentials,
  WebhookVerifyResult,
  CheckinWebhookPayload,
  CheckinOrderCreatedData,
} from './types'

/** Default Checkin.no GraphQL endpoint. Overridable via injected credentials. */
export const CHECKIN_API_URL = 'https://api.checkin.no/graphql'

/**
 * Narrow a (possibly Tito-shaped) {@link EventRef} to Checkin's customer+event
 * pair. A ref without `provider`, or `provider: 'checkin'`, is Checkin; a Tito
 * ref reaching this provider is a wiring bug (the resolver picks the provider
 * from the same field), so it throws loudly.
 */
function checkinRef(ref: EventRef): { customerId: number; eventId: number } {
  if (ref.provider === 'tito') {
    throw new Error(
      'CheckinProvider received a Tito event reference — check the resolver wiring',
    )
  }
  return { customerId: ref.customerId, eventId: ref.eventId }
}

interface GraphQLError {
  message: string
}

interface GraphQLResponse<T> {
  data?: T
  errors?: GraphQLError[]
}

interface GraphQLRequest {
  query: string
  variables?: Record<string, unknown>
}

// Warn at most once per process about missing credentials, mirroring the old
// module-scope singleton (which warned once at import) now that providers are
// constructed per request.
let hasWarnedAboutCredentials = false

/**
 * Checkin.no implementation of {@link TicketingProvider}.
 *
 * Absorbs the former module-scope `CheckinGraphQLClient` as instance methods.
 * Credentials are injected (no `process.env` reads here); the request boundary
 * assembles them — see `resolveTicketingProvider` / `platformCheckinCredentials`.
 */
export class CheckinProvider implements TicketingProvider {
  readonly name = 'Checkin.no'

  private readonly apiUrl: string
  private readonly apiKey: string | undefined
  private readonly apiSecret: string | undefined
  private readonly webhookSecret: string | undefined

  constructor(credentials: TicketingProviderCredentials) {
    this.apiUrl = credentials.apiUrl ?? CHECKIN_API_URL
    this.apiKey = credentials.apiKey
    this.apiSecret = credentials.apiSecret
    this.webhookSecret = credentials.webhookSecret

    if ((!this.apiKey || !this.apiSecret) && !hasWarnedAboutCredentials) {
      hasWarnedAboutCredentials = true
      console.warn(
        '⚠️  Checkin API credentials not found. Check CHECKIN_API_KEY and CHECKIN_API_SECRET environment variables.',
      )
      console.warn(
        '   Without these credentials, ticket and discount management features will not work.',
      )
    }
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret)
  }

  // ── GraphQL transport (formerly CheckinGraphQLClient) ─────────────

  private async execute<T>(request: GraphQLRequest): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error(
        'Checkin.no API is not configured. Please check CHECKIN_API_KEY and CHECKIN_API_SECRET environment variables.',
      )
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
        // A stalled Checkin.no upstream must never hang server rendering
        // indefinitely (e.g. the homepage price fetch); callers handle the
        // resulting rejection via their existing error paths
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        let errorMessage = `GraphQL request failed: ${response.status} ${response.statusText}`

        try {
          const errorBody = await response.text()
          if (errorBody) {
            errorMessage += ` - ${errorBody}`
          }
        } catch {}

        console.error(errorMessage)
        throw new Error(errorMessage)
      }

      const responseData: GraphQLResponse<T> = await response.json()

      if (responseData.errors && responseData.errors.length > 0) {
        const errorMessage = responseData.errors
          .map((e) => e.message)
          .join('; ')

        // Enhanced error logging for debugging
        console.error('GraphQL Request Failed:', {
          errors: responseData.errors,
          query: request.query.substring(0, 200) + '...',
          variables: request.variables,
          url: this.apiUrl,
          hasAuth: !!(this.apiKey && this.apiSecret),
          apiKeyLength: this.apiKey?.length || 0,
          secretLength: this.apiSecret?.length || 0,
        })

        const hasAuthError = responseData.errors.some(
          (error) =>
            error.message.toLowerCase().includes('authorize') ||
            error.message.toLowerCase().includes('unauthorized') ||
            error.message.toLowerCase().includes('forbidden'),
        )

        if (hasAuthError) {
          throw new Error(
            `Access denied: ${errorMessage}. This usually means:\\n` +
              `1. API credentials don't have access to this event/organization\\n` +
              `2. The event ID or customer ID is incorrect\\n` +
              `3. API credentials are invalid or expired\\n` +
              `\\nPlease verify CHECKIN_API_KEY, CHECKIN_API_SECRET, and the event configuration.`,
          )
        }

        throw new Error(`GraphQL errors: ${errorMessage}`)
      }

      if (!responseData.data) {
        console.error('Invalid GraphQL response - no data:', responseData)
        throw new Error('Invalid GraphQL response - no data received')
      }

      return responseData.data
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(
          `Network error connecting to Checkin.no API: ${error.message}`,
        )
      }
      throw error
    }
  }

  private async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return this.execute<T>({ query, variables })
  }

  private async mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return this.execute<T>({ query: mutation, variables })
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey && this.apiSecret) {
      headers.Authorization = `Basic ${this.apiKey}:${this.apiSecret}`
    }

    return headers
  }

  // ── Tickets & orders ──────────────────────────────────────────────

  async fetchEventTickets(eventRef: EventRef): Promise<EventTicket[]> {
    const { customerId, eventId } = checkinRef(eventRef)
    if (!customerId || customerId <= 0) {
      throw new Error('Valid customer ID is required')
    }
    if (!eventId || eventId <= 0) {
      throw new Error('Valid event ID is required')
    }

    try {
      const [tickets, orderUsers] = await Promise.all([
        this.fetchEventTicketsRaw(customerId, eventId),
        this.fetchAllEventOrders(customerId, eventId),
      ])

      const orderDateMap = new Map<number, string>()
      orderUsers.forEach((orderUser) => {
        orderDateMap.set(orderUser.orderId, orderUser.createdAt)
      })

      return tickets.map((ticket): EventTicket => ({
        ...ticket,
        order_date: orderDateMap.get(ticket.order_id) || '',
      }))
    } catch (error) {
      console.error('Failed to fetch event tickets with dates:', error)
      throw new Error(
        `Failed to fetch tickets with dates for event ${eventId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async fetchEventTicketsRaw(
    customerId: number,
    eventId: number,
  ): Promise<EventTicketWithoutDate[]> {
    if (!customerId || customerId <= 0) {
      throw new Error('Valid customer ID is required')
    }
    if (!eventId || eventId <= 0) {
      throw new Error('Valid event ID is required')
    }

    const query = `
    query FetchEventTickets($customerId: Int!, $eventId: Int!) {
      eventTickets(customer_id: $customerId, id: $eventId) {
        id
        order_id
        category
        customer_name
        sum
        sum_left
        coupon
        discount
        fields {
          key
          value
        }
        crm {
          first_name
          last_name
          email
        }
      }
    }
  `

    const variables = { customerId, eventId }
    const responseData = await this.query<EventTicketsResponse>(
      query,
      variables,
    )

    return responseData.eventTickets || []
  }

  async fetchOrderPaymentDetails(orderId: number): Promise<CheckinPayOrder> {
    const query = `
    query FindCheckinPayOrderByID($id: Int!) {
      findCheckinPayOrderByID(id: $id, type: EVENT) {
        id
        belongsTo
        orderId
        orderType
        documentType
        kid
        invoiceReference
        archivedAt
        createdAt
        invoiceDate
        deliveryDate
        dueAt
        contactCrm {
          firstName
          lastName
          email {
            email
          }
        }
        billingCrm {
          firstName
          lastName
          email {
            email
          }
        }
        currency
        country
        paymentMethod
        paymentStatus
        actionRequired
        debtStatus
        debtLastUpdatedAt
        sum
        sumLeft
        paid
        sumVat
      }
    }
  `

    const variables = { id: orderId }
    const responseData = await this.query<CheckinPayOrderResponse>(
      query,
      variables,
    )

    return responseData.findCheckinPayOrderByID
  }

  private async fetchEventOrders(
    customerId: number,
    eventId?: number,
    options: {
      offset?: number
      length?: number
      reportFilters?: Array<{
        rule: 'AND' | 'OR' | 'AND_NOT' | 'OR_NOT'
        conditions?: Array<{
          rule: 'AND' | 'OR' | 'AND_NOT' | 'OR_NOT'
          field: string
          operator:
            | 'EQUALS'
            | 'NOT_EQUALS'
            | 'GREATER_THAN'
            | 'LESS_THAN'
            | 'GREATER_THAN_OR_EQUAL'
            | 'LESS_THAN_OR_EQUAL'
            | 'CONTAINS'
            | 'STARTS_WITH'
          value: string
        }>
      }>
    } = {},
  ): Promise<EventOrder[]> {
    if (!customerId || customerId <= 0) {
      throw new Error('Valid customer ID is required')
    }

    const { offset = 0, length = 1000, reportFilters = [] } = options

    const filters = eventId
      ? [
          {
            rule: 'AND',
            conditions: [
              {
                rule: 'AND',
                field: 'EVENT_ID',
                operator: 'EQUALS',
                value: eventId.toString(),
              },
            ],
          },
        ]
      : reportFilters

    try {
      const query = `
      query allEventOrderUsers(
        $customerId: Int!
        $offset: Int
        $length: Int
        $reportFilters: [EventOrderUserReportFilterInput!]
      ) {
        allEventOrderUsers(
          customerId: $customerId
          offset: $offset
          length: $length
          reportFilters: $reportFilters
        ) {
          records
          offset
          length
          data {
            id
            orderId
            eventId
            createdAt
          }
          pageInfo {
            hasNextPage
          }
          cachedAt
        }
      }
    `

      const variables = {
        customerId,
        offset,
        length,
        reportFilters: filters.length > 0 ? filters : undefined,
      }

      const responseData = await this.query<AllEventOrderUsersResponse>(
        query,
        variables,
      )

      if (!responseData.allEventOrderUsers?.data) {
        console.warn('No event order users found in response')
        return []
      }

      return responseData.allEventOrderUsers.data
    } catch (error) {
      console.error('Failed to fetch event order users:', error)
      throw new Error(
        `Failed to fetch event order users: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async fetchAllEventOrders(
    customerId: number,
    eventId: number,
    batchSize: number = 1000,
  ): Promise<EventOrder[]> {
    if (!customerId || customerId <= 0) {
      throw new Error('Valid customer ID is required')
    }

    if (!eventId || eventId <= 0) {
      throw new Error('Valid event ID is required')
    }

    const allTickets: EventOrder[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      try {
        const batch = await this.fetchEventOrders(customerId, eventId, {
          offset,
          length: batchSize,
        })

        if (batch.length === 0) {
          hasMore = false
        } else {
          allTickets.push(...batch)
          offset += batchSize

          if (batch.length < batchSize) {
            hasMore = false
          }
        }
      } catch (error) {
        console.error(`Failed to fetch batch at offset ${offset}:`, error)
        throw error
      }
    }

    return allTickets
  }

  // ── Public ticket types ───────────────────────────────────────────

  async fetchPublicTicketTypes(
    event: EventRef | number,
  ): Promise<{ event: PublicEventInfo; tickets: PublicTicketType[] }> {
    // Accept the historical bare-number form or a provider-shaped ref; Checkin's
    // public lookup only needs the event id.
    const eventId =
      typeof event === 'number' ? event : checkinRef(event).eventId
    const query = `
  query FindEvent($id: Int!) {
    findEventById(id: $id) {
      id
      name
      registrationOpensAt
      registrationClosesAt
      currencies
      tickets {
        id
        name
        type
        description
        price {
          price
          vat
          description
          key
        }
        available
        requiresInvitation
        visibleStartsAt
        visibleEndsAt
        position
      }
    }
  }
`

    const response = await this.query<{
      findEventById: {
        id: number
        name: string
        registrationOpensAt: string | null
        registrationClosesAt: string | null
        currencies: string[]
        tickets: PublicTicketType[]
      }
    }>(query, { id: eventId })

    const eventData = response.findEventById
    if (!eventData) {
      throw new Error(`Event with ID ${eventId} not found`)
    }

    return {
      event: {
        id: eventData.id,
        name: eventData.name,
        registrationOpensAt: eventData.registrationOpensAt,
        registrationClosesAt: eventData.registrationClosesAt,
        currencies: eventData.currencies,
      },
      tickets: eventData.tickets || [],
    }
  }

  // ── Discounts ─────────────────────────────────────────────────────

  async listDiscounts(
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
      const responseData = await this.query<EventDiscountsResponse>(
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
      const errorMessage =
        error instanceof Error ? error.message : String(error)

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

  async createDiscount(
    input: CreateEventDiscountInput,
  ): Promise<EventDiscount> {
    const { eventId, discountCode, numberOfTickets, ticketTypes } = input

    // GraphQL VARIABLES, not string interpolation: discountCode and ticketTypes
    // are user-supplied — interpolating them into the mutation string allowed
    // crafted values (quotes/braces) to inject arbitrary GraphQL. The enum-typed
    // literals (trigger/affects/modes/type) stay inline; every user value rides
    // a typed variable. Defense in depth: numeric inputs are coerced/validated.
    const safeEventId = Math.trunc(eventId)
    const safeCount = Math.trunc(numberOfTickets)
    if (!Number.isFinite(safeEventId) || !Number.isFinite(safeCount)) {
      throw new Error('createDiscount: eventId/numberOfTickets must be numbers')
    }
    const safeTickets = ticketTypes.map((id) => Math.trunc(Number(id)))
    if (safeTickets.some((n) => !Number.isFinite(n))) {
      throw new Error('createDiscount: ticketTypes must be numeric ids')
    }

    const mutation = `
    mutation CreateEventDiscount($eventId: Int!, $triggerValue: String!, $affectsValue: Int!, $tickets: [Int!]!, $timesTotal: Int!) {
      createEventDiscount(
        eventId: $eventId
        input: {
          trigger: coupon
          triggerValue: $triggerValue
          value: "100"
          affects: total
          affectsValue: $affectsValue
          includeBooking: false
          modes: default
          tickets: $tickets
          ticketsOnly: false
          timesTotal: $timesTotal
          type: percent
        }
      ) {
        success
      }
    }
  `

    const responseData = await this.mutate<CreateEventDiscountResponse>(
      mutation,
      {
        eventId: safeEventId,
        triggerValue: discountCode,
        affectsValue: safeCount,
        tickets: safeTickets,
        timesTotal: safeCount,
      },
    )

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
      // Mirror what the mutation actually sent — the admin UI displays this as
      // the usage limit; hardcoding 1 made fresh discounts look nearly used up.
      timesTotal: safeCount,
    }
  }

  async deleteDiscount(
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

    const responseData = await this.mutate<DeleteEventDiscountResponse>(
      mutation,
      variables,
    )

    const result = responseData.deleteEventDiscount
    return result.success
  }

  // ── Invitations ───────────────────────────────────────────────────

  async sendTicketInvitation(
    ticketId: number,
    emails: string[],
    message?: string,
  ): Promise<void> {
    const mutation = `
      mutation sendEventInvitation(
        $invites: [EventInvitationInviteInput!]!
        $emails: [EmailAddress!]!
        $message: String
      ) {
        sendEventInvitation(
          invites: $invites
          emails: $emails
          message: $message
        ) {
          success
        }
      }
    `

    const variables = {
      invites: [
        {
          itemType: 'TICKET',
          id: ticketId,
          usageLimit: 1,
        },
      ],
      emails,
      message,
    }

    let responseData: { sendEventInvitation: { success: boolean } }
    try {
      responseData = await this.mutate<{
        sendEventInvitation: { success: boolean }
      }>(mutation, variables)
    } catch (error) {
      console.error('Failed to send event invitation via checkin:', error)
      throw new Error(
        `Failed to send event invitation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }

    // Checkin can answer `{ success: false }` with no GraphQL errors at all.
    // Treating that as sent would leave the speaker waiting for an invitation
    // that never arrives, so fail loudly and let the caller retry.
    if (!responseData?.sendEventInvitation?.success) {
      console.error(
        `Checkin reported failure sending event invitation for ticket ${ticketId}`,
      )
      throw new Error(
        `Failed to send event invitation: Checkin reported success=false for ticket ${ticketId}`,
      )
    }
  }

  // ── Webhooks ──────────────────────────────────────────────────────

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerifyResult {
    if (!this.webhookSecret) {
      return { verified: false, reason: 'not-configured' }
    }

    const signature = headers.get('checkin-signature')
    if (!signature) {
      return { verified: false, reason: 'invalid-signature' }
    }

    try {
      // Checkin signs the HMAC over the `data` field of the payload, not the
      // full envelope. Re-parse the raw body to recover it exactly.
      const payload = JSON.parse(rawBody) as CheckinWebhookPayload
      const dataString = JSON.stringify(payload.data)
      const expectedSignature = createHmac('sha256', this.webhookSecret)
        .update(dataString)
        .digest('hex')

      const ok = timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
      return ok
        ? { verified: true }
        : { verified: false, reason: 'invalid-signature' }
    } catch (error) {
      console.error('Checkin webhook signature verification failed:', error)
      return { verified: false, reason: 'invalid-signature' }
    }
  }

  parseOrderCreated(
    payload: CheckinWebhookPayload,
  ): CheckinOrderCreatedData | null {
    return parseCheckinOrderCreated(payload)
  }
}

/**
 * Is this envelope an order-created delivery, and what does it carry?
 *
 * PURE, AND DELIBERATELY NOT A METHOD. The ticket-sold webhook has to read the
 * event name and the claimed `eventId` BEFORE it knows which tenant the delivery
 * is for and therefore before it has any credentials (#886). Doing that through
 * a provider meant constructing one with an empty credential bag, and
 * {@link CheckinProvider}'s constructor warns ONCE PER PROCESS about missing
 * `CHECKIN_API_KEY`/`CHECKIN_API_SECRET`. That did two bad things: it fired a
 * false alarm on the first webhook of every instance even when fully configured,
 * and — worse — it CONSUMED the once-per-process flag, so a later, genuinely
 * unconfigured construction logged nothing. Since #886 made an unset webhook
 * secret answer 401 rather than 500 (to close an existence oracle), that log
 * line is the ONLY remaining signal that the secret is missing; polluting the
 * channel and then silencing it is exactly backwards.
 *
 * `CheckinProvider.parseOrderCreated` delegates here, so there is one
 * implementation and the pre-authentication path constructs nothing.
 */
export function parseCheckinOrderCreated(
  payload: CheckinWebhookPayload,
): CheckinOrderCreatedData | null {
  if (payload.event !== 'event-order-created') {
    return null
  }
  return payload.data
}
