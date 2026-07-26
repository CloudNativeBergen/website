# Integration Adapters

Third-party integrations (ticketing, contract signing, …) sit behind a small
**provider interface** so the application never talks to a specific vendor's API
directly. Swapping or adding a vendor is a matter of writing one class and
registering it in a factory — no call site changes.

Two integrations use this pattern today:

- **Ticketing** — `src/lib/tickets/provider/` (`TicketingProvider`; two vendors,
  Checkin.no and Tito, selected per conference)
- **Contract signing** — `src/lib/contract-signing/` (`ContractSigningProvider`,
  self-hosted)

Ticketing is the reference case for a **second provider**: Tito (ti.to, REST
Admin API v3) validated that the adapter generalizes past Checkin. See
[Ticketing providers: Checkin + Tito](#ticketing-providers-checkin--tito).

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

// EventRef is now a provider-discriminated union (see the Tito section):
type EventRef =
  | { provider?: 'checkin'; customerId: number; eventId: number }
  | { provider: 'tito'; accountSlug: string; eventSlug: string }
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

- **`EventRef`** — ✅ GENERALIZED by the Tito work into a provider-discriminated
  union (`{ provider?: 'checkin'; customerId; eventId } | { provider: 'tito';
accountSlug; eventSlug }`). `provider` is optional on the Checkin variant so
  every legacy `{ customerId, eventId }` literal still type-checks; each provider
  narrows to its own shape. The rest of the list below is still Checkin-shaped
  debt.
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

## Ticketing providers: Checkin + Tito

Tito (ti.to) is the second ticketing provider, proving the adapter generalizes.
Tito's **Admin API v3** is REST (`https://api.tito.io/v3`), authenticated with
`Authorization: Token token=<API token>` — a different shape from Checkin's
GraphQL + `Basic` auth, which is exactly the point.

### Binding design (how a conference selects its provider)

- A conference carries an optional **`ticketingProvider: 'checkin' | 'tito'`**
  field. **Absent ⇒ `'checkin'`** — every legacy conference behaves identically
  with zero migration (`conferenceProviderType()` centralizes that default).
- Each provider reads only **its own** binding fields on the conference:
  - Checkin: `checkinCustomerId` + `checkinEventId` (numbers)
  - Tito: `titoAccountSlug` + `titoEventSlug` (the two URL slugs of
    `ti.to/:account/:event`)
- **`EventRef`** became a discriminated union (see above). The Checkin variant's
  `provider` key is **optional**, so the resolver still emits a bare
  `{ customerId, eventId }` for Checkin — no consumer that reads `.eventId`
  changed, and the regression is pinned by a test.
- **`resolveTicketingProvider(conference)`** branches on the provider type and
  requires that provider's full binding (both fields); a partial binding returns
  the same `configured: false` soft-fail as before.
- **`hasTicketingBinding` / `ticketingBinding`** are provider-aware: the gate and
  the cache-key projection both include the provider + its fields.

### Credentials & secrets

Tito authenticates with a single API token and signs webhooks with the
endpoint's security token. Credentials are injected (constructor only):

- **Platform fallback:** `platformTitoCredentials()` reads `TITO_API_KEY` and
  `TITO_WEBHOOK_SECRET` (mirrors `platformCheckinCredentials`).
- **Per-org secret:** the `ticketing` family is a provider-agnostic opaque
  record. A Tito org sets
  `TENANT_SECRETS_JSON = {"<orgId>":{"ticketing":{"apiKey":"tito_secret_…"}}}`.
- ⚠️ The env-backed `ticketing` family in `EnvSecretsStore` is **Checkin-shaped**
  (it reads `CHECKIN_*`). A single `(orgId, 'ticketing')` lookup can't know which
  vendor a conference picked, so the **Tito resolver branch skips that env store**
  — it resolves per-org Tito secrets through the JSON store only and falls back to
  `platformTitoCredentials()`. The provider that knows its vendor (the resolver)
  is the right layer for the vendor-specific env fallback.

### The Tito ↔ `TicketingProvider` mapping

| Interface member           | Tito support         | Mapping / reason                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isConfigured`             | ✅                   | `!!apiKey`                                                                                                                                                                                                                                                        |
| `fetchPublicTicketTypes`   | ✅                   | `GET /:a/:e` + `GET /:a/:e/releases`; release `title→name`, `description`, `price→price[0]`, `quantity→available`, `secret→requiresInvitation`, `start_at/end_at→visibleStartsAt/EndsAt`, `position`. Accepts the ref form; **unsupported** on a bare numeric id. |
| `fetchEventTickets`        | ✅                   | `GET /:a/:e/tickets` (paginated via `meta.next_page`); `email/first_name/last_name`, `release_title→category`, `state→order.paid` (`complete`⇒paid), `registration_id→order_id`.                                                                                  |
| `verifyWebhook`            | ✅                   | HMAC-SHA256 over the raw body, keyed by the endpoint security token, **base64**-encoded in the **`Tito-Signature`** header (vs Checkin's hex `checkin-signature` over only `data`).                                                                               |
| `fetchOrderPaymentDetails` | ⛔ typed-unsupported | Tito has no Checkin-shaped per-order payment document; the numeric order id can't address a Tito registration. Throws `ProviderUnsupportedError`.                                                                                                                 |
| `listDiscounts`            | ⛔ typed-unsupported | Input is a bare numeric `eventId` — can't address a Tito event (needs slugs).                                                                                                                                                                                     |
| `createDiscount`           | ⛔ typed-unsupported | Tito _does_ expose `POST /:a/:e/discount_codes`, but `CreateEventDiscountInput.eventId` is a Checkin-shaped number with no slugs. Generalizing the discount input to carry an `EventRef` is the unlock (tracked debt).                                            |
| `deleteDiscount`           | ⛔ typed-unsupported | Same numeric-`eventId` limitation.                                                                                                                                                                                                                                |
| `parseOrderCreated`        | ⛔ returns `null`    | Typed against the Checkin webhook envelope; Tito's envelope differs. Returning `null` ("not an order-created event") is interface-consistent. The live webhook route is Checkin-namespaced, so this is never invoked today.                                       |

**Unsupported model:** members with a bare domain-object return type throw a
**named, typed** `ProviderUnsupportedError` (never a generic `Error`), so callers
can `instanceof`-distinguish "not implemented for this vendor" from a transport
failure. Members with a result-typed error channel use it (`verifyWebhook` →
`{ verified: false, reason }`; `parseOrderCreated` → `null`).

**VAT / price semantics (honest note):** Tito prices are **tax-INCLUSIVE** (the
gross a buyer pays). Checkin's `TicketPrice.price` is **net** (excl. VAT) with a
separate `vat` percent that downstream `formatTicketPrice` adds back on
`includeVat`. To avoid double-counting, Tito surfaces the gross as `price` with
`vat: '0'`, so the incl/excl display math is a no-op and the shown number always
equals what the buyer pays. A future generalization would add a tax-inclusive
flag to `TicketPrice`.

## Adding a ticketing provider N+1 (checklist validated by Tito)

These are the files the Tito work actually touched — the concrete "add provider
N+1" checklist:

1. **Provider class** — `src/lib/tickets/provider/<vendor>.ts` implementing
   `TicketingProvider`; credentials injected via the constructor, no
   `process.env`. Throw `ProviderUnsupportedError` for members with no faithful
   analogue.
2. **Factory + union** — add the vendor to `TicketingProviderType` and the
   `getTicketingProvider` `switch` in `provider/index.ts`.
3. **EventRef** — if the vendor keys events differently, add a variant to the
   `EventRef` union in `provider/types.ts` and narrow it inside the provider
   (keep the Checkin variant's `provider` optional so old literals still compile).
4. **Resolver + binding** — branch `resolveTicketingProvider`, and extend
   `ConferenceTicketingBinding` / `ticketingBinding` / `hasTicketingBinding` /
   `conferenceProviderType` with the vendor's binding fields in `provider/index.ts`.
5. **Platform credentials** — add `platform<Vendor>Credentials()` reading the
   vendor's env vars; note whether the env-backed secret family covers it (for
   Tito it does not — see the secrets note above).
6. **Conference schema** — `sanity/schemaTypes/conference.ts` (the provider
   selector + the vendor's binding fields, hidden by the selector), the Zod
   `UpdateTicketingIdsSchema` in `src/server/schemas/conference.ts`, and the
   `Conference` type in `src/lib/conference/types.ts`.
7. **Admin edit surface** — the `ticketingIds` fieldset in
   `src/components/admin/EditConferenceCard.tsx` + the card's `initialValues` /
   read-only rows in `src/app/(admin)/admin/settings/page.tsx`.
8. **Consumers passing an event ref** — audit `fetchPublicTicketTypes` /
   `fetchEventTickets` call sites; pass the whole `eventRef` (not `.eventId`) so
   slug-keyed providers route correctly (`src/lib/tickets/public.ts`).
9. **Docs + tests** — this file, plus provider contract tests (mocked `fetch`:
   happy path, auth failure, mapping edges) and resolver routing/regression tests.

**Not needed for the proof (left as debt):** generalizing the Checkin-shaped
neutral types (`EventTicket`, `CheckinPayOrder`, the webhook envelope, the
discount input). Those force `parseOrderCreated` / the discount methods to be
unsupported for Tito; unlocking them is the next generalization, and the mapping
seams (`parseOrderCreated`, `fetchPublicTicketTypes`) are where it lands.
