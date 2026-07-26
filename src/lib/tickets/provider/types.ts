import type { EventTicket, CheckinPayOrder } from '@/lib/tickets/types'
import type {
  EventDiscount,
  TicketType,
  CreateEventDiscountInput,
} from '@/lib/discounts/types'

/**
 * Provider-shaped reference to an event.
 *
 * GENERALIZED FOR THE SECOND PROVIDER (Tito): `EventRef` is now a discriminated
 * union keyed by `provider`. Each provider narrows to its own binding shape and
 * throws (or unsupported-errors) if handed another provider's ref.
 *
 * BACKWARD COMPATIBILITY: `provider` is OPTIONAL on the Checkin variant and
 * absent means Checkin, so every pre-existing `{ customerId, eventId }` literal
 * (admin pages, tRPC router, resolver output) is still a valid `EventRef` with
 * zero edits — the discriminant `'tito'` appears only on the Tito variant, so
 * narrowing with `ref.provider === 'tito'` is exhaustive.
 */
export interface CheckinEventRef {
  /** Optional discriminant; absent ⇒ Checkin (the historical default). */
  provider?: 'checkin'
  /** Checkin customer (tenant) id — `conference.checkinCustomerId`. */
  customerId: number
  /** Checkin event id — `conference.checkinEventId`. */
  eventId: number
}

/** Tito keys an event by two URL slugs: `/:account/:event`. */
export interface TitoEventRef {
  provider: 'tito'
  /** Tito account slug — `conference.titoAccountSlug`. */
  accountSlug: string
  /** Tito event slug — `conference.titoEventSlug`. */
  eventSlug: string
}

export type EventRef = CheckinEventRef | TitoEventRef

/**
 * Thrown by a provider for an interface member that has NO faithful equivalent
 * on that vendor (e.g. Tito has no Checkin-shaped `fetchOrderPaymentDetails`, and
 * the discount methods carry a Checkin-shaped numeric `eventId` input that can't
 * address a Tito event). It is a NAMED, typed error — callers can `instanceof`
 * it — so a provider never fails with a bare/opaque `Error` for an operation it
 * deliberately does not implement.
 */
export class ProviderUnsupportedError extends Error {
  readonly code = 'provider-unsupported'
  constructor(
    readonly providerName: string,
    readonly operation: string,
    detail?: string,
  ) {
    super(
      `${providerName} does not support "${operation}"${detail ? `: ${detail}` : ''}`,
    )
    this.name = 'ProviderUnsupportedError'
  }
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
   * Public ticket types for an event.
   *
   * Accepts either a bare numeric event id (the historical Checkin-only form —
   * Checkin's public lookup is not tenant-scoped, so an id alone suffices) OR a
   * provider-shaped {@link EventRef}. A provider whose public lookup needs more
   * than a number (Tito needs `account/event` slugs) requires the ref form and
   * unsupported-errors on a bare number. The resolver path always passes the
   * ref; direct Checkin callers may still pass the number. Throws on
   * transport/not-found; callers that want soft-fail wrap this (see
   * `getPublicTicketTypes`).
   */
  fetchPublicTicketTypes(
    event: EventRef | number,
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
