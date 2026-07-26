import type { EventTicket, CheckinPayOrder } from '@/lib/tickets/types'
import type {
  EventDiscount,
  TicketType,
  CreateEventDiscountInput,
} from '@/lib/discounts/types'

/**
 * Neutral reference to an event within a ticketing provider.
 *
 * For Checkin.no this is a customer (tenant) id plus an event id, both stored
 * per-conference as `conference.checkinCustomerId` / `conference.checkinEventId`.
 *
 * SECOND-PROVIDER DEBT: the two-number shape is Checkin's. A provider that keys
 * events differently (e.g. a single opaque event slug) will need this
 * generalized — see docs/INTEGRATION_ADAPTERS.md.
 */
export interface EventRef {
  customerId: number
  eventId: number
}

/**
 * Credentials injected into a provider at construction time. Providers NEVER
 * read `process.env` themselves — the request boundary assembles these (today
 * from env, tomorrow from a per-org secret store). `apiUrl` is optional so the
 * platform default endpoint can stay a provider constant.
 */
export interface TicketingProviderCredentials {
  apiUrl?: string
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
}

// ── Public ticket-type shapes ────────────────────────────────────────────────
//
// SECOND-PROVIDER DEBT: these mirror Checkin's `findEventById` response
// (VAT-inclusive price arrays, `visibleStartsAt` windows, invitation flags).
// They are kept AS the neutral shape for now; a second provider will force them
// to generalize. Re-exported from `@/lib/tickets/public` so existing importers
// are unaffected.

export interface TicketPrice {
  price: string
  vat: string
  description: string | null
  key: string | null
}

export interface PublicTicketType {
  id: number
  name: string
  type: string
  description: string | null
  price: TicketPrice[]
  available: number | null
  requiresInvitation: boolean
  visibleStartsAt: string | null
  visibleEndsAt: string | null
  position: number
}

export interface PublicEventInfo {
  id: number
  name: string
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  currencies: string[]
}

// ── Webhook shapes ───────────────────────────────────────────────────────────
//
// SECOND-PROVIDER DEBT: the Checkin webhook envelope (`event`, `data`, per-user
// `crm`/`ticket` records, HMAC over `data`). A second provider will define its
// own envelope + signature scheme; `parseOrderCreated` is the seam.

export interface CheckinWebhookUser {
  id: number
  crm: {
    id: number
    firstName: string
    lastName: string
    email: {
      email: string
    }
  }
  ticket: {
    id: number
    name: string
    type: string
  }
  isPaid: boolean
}

export interface CheckinOrderCreatedData {
  id: number
  eventId: number
  users: CheckinWebhookUser[]
  orderContact: {
    crm: {
      id: number
      firstName: string
      lastName: string
      email: {
        email: string
      }
    }
  }
}

export interface CheckinWebhookPayload {
  payloadId: string
  event: string
  dataType: string
  data: CheckinOrderCreatedData
}

/** Result of verifying an inbound provider webhook request. */
export type WebhookVerifyResult =
  | { verified: true }
  | { verified: false; reason: 'not-configured' | 'invalid-signature' }

/**
 * Provider-agnostic ticketing interface.
 *
 * The application interacts with this interface only — never with a specific
 * vendor's API directly. Each provider (Checkin.no today) implements it and is
 * selected via {@link getTicketingProvider}. Credentials are injected at
 * construction; a provider must not read `process.env`.
 */
export interface TicketingProvider {
  /** Human-readable provider name. */
  readonly name: string

  /** Whether API credentials are present (does not perform a network call). */
  isConfigured(): boolean

  // ── Tickets & orders ──────────────────────────────────────────────
  fetchEventTickets(eventRef: EventRef): Promise<EventTicket[]>
  fetchOrderPaymentDetails(orderId: number): Promise<CheckinPayOrder>

  /**
   * Public ticket types for an event. Only the event id is required (the public
   * event lookup is not tenant-scoped). Throws on transport/not-found; callers
   * that want soft-fail wrap this (see `getPublicTicketTypes`).
   */
  fetchPublicTicketTypes(
    eventId: number,
  ): Promise<{ event: PublicEventInfo; tickets: PublicTicketType[] }>

  // ── Discounts (same vendor + event id) ────────────────────────────
  listDiscounts(
    eventId: number,
  ): Promise<{ discounts: EventDiscount[]; ticketTypes: TicketType[] }>
  createDiscount(input: CreateEventDiscountInput): Promise<EventDiscount>
  deleteDiscount(eventId: number, discountCode: string): Promise<boolean>

  // ── Webhooks ──────────────────────────────────────────────────────
  /** Verify an inbound webhook using the injected webhook secret. */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerifyResult
  /**
   * Extract the order-created payload, or `null` when the event is not an
   * order-created notification.
   */
  parseOrderCreated(
    payload: CheckinWebhookPayload,
  ): CheckinOrderCreatedData | null
}
