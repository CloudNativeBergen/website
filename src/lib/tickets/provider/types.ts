import type { EventTicket, CheckinPayOrder } from '@/lib/tickets/types'
import { parseTicketAmount } from '@/lib/tickets/amount'
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
 *
 * Refunds are netted per order (#1451): a row with a negative `sum` is a refund,
 * not a seat, so it is dropped and its amount subtracted from the order's
 * total. Seat rows are always kept, so attendee counts are unchanged; a fully
 * refunded order keeps its seats at 0. A negative `sum_left` (credit balance)
 * counts as 0 outstanding.
 */
export function toPerTicketAmounts<
  T extends { order_id: number; sum: string; sum_left?: string },
>(tickets: T[], basis: TicketAmountBasis): T[] {
  const clean = (t: T) =>
    parseTicketAmount(t.sum) >= 0 &&
    (t.sum_left === undefined || parseTicketAmount(t.sum_left) >= 0)
  if (basis === 'per-ticket' && tickets.every(clean)) return tickets

  const orders = new Map<number, { seats: number; refund: number }>()
  for (const t of tickets) {
    const o = orders.get(t.order_id) ?? { seats: 0, refund: 0 }
    const sum = parseTicketAmount(t.sum)
    if (sum < 0) o.refund += sum
    else o.seats += 1
    orders.set(t.order_id, o)
  }

  // Per-ticket share of each seat row, before refunds.
  const share = (t: T, value: string) =>
    parseTicketAmount(value) /
    (basis === 'per-order' ? orders.get(t.order_id)!.seats : 1)

  // Gross seat revenue per order, to scale each seat by (gross + refund) / gross.
  const gross = new Map<number, number>()
  for (const t of tickets) {
    if (parseTicketAmount(t.sum) < 0) continue
    gross.set(t.order_id, (gross.get(t.order_id) ?? 0) + share(t, t.sum))
  }

  return tickets
    .filter((t) => parseTicketAmount(t.sum) >= 0)
    .map((t) => {
      const { refund } = orders.get(t.order_id)!
      if (basis === 'per-ticket' && refund === 0) return clampSumLeft(t)
      // Net in integer øre: re-summed float shares (2000/7 × 7) drift past
      // the order total, which would leave fully refunded seats a tiny price.
      const g = Math.round(gross.get(t.order_id)! * 100)
      const net = Math.max(0, g + Math.round(refund * 100))
      const ratio = g > 0 ? net / g : 0
      return clampSumLeft({
        ...t,
        sum: String(share(t, t.sum) * ratio),
        ...(t.sum_left === undefined
          ? {}
          : { sum_left: String(share(t, t.sum_left)) }),
      })
    })
}

function clampSumLeft<T extends { sum_left?: string }>(t: T): T {
  return t.sum_left !== undefined && parseTicketAmount(t.sum_left) < 0
    ? { ...t, sum_left: '0' }
    : t
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

  /** Whether API credentials are present (does not perform a network call). */
  isConfigured(): boolean

  // ── Tickets & orders ──────────────────────────────────────────────
  fetchEventTickets(
    eventRef: EventRef,
    options?: FetchEventTicketsOptions,
  ): Promise<EventTicket[]>
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
