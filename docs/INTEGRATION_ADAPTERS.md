# Integration Adapters

Third-party integrations (ticketing, contract signing, …) sit behind a small
**provider interface** so the application never talks to a specific vendor's API
directly. Swapping or adding a vendor is a matter of writing one class and
registering it in a factory — no call site changes.

Two integrations use this pattern today:

- **Ticketing** — `src/lib/tickets/provider/` (`TicketingProvider`, Checkin.no)
- **Contract signing** — `src/lib/contract-signing/` (`ContractSigningProvider`,
  self-hosted)

## The house pattern

Each integration is three pieces:

1. **`types.ts`** — a provider-agnostic interface plus the neutral result types
   the application consumes. Status/shape normalization lives here, not at call
   sites.
2. **One class per vendor** — implements the interface. All vendor-specific
   transport, queries, and quirks are hidden inside.
3. **`index.ts`** — a factory that selects a vendor implementation, plus (for
   ticketing) a request-boundary **resolver** that wires per-request
   configuration into the factory.

Call sites depend only on the interface and the factory/resolver — never on a
concrete vendor module.

## The credential-injection rule

> **A provider MUST NOT read `process.env` (or any ambient configuration).**

Credentials are **injected** at construction. The factory signature is:

```ts
getTicketingProvider(providerType, credentials): TicketingProvider
```

The **request boundary** is the only place that assembles credentials. Today it
reads them from environment variables (`platformCheckinCredentials()`), which is
the platform default. Tomorrow a per-organization secret store plugs in at that
one seam (`// TODO(#617)`) without touching any provider or consumer.

This is the one upgrade over the contract-signing factory, which still reaches
for `process.env.CONTRACT_SIGNING_PROVIDER` inside the factory. New providers
should follow the ticketing rule: **nothing ambient inside the provider.**

### Why it matters

- **Multi-tenant readiness** — each conference can eventually bring its own
  ticketing account; the provider is already credential-agnostic.
- **Testability** — providers are constructed with fake credentials and a
  stubbed `fetch`; no env mutation, no module-load side effects.
- **Import safety** — the factory reads no env at import, so import-sensitive
  modules (e.g. `src/lib/system-status/checks.ts`) can construct a provider
  just to probe `isConfigured()`.

## The `TicketingProvider` contract

`src/lib/tickets/provider/types.ts`:

```ts
interface TicketingProvider {
  readonly name: string
  isConfigured(): boolean

  // Tickets & orders
  fetchEventTickets(eventRef: EventRef): Promise<EventTicket[]>
  fetchOrderPaymentDetails(orderId: number): Promise<CheckinPayOrder>
  fetchPublicTicketTypes(eventId): Promise<{ event; tickets }>

  // Discounts (same vendor + event id — folded into the provider)
  listDiscounts(eventId): Promise<{ discounts; ticketTypes }>
  createDiscount(input): Promise<EventDiscount>
  deleteDiscount(eventId, discountCode): Promise<boolean>

  // Webhooks
  verifyWebhook(rawBody, headers): WebhookVerifyResult
  parseOrderCreated(payload): CheckinOrderCreatedData | null
}

type EventRef = { customerId: number; eventId: number }
```

### The request-boundary resolver

`resolveTicketingProvider(conference)` takes an **already domain-resolved**
conference (never a client-supplied one — see the security note in
`src/app/(admin)/admin/actions.ts`) and returns a discriminated result:

```ts
type ResolvedTicketing =
  | { configured: true; provider: TicketingProvider; eventRef: EventRef }
  | { configured: false; provider: null; eventRef: null }
```

`configured: false` mirrors today's per-consumer
`!checkinCustomerId || !checkinEventId` guard, and consumers short-circuit to
their existing empty/soft-fail path. It does **not** pre-check API credentials:
when those are absent the provider's operations throw at call time and are
caught by each consumer's existing error path — identical to before.

Consumers that operate off a raw event id (the discount tRPC endpoints, the
webhook route, the cached public ticket-price lookups) skip the resolver and
call `getTicketingProvider('checkin', platformCheckinCredentials())` directly.

### Webhooks

`verifyWebhook(rawBody, headers)` owns the vendor's signature scheme (Checkin
HMACs SHA-256 over the `data` field, header `checkin-signature`) using the
injected `webhookSecret`. It returns `{ verified: false, reason:
'not-configured' | 'invalid-signature' }` so the route maps the same HTTP codes
(500 vs 401) it always has. `parseOrderCreated(payload)` returns the order data
for `event-order-created` notifications, else `null`.

## Second-provider debt (the Checkin-shaped types)

The extraction preserved behavior exactly, so a number of neutral types are
still **Checkin-shaped**. A second ticketing provider (a separate PR) will need
these generalized — they are flagged in the source with a `SECOND-PROVIDER
DEBT` comment:

- **`EventRef`** (`{ customerId, eventId }`) — Checkin binds an event with a
  customer (tenant) id + event id. A provider that keys events differently
  (single opaque slug, per-tenant API base) will force this to generalize.
- **`EventTicket` / `EventTicketWithoutDate` / `CheckinPayOrder`**
  (`src/lib/tickets/types.ts`) — Checkin field names (`order_id`, `sum_left`,
  `crm`, `findCheckinPayOrderByID` shape).
- **`PublicTicketType` / `TicketPrice` / `PublicEventInfo`**
  (`src/lib/tickets/provider/types.ts`) — VAT-inclusive price arrays,
  `visibleStartsAt` windows, invitation flags.
- **`EventDiscount` / `TicketType`** (`src/lib/discounts/types.ts`) — Checkin
  coupon/discount model.
- **`CheckinWebhookPayload` / `CheckinOrderCreatedData` / `CheckinWebhookUser`**
  (`src/lib/tickets/provider/types.ts`) — Checkin's webhook envelope and
  HMAC-over-`data` signature scheme.

Generalizing means introducing a genuinely neutral shape and a per-provider
mapping layer (the extraction deliberately did **not** remap — zero behavior
change was the bar). `parseOrderCreated` and `fetchPublicTicketTypes` are the
natural seams where that mapping will live.

## Adding a ticketing provider (the follow-up PR)

1. Add the vendor to the `TicketingProviderType` union in
   `src/lib/tickets/provider/index.ts`.
2. Write `src/lib/tickets/provider/<vendor>.ts` implementing `TicketingProvider`
   — credentials injected via the constructor, no `process.env`.
3. Register it in the `getTicketingProvider` factory `switch`.
4. Where the new vendor's payloads don't fit the Checkin-shaped neutral types,
   introduce the neutral shape + a mapping layer (see the debt list above).
5. Select the provider per conference (a `conference.ticketingProvider` field,
   mirroring `conference.signingProvider`) and assemble its credentials at the
   request boundary.
