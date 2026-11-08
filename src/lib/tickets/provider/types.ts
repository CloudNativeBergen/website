import type { EventTicket } from '@/lib/tickets/types'
import type { CheckinWebhookPayload, CheckinOrderCreatedData } from './checkin'
import { parseTicketAmount } from '@/lib/tickets/amount'
import type {
  EventDiscount,
  TicketType,
  CreateEventDiscountInput,
} from '@/lib/discounts/types'

/** The vendors behind {@link TicketingProvider}. */
export type TicketingProviderType = 'checkin' | 'tito'

/**
 * Konf reference to an event at a ticketing vendor. Every id is a string; the
 * vendor's own meaning stays inside its provider module.
 *
 *  - Checkin: `accountId` = customer id, `externalId` = event id (both numeric
 *    on the wire, carried here as decimal strings).
 *  - Tito: `accountId` = account slug, `externalId` = event slug.
 *
 * A provider handed another provider's ref throws (a resolver wiring bug).
 */
export interface EventRef {
  provider: TicketingProviderType
  accountId: string
  externalId: string
}

/**
 * The optional operations a provider supports. Required operations (ticket
 * types, orders, webhook verification) are not listed. A caller checks the
 * flag instead of catching {@link ProviderUnsupportedError}; the admin UI uses
 * it to hide what the provider cannot do.
 */
export interface TicketingCapabilities {
  /** `listDiscounts` / `createDiscount` / `deleteDiscount`. */
  discounts: boolean
  /** `fetchOrderPaymentDetails`. */
  paymentDetails: boolean
  /** Attendee check-in. No provider exposes it through this interface yet. */
  checkin: boolean
}

/** Money as an integer in the currency's minor unit (øre, cents). */
export interface Money {
  amountMinor: number
  currency: string | null
}

/** A person as the provider reports them on an order. */
export interface OrderContact {
  firstName: string
  lastName: string
  email: string
}

/**
 * The payment state of ONE order, in Konf terms. Amounts are minor units; the
 * currency is the provider's (`null` when it did not say).
 */
export interface OrderPaymentDetails {
  provider: TicketingProviderType
  /** The vendor's payment-document id. */
  externalId: string
  /** The vendor's order id, as shown to organizers. */
  orderId: string
  currency: string | null
  totalMinor: number
  amountLeftMinor: number
  vatMinor: number
  paid: boolean
  paymentStatus: string
  paymentMethod: string
  actionRequired: string | null
  invoiceReference: string | null
  kid: string | null
  createdAt: string
  dueAt: string
  invoiceDate: string | null
  deliveryDate: string | null
  contact: OrderContact
  billing: OrderContact | null
}

/** Convert a provider's decimal amount (`"1234.50"`) to minor units. */
export function toMinorUnits(
  value: string | number | null | undefined,
): number {
  return Math.round(parseTicketAmount(value) * 100)
}

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
// The order-created webhook is still the Checkin envelope. The shapes live in
// `./checkin`; the interface names them only through these aliases until #2146
// normalises webhooks to Konf events.

/** The raw order-created webhook body (Checkin's envelope until #2146). */
export type LegacyOrderWebhookPayload = CheckinWebhookPayload
/** The order-created data extracted from {@link LegacyOrderWebhookPayload}. */
export type LegacyOrderCreatedData = CheckinOrderCreatedData

/**
 * What ONE ticket row's money fields (`sum`, `sum_left`) mean.
 *
 *  - `'per-ticket'`: the amount for that seat alone. Summing every ticket of an
 *    order gives the order total.
 *  - `'per-order'`: the ORDER total, repeated on every ticket of the order.
 *    Summing every ticket would multiply the order by its ticket count.
 *
 * This is DECLARED by the adapter rather than guessed by each consumer, because
 * guessing is exactly what produced three different revenue totals in this app.
 * {@link toPerTicketAmounts} converts a `'per-order'` feed to the per-ticket
 * form, so everything downstream of `fetchEventTickets` may sum per ticket
 * without asking. Flipping a vendor's reading is a one-line change on its
 * adapter's `amountBasis`.
 */
export type TicketAmountBasis = 'per-ticket' | 'per-order'

/**
 * Normalize a provider's ticket rows to {@link TicketAmountBasis} `'per-ticket'`.
 *
 * For a `'per-order'` feed the order total is split EVENLY across the order's
 * tickets — the order total is the only fact such a feed carries, so an even
 * split is the honest reconstruction; per-category revenue for a mixed order is
 * therefore approximate in that (currently hypothetical) case.
 */
export function toPerTicketAmounts<
  T extends { order_id: number; sum: string; sum_left?: string },
>(tickets: T[], basis: TicketAmountBasis): T[] {
  if (basis === 'per-ticket') return tickets

  const ticketsPerOrder = new Map<number, number>()
  for (const t of tickets) {
    ticketsPerOrder.set(t.order_id, (ticketsPerOrder.get(t.order_id) ?? 0) + 1)
  }

  const split = (value: string | undefined, by: number) =>
    value === undefined ? undefined : String(parseTicketAmount(value) / by)

  return tickets.map((t) => {
    const by = ticketsPerOrder.get(t.order_id) || 1
    return {
      ...t,
      sum: split(t.sum, by)!,
      ...(t.sum_left === undefined ? {} : { sum_left: split(t.sum_left, by) }),
    }
  })
}

/** Options for `TicketingProvider.fetchEventTickets`. */
export interface FetchEventTicketsOptions {
  /**
   * Return the vendor's rows with their money fields UNTOUCHED, skipping
   * {@link toPerTicketAmounts}.
   *
   * For `scripts/dump-ticket-shape.ts` ONLY. That script exists to test whether
   * the adapter's {@link TicketAmountBasis} declaration is right; rows the
   * declaration has already normalized would make the probe confirm whatever is
   * configured (a `'per-order'` feed comes back evenly split, i.e. looking
   * per-ticket). Application code must never set this: everything downstream of
   * `fetchEventTickets` sums per ticket and depends on the normalization.
   */
  rawAmounts?: boolean
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

  /**
   * What this vendor's `sum` / `sum_left` mean on ONE ticket row. The adapter
   * declares it and normalizes its own output with {@link toPerTicketAmounts},
   * so every consumer of `fetchEventTickets` sums per ticket. See
   * {@link TicketAmountBasis}.
   */
  readonly amountBasis: TicketAmountBasis

  /**
   * Whether the amounts this vendor reports INCLUDE VAT. Revenue is shown as
   * the provider reports it (no VAT normalization anywhere in the app), so this
   * is what labels a revenue figure incl./ex. VAT — the same card means
   * different things for a Checkin tenant and a Tito one.
   */
  readonly amountsIncludeVat: boolean

  /** Which optional operations this provider supports. */
  readonly capabilities: TicketingCapabilities

  /** Whether API credentials are present (does not perform a network call). */
  isConfigured(): boolean

  // ── Tickets & orders ──────────────────────────────────────────────
  fetchEventTickets(
    eventRef: EventRef,
    options?: FetchEventTicketsOptions,
  ): Promise<EventTicket[]>
  fetchOrderPaymentDetails(orderId: string): Promise<OrderPaymentDetails>

  /**
   * Public ticket types for an event. Throws on transport/not-found; callers
   * that want soft-fail wrap this (see `getPublicTicketTypes`).
   */
  fetchPublicTicketTypes(
    event: EventRef,
  ): Promise<{ event: PublicEventInfo; tickets: PublicTicketType[] }>

  // ── Discounts (capabilities.discounts) ────────────────────────────
  // `eventId` is the event's `EventRef.externalId`.
  listDiscounts(
    eventId: string,
  ): Promise<{ discounts: EventDiscount[]; ticketTypes: TicketType[] }>
  createDiscount(input: CreateEventDiscountInput): Promise<EventDiscount>
  deleteDiscount(eventId: string, discountCode: string): Promise<boolean>

  // ── Webhooks ──────────────────────────────────────────────────────
  /** Verify an inbound webhook using the injected webhook secret. */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerifyResult
  /**
   * Extract the order-created payload, or `null` when the event is not an
   * order-created notification.
   */
  parseOrderCreated(
    payload: LegacyOrderWebhookPayload,
  ): LegacyOrderCreatedData | null

  // ── Invitations ───────────────────────────────────────────────────
  /**
   * Send a ticket invitation directly from the provider.
   * Currently only implemented by Checkin.
   */
  sendTicketInvitation?(
    ticketId: number,
    emails: string[],
    message?: string,
  ): Promise<void>
}
