# Pretix as a Ticketing Provider

Status: **ready for implementation**. This spec is where the wayfinder map
[Pretix as a ticketing provider](https://github.com/CloudNativeBergen/website/issues/1367) ends up.
Every decision below was made on a closed map ticket. The spec gathers them and
links to the ticket that holds each one's reasoning. It does not re-decide them;
to change one, reopen its ticket.

## 1. What this delivers

**Pretix** becomes a third Ticketing Provider, both hosted (pretix.eu) and
self-hosted. It reaches **full parity with Checkin** for everything a tenant uses:

- public prices
- the admin tickets, orders, companies and ticket-type pages
- discount codes, including the sponsor discount send
- speaker invitations
- sale webhooks and workshop access
- Marketing Outcomes and the budget

First comes a **provider-neutral ticketing model**. Checkin and Tito move onto it
with no change in behaviour, except for the few deliberate changes listed in §5.3.
Pretix is then a third adapter with nothing marked unsupported.

### Out of scope

- **Tito parity** (discounts, webhooks, payment details). Tito moves onto the
  neutral types unchanged; finishing it is a separate effort.
- **Self-serve connection setup** by org admins, and a runtime-writable secret store.
- Switching provider for a live edition, or migrating orders between providers.
- Pretix check-in, badge printing, seating, or writing a Pretix plugin.
- **Changes that aren't needed for Pretix:**
  - keying `ticketTypeRoles` by id instead of name
  - revoking speaker invitations
  - generating a personal voucher per volunteer
  - a webhook dedupe store

## 2. Vocabulary

These terms are added to `CONTEXT.md` in the same PR.

- **Ticketing Provider**: the vendor adapter (Checkin, Tito, Pretix).
- **Ticketing Connection**: an Organization's account at a provider. For Pretix
  that's an instance base URL, a Pretix organizer slug, an API token and a
  webhook secret.
- **Ticketing Binding**: a conference's link to one event at its provider
  (`ticketingProvider` plus the event key).
- **Pretix organizer account**: Pretix's top-level account, which owns events.
  Always written out in full. A bare "organizer" in this app means a person with
  admin access.
- **Sold Ticket**: a non-complimentary ticket of a type that admits an attendee,
  whether paid or awaiting payment. Sold items that don't admit (merchandise,
  add-ons) count toward revenue only.

## 3. Decision index

| Area                                            | Decided on                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pretix API facts                                | [Research: Pretix data model and REST API](https://github.com/CloudNativeBergen/website/issues/1368) (`docs/research/pretix-api.md` on `research/pretix-api`)                              |
| Webhook facts                                   | [Research: Pretix webhooks, authenticity, and tenant routing](https://github.com/CloudNativeBergen/website/issues/1369) (`docs/research/pretix-webhooks.md` on `research/pretix-webhooks`) |
| Observed behaviour                              | [Task: provision a Pretix test organizer account and API token](https://github.com/CloudNativeBergen/website/issues/1370) (`docs/research/pretix-local/` on `research/pretix-local`)       |
| Connection storage, guard and status            | [Decide how a Pretix Ticketing Connection is stored and guarded](https://github.com/CloudNativeBergen/website/issues/1371)                                                                 |
| Neutral model (and the amendments posted on it) | [Decide the provider-neutral ticketing model](https://github.com/CloudNativeBergen/website/issues/1372)                                                                                    |
| Products → Ticket Types                         | [Decide how Pretix products map to Ticket Type names, roles and workshop access](https://github.com/CloudNativeBergen/website/issues/1373)                                                 |
| Discounts                                       | [Decide discounts on Pretix: vouchers, usage counting and sponsor codes](https://github.com/CloudNativeBergen/website/issues/1374)                                                         |
| Invitations and registration links              | [Decide speaker invitations and registration links on Pretix](https://github.com/CloudNativeBergen/website/issues/1375)                                                                    |
| Sale webhook                                    | [Decide the Pretix sale webhook: route, tenant lookup and authenticity](https://github.com/CloudNativeBergen/website/issues/1376)                                                          |
| Stored ids and rollout                          | [Decide the migration of stored numeric provider ids and the refactor's rollout order](https://github.com/CloudNativeBergen/website/issues/1384)                                           |
| Outcomes and budget                             | [Decide Marketing Outcomes and budget semantics on the neutral model](https://github.com/CloudNativeBergen/website/issues/1385)                                                            |
| Verification strategy                           | [Write the Pretix provider spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1377) (§13 here)                                                           |

## 4. The neutral model

The seam stays `src/lib/tickets/provider/` (`docs/INTEGRATION_ADAPTERS.md`).
The application talks only to `TicketingProvider`. Each adapter maps its own
vendor's response in its own file.

### 4.1 Principles

- **Our names, not a vendor's.** The Checkin field names (`order_id`, `sum_left`,
  `crm`, `coupon`, `fields`, `additionals`) leave the shared types.
- **Ids are opaque strings.** Each adapter owns its id format. No consumer
  parses, sorts or does arithmetic on an id.
- **Every method takes an `EventRef`.** The bare numeric `eventId`, and the
  `EventRef | number` overload, go away.
- **The adapter reports only what the vendor states.** A field the vendor doesn't
  provide is absent, never guessed.

### 4.2 Types

```ts
/** Major currency units, parsed. Filled only with what the vendor states. */
type Money = { net?: number; gross?: number }

type EventRef =
  | { provider?: 'checkin'; customerId: number; eventId: number } // unchanged
  | { provider: 'tito'; accountSlug: string; eventSlug: string } // unchanged
  | {
      provider: 'pretix'
      baseUrl: string
      organizerSlug: string
      eventSlug: string
    }

interface TicketTypeRef {
  id: string
  name: string
  /** The vendor's own answer (Pretix `admission`). An organizer's role entry overrides it. */
  admits?: boolean
}

interface Answer {
  key: string // stable identifier: Checkin field key or additional name; Pretix `question_identifier`
  label: string // what is shown; event default locale
  value: string
  kind: 'profile' | 'custom' // keeps today's ordering in question discovery
}

interface Ticket {
  id: string
  ticketType: TicketTypeRef
  attendee: { name: string | null; email: string | null }
  price: Money // per ticket, after discounts
  discountCode?: string // the code itself, upper-cased
  company?: string // the attendee's own company, when the vendor asks for it
  jobTitle?: string
  answers: Answer[]
}

type OrderStatus = 'paid' | 'pending'

interface Order {
  id: string
  placedAt: string // ISO 8601
  status: OrderStatus
  buyer: { name: string | null; email: string | null }
  company?: string // the buyer's company (Pretix: invoice address)
  /** May be NEGATIVE: a refund is due (observed after a partial cancel). */
  outstanding: Money
  tickets: Ticket[]
}

interface PublicTicketType {
  id: string
  name: string
  description: string | null
  prices: {
    key: string | null
    description: string | null
    net?: number
    gross?: number
    vatRate?: number
  }[]
  available: number | null
  requiresInvitation: boolean
  visibleFrom: string | null
  visibleUntil: string | null
  position: number
}

interface PublicEventInfo {
  name: string
  currency: string
  registrationOpensAt: string | null
  registrationClosesAt: string | null
}

interface PaymentSummary {
  orderId: string
  status: 'paid' | 'pending' | 'canceled' | 'refunded'
  total: Money
  vat?: number
  outstanding: Money
  currency: string
  method?: string
  placedAt: string
  dueAt?: string
  contact: { name: string | null; email: string | null }
  billingContact?: { name: string | null; email: string | null }
  invoice?: { number: string; date: string }
  paymentReference?: string // Checkin's KID
  notices: string[] // Checkin's actionRequired
}

interface Discount {
  id: string // Checkin: the code (Checkin returns no id). Pretix: the voucher id.
  code: string
  kind: 'percent' | 'fixed' | 'set' | 'none'
  value: number
  ticketTypeIds: string[] // empty = every type
  maxUses: number | null
  providerUses: number // the vendor's own redemption counter
  validFrom?: string
  validUntil?: string
}

interface CreateDiscountInput {
  code: string
  kind: 'percent' // the only kind the app creates
  value: number // 1–100
  maxUses: number
  ticketTypeIds: string[]
  validFrom?: string // refused as unsupported by Pretix
  validUntil?: string
}

type WebhookRequest = { rawBody: string; headers: Headers }

type WebhookOrigin =
  | { provider: 'checkin'; eventId: number }
  | { provider: 'pretix'; organizerSlug: string; eventSlug: string }

interface SaleEvent {
  dedupeKey: string // logged; there is no dedupe store
  order: Order
}

type InvitationResult =
  | { delivery: 'provider-sent' } // Checkin mails its own invitation
  | { delivery: 'link'; url: string; invitationId: string; code: string } // Pretix

interface Capabilities {
  discounts: boolean
  paymentDetails: boolean
  invitations: boolean
  saleWebhook: boolean
}
```

### 4.3 The interface

```ts
interface TicketingProvider {
  readonly name: string
  readonly capabilities: Capabilities
  isConfigured(): boolean

  fetchPublicTicketTypes(
    ref: EventRef,
  ): Promise<{ event: PublicEventInfo; ticketTypes: PublicTicketType[] }>
  fetchEventOrders(ref: EventRef): Promise<Order[]>
  fetchPaymentSummary(ref: EventRef, orderId: string): Promise<PaymentSummary>
  orderAdminUrl(ref: EventRef, orderId: string): string | null // pure

  listDiscounts(
    ref: EventRef,
  ): Promise<{ discounts: Discount[]; ticketTypes: TicketTypeRef[] }>
  createDiscount(ref: EventRef, input: CreateDiscountInput): Promise<Discount>
  deleteDiscount(
    ref: EventRef,
    discountId: string,
  ): Promise<{ outcome: 'deleted' | 'retired' }>
  discountRedeemUrl(ref: EventRef, code: string): Promise<string | null>

  issueInvitation(
    ref: EventRef,
    ticketTypeId: string,
    recipient: { email: string; name: string; reference: string },
  ): Promise<InvitationResult>

  identifyWebhook(req: WebhookRequest): WebhookOrigin | null // pure, unauthenticated
  verifyWebhook(req: WebhookRequest): WebhookVerifyResult // with the injected secret(s)
  readSaleEvent(ref: EventRef, req: WebhookRequest): Promise<SaleEvent | null>
}
```

- **Shared helper.** `ticketsOf(orders): { ticket: Ticket; order: Order }[]` is
  the one flat view, for every consumer that wants rows. `groupTicketsByOrder`
  is deleted.
- **Unsupported operations.** A surface checks `capabilities` **before** it
  renders or offers an action. `ProviderUnsupportedError` stays as the backstop,
  and a test asserts that a declared capability and a throwing method never
  disagree.
- **`discountRedeemUrl` is async**, unlike the "pure" method the discounts
  decision described. Pretix's shop address is the event's `public_url`, which
  can be a custom domain, so the adapter reads it once per event and caches it
  with the public catalogue. It makes no write and no per-call network request
  once cached. _(Refinement made while writing the spec; flagged in the PR.)_
- **`orderAdminUrl` stays pure.** The control panel always lives on the base URL.

| Capability       | Checkin             | Tito | Pretix     |
| ---------------- | ------------------- | ---- | ---------- |
| `discounts`      | ✓                   | ✗    | ✓          |
| `paymentDetails` | ✓                   | ✗    | ✓          |
| `invitations`    | ✓ (`provider-sent`) | ✗    | ✓ (`link`) |
| `saleWebhook`    | ✓                   | ✗    | ✓          |

### 4.4 Money and VAT

- **Revenue cards** show `net` when present, else `gross`, and label which one.
- **The budget** reads `net ?? exVat(gross, budget.vatRate)` and labels any part
  derived from gross. It is unknown only when there's neither a `net` nor a
  budget VAT rate.
- `amountsIncludeVat` leaves the interface. `amountBasis` and `toPerTicketAmounts`
  become internal to the Checkin adapter.
- **Per vendor:**
  - Checkin fills `net`.
  - Tito fills `gross`.
  - Pretix fills both: `gross = position.price`, `net = price − tax_value`.

### 4.5 Sold Tickets, counts and dating

- **One rule for a sale**, `isPaidTicket(ticket, context)`, everywhere: the admin
  tickets page, the budget and Marketing snapshots. Snapshots drop their own
  `sum > 0` and gain the classification context. Order status isn't consulted.
- **Counts only include types that admit.** Ticket counts (Outcomes, the
  budget's `ticketCount` and `categoryCounts`) include a ticket only if its
  type's **effective `admits`** isn't false: the role entry, else the vendor's
  `admits`, else admitting by default. Revenue includes every non-complimentary
  item.
- **Dating:** a sale is dated by `order.placedAt`. Snapshots store counts per day
  under deterministic ids, so no per-ticket dedupe key exists or is needed.

## 5. The refactor (Checkin and Tito onto the neutral model)

### 5.1 Strangler, in nine slices

The neutral methods are added **alongside** the old ones. Consumers move group
by group, and the old methods and the Checkin-shaped types are deleted last, so
the type checker proves nothing still uses them. Each slice is independently
mergeable and green.

| #   | Slice                       | Moves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Foundation                  | Neutral types, `capabilities`, and every new method on the Checkin and Tito adapters, alongside the old ones. **Recorded-fixture tests per adapter** (vendor response → neutral output). `getTicketingProvider` stops silently defaulting to Checkin.                                                                                                                                                                                                                                                                                                                                              |
| N2  | Read path: analytics        | `ticketsOf()` consumers: `tickets/summary.ts`, classification and `classificationContext`, participants, discovery, speaker and volunteer status, workshop eligibility, Marketing snapshots (§4.5), budget income (§4.4).                                                                                                                                                                                                                                                                                                                                                                          |
| N3  | Read path: admin pages      | Orders and companies pages onto `Order[]` (the companies page reads `ticket.company ?? order.company`). Deep links via `orderAdminUrl`, which removes the hard-coded URLs in `OrdersTableWithSearch.tsx`, `speakerStatus.ts` and `volunteerStatus.ts` (Checkin keeps the orders-table form).                                                                                                                                                                                                                                                                                                       |
| N4  | Payment Summary             | `getPaymentDetails` and `requireOrderInCurrentEvent` onto the resolver and `PaymentSummary` (`orderId: string`); `PaymentDetailsModal` renders optional fields only when present; reconcile reads `total` / `vat`.                                                                                                                                                                                                                                                                                                                                                                                 |
| N5  | Discounts                   | The tickets router: the `checkin()` helper, `requireCheckinEventId` and `listEventDiscounts` go. Also `sponsor-crm/discount-codes.ts` and the discount manager (the "Total Order (N)" and "Tickets Only / All Items" columns dropped; new kinds displayed; delete-or-retire notice), `discounts/usage.ts`, `removesFullPrice` (true for `percent ≥ 100` and `set` 0), `providerCodeId = Discount.id` (stored from the created discount), and the sponsor email via `discountRedeemUrl` with today's fallback chain. `system-status/checks.ts` and `settings/activation.ts` move onto the resolver. |
| N6  | Webhook                     | `handleSaleWebhook(providerType, request)` (§8); Checkin's route onto it, path unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| N7  | Invitations                 | `issueInvitation` in `events/handlers/speakerTicket.ts`; the marker stores `invitationId` / `code` when present; the speaker email gets a link-delivery variant.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| N8  | Public types and stored ids | Public prices `{net?, gross?, vatRate?}` through `public.ts`, the pricing grid and the JSON-LD offer; `publicFreeTicketTypeIds` and the grant's `providerTicketId` (§6); `Hero` and `PhaseCtaRow` stop hard-coding "excl. VAT" and use the price basis.                                                                                                                                                                                                                                                                                                                                            |
| N9  | Delete                      | The old methods, `EventTicket` / `EventTicketWithoutDate`, `CheckinPayOrder`, `EventDiscount` / `TicketType` / `CreateEventDiscountInput`, and the Checkin webhook types outside the adapter.                                                                                                                                                                                                                                                                                                                                                                                                      |

N2–N8 depend only on N1 and touch different files, so they can run in parallel.
N9 comes last. **Pretix work (§12) can start after N1.**

### 5.2 Zero change: how it's proven

- **N1's fixture tests are the regression net.** Each adapter is driven from
  recorded vendor responses (Checkin's GraphQL, Tito's REST), and the neutral
  output is asserted value by value.
- **Every later slice keeps the consumer's existing tests green** on that
  neutral output, with the file and test counts checked on every run (AGENTS.md).
- **Moving a call site off a hard-coded Checkin provider onto the resolver gets a
  test** that a Checkin conference still reaches Checkin with the same `EventRef`.

### 5.3 The deliberate behaviour changes (all decided)

| Change                                                                                 | Who sees it                                                       | Decided on          |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------- |
| Discount manager drops the "Total Order (N)" and "Tickets Only / All Items" columns    | Checkin admins (only codes made outside the app had other values) | Neutral model       |
| Payment modal drops `deliveryDate`                                                     | Checkin admins                                                    | Neutral model       |
| Tito surfaces show a "not available on this provider" state instead of a Checkin error | Tito admins                                                       | Neutral model       |
| Snapshots use `isPaidTicket` with context instead of `sum > 0`                         | Outcomes, where a 100 %-off sponsor grant carries an amount       | Outcomes and budget |
| Counts exclude types whose effective `admits` is false                                 | Outcomes and budget counts, where an organizer declared one       | Outcomes and budget |
| Tito budget income is ex-VAT, derived at the budget's VAT rate                         | Tito budget                                                       | Outcomes and budget |
| Hero and PhaseCtaRow price captions follow the price basis                             | Tito public pages (already wrong today)                           | Neutral model       |

Nothing else may change for a Checkin or Tito tenant. A diff that changes
anything else is a defect.

## 6. Stored ids and schema additions

All additions are append-only. Nothing is retyped or removed, so
`sanity/schema-shape.baseline.json` only grows.

| Document       | Addition                                            | Notes                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference`   | `ticketingProvider` gains the option `'pretix'`     | Every hard-coded spot for the provider-type union moves with it (§10).                                                                                                                                                                              |
| `conference`   | `pretixEventSlug: string`                           | The Ticketing Binding's event key.                                                                                                                                                                                                                  |
| `conference`   | `publicFreeTicketTypeIds: string[]`                 | Replaces `publicFreeTicketIds: number[]`, which stays declared but hidden. Checkin ids are stored as `String(id)`; the toggle input becomes `z.string().min(1)`. **No migration**: no production conference has the old field (checked 2026-10-16). |
| `organization` | `pretixBaseUrl: url`, `pretixOrganizerSlug: string` | **Operator-only**, edited like `secretEnvSlug`, never by org admins. Validated by the base-URL guard (§7.2) and the uniqueness rule (§7.3).                                                                                                         |
| `speaker`      | `ticketEmailGrants[].providerTicketId: string`      | New grants write it; `TicketAddressModal` shows `providerTicketId ?? ticketId`; the old `ticketId` is hidden. **No production write**: the 13 existing grants keep their number.                                                                    |

- `linkedDiscountCodes[].providerCodeId` is already a string. Its meaning is
  fixed as the neutral `Discount.id`.
- `ticketTypeRoles` stays keyed by name.
- `src/lib/conference/contract.ts`, the cross-app read contract, gains nothing,
  because the control panel doesn't read ticketing fields.

## 7. The Pretix Ticketing Connection

### 7.1 Storage

- **On the Organization:** base URL and Pretix organizer slug (§6).
- **In env: only secrets**, as a new **per-org-only `pretix` secret family**
  (`docs/TENANT_SECRETS.md`), separate from `ticketing`, so a Checkin bag can
  never reach a Pretix conference:
  - `TENANT_<SLUG>_PRETIX_API_TOKEN`
  - `TENANT_<SLUG>_PRETIX_WEBHOOK_SECRET`
  - optional `TENANT_<SLUG>_PRETIX_WEBHOOK_SECRET_PREVIOUS`
  - or the same fields in `TENANT_SECRETS_JSON`
- **No platform fallback.** An org without the secrets is "not configured".
- **The token is a Pretix team token** with exactly `event.orders:read`,
  `event.vouchers:read` and `event.vouchers:write`. Never
  `organizer.settings.general:write` or `event.items:write`.

### 7.2 Base-URL guard

Applied at save (Studio validation) and before every call:

- `https://` only
- a hostname, not an IP literal
- not `localhost`, `*.local` or `*.internal`
- no userinfo
- redirects are never followed (`redirect: 'manual'`; any 3xx is an error)
- a 10 s timeout

This light guard is enough only because an operator sets the base URL.
**Self-serve setup would require the full SSRF guard**: resolve DNS, refuse
private, loopback, link-local and metadata ranges, and pin the resolved address.

### 7.3 One tenant per Pretix organizer account

`(base URL, Pretix organizer slug)` is unique across Organizations, enforced by
Studio validation plus a guard when the connection is resolved. On a collision,
**both** organizations resolve as not configured and the collision is logged
loudly (the `secretEnvSlug` rule). The binding claim check
(`ticketingBindingIsClaimed`) extends to Pretix, keyed on
`(Pretix organizer account, event slug)`.

### 7.4 Status and activation

- **System status** makes one probe per bound conference,
  `GET /api/v1/organizers/<slug>/events/<event>/`, and reports one of:
  - **connected**
  - **rejected**, on 401/403: "check the Pretix organizer slug, event slug and
    token". A wrong slug is also a 403, not a 404 (observed), so the two can't be
    told apart.
  - **unreachable**: network error, timeout or 3xx
  - **not configured**: an org field, a secret or the event slug is missing
- The webhook is reported as **not verifiable**.
- **Activation's "Ticketing connected"** checks only that the configuration is
  present, with no network call (as for Checkin).

## 8. The Pretix adapter

`src/lib/tickets/provider/pretix.ts`, built from injected credentials (it never
reads `process.env`).

### 8.1 Client

- **Auth:** `Authorization: Token <token>` against `<baseUrl>/api/v1/`, with the
  base-URL guard and 10 s timeout from §7.2.
- **Pagination** follows `next`.
- **Rate limits:** on 429, respect `Retry-After` within a bounded budget, then
  fail as **unavailable**, which the existing "empty is not error" surfaces
  already render.

### 8.2 Products → Ticket Types

- **Identity:** each `(item, variation?)` is one Ticket Type, with id `"<item>"`
  or `"<item>:<variation>"`.
- **Name:** `"<variation>: <item>"` for a variation, otherwise the item's own
  name. The "Tier: Category" grid parser (`buildPricingMatrix`, first colon)
  works unchanged, whether tiers are set up as variations or as tier-prefixed
  item names.
- **Locale:** names, and question labels in `answers[]`, use the event's
  **default locale**, read from `…/events/<e>/settings/` `locale`, which the app
  token can read (observed). The fallback is `en`, then the first key present.
  Bokmål is `nb-no`.
- **Matching stays by name** (roles, workshop access, speaker lookup). A rename
  in Pretix behaves like a rename in Checkin: on a conference that has declared
  roles the type becomes `unclassified` and is reported, never silently granted
  or denied.
- **`admits`** comes from the item's `admission` flag.
- **Speaker and volunteer types** use the existing rules unchanged.
  `requiresInvitation` comes from the item's `require_voucher` and is inherited
  by its variations. The adapter reads `GET /items/?active=true`, which includes
  voucher-only and `hide_without_voucher` items and excludes inactive ones
  (observed).
- **Display order** is the lexicographic rank of (category position, item
  position, variation position).
- **Price, window and availability:** a variation's price and window override
  the item's. `available` is the tightest quota covering the type, from
  `/quotas/?with_availability=true`. Pretix's own product categories aren't used.

### 8.3 Public ticket types

- **Reads:** `GET /events/<e>/`, `/items/?active=true` (variations embedded),
  `/taxrules/` and `/quotas/?with_availability=true`. They're cacheable with
  `If-Modified-Since`.
- **Prices:** `vatRate` comes from the tax rule. `gross` and `net` are computed
  from `default_price` and the rule's `price_includes_tax`.
- **Windows:** `available_from` / `available_until` become `visibleFrom` /
  `visibleUntil`.

### 8.4 Orders feed

`GET /orders/?testmode=false`, keeping status `p` and `n`. Expired (`e`) and
canceled (`c`) orders are excluded. Canceled positions are hidden by default
(observed).

| Neutral field         | Pretix source                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Order.id`            | order `code`                                                                                                                                                                                     |
| `Order.placedAt`      | `datetime`                                                                                                                                                                                       |
| `Order.status`        | `p` → `paid`, `n` → `pending`                                                                                                                                                                    |
| `Order.buyer`         | invoice-address name, else none; order `email`                                                                                                                                                   |
| `Order.company`       | `invoice_address.company`                                                                                                                                                                        |
| `Order.outstanding`   | `total − Σ payments{confirmed, refunded} + Σ refunds{done, transit, created}` (0 total when canceled). **May be negative.**                                                                      |
| `Ticket.id`           | position `id`                                                                                                                                                                                    |
| `Ticket.ticketType`   | `(item, variation)` per §8.2                                                                                                                                                                     |
| `Ticket.attendee`     | the position's own attendee, else the **parent position's** (for an add-on, `addon_to`), else the order's buyer. The API doesn't enforce attendee email (observed), so the fallback is required. |
| `Ticket.price`        | `gross = price`, `net = price − tax_value`                                                                                                                                                       |
| `Ticket.discountCode` | the voucher id mapped to its code via one `GET /vouchers/` per fetch                                                                                                                             |
| `Ticket.company`      | `position.company`                                                                                                                                                                               |
| `Ticket.jobTitle`     | the answer whose `question_identifier` is `job_title`                                                                                                                                            |
| `Ticket.answers`      | `answers[]`, keyed by `question_identifier`, labelled in the default locale                                                                                                                      |

### 8.5 Payment Summary and deep links

- **`fetchPaymentSummary(ref, code)`** reads `GET /orders/<code>/`, its
  `payments[]` and `refunds[]`, and `/invoices/?order=<code>` for the invoice
  number and date.
  - `dueAt` comes from `expires`.
  - `method` is the first confirmed payment's `provider`.
  - `paymentReference` and `notices` are absent.
- **`orderAdminUrl`** returns `<baseUrl>/control/event/<org>/<event>/orders/<CODE>/`.
  The route exists and redirects a logged-out request to login with the order
  path preserved (observed).

### 8.6 Discounts (vouchers)

Pretix's automatic Discounts are neither read nor written. A selection of Ticket
Types maps by **exact match**, so the token gains no privilege:

| Selection                                        | Voucher scope                                                                                                                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none (every type)                                | unscoped, `show_hidden_items: false`                                                                                                                                                                                                    |
| one Ticket Type                                  | `item` (+ `variation`)                                                                                                                                                                                                                  |
| every variation of one item                      | `item`                                                                                                                                                                                                                                  |
| exactly an existing quota's items and variations | `quota`                                                                                                                                                                                                                                 |
| anything else                                    | **refused before any write**; the claim hold is released. Message: "On Pretix a code can cover one ticket type, one product, or one quota. Create a quota for these types in Pretix, or pick fewer." The form shows which quotas match. |

- **Add-ons can't take a voucher** (observed), so `listDiscounts().ticketTypes`
  omits them.
- **Price modes:**
  - `percent` → `percent`
  - `subtract` → `fixed`
  - `set` → `set`
  - `none` → `none`
  - Created codes use `percent`/100.
- **Usage:** `redeemed` becomes `providerUses`. It counts pending and expired
  orders and is incremented by API-created orders too (observed). Our own count
  (`Ticket.discountCode` over the feed) can read lower; `resolveRedemptionCount`
  already labels the source.
- **Create:**
  - `POST /vouchers/` with `X-Idempotency-Key = sha256(conference id + code)`.
  - `validFrom` is refused as unsupported.
  - The `discountCodeClaim` lock is unchanged, because it keys on the code.
- **Delete or retire:**
  - an unused voucher is deleted
  - a used one gets 403 on delete (observed), so it is **retired**:
    `max_usages = redeemed`, the floor Pretix allows (observed), and
    `valid_until = now`
  - sponsor links are untouched
- **Redeem link:** `discountRedeemUrl` returns `<public_url>redeem?voucher=CODE`,
  which pre-fills the code and shows the hidden products in the voucher's scope.

### 8.7 Speaker invitations

- **`issueInvitation`** creates one voucher on the speaker Ticket Type:
  - `max_usages: 1`, `percent`/100
  - `tag: "speaker"`, with the speaker reference in `comment`
  - `X-Idempotency-Key = sha256(conference id + reference)`

  It returns `{ delivery: 'link', url, invitationId, code }`. Our email carries
  the link, and `speakerRegistrationLink` isn't required.

- **Resend reuses the voucher**, looked up by `invitationId`, falling back to
  `tag` plus the reference. A resend on a redeemed voucher is a no-op. There is
  no revocation.
- **Claimed** means an email match, as today (grants included), **or** a ticket
  whose `discountCode` is the speaker's invitation code.
- **Registration links:** the four conference links stay hand-pasted. On Pretix,
  the volunteer link is a shared voucher's redeem link, and the sponsor link is
  only a fallback behind `discountRedeemUrl`.

## 9. The sale webhook

`handleSaleWebhook(providerType, request)` implements, once, the #886 order:
parse → shape pre-filter → identify → resolve the connection → resolve its
secret → verify → read → act. Every failure before verification gets the
byte-identical 401. Checkin's route keeps its path. Pretix gets
**`/api/webhooks/pretix`**.

1. **Registration**, by hand, per the runbook (§11). The URL is
   `https://pretix-webhook:<secret>@<host>/api/webhooks/pretix`, with only
   `pretix.event.order.paid` ticked. Pretix sends the secret as
   `Authorization: Basic` (observed).
2. **Identify:** `{organizer, event}` from the body, a five-field trigger with no
   signature (observed).
3. **Connection:** read the Organizations whose Pretix organizer slug matches.
   For each, compare the presented secret (current and previous) **in constant
   time**. **Exactly one match** proceeds; otherwise, the uniform 401. The
   unauthenticated cost is one small Organization read.
4. **Conference:** only after verification, read the single conference of that
   org with `ticketingProvider: 'pretix'` and `pretixEventSlug == event`, with
   drafts collapsed and ambiguity refused (#731). An unknown event is logged and
   answered 200 "ignored".
5. **Read:** `readSaleEvent` re-fetches the order and returns a `SaleEvent` only
   if it's paid **now**. Test-mode orders return `null`.
6. **Act:** the workshop handler is unchanged in substance:
   `workshopAccessOf(ticket.ticketType.name, ticketTypeRoles)` per ticket,
   emailing `ticket.attendee`.
7. **Status codes:**
   - other actions: 200 "ignored"
   - **never 410**, which disables the hook
   - 5xx **only** when the re-fetch fails, so Pretix retries for about 3 days
   - a per-recipient email failure: 200, logged
   - no dedupe store; `dedupeKey` (connection + `notification_id`) is logged

## 10. Admin surfaces and provider-type spots

- **Every hard-coded spot for the provider-type union** gains `'pretix'`:
  - the Sanity `ticketingProvider` options
  - `lib/conference/types.ts`
  - `lib/features/ticketing.ts`
  - `lib/legal/subprocessors*.ts`
  - `lib/settings/activation.ts`
  - `lib/system-status/checks.ts`
  - `EditConferenceCard.tsx`
  - `lib/tickets/summary.ts` and `admin-access.ts`
  - `lib/conference/sanity.ts`
  - the Marketing snapshot GROQ projection, which must add `pretixEventSlug`
    (§6 rule: never drop a projected field without finding its consumers)
- **Settings:**
  - the Ticketing card offers Pretix with one field, the event slug. The
    Organization's fields are operator-only and shown read-only with their
    status.
  - the registration-link help text explains the shared-voucher volunteer link
    for Pretix.
- **Discount form:** on Pretix, shows the matching quotas and the exact-match
  refusal (§8.6), and never lists add-on types.

## 11. Organizer and operator setup

### 11.1 Organizer checklist (Pretix)

Moves into `docs/TICKET_SYSTEM.md` in slice P7.

- **Tiers:** as variations of one product ("Early Bird", "Standard"), or as
  tier-prefixed product names ("Standard: Conference"). Both produce the grid.
- **Speaker and volunteer tickets:** products whose name contains "Speaker" or
  "Volunteer", with "can only be bought using a voucher" ticked (and optionally
  hidden without one).
- **Sponsor-discountable workshop upgrade:** its own product, not an add-on
  (vouchers can't target add-ons).
- **Non-ticket products** (T-shirts, parking): leave "admission ticket"
  unticked, so they never count as attendees.
- **Job title:** a question with identifier `job_title`. The API requires an
  identifier; the control panel generates a random one if it isn't set.
- **Multi-type sponsor codes:** a quota covering exactly those types.
- **Volunteers:** one shared voucher (max usages = number of volunteers), with
  its redeem link pasted as the volunteer registration link.

### 11.2 Operator runbook

Goes into `docs/TENANT_SECRETS.md` and `docs/INTEGRATION_ADAPTERS.md`.

1. In Pretix, create a team with exactly the three permissions (§7.1) and
   generate its API token.
2. Set the Organization's `pretixBaseUrl` and `pretixOrganizerSlug`, and the
   `TENANT_<SLUG>_PRETIX_*` secrets. **Deploy before binding**, per the existing
   ordering rule.
3. Register the webhook by hand: the URL with the secret (§9), `order.paid` only.
4. **Rotation:** set the new secret as current and the old one as previous,
   update the Pretix hook, wait about 3 days for retries to drain, then remove
   the previous one.
5. Verify in System status (connected), then with one real 100 % voucher order.

## 12. Pretix slices

All of them start after N1.

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                          | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | **Connection and binding:** the schema additions in §6 (`'pretix'` option, `pretixEventSlug`, Organization fields); the `pretix` secret family; the base-URL guard; uniqueness; binding claim; the §10 union spots; the status probe and activation                                                                                                                                            | N1         |
| P2  | **Adapter read path:** the client (§8.1), public ticket types (§8.3), products mapping (§8.2), orders feed (§8.4); the fixture recorder and fixtures (§13)                                                                                                                                                                                                                                     | P1         |
| P3  | **Payment Summary and deep links** (§8.5)                                                                                                                                                                                                                                                                                                                                                      | P2, N3, N4 |
| P4  | **Discounts** (§8.6), including the form's quota hints and refusal                                                                                                                                                                                                                                                                                                                             | P2, N5     |
| P5  | **Invitations** (§8.7)                                                                                                                                                                                                                                                                                                                                                                         | P4, N7     |
| P6  | **Webhook** (§9): `/api/webhooks/pretix` on the shared handler                                                                                                                                                                                                                                                                                                                                 | P2, N6     |
| P7  | **Privacy, subprocessors and docs:** `/privacy` and the subprocessor list (pretix.eu when the base URL's host is `pretix.eu`; a self-hosted instance is the tenant's own, so no platform subprocessor); the §11 checklist into `TICKET_SYSTEM.md`; the secret family and runbook into `TENANT_SECRETS.md`; `INTEGRATION_ADAPTERS.md` (the provider N+1 checklist, Second-provider debt closed) | P1         |
| P8  | **Weekly live contract workflow** (§13)                                                                                                                                                                                                                                                                                                                                                        | P2         |

## 13. Verification strategy

- **Per-PR CI uses recorded fixtures only.**
  - A committed recorder script (ported from `research/pretix-local`) boots
    `pretix/standalone` at a **pinned** version, builds the fixture event, and
    saves real API responses and webhook deliveries under
    `__tests__/fixtures/pretix/`.
  - Contract tests run the adapter mapping, guards, exact-match scoping,
    idempotency keys, delete-or-retire, the uniform 401 and the
    constant-time connection pick against them.
  - The recorder captures webhook deliveries with the private-network guard
    lifted for its own process only, never in the instance config.
- **A weekly, non-required GitHub Actions workflow** boots the pinned image (CI
  runners are amd64, so it runs natively), runs the recorder, and diffs the
  result against the committed fixtures. Drift shows up as a failed scheduled
  run. Re-recording is a manual commit, for example when the image pin is
  bumped.
- **CI cannot falsify:**
  - pretix.eu-specific behaviour (hosted retries, rate limits, custom-domain
    `public_url`)
  - a real end-to-end webhook through a public URL (Pretix refuses private and
    loopback targets, so local development needs a tunnel)
  - the shop's redeem page (it needs a live event with a payment provider)

  These are **manual checks before the first real tenant**, recorded on the P8
  ticket:
  - one 100 % voucher order end to end on the tenant's own instance
  - the webhook arriving through the public URL
  - the redeem link opening the shop with the voucher's hidden products

## 14. Known gaps and risks

- **The redeem page and custom-domain `public_url` are unverified.**
  `discountRedeemUrl` reads `public_url` rather than composing it, for that reason.
- **The payment `method`** for Stripe or PayPal plugins comes through as the
  plugin's provider id (for example `stripe_cc`), unmapped.
- **A Pretix rename fails safe but visibly.** Types become `unclassified` until
  roles are updated, as on Checkin.
- **Duplicate webhook deliveries can send a second workshop email.** This is
  accepted, as on Checkin today.
