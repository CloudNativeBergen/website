# Pretix as a Ticketing Provider

Status: **ready for implementation**. This spec is where the wayfinder map
[Pretix as a ticketing provider](https://github.com/CloudNativeBergen/website/issues/1367)
ends up. Every decision below was made on a closed map ticket. The spec gathers
them and links to the ticket that holds each one's reasoning; to change a
decision, reopen its ticket.

Three kinds of statement aren't map decisions, and each is marked where it
appears:

- **Refinement (spec):** a correction made while writing this spec or during its
  adversarial review, usually because a decided rule couldn't be implemented as
  written. Each one is posted as an amendment on the ticket it refines.
- **Decided in review:** a decision the user took while this spec was being
  reviewed (§15).
- **Adapter detail:** an engineering choice inside one adapter that no consumer
  depends on.

## 1. What this delivers

**Pretix** becomes a third Ticketing Provider, both hosted (pretix.eu) and
self-hosted. It reaches **full parity with Checkin** for everything a tenant
uses:

- public prices
- the admin tickets, orders, companies and ticket-type pages
- discount codes, including the sponsor discount send
- speaker invitations
- sale webhooks and workshop access
- Marketing Outcomes and the budget

First comes a **provider-neutral ticketing model**. Checkin and Tito move onto
it with no change in behaviour, except for the deliberate changes listed in
§5.3. Pretix is then a third adapter with nothing marked unsupported.

### Out of scope

- **Tito parity** (discounts, webhooks, payment details). Tito moves onto the
  neutral types unchanged; finishing it is a separate effort.
- **Self-serve connection setup** by org admins, and a runtime-writable secret
  store.
- Switching provider for a live edition, or migrating orders between providers.
- Pretix check-in, badge printing, seating, or writing a Pretix plugin.
- **Pretix event series** (`has_subevents: true`), where quotas, prices and
  `public_url` are per date. The status probe reports such an event as not
  supported. _Refinement (spec):_ reversible if a tenant needs it.
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
- **Sold Ticket**: a non-complimentary ticket of a type that admits an
  attendee, whether paid or awaiting payment. Sold items that don't admit
  (merchandise, add-ons) count toward revenue only.

## 3. Decision index

| Area                                                 | Decided on                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pretix API facts                                     | [Research: Pretix data model and REST API](https://github.com/CloudNativeBergen/website/issues/1368) (`docs/research/pretix-api.md` on `research/pretix-api`)                              |
| Webhook facts                                        | [Research: Pretix webhooks, authenticity, and tenant routing](https://github.com/CloudNativeBergen/website/issues/1369) (`docs/research/pretix-webhooks.md` on `research/pretix-webhooks`) |
| Observed behaviour                                   | [Task: provision a Pretix test organizer account and API token](https://github.com/CloudNativeBergen/website/issues/1370) (`docs/research/pretix-local/` on `research/pretix-local`)       |
| Connection storage, guard and status                 | [Decide how a Pretix Ticketing Connection is stored and guarded](https://github.com/CloudNativeBergen/website/issues/1371)                                                                 |
| Neutral model (and the amendments posted on it)      | [Decide the provider-neutral ticketing model](https://github.com/CloudNativeBergen/website/issues/1372)                                                                                    |
| Products → Ticket Types                              | [Decide how Pretix products map to Ticket Type names, roles and workshop access](https://github.com/CloudNativeBergen/website/issues/1373)                                                 |
| Discounts                                            | [Decide discounts on Pretix: vouchers, usage counting and sponsor codes](https://github.com/CloudNativeBergen/website/issues/1374)                                                         |
| Invitations and registration links                   | [Decide speaker invitations and registration links on Pretix](https://github.com/CloudNativeBergen/website/issues/1375)                                                                    |
| Sale webhook                                         | [Decide the Pretix sale webhook: route, tenant lookup and authenticity](https://github.com/CloudNativeBergen/website/issues/1376)                                                          |
| Stored ids and rollout                               | [Decide the migration of stored numeric provider ids and the refactor's rollout order](https://github.com/CloudNativeBergen/website/issues/1384)                                           |
| Outcomes and budget                                  | [Decide Marketing Outcomes and budget semantics on the neutral model](https://github.com/CloudNativeBergen/website/issues/1385)                                                            |
| Verification strategy, refinements, review decisions | [Write the Pretix provider spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1377)                                                                      |

## 4. The neutral model

The seam stays `src/lib/tickets/provider/` (`docs/INTEGRATION_ADAPTERS.md`).
The application talks only to the provider interface. Each adapter maps its own
vendor's response in its own file.

### 4.1 Principles

- **Our names, not a vendor's.** The Checkin field names (`order_id`,
  `sum_left`, `crm`, `coupon`, `fields`, `additionals`) leave the shared types.
- **Ids are opaque strings.** Each adapter owns its id format. No consumer
  parses, sorts or does arithmetic on an id.
- **Every method takes an `EventRef`.** The bare numeric `eventId`, and the
  `EventRef | number` overload, go away.
- **The adapter reports only what the vendor states.** A field the vendor
  doesn't provide is absent or `null`, never guessed.
- **Every id that reaches a URL path, a GROQ patch path or a vendor request is
  shape-checked first.** Path segments are `encodeURIComponent`-encoded
  (§8.1).
- **No bearer credential is stored where another user can read it.** Voucher
  codes and redeem URLs never go into a Sanity document that a speaker,
  co-speaker or sponsor can read, and never into logs.

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
    } // baseUrl canonical (§7.2)

interface TicketTypeRef {
  /** Absent when the vendor's order feed names the type but not its id (Checkin). Matching is by name. */
  id?: string
  name: string
  /** The vendor's own answer (Pretix `admission`). An organizer's role entry overrides it. */
  admits?: boolean
}

interface Person {
  name: string | null // display name
  firstName?: string // when the vendor supplies the parts (the participant export needs them)
  lastName?: string
  email: string | null
}

interface Answer {
  key: string // stable identifier: Checkin field key, or for a choice the question part of the additional name (before the last ' - '); Pretix `question_identifier`
  label: string // what is shown; event default locale
  value: string
  kind: 'profile' | 'custom' // keeps today's ordering in question discovery
  /** 'choice': `label` is the question and `value` one option's label; `selected` says whether it was picked. */
  valueType: 'text' | 'choice'
  selected?: boolean // choice only
}

interface Ticket {
  id: string
  ticketType: TicketTypeRef
  attendee: Person
  price: Money // per ticket, after discounts
  discountCode?: string // the code itself, upper-cased; in memory only, never persisted (§4.1)
  /** Tito's per-ticket created_at, when it differs from the order's; null = this ticket is undated, as '' is today. Refinement (spec). */
  soldAt?: string | null
  company?: string // the attendee's own company, when the vendor asks for it
  jobTitle?: string
  answers: Answer[]
}

type OrderStatus = 'paid' | 'pending'

interface Order {
  id: string
  /**
   * Provider-owned precedence, larger = newer: Checkin's and Tito's numeric order id
   * (today's highest-numeric-id rule in volunteerStatus.ts), Pretix's highest position id.
   * Ids stay opaque; consumers that need "the latest order" compare `rank`. Refinement (spec).
   */
  rank: number
  /**
   * ISO 8601, or null when the vendor doesn't say (today Checkin emits '' when
   * its order-user lookup finds no match, and Tito allows a missing created_at).
   * Null orders are excluded from dated charts and snapshots, exactly as '' is
   * today, and kept in undated totals.
   */
  placedAt: string | null
  status: OrderStatus
  buyer: Person
  company?: string // the buyer's company (Pretix: invoice address)
  /**
   * Signed settlement balance, on the provider's amount basis:
   * > 0 owed, 0 settled, < 0 refund due (observed after a partial cancel on Pretix).
   * Unpaid and overdue filters consider only > 0.
   */
  outstanding: Money
  tickets: Ticket[]
}

interface PublicTicketType {
  id: string // required: the catalogue always names its ids
  name: string
  description: string | null
  providerTypeLabel?: string // Checkin's `type`, shown on TicketTypeCard as today
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
  publicUrl?: string // the shop's address (Pretix `public_url`), for link attribution
}

interface PaymentSummary {
  orderId: string
  status: 'paid' | 'pending' | 'canceled' | 'refunded' // mapping tables in §8.5 and §5.4
  statusLabel: string // the vendor's own wording, displayed as today
  /** Checkin's separate `paid` boolean; drives the icon, "Paid in Full" and overdue exactly as today. */
  settled: boolean
  total: Money
  /** A VAT amount has no net/gross basis. Refinement (spec): the decided `vat: Money` can't be filled meaningfully. */
  vat?: number
  outstanding: Money
  currency: string
  method?: string
  placedAt: string | null
  dueAt?: string
  contact: Person
  billingContact?: Person
  invoiceNumber?: string
  invoiceReference?: string
  invoiceDate?: string
  paymentReference?: string // Checkin's KID
  notices: string[] // Checkin's actionRequired; [] when none
}

interface Discount {
  id: string // Checkin: the code (Checkin returns no id; delete addresses `coupon-<code>`). Pretix: the voucher id.
  code: string
  /** 'other' = a vendor kind with no neutral meaning (an unrecognised Checkin type). */
  kind: 'percent' | 'fixed' | 'set' | 'none' | 'other'
  value: number | null // null when the vendor's value doesn't parse
  ticketTypeIds: string[] // empty = every type
  maxUses: number | null
  providerUses: number // the vendor's own redemption counter
  validFrom?: string
  validUntil?: string
}

/** A scope a code can be given. `'any'` means any set of types is expressible (Checkin). */
type DiscountScopes =
  | 'any'
  | {
      id: string
      label: string
      kind: 'all' | 'type' | 'item' | 'quota'
      ticketTypeIds: string[]
    }[]

interface CreateDiscountInput {
  code: string
  kind: 'percent' // the only kind the app creates
  value: number // 1–100
  maxUses: number
  /** Required when `scopes` is a list: two scopes can cover the same types (an item and a quota over it). */
  scopeId?: string
  ticketTypeIds: string[] // used when `scopes` is 'any'; checked against the chosen scope otherwise
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

interface InvitationRequest {
  recipient: { email: string; name: string; reference: string } // reference = the published speaker id
  message: string // today's "Welcome as a speaker at <conference>!"; Pretix ignores it
  existing?: { invitationId: string } // from the marker, on resend
}

type InvitationResult =
  | { delivery: 'provider-sent' } // Checkin mailed its own invitation
  | { delivery: 'link'; url: string; invitationId: string; codeHash: string } // Pretix: we mail `url`; the marker stores id and hash only
  | { delivery: 'already-redeemed'; invitationId: string; codeHash: string } // Pretix: a live ticket used it; send nothing, repair the marker
  | { delivery: 'held-by-expired-order'; orderId: string } // Pretix: an expired order holds the use; the organizer must cancel it first
  | { delivery: 'held-by-test-order'; orderId: string } // Pretix: a test-mode order holds the use; the organizer must delete it first

interface Capabilities {
  discounts: boolean
  paymentDetails: boolean
  /** Known BEFORE issuing, so the handler can run the right pre-write guard. */
  invitations: false | 'provider-sent' | 'link'
  saleWebhook: boolean
}
```

### 4.3 The interface

**During the migration the neutral interface is a separate object.** Several
of today's method names (`fetchPublicTicketTypes`, the discount methods,
`verifyWebhook`) have incompatible signatures, so one class can't implement
both interfaces. N1 therefore gives each adapter a second object:

- `neutral(): NeutralTicketingProvider`, built from the same injected
  credentials
- a neutral resolver, `resolveNeutralTicketing(binding)`, next to today's
  `resolveTicketingProvider`

Migrated consumers use only the neutral one. N9 deletes the old interface and
resolver and makes the neutral ones the only ones, named `TicketingProvider`
and `resolveTicketingProvider`.

```ts
interface NeutralTicketingProvider {
  readonly name: string
  readonly capabilities: Capabilities
  /** 'apportioned': per-ticket prices are an even split of an order total (Checkin). Drives `revenueApportioned`. */
  readonly priceAllocation: 'reported' | 'apportioned'
  isConfigured(): boolean

  fetchPublicTicketTypes(
    ref: EventRef,
  ): Promise<{ event: PublicEventInfo; ticketTypes: PublicTicketType[] }>
  fetchEventOrders(ref: EventRef): Promise<Order[]>
  fetchPaymentSummary(ref: EventRef, orderId: string): Promise<PaymentSummary>
  orderAdminUrl(ref: EventRef, orderId: string): string | null // pure

  listDiscounts(ref: EventRef): Promise<{
    discounts: Discount[]
    ticketTypes: TicketTypeRef[]
    scopes: DiscountScopes
  }>
  createDiscount(ref: EventRef, input: CreateDiscountInput): Promise<Discount>
  deleteDiscount(
    ref: EventRef,
    discountId: string,
  ): Promise<{ outcome: 'deleted' | 'retired' }>
  discountRedeemUrl(ref: EventRef, code: string): Promise<string | null>

  issueInvitation(
    ref: EventRef,
    ticketTypeId: string,
    request: InvitationRequest,
  ): Promise<InvitationResult>

  identifyWebhook(req: WebhookRequest): WebhookOrigin | null // pure, unauthenticated
  verifyWebhook(req: WebhookRequest): WebhookVerifyResult // with the injected secret(s)
  readSaleEvent(ref: EventRef, req: WebhookRequest): Promise<SaleEvent | null>
}
```

- **Question answers.** N1's Checkin mapping converts today's encoding (`"<question> - <option>"` with `'1'` / `'0'`) into `valueType: 'choice'` answers with `selected`. N2's `questions.ts` then discovers choices from `valueType` instead of parsing names. Fixture tests compare the discovered questions and `SpeakerTable` filters before and after, plus single-choice, multi-choice and identically worded free-text cases.
- **Shared helper.** `ticketsOf(orders): { ticket: Ticket; order: Order }[]` is
  the one flat view, for every consumer that wants rows. `groupTicketsByOrder`
  is deleted.
- **Unsupported operations.** A surface checks `capabilities` **before** it
  renders or offers an action. `ProviderUnsupportedError` stays as the
  backstop, and a test asserts that a declared capability and a throwing method
  never disagree.
- **`discountRedeemUrl` is async.** _Refinement (spec):_ Pretix's shop address
  is the event's `public_url`, which can be a custom domain, so a pure method
  can't produce the decided link. The adapter reads `public_url` once **per
  `EventRef`** and caches it with the public catalogue.
- **`orderAdminUrl` stays pure.** The control panel always lives on the base
  URL.

| Capability        | Checkin           | Tito         | Pretix       |
| ----------------- | ----------------- | ------------ | ------------ |
| `discounts`       | ✓                 | ✗            | ✓            |
| `paymentDetails`  | ✓                 | ✗            | ✓            |
| `invitations`     | `'provider-sent'` | `false`      | `'link'`     |
| `saleWebhook`     | ✓                 | ✗            | ✓            |
| `priceAllocation` | `'apportioned'`   | `'reported'` | `'reported'` |

### 4.4 Money and VAT

- **Revenue cards** show `net` when present, else `gross`, and label which one.
  The label comes from the basis present, replacing `amountsIncludeVat`, which
  leaves the interface. `amountBasis` and `toPerTicketAmounts` become internal
  to the Checkin adapter. Its effect stays visible through `priceAllocation`,
  so `tickets/summary.ts` keeps its "apportioned" disclosure.
- **The budget** reads `net ?? exVat(gross, budget.vatRate)` and labels any
  part derived from gross. It is unknown only when there's neither a `net` nor
  a budget VAT rate.
- **Per vendor:**

  | Vendor  | `price`                                             | `outstanding`            |
  | ------- | --------------------------------------------------- | ------------------------ |
  | Checkin | `net`                                               | `net` (from `sum_left`)  |
  | Tito    | `gross`                                             | `gross`                  |
  | Pretix  | `gross = position.price`, `net = price − tax_value` | `gross` (computed, §8.4) |

### 4.5 Sold Tickets, counts and dating

- **One rule for a sale**, `isPaidTicket(ticket, context)`, everywhere: the
  admin tickets page, the budget and Marketing snapshots. Snapshots drop their
  own `sum > 0` and gain the classification context. Order status isn't
  consulted.
- **Counts only include types that admit.** Ticket counts (Outcomes, the
  budget's `ticketCount` and `categoryCounts`) include a ticket only if its
  type's **effective `admits`** isn't false: the role entry, else the vendor's
  `admits`, else admitting by default. Revenue includes every non-complimentary
  item.
- **Dating:** a sale is dated by `ticket.soldAt !== undefined ? ticket.soldAt : order.placedAt`; a `null`
  one is undated, as `''` is today. _Refinement (spec):_ `soldAt` keeps Tito's
  per-ticket timestamps, which today date each ticket and break ties in
  `tickets/utils.ts`, so a registration with tickets bought at different times
  keeps its daily split. (Refines "Decide Marketing Outcomes and budget semantics on
  the neutral model", which dated by `order.placedAt`.) Snapshots store counts per day under deterministic ids, so no
  per-ticket dedupe key exists or is needed.

## 5. The refactor (Checkin and Tito onto the neutral model)

### 5.1 Strangler, in nine slices

Each adapter gains its `neutral()` object **alongside** the old interface.
Consumers move group by group onto the neutral resolver, and the old interface
and the Checkin-shaped types are deleted last, so the type checker proves
nothing still uses them. Each slice is independently mergeable and green. Every
live consumer of the old methods is assigned to exactly one slice below.

| #   | Slice                                       | Moves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | After  |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| N1  | Foundation                                  | `NeutralTicketingProvider`, the types, `capabilities`, `priceAllocation`, `ticketsOf()`, each adapter's `neutral()` and `resolveNeutralTicketing`. Tito's invented `-ticketId` order id becomes an explicit synthetic string id. **Recorded-fixture tests per adapter** (vendor response → neutral output, value by value). `getTicketingProvider` stops silently defaulting to Checkin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —      |
| N2  | Read path: analytics and status             | `ticketsOf()` consumers: `tickets/summary.ts` (keeping `revenueApportioned` via `priceAllocation`), `tickets/utils.ts`, classification and `classificationContext`, participants (the export keeps first and last name), discovery, `src/lib/status/summary.ts`, `dashboard/widget-data.ts`, Marketing snapshots (§4.5), budget income (§4.4). Discount usage (`discounts/usage.ts` `calculateDiscountUsage`), `freeAllocation.ts` and `removesFullPrice`, which `summary.ts` and classification consume: `removesFullPrice` stays tri-state, true for `percent ≥ 100` and `set` 0, false for `none`, `'unknown'` for `fixed`, `other` and a `null` value. These land as neutral twins; the legacy forms stay for N5's callers (see the rule below the table). Speaker and volunteer status, **including** `volunteerStatus.ts`'s latest-order selection on `Order.rank` instead of the numeric id, with last-wins ties as today and a regression for order ids 9 and 10, `resolveSpeakerTicketType` and their deep links via `orderAdminUrl`. The grant write in `server/routers/speaker.ts`, which now writes `providerTicketId` from the neutral string id, together with its `TicketEmailGrant` type and schema field and `TicketAddressModal` showing `providerTicketId ?? ticketId` (§6), so no grant ever loses its label. Workshop eligibility. The revenue label from the price basis (`admin/tickets/page.tsx`, `TicketAnalysisClient`, `TicketSalesChartDisplay`). | N1     |
| N3  | Read path: orders and companies             | The orders page and `OrdersTableWithSearch` onto `Order[]`, with `orderAdminUrl` (Checkin keeps the orders-table form) and unpaid/overdue on `outstanding > 0`. The companies page credits **the whole order** to `order.company`, as it does today with the first ticket's fields. _Refinement (spec):_ the neutral-model decision wrote `ticket.company ?? order.company`, which would reallocate a mixed-company Checkin order across companies and break the zero-change rule. Checkin's adapter sets `order.company` from the first ticket's company (today's rule), and Pretix from the invoice address, falling back to the first ticket's. The whole-order speaker exclusion stays. A mixed-company fixture proves unchanged totals, and the orders table's Organization and Job Title columns are asserted unchanged for recorded Checkin orders. `groupTicketsByOrder` (`tickets/api.ts`) is deleted here, since `Order[]` replaces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | N4     |
| N4  | Payment Summary                             | `getPaymentDetails` onto the neutral resolver and `PaymentSummary`. **`requireOrderInCurrentEvent` is rewritten**: it guards on the order id (a string) being in this conference's neutral feed, not on `checkinEventId` / `checkinCustomerId`. `schemas/tickets.ts` `orderId` becomes a shape-checked string. `PaymentDetailsModal` keeps its icon, "Paid in Full" and overdue logic on `settled`, `outstanding` and `dueAt` exactly as today, and renders optional fields only when present. Reconcile reads `total` / `vat`. N4 moves `tickets/api.ts`'s `isPaymentOverdue` / `getDaysOverdue` onto `PaymentSummary` (`settled`, `outstanding`, `dueAt`). N4 also owns the payment boundary inside `OrdersTableWithSearch`: its `getPaymentDetails` query (string order id) and what it passes to `PaymentDetailsModal`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | N1     |
| N5  | Discounts, status, activation               | The tickets router: `requireCheckinEventId` and `listEventDiscounts` go, reusing N4's guard. The `checkin()` helper loses its N5 callers here and is deleted in N9, because N8's `getTicketTypes` still calls it. `sponsor-crm/discount-codes.ts`; the discount page's `providerType === 'checkin'` gate becomes the `discounts` capability. The discount manager: the "Total Order (N)" and "Tickets Only / All Items" columns dropped; "Price set to X" / "Unlocks only" for the new kinds; scope choices from `scopes`, posting `scopeId`; the notice "retired: used N times, so Pretix keeps it", with the row staying listed as used up. `providerCodeId = Discount.id`, stored from the created discount. The sponsor email via `discountRedeemUrl` with today's fallback chain. `system-status/checks.ts` and `settings/activation.ts` select the provider through the resolver, with **Checkin's status and activation output unchanged** (they still check configuration; the Pretix probe is new, in P1b).                                                                                                                                                                                                                                                                                                                                                                                                                                                          | N2, N4 |
| N6  | Webhook                                     | `handleSaleWebhook(providerType, request)` (§9); Checkin's route onto it, path and responses unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | N1     |
| N7  | Invitations                                 | `issueInvitation` in `events/handlers/speakerTicket.ts`. The `speakerRegistrationLink` pre-write guard runs **only when `capabilities.invitations === 'provider-sent'`**, in both places it exists today: the handler and the speaker router (`server/routers/speaker.ts` `runTicketSweep` / `hasUsableRegistrationLink`, and its `NO_REGISTRATION_LINK_MESSAGE`), which refuses before the handler is reached. The marker gains `invitationId` / `invitationCodeHash` (§6). `recordSpeakerTicketEmailed` (`lib/proposal/data/sanity.ts`) re-records a marker by `_key`, setting three fields today, and must set the two new paths too, so a re-record keeps them current. The link-delivery email variant (§8.7). `scripts/backfill-speaker-ticket-markers.ts` onto the neutral methods.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | N2     |
| N8  | Public types, ticket-types page, stored ids | Public prices `{net?, gross?, vatRate?}` through `public.ts`, the pricing grid and the JSON-LD offer. The **whole ticket-types surface**: `admin/tickets/types/page.tsx`, `TicketTypeCard` (with `providerTypeLabel`) and `PublicFreeTicketToggle`. `WorkshopTickets.tsx`. `publicFreeTicketTypeIds` (§6). `Hero`, `PhaseCtaRow` and the `TicketPricingGrid` caption stop hard-coding "excl. VAT" and use the price basis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | N2     |
| N9  | Delete                                      | The old `TicketingProvider` interface and resolver, renaming the neutral ones to those names. `EventTicket` / `EventTicketWithoutDate`, `CheckinPayOrder`, `EventDiscount` / `TicketType` / `CreateEventDiscountInput`, the Checkin webhook types outside the adapter, and `toPerTicketAmounts` outside the Checkin adapter. The `checkin()` helper in `tickets.ts`. `scripts/dump-ticket-shape.ts` becomes a Checkin-adapter-internal probe (it needs raw amounts, which the neutral model has no equivalent for).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | N2–N8  |

**Shared helpers never change under an unmigrated caller.** A slice that
moves a shared helper onto neutral types adds a **neutral twin** under a new
name and leaves the legacy helper in place for callers owned by later slices.
The legacy one is deleted in N9.

The test is mechanical: **a slice is green only if `pnpm typecheck` (which
includes `scripts/`) passes with no edits outside the files that slice owns**,
and its PR lists every twin it added. For `server/routers/tickets.ts`, which
four slices touch, ownership is **per procedure** (below), and the test reads
"the files, or the named procedures of `tickets.ts`, that the slice owns". Known cases, not an exhaustive list:

| Helper                                                          | Legacy form kept for                         | Until |
| --------------------------------------------------------------- | -------------------------------------------- | ----- |
| `resolveSpeakerTicketType`                                      | `events/handlers/speakerTicket.ts`           | N7    |
| `toTicketCandidates`, `redeemedSpeakerEmails` (`EventTicket[]`) | `scripts/backfill-speaker-ticket-markers.ts` | N7    |
| `calculateDiscountUsage` (`EventTicket[]`)                      | the tickets router                           | N5    |
| `removesFullPrice`, `freeAllocation` (`EventDiscount`)          | the tickets router, `sponsor-crm`            | N5    |
| `buildClassificationContext`, `TicketClassificationAccess`      | `admin/tickets/types/page.tsx`               | N8    |

**`server/routers/tickets.ts` by procedure.**

- **N2:** `speakerTicketStatus`, `volunteerTicketStatus`, `searchEventTickets`,
  `summary`, `exportParticipants`
- **N4:** `getPaymentDetails`, `requireOrderInCurrentEvent`, `orderIdsForEvent`
- **N5:** `checkin()`, `requireCheckinEventId` and the discount procedures
- **N8:** `getTicketTypes`

**File ownership.** N2 owns `speakerStatus.ts`, `volunteerStatus.ts`,
`classificationContext.ts` and `resolveSpeakerTicketType`. N3 owns the orders
and companies pages. N8 owns the ticket-types page. N4 owns
`requireOrderInCurrentEvent` and the orders table's payment boundary, and N3
and N5 build on it. N2 owns discount usage, `freeAllocation` and
`removesFullPrice`.

_Refinement (spec)_ of "Decide the migration of stored numeric provider ids and the refactor's rollout order", which ran slices 2–8 in parallel: review found shared files and helpers, hence the edges below and the grant id moving into N2.

**Parallel work.** After N1: N2, N4 and N6 in parallel. After N2: N7 and N8.
After N4: N3. After N2 and N4: N5. **Pretix adapter work (P2) starts after N1** (§12).

### 5.2 Zero change: how it's proven

- **N1's fixture tests are the regression net.** Each adapter is driven from
  recorded vendor responses (Checkin's GraphQL, Tito's REST), and the neutral
  output is asserted value by value.
- **Every later slice keeps the consumer's existing tests green** on that
  neutral output, with the file and test counts checked on every run
  (AGENTS.md).
- **Moving a call site off a hard-coded Checkin provider onto the resolver gets
  a test** that a Checkin conference still reaches Checkin with the same
  `EventRef`.

### 5.3 The deliberate behaviour changes (all decided)

| Change                                                                                                                     | Who sees it                                                       | Decided on                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| Discount manager drops the "Total Order (N)" and "Tickets Only / All Items" columns                                        | Checkin admins (only codes made outside the app had other values) | Neutral model                                             |
| Payment modal drops `deliveryDate`                                                                                         | Checkin admins                                                    | Neutral model                                             |
| Tito surfaces show a "not available on this provider" state instead of a Checkin error                                     | Tito admins                                                       | Neutral model                                             |
| Snapshots use `isPaidTicket` with context instead of `sum > 0`                                                             | Outcomes, where a 100 %-off sponsor grant carries an amount       | Outcomes and budget                                       |
| Counts exclude types whose effective `admits` is false                                                                     | Outcomes and budget counts, where an organizer declared one       | Outcomes and budget                                       |
| Tito budget income is ex-VAT, derived at the budget's VAT rate                                                             | Tito budget                                                       | Outcomes and budget                                       |
| Hero, PhaseCtaRow and the pricing-grid caption follow the price basis                                                      | Tito public pages (already wrong today)                           | Neutral model                                             |
| Speaker and volunteer status deep links use the orders-table URL form (`…/order/<id>`) instead of `…/orders/order?id=<id>` | Checkin admins                                                    | Neutral model (one Checkin form for all three call sites) |
| The shared webhook handler logs ticket ids, not attendee emails                                                            | Server logs only                                                  | Refinement (spec), §9                                     |

Nothing else may change for a Checkin or Tito tenant. A diff that changes
anything else is a defect.

### 5.4 Checkin and Tito status mappings

| Neutral                                              | Checkin                                                                                                                         | Tito                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Order.status`                                       | `outstanding > 0` → `pending`, else `paid` (today's `amountLeft` rule in `tickets/api.ts`)                                      | `outstanding.gross > 0` → `pending`, else `paid`, where `outstanding.gross` is the sum of today's per-ticket balances (0 when the ticket's `state` is `complete`, else its price). Void-ticket filtering and orphan grouping stay as today; fixtures cover mixed states and zero-price incomplete tickets. |
| `Order.placedAt`                                     | the order date, as today                                                                                                        | the **first** ticket's `created_at` in the registration, as `groupTicketsByOrder` dates it today (null when none); `soldAt` on every ticket whose `created_at` differs                                                                                                                                     |
| `PaymentSummary.status`                              | `paymentStatus` `'PAID'` → `paid`, `'PENDING'` → `pending`, anything else → `pending`, with the raw value kept in `statusLabel` | — (no payment details)                                                                                                                                                                                                                                                                                     |
| `PaymentSummary.settled`                             | `paid`                                                                                                                          | —                                                                                                                                                                                                                                                                                                          |
| `Ticket.company`, `Ticket.jobTitle`, `Order.company` | `fields[key == 'company']`, `fields[key == 'work_title']`; the order's is the first ticket's company (today's rule)             | as today                                                                                                                                                                                                                                                                                                   |
| `Discount.kind`                                      | `type` `'percent'` → `percent`, an amount type → `fixed`, anything else → `other`                                               | — (no discounts)                                                                                                                                                                                                                                                                                           |

## 6. Stored ids and schema additions

All additions are append-only. Nothing is retyped or removed, so
`sanity/schema-shape.baseline.json` only grows. (The baseline records paths and
types only, not `hidden` or option lists, so hiding a field and adding an
option can't fail the contract test.)

| Document       | Addition                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference`   | `ticketingProvider` option `'pretix'`                                       | Added in P9 (§12), operator-settable only. P10 exposes it to org admins.                                                                                                                                                                                                                                                                                                                                      |
| `conference`   | `pretixEventSlug: string`                                                   | The Ticketing Binding's event key. Validated against Pretix's slug shape at save. Shown only when the provider is Pretix.                                                                                                                                                                                                                                                                                     |
| `conference`   | `publicFreeTicketTypeIds: string[]`                                         | Replaces `publicFreeTicketIds: number[]`, which stays declared but hidden. Checkin ids are stored as `String(id)`. The toggle input becomes `z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/)`, and the patch path **quotes** the value (`publicFreeTicketTypeIds[@ == "<id>"]`). A test asserts that a `"]` payload is refused. **No migration**: no production conference has the old field (checked 2026-10-16). |
| `organization` | `pretixBaseUrl: url`, `pretixOrganizerSlug: string`                         | **Operator-only**, edited like `secretEnvSlug`, never by org admins. Canonicalised and validated by the base-URL guard (§7.2) and the uniqueness rule (§7.3).                                                                                                                                                                                                                                                 |
| `speaker`      | `ticketEmailGrants[].providerTicketId: string`                              | New grants write it; `TicketAddressModal` shows `providerTicketId ?? ticketId`; the old `ticketId` is hidden. **No production write**: the 13 existing grants keep their number.                                                                                                                                                                                                                              |
| `talk`         | `issuedSpeakerTickets[].invitationId: string`, `invitationCodeHash: string` | Optional; written only for `link` deliveries (§8.7). **Never the code itself**: proposal reads project the whole talk to every speaker on it, so a stored code would hand a co-speaker another speaker's free voucher (the rule `recordSpeakerTicketEmailed` already documents). _Decided in review._ Not a locked schema.                                                                                    |

- `linkedDiscountCodes[].providerCodeId` is already a string. Its meaning is
  fixed as the neutral `Discount.id`.
- `ticketTypeRoles` stays keyed by name.
- `src/lib/conference/contract.ts`, the cross-app read contract, gains nothing,
  because it has no ticketing field.

## 7. The Pretix Ticketing Connection

### 7.1 Storage and resolution

- **On the Organization:** base URL and Pretix organizer slug (§6).
- **In env: only secrets**, as a new **per-org-only `pretix` secret family**,
  separate from `ticketing`, so a Checkin bag can never reach a Pretix
  conference:
  - `TENANT_<SLUG>_PRETIX_API_TOKEN`
  - `TENANT_<SLUG>_PRETIX_WEBHOOK_SECRET`
  - optional `TENANT_<SLUG>_PRETIX_WEBHOOK_SECRET_PREVIOUS`
  - or the same fields in `TENANT_SECRETS_JSON`
- **Store and type changes (P1):**
  - add `pretix` to the `SecretFamily` union (`lib/secrets/types.ts`), to
    `FamilyCredentialsMap`, to `FAMILY_SEGMENT` / `REQUIRED_FIELDS` and the
    exhaustive `never` case in `env-per-org.ts`, and to
    `JSON_REQUIRED_FIELDS` in `store.ts`
  - the required fields are `apiToken` and `webhookSecret`, with the previous
    secret optional, so a half-filled JSON bag can't shadow the chain
  - add `'pretix'` to `TicketingProviderType` and `conferenceProviderType`
  - `TicketingProviderCredentials` gains `webhookSecretPrevious`
- **How the resolver gets the Organization fields (P1).** Today
  `ConferenceTicketingBinding` carries only `organization._ref`, which tenant
  credential resolution depends on, so it stays exactly as it is. The binding
  gains `pretixEventSlug` and a **sibling**
  `pretixConnection: { pretixBaseUrl?, pretixOrganizerSlug? }`, projected as
  `"pretixConnection": organization->{pretixBaseUrl, pretixOrganizerSlug}` at
  **every binding read**. A dereference returns the Organization's `_id`, not
  `_ref`, so replacing `organization` with a dereference would silently
  unconfigure every conference, Checkin and Tito included. An executed-GROQ
  regression asserts that `organization._ref` survives. P1 enumerates those reads,
  including the cached ones keyed on the serialised binding and the Marketing
  snapshot projection, so no new Sanity read is added per ticketing call. The
  uniqueness guard (§7.3) reuses the cached all-organizations map
  `resolveTenantEnvSlug` already builds, with its projection extended by the
  two fields and its filter widened from `defined(secretEnvSlug)` to
  `defined(secretEnvSlug) || defined(pretixBaseUrl)`. Otherwise an
  Organization whose Pretix secrets live in `TENANT_SECRETS_JSON` would be
  missing from the map and its collisions undetected. A test covers a
  collision between a JSON-only Organization and a slug one.
- **No platform fallback.** An org without the secrets is "not configured".
- **The token** is a Pretix team token with exactly `event.orders:read`,
  `event.vouchers:read` and `event.vouchers:write`. Never
  `organizer.settings.general:write` or `event.items:write`.
- **The webhook secret** is `[A-Za-z0-9_-]{32,}`, validated when the connection
  is resolved. It travels in URL userinfo, where `@ / : % #` would break or
  truncate it.

### 7.2 Base-URL guard and canonical form

- **Applied** at save (Studio validation) and before every call:
  - `https://` only
  - a hostname, not an IP literal
  - not `localhost`, `*.local` or `*.internal`
  - no userinfo, path, query or fragment
  - redirects are never followed (`redirect: 'manual'`). Any 3xx is an error
    **except 304 Not Modified** on a conditional catalogue read, which reuses
    the cached representation for that exact request. A 200 → 304 regression
    covers the client and the catalogue cache together.
  - a 10 s timeout
- **Canonical form:** lower-cased scheme and host, the default port dropped, no
  trailing slash. `www.` is not folded. Studio validation **refuses a value
  that isn't already canonical** (validation can refuse but not rewrite), and
  the resolver canonicalises again. Uniqueness and the binding claim compare
  canonical forms from the cached all-organizations map, never raw GROQ
  strings, and `EventRef.baseUrl` is canonical.
- **Self-serve setup would require the full SSRF guard.** This light guard is
  enough only because an operator sets the base URL. Self-serve would need DNS
  resolved, private, loopback, link-local and metadata ranges refused, and the
  resolved address pinned.

### 7.3 One tenant per Pretix organizer account

- **Uniqueness:** `(canonical base URL, Pretix organizer slug)` is unique across
  Organizations, enforced by Studio validation plus a guard when the connection
  is resolved. On a collision, **both** organizations resolve as not configured
  and the collision is logged loudly (the `secretEnvSlug` rule).
- **The binding claim check** (`ticketingBindingIsClaimed`,
  `server/routers/conference.ts`) extends to Pretix, keyed on
  `(canonical base URL, Pretix organizer slug, event slug)`.

### 7.4 Status and activation

- **System status** also runs the §8.6 "All ticket types" guard for each Pretix
  conference (extra catalogue and voucher reads, owned by P4), and the probe
  reports an event series (`has_subevents: true`) as **not supported**.
- **System status** makes one probe per bound conference,
  `GET /api/v1/organizers/<slug>/events/<event>/`, and reports one of:
  - **connected**
  - **rejected**, on 401/403: "check the Pretix organizer slug, event slug and
    token". A wrong slug is also a 403, not a 404 (observed), so a mistyped
    `pretixEventSlug` shows up here. That matters because the webhook answers a
    verified delivery for an unknown event with 200 (§9).
  - **unreachable**: network error, timeout or 3xx
  - **not configured**: an org field, a secret or the event slug is missing
- The webhook is reported as **not verifiable**.
- **Activation's "Ticketing connected"** checks only that the configuration is
  present, with no network call (as for Checkin).

## 8. The Pretix adapter

`src/lib/tickets/provider/pretix.ts`, built from injected credentials (it never
reads `process.env`).

### 8.1 Client

- **Auth:** `Authorization: Token <token>` against `<baseUrl>/api/v1/`, with
  the base-URL guard and 10 s timeout from §7.2.
- **Path segments** (organizer slug, event slug, order code, voucher id) are
  shape-checked and `encodeURIComponent`-encoded. Order codes match
  `^[A-Z0-9]{1,16}$`.
- **Pagination** follows `next`, only while it stays on the canonical base URL.
- _Adapter detail:_ on 429, respect `Retry-After` within a bounded budget, then
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
  `requiresInvitation` is the item's `require_voucher`, **or** `hide_without_voucher`
  on the item or on that variation. Each variation evaluates it for itself. The adapter reads `GET /items/?active=true`, which
  includes voucher-only and `hide_without_voucher` items and excludes inactive
  ones (observed). That filter is for the **public catalogue only**. Order
  positions resolve against the full catalogue (`GET /items/`, unfiltered, with
  variations), because an order can hold a product deactivated since. A
  position whose item no longer exists at all keeps its id, is named
  `Deleted product <id>`, has no `admits`, and is logged. Classification then
  treats it as unclassified, never guessing.
- **Display order** is the lexicographic rank of (category position, item
  position, variation position). Category positions come from
  `GET /categories/`, read with the items; an item without a category sorts
  first.
- **Price, window and availability:**
  - The price is the variation's resolved `price`, never its `default_price`,
    which is null when inherited.
  - The sale window is the **intersection** of the item's and the variation's,
    because Pretix requires both: `visibleFrom` is the latest non-null start,
    and `visibleUntil` the earliest non-null end. Disjoint windows make the type
    unavailable.
  - _Refinement (spec)_ of "Decide how Pretix products map to Ticket Type
    names, roles and workshop access", which had the variation's window
    override the item's; the same refinement covers the widened
    `requiresInvitation` rule above and "0 when no quota covers it".
  - `available` is the tightest quota covering the
    type, and **0 when no quota covers it** (Pretix refuses to sell such a
    product). The values come from
    `/quotas/?with_availability=true`. Pretix's own product categories aren't
    used.

### 8.3 Public ticket types

- **Reads:** `GET /events/<e>/` (name, currency, `public_url`),
  `/items/?active=true` (variations embedded), `/categories/`, `/taxrules/` and
  `/quotas/?with_availability=true`. _Adapter detail:_ cached with
  `If-Modified-Since`.
- **Prices:** `vatRate` comes from the tax rule. `gross` and `net` are computed
  from the resolved price and the rule's `price_includes_tax`.
- **Public filter:**
  - inactive variations are excluded, as are inactive items
  - only products sold in the web shop are included (`all_sales_channels`, or
    `web` in `limit_sales_channels`), applied to the item **and** to each
    variation, which carries its own channel limits
  - `available_from_mode` / `available_until_mode` are ignored; the window
    keeps today's meaning

  The full catalogue (§8.2) is still used to resolve order positions.

- **Windows:** `available_from` / `available_until` become `visibleFrom` /
  `visibleUntil`.
- `PublicEventInfo.publicUrl` is the event's `public_url` (Checkin and Tito
  leave it absent).
- `providerTypeLabel` is absent.

### 8.4 Orders feed

`GET /orders/?testmode=false`, keeping status `p` and `n`. Expired (`e`) and
canceled (`c`) orders are excluded, and so is a paid order with **no live
positions** (canceled with a fee). It has no tickets to show, and no position
to rank by. Canceled positions are hidden by default
(observed).

| Neutral field             | Pretix source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Order.id`                | order `code`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Order.rank`              | the highest position `id` in the order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Order.placedAt`          | `datetime`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Order.status`            | `p` → `paid`, `n` → `pending`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Order.buyer`             | invoice-address name parts, else none; order `email`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Order.company`           | `invoice_address.company`, else the first position's `company`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Order.outstanding.gross` | `total − Σ payments{confirmed, refunded} + Σ refunds{done, transit, created}`. **May be negative.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Ticket.id`               | position `id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Ticket.ticketType`       | `(item, variation)` per §8.2, id always present                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Ticket.attendee`         | the position's own attendee (`attendee_name_parts` gives the first and last name when the name scheme has them), else the **parent position's** (for an add-on, `addon_to`), else the order's buyer. The API doesn't enforce attendee email (observed), so the fallback is required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Ticket.price`            | `gross = price`, `net = price − tax_value`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Ticket.discountCode`     | the voucher id mapped to its code via one `GET /vouchers/` per fetch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Ticket.company`          | `position.company`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Ticket.jobTitle`         | the answer whose `question_identifier` is `job_title`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Ticket.answers`          | `answers[]` joined by question id to the question catalogue (`GET /questions/`, paginated, read with the items). Labels and option labels in the default locale (§8.2). Choice and multi-choice questions (`C`, `M`) give **`valueType: 'choice'`, one `Answer` per selected option** with `selected: true`, sharing the question's key. A boolean (`B`), which has no options, gives one choice `Answer` with value `Yes` (in the default locale) and `selected` from the answer, matching Checkin's `'1'` / `'0'`; free text gives `valueType: 'text'`, even when its wording matches an option. A file question (`F`) gives the text value "File uploaded", never its answer, which the API rewrites to a token-protected URL. A question missing from the catalogue uses its `question_identifier` as label; a missing option uses the answer's own text. |

### 8.5 Payment Summary and deep links

- **`fetchPaymentSummary(ref, code)`** reads `GET /orders/<code>/`, its
  `payments[]` and `refunds[]`, and `/invoices/?order=<code>` for the invoice
  number and date. That list can hold an original, its cancellation and a
  replacement, so the **current** invoice is used: the newest one that is not
  a cancellation (`is_cancellation: false`) and that no cancellation `refers`
  to. With none, the invoice fields are absent.
  - `status`: `p` → `paid`, `n` → `pending`, `e` → `canceled`, and `c` →
    `refunded` if any refund is done, else `canceled`. `statusLabel` is the
    Pretix status name.
  - `outstanding` uses §8.4's formula, with `total` taken as 0 for status `c`
    (as Pretix's own `pending_sum` does). `settled` is `outstanding.gross <= 0` (the buyer owes nothing). A negative
    balance adds the notice "Refund due: <amount>", so a refund-due order is
    never shown as plainly paid in full.
  - _Adapter detail:_ `dueAt` comes from `expires`, and `method` is the first
    confirmed payment's `provider`.
  - `paymentReference` is absent; `notices` is `[]` unless a refund is due.
- **`orderAdminUrl`** returns
  `<baseUrl>/control/event/<org>/<event>/orders/<CODE>/`. The route exists: it
  redirects a logged-out request to login with the order path preserved
  (observed while writing this spec).

### 8.6 Discounts (vouchers)

Pretix's automatic Discounts are neither read nor written.

**Scopes.** A voucher can name one item (+ variation), one quota, or nothing.
`listDiscounts().scopes` lists exactly what Pretix can express, so the token
gains no privilege and the form offers only valid choices:

| Scope offered                | Voucher                              | Offered when                                                                                                    |
| ---------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| "All ticket types"           | unscoped, `show_hidden_items: false` | **only if every `require_voucher` item in the event is also `hide_without_voucher`** (_decided in review_, §15) |
| one Ticket Type              | `item` (+ `variation`)               | unless it is a speaker- or volunteer-rule type                                                                  |
| every variation of one item  | `item`                               | the item has variations, none of a speaker- or volunteer-rule type                                              |
| an existing quota (its name) | `quota`                              | unless it contains a speaker- or volunteer-rule type; `ticketTypeIds` = the quota's items and variations        |

- **`show_hidden_items`.** Pretix defaults it to **true**, and a voucher with it
  set shows and sells the hidden products in its scope. The rules:
  - an unscoped sponsor voucher sends `false`, as in the table above
  - a scoped sponsor voucher sends `true`, because sponsor products are often
    hidden. **No scope is offered that contains a speaker- or volunteer-rule
    type** (`findSpeakerTicketType` or the volunteer pattern), so a sponsor code
    can never unlock those products. A capacity quota that also covers the
    speaker product isn't offered, for example.
  - a speaker voucher is item-scoped to the speaker type and sends `true`, so
    the hidden speaker product is reachable with it
  - verification after create compares the value sent
- **Exact match before writing.** `createDiscount` refuses a missing or unknown
  `scopeId`, and any `ticketTypeIds` that don't equal that scope's, **before
  any write**; the claim hold is released. Message: "On Pretix a code can cover
  one ticket type, one product, or one quota. Create a quota for these types in
  Pretix, or pick fewer." The scope is re-derived from a fresh catalogue read,
  so the "All ticket types" guard is checked at write time, not just when the
  form loaded.
- **Any unscoped voucher with `show_hidden_items` on**, such as a hand-made one,
  is flagged the same way, because it shows and sells every hidden product.
- **Scoped sponsor vouchers are re-checked too.** Their coverage is the
  quota's or item's _current_ products and variations. Each listing
  recomputes it, and warns and offers retirement whenever it now includes a
  speaker- or volunteer-rule type, for example after a hidden speaker product
  is added to a sponsor's quota. A regression changes quota membership after
  the code was created.
- **The guard is re-checked on every listing, not only at creation.** A later
  catalogue change can make an existing unscoped code unlock a voucher-only
  product: an organizer adds one, or un-hides one. So every `listDiscounts`
  re-evaluates the guard. When it fails while unscoped vouchers exist, System
  status and the discount manager warn: "An All ticket types code can now buy
  <product>; hide the product without a voucher, or retire the code." The
  manager offers a one-click retire.
  - Codes are **never retired automatically**, because that would silently
    break a sponsor's code mid-campaign.
  - _Refinement (spec)_ of the decision in §15.1.
- **The reverse mapping**, for listing: an item-scoped voucher maps to that
  item's Ticket Types, an item-and-variation voucher to one, a quota voucher to
  the quota's items and variations, and an unscoped voucher to `[]` (every
  type).
- **Add-ons can't take a voucher** (observed), so they're never in
  `ticketTypes` or `scopes`.
- **Why the unscoped guard** (observed in Pretix's source): an unscoped voucher
  `applies_to` every item, and a voucher-only item checks only that _some_
  voucher is present. `show_hidden_items: false` therefore keeps the speaker
  and volunteer products out of reach only if they're also hidden without a
  voucher.
- **Price modes:**
  - `percent` → `percent`
  - `subtract` → `fixed`
  - `set` → `set`
  - `none` → `none`
  - Created codes use `percent`/100.
  - A value that doesn't parse is `null`.
- **Usage:** `redeemed` becomes `providerUses`. It counts pending and expired
  orders and is incremented by API-created orders too (observed). Our own count
  (`Ticket.discountCode` over the feed) can read lower;
  `resolveRedemptionCount` already labels the source.
- **Create:**
  - `POST /vouchers/` with
    `X-Idempotency-Key = sha256(JSON.stringify(["voucher", baseUrl, organizerSlug, eventSlug, code]))`.
    _Refinement (spec):_ the key is built from the `EventRef`, which
    identifies the tenant's event as uniquely as the decided conference id and
    which the adapter actually receives. The domain tag and JSON encoding rule
    out collisions with invitation keys.
  - **Pretix's semantics** (research): a reused key **replays the stored
    response** for 24 h, and a 409 means the first request is **still in
    flight**.
  - **On 409:** wait 5 s and retry the same request, with a bounded number of
    tries. A key can stay locked for up to 24 h if the first request never
    completed, so after that budget a **sponsor code** create falls back to a
    fresh random key, on the same code-uniqueness argument. Invitations never
    do (§8.7).
  - _Refinement (spec):_ the replay, 409 and fresh-key rules, scoped
    `show_hidden_items`, and delete-by-attempt were all added while reviewing
    this spec.
  - **After any 2xx**, which may be a replay: `GET /vouchers/<id>/` and verify
    the full intent (code, price mode, value, scope, `max_usages`,
    `valid_until`, `show_hidden_items`) before returning.
    - A mismatch is an error.
    - Pretix also **stores and replays error responses** (all but 409, 429,
      500 and 503) under the same key for 24 h. Any other non-2xx is therefore
      retried once under a fresh random key, on the same code-uniqueness
      argument as below. Key expiry itself is done by Pretix's periodic task.
    - A 404 means the replay was of a voucher since deleted (a code deleted and
      re-created within 24 h). The create is retried once under a fresh random
      key. That's safe, because Pretix keeps codes unique per event: a real
      duplicate answers 400, and is then read by code and verified the same
      way.
  - Nothing is returned, and no sponsor link stored, until verification
    passes.
  - **Codes** are upper-cased and checked for 5–255 characters before the write
    (Pretix upper-cases on save and refuses shorter codes), and compared
    case-insensitively in verification. Sponsor codes come from the app's
    existing generator; speaker voucher codes are left to Pretix to generate.
  - `validFrom` is refused as unsupported.
  - The `discountCodeClaim` lock is unchanged, because it keys on the code.
- **Delete or retire:**
  - the adapter **attempts the DELETE**. "Unused" is defined by the DELETE
    succeeding, never by `redeemed`: Pretix refuses to delete a voucher any order
    position ever referenced, including one whose orders were all cancelled.
  - on 403 (observed) it is **retired**:
    `max_usages = redeemed`, the floor Pretix allows (observed), and
    `valid_until = now`
  - sponsor links are untouched
  - `valid_until = now` is what holds a retirement: a later cancellation lowers
    `redeemed` below the new `max_usages`, so `max_usages` alone isn't enough
- **Redeem link:** `discountRedeemUrl` normalises `public_url`'s path to end in
  `/` and then joins: `new URL('redeem', dir)`, with
  `searchParams.set('voucher', code)`. A bare `new URL('redeem', public_url)`
  drops the event segment when `public_url` has no trailing slash. A test covers
  both forms and a custom domain. The link pre-fills the code and shows the
  hidden products in the voucher's scope.

### 8.7 Speaker invitations

- **Before every create, with or without `existing`**, the adapter searches for
  a voucher with `tag=speaker` and exactly this reference in `comment`:
  - a unique match is reused. If it's used, its holder is classified, never
    inferred from the feed:
    - read `GET /orderpositions/?voucher=<id>&order__status__in=p,n,e`
      (within `event.orders:read`). It returns the holding orders' **codes**
      only, test-mode orders included, with no test-mode filter. The status
      filter matters: a fully cancelled order keeps uncancelled positions.
    - read each distinct `GET /orders/<code>/` for `testmode` and `status`
    - classify by precedence:
      1. any **non-test `p` or `n`** holder: `already-redeemed`, with its
         `invitationId` and `codeHash` (and the marker is repaired)
      2. otherwise any **test-mode** holder: `held-by-test-order` with that
         code. Test orders count toward `redeemed` but never appear in the
         feed. Message: "<speaker>'s personal voucher is held by test-mode order
         <code>; delete it in Pretix, then resend." Deleting a test order frees
         the voucher.
      3. otherwise an **`e`** holder: `held-by-expired-order` with that code.
         Expiry doesn't free a Pretix voucher, while a cancellation does.
         Message: "<speaker>'s personal voucher is held by expired order <code>;
         cancel it in Pretix, then resend." Cancelling frees the voucher, so
         the next resend finds it unused and re-sends the link.
      4. otherwise (the state changed between reads): an error, with nothing
         sent
    - **Where the organizer sees it:** `SpeakerTicketIssuanceResult` gains
      `held: { speakerId, reason: 'expired-order' | 'test-order', orderId }[]`.
      The sweep confirmation and the per-speaker resend result in the speaker
      admin render each entry with its message. The confirm-time bus path
      has no organizer to tell, so it logs the held state (without the code),
      and the next sweep or resend shows it.
      - It is **not** re-opened automatically: Pretix lets an expired order be
        paid later without re-checking voucher usage, so raising `max_usages`
        could give one speaker two tickets.
      - _Refinement (spec)_, replacing the earlier re-open rule.
  - several matches are refused as an error, and nothing is sent
  - **only when none exists** does it create one voucher on the speaker Ticket
    Type

  This keeps "at most one voucher per person" true even when a marker write
  failed after the email went out, beyond the 24-hour idempotency window. The
  handler then rewrites the missing marker, including on `already-redeemed`,
  where it sends no email. The new voucher is:
  - `max_usages: 1`, `percent`/100, scoped to the speaker type's item (+
    variation), `show_hidden_items: true` (§8.6)
  - `tag: "speaker"`, with the speaker reference in `comment`
  - `X-Idempotency-Key = sha256(JSON.stringify(["invite", baseUrl, organizerSlug, eventSlug, reference]))`,
    with the same refinement, replay and 409 handling as §8.6, with one
    difference. **No fresh-key fallback after the 409 budget**: speaker codes
    are Pretix-generated, so a fresh key could mint a second voucher while the
    first request is still running. The attempt fails with nothing sent, and
    the next resend's search-before-create finds whatever the first request
    made. A fresh key is used **only after a Pretix 4xx with a JSON body other
    than 409 and 429**, which can only be Pretix's own refusal or its stored
    replay of one (voucher creation is atomic, so nothing was written). The
    search runs again first, and the fresh key is used only if it finds
    nothing. On a 409, 429, any 5xx, a gateway error or a client timeout
    (§7.2), the first request may still be running, so the adapter retries
    **the same key**. That gives 409 while the first request runs, then its
    stored response, or after a real 500 or 503, whose record Pretix deletes,
    a fresh run of the same atomic request.

  It returns `{ delivery: 'link', url, invitationId, codeHash }`, where
  `codeHash = sha256(code)`.

- **Resend**, with `existing`, looks the voucher up by `invitationId` first,
  then falls back to the search above, and returns the same link, with the code read from Pretix, not from storage. A voucher with a live ticket returns `already-redeemed`, and the
  handler sends nothing; one held by an expired or test-mode order
  returns `held-by-expired-order` or `held-by-test-order`, as above. A
  new voucher is minted only if none exists. There is no revocation.
- **The marker** stores `invitationId` and `invitationCodeHash`, **never the
  code** (§6, _decided in review_).
- **Claimed** means an email match, as today (grants included), **or** a ticket
  whose `sha256(discountCode)` equals the stored `invitationCodeHash`.
- **The email** for a `link` delivery is a variant of today's speaker ticket
  email:
  - the button is the personal link
  - there's no "look out for an invitation from …" line
  - the copy states that the link is personal and works once
  - the final wording is written in N7, held to the taste bar for user-facing
    copy
- **Registration links:** the four conference links stay hand-pasted. On
  Pretix, the volunteer link is a shared voucher's redeem link, and the sponsor
  link is only a fallback behind `discountRedeemUrl`.

## 9. The sale webhook

`handleSaleWebhook(providerType, request)` implements, once, the #886 order:
parse → shape pre-filter → identify → resolve the connection (Pretix) or the
tenant (Checkin) → resolve its secret → verify → read → act. Checkin's route
keeps its path **and its responses**: 400 for unparseable JSON, 200 for
non-order events, the uniform 401, 404 "Conference not found" and 200 "No
tickets in order" after verification, and 500 for an internal error. Step 4's
200 "ignored" for an unknown event is Pretix-only. Pretix gets
**`/api/webhooks/pretix`**.

**Uniform 401, from identify onward.** Every failure from identification
through verification answers the byte-identical 401: an unknown slug, no
candidate, a wrong secret, a malformed `Authorization` header, a secret that
fails its shape rule. The one exception is a **transient** store failure, such
as `TenantEnvSlugUnavailableError` when the slug lookup itself is
indeterminate. That answers 500, as Checkin does today, so the vendor retries
and no sale is lost.

_Refinement (spec):_ this is a deliberate narrow oracle. A 500 appears only
during a store outage, and only for a slug with candidates. That was preferred
over dropping real sales by answering 401 to a retryable failure.

1. **Registration**, by hand, per the runbook (§11). The URL is
   `https://pretix-webhook:<secret>@<host>/api/webhooks/pretix`, with only
   `pretix.event.order.paid` ticked. Pretix sends the secret as
   `Authorization: Basic` (observed).
2. **Identify:** `{organizer, event}` from the body, a five-field trigger with
   no signature (observed). Parsing:
   - the header length is capped before decoding
   - `Basic` is matched case-insensitively
   - strict base64
   - split on the **first** `:`, ignoring the username
3. **Connection:**
   - Read the Organizations whose Pretix organizer slug matches, with drafts
     collapsed onto published ids, **through the §7.3 guard**: a colliding
     pair yields no candidate, consistent with every other path. This is a `groq-global` read, annotated with
     the same justification as the Checkin route.
   - For each, compare `sha256(presented)` with `sha256(secret)`, current and
     previous, using `timingSafeEqual` on the fixed-length digests.
   - **Exactly one distinct Organization** with a matching secret proceeds;
     zero or several get the uniform 401.
   - With no candidates, one comparison round runs against a dummy, so zero and
     one candidate cost the same work. Work still grows with the number of
     candidates: several exist only when the same Pretix organizer slug is
     connected on different instances. That reveals only that a slug is
     shared, which is accepted and stated, together with the one small read,
     as in the Checkin route.
4. **Conference:** only after verification, read the single conference of that
   org with `ticketingProvider: 'pretix'` and `pretixEventSlug == event`, with
   drafts collapsed and ambiguity refused (#731). An unknown event is logged and
   answered 200 "ignored". System status surfaces a mistyped slug (§7.4).
5. **Read:** `readSaleEvent` re-fetches the order and returns a `SaleEvent`
   only if it's paid **now**. Test-mode orders return `null`.
6. **Act:** the workshop handler is unchanged in substance:
   `workshopAccessOf(ticket.ticketType.name, ticketTypeRoles)` per ticket,
   emailing `ticket.attendee`.
7. **Status codes:**
   - other actions: 200 "ignored"
   - **never 410**, which disables the hook
   - Pretix retries **any** non-2xx (only 410 disables the hook), with a 30 s
     timeout per attempt. So the uniform 401 and Checkin-style 404s also
     retry; that costs up to 11 small reads per delivery while a hook is
     misconfigured, which is accepted.
   - _Refinement (spec):_ the handler answers within 25 s. On the Pretix path, workshop emails are
     sent after the response (`after()`), so a slow email provider can't cause
     a re-delivery. Checkin's path is unchanged.
   - 5xx **only** when the re-fetch fails or the store is transiently
     unavailable, so Pretix retries for about 3 days
   - a per-recipient email failure: 200, logged
   - no dedupe store; `dedupeKey` (connection + `notification_id`) is logged
8. **Logging:** ticket ids, order codes and `notification_id` only. Never log
   attendee emails, voucher codes, redeem URLs or `InvitationResult.url`; the
   codes and URLs are bearer credentials.

## 10. Admin surfaces and provider-type spots

**Every hard-coded spot for the provider-type union gains `'pretix'`.** P9
greps `'checkin' | 'tito'`, `=== 'tito'`, `=== 'checkin'` and
`TicketingProviderType` to confirm none is missed. Known today:

- `lib/tickets/provider/index.ts`: the union, the default,
  `ticketingCredentialsConfigured`, `resolveTicketingCredentials` and
  `conferenceProviderType` (P1)
- `lib/secrets/types.ts`, `env-per-org.ts`, `store.ts` (P1, §7.1)
- `lib/conference/types.ts`, `lib/conference/sanity.ts`,
  `lib/features/ticketing.ts`
- `lib/tickets/summary.ts`, `lib/tickets/admin-access.ts` (including the label
  ternary), `lib/tickets/classificationContext.ts` (which returns `undefined`
  for Tito), `lib/tickets/volunteerStatus.ts`
- `lib/legal/subprocessors.ts` and `subprocessors.resolve.ts`, including
  `registrationLinkVendor` (§11.3)
- `lib/settings/activation.ts`, `lib/system-status/checks.ts`,
  `lib/conference/info-faq.ts`
- `server/schemas/conference.ts`: the `z.enum(['checkin', 'tito'])`, plus a
  `pretixEventSlug` twin of the Tito-slug refinement
- `app/(admin)/admin/settings/page.tsx`, `EditConferenceCard.tsx`,
  `app/(admin)/admin/tickets/discount/page.tsx` (its Checkin gate goes in N5)
- `sanity/schemaTypes/conference.ts`: the `ticketingProvider` options and the
  field `hidden` rules (the Checkin fields hide only on `=== 'tito'`, so they
  would show on Pretix)
- the Marketing snapshot GROQ projection (`marketing/snapshots/sanity.ts`),
  which must add `pretixEventSlug` and the dereferenced Organization fields
  (§7.1), because a missing projected field is silently `undefined`
- `scripts/backfill-speaker-ticket-markers.ts`, `scripts/dump-ticket-shape.ts`

**Settings:**

- The Ticketing card offers Pretix (from P10) with one field, the event slug.
  The Organization's fields are operator-only and shown read-only with their
  status.
- The registration-link help text explains the shared-voucher volunteer link
  for Pretix.

**Discount form:** on Pretix, it offers `scopes` (§8.6) instead of a free
multi-select, posts `scopeId`, and never lists add-on types.

## 11. Organizer and operator setup

### 11.1 Organizer checklist (Pretix)

Moves into `docs/TICKET_SYSTEM.md` in slice P7.

- **Tiers:** as variations of one product ("Early Bird", "Standard"), or as
  tier-prefixed product names ("Standard: Conference"). Both produce the grid.
- **Speaker and volunteer tickets:** products whose name contains "Speaker" or
  "Volunteer", with **both** "can only be bought using a voucher" and "hide
  without a voucher" ticked. The "All ticket types" sponsor code is offered only
  when every voucher-only product is also hidden (§8.6).
- **Sponsor-discountable workshop upgrade:** its own product, not an add-on
  (vouchers can't target add-ons).
- **Non-ticket products** (T-shirts, parking): leave "admission ticket"
  unticked, so they never count as attendees.
- **Job title:** a question with identifier `job_title`. The API requires an
  identifier; the control panel generates a random one if it isn't set.
- **Multi-type sponsor codes:** a quota covering exactly those types.
- **Volunteers:** one shared voucher (max usages = number of volunteers),
  **scoped to the volunteer product** (item, or item plus variation), never
  unscoped or quota-wide. An unscoped hand-made voucher applies to everything
  and, by Pretix's default, shows every hidden product. Its redeem link is
  pasted as the volunteer registration link.

### 11.2 Operator runbook

Goes into `docs/TENANT_SECRETS.md` and `docs/INTEGRATION_ADAPTERS.md`.

1. In Pretix, create a team with exactly the three permissions (§7.1) and
   generate its API token.
2. Generate a webhook secret matching `[A-Za-z0-9_-]{32,}`. Set the
   `TENANT_<SLUG>_PRETIX_*` secrets and deploy, then set the Organization's
   `pretixBaseUrl` and `pretixOrganizerSlug` (the binding resolves as "not
   configured" until both are present).
3. **Self-hosted instances only:** confirm the instance runs a Celery worker and
   `pretix runperiodic` on a schedule. Without a task queue, Pretix sends
   webhooks inline and **never retries**, and long retries need
   `runperiodic`, so a failed delivery would silently skip that sale's
   workshop email. The runbook makes this a prerequisite for connecting a
   self-hosted instance. §14 states the gap for instances that don't meet it.
4. Register the webhook by hand: the URL with the secret (§9), `order.paid`
   only.
5. **Rotation:** set the new secret as current and the old one as previous,
   update the Pretix hook, wait about 3 days for retries to drain, then remove
   the previous one. **If the old secret leaked, don't set it as previous.**
6. Verify in System status (connected), then with one real 100 % voucher order.

### 11.3 Privacy and subprocessors

_Decided in review_ (§15). Implemented in P7, in `lib/legal/subprocessors.ts`,
`subprocessors.resolve.ts` and `/privacy`.

- **Hosted:** when the connection's canonical base URL host is `pretix.eu` or a
  subdomain of it, list **"Pretix (pretix GmbH, pretix.eu)"** as a
  subprocessor, as Checkin and Tito are listed today. The hosted API always
  lives on pretix.eu, even when the shop uses a custom domain.
- **Self-hosted:** **no platform subprocessor.** The instance is operated by
  the organization itself, or its own hosting provider. `/privacy` states that
  the organization's own Pretix instance at `<host>` handles ticket purchases.
- **`registrationLinkVendor`** learns the pretix.eu hosts, plus the
  connection's base-URL host and the event's `PublicEventInfo.publicUrl` host, so a pasted
  redeem link is attributed correctly. `registrationLinkVendor` stays a pure
  function: `subprocessors.resolve.ts` passes it the hosts, taking the
  `publicUrl` host from the cached public catalogue. A failed read falls back to
  the base-URL and pretix.eu rule, so `/privacy` gains no new failure mode.
- **`/privacy` adds one line for every provider:** order data, including
  answers to custom questions (which may include dietary or accessibility
  information), is read from the ticketing provider to run the event.

## 12. Pretix slices

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | After           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P1  | **Connection:** the Organization fields and `pretixEventSlug` (§6); the `pretix` secret family, store and type changes, and the binding projection with the dereferenced Organization fields (§7.1); canonicalisation and the base-URL guard (§7.2); uniqueness and the binding claim (§7.3), whose `effective` projection gains `pretixEventSlug`. No conference can select Pretix yet.                                                                                                                                    | N1              |
| P1b | **Status probe:** the §7.4 probe and activation wiring, in `system-status/checks.ts` and `settings/activation.ts`                                                                                                                                                                                                                                                                                                                                                                                                           | P1, P2, N5      |
| P2  | **Adapter read path:** the client (§8.1), public ticket types (§8.3), products mapping (§8.2), the question catalogue and orders feed (§8.4), including `PublicEventInfo.publicUrl`, built from injected credentials and proven against fixtures; the fixture recorder and fixtures (§13)                                                                                                                                                                                                                                   | N1              |
| P3  | **Payment Summary and deep links** (§8.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P1, P2, N3, N4  |
| P4  | **Discounts** (§8.6), including scopes, `scopeId`, the exact-match and unscoped guards, the listing re-check with its System status and discount-manager warning and one-click retire, idempotency verification including replayed errors, and the form                                                                                                                                                                                                                                                                     | P1, P1b, P2, N5 |
| P5  | **Invitations** (§8.7), including claim detection by code hash in `speakerStatus.ts`, which gains the markers as an input. `fetchSpeakerTicketInputs` (`lib/speaker/ticketInputs.ts`) projects `issuedSpeakerTickets[]{ speakerId, email, emailedAt }` today and must add `invitationId, invitationCodeHash`, proven by an executed-GROQ test, since a missing field is silently `undefined` and typecheck stays green                                                                                                      | P4, N7          |
| P6  | **Webhook** (§9): `/api/webhooks/pretix` on the shared handler                                                                                                                                                                                                                                                                                                                                                                                                                                                              | P1, P2, N6      |
| P7  | **Privacy, subprocessors and docs:** §11.3; the §11.1 checklist into `TICKET_SYSTEM.md`; the secret family and runbook into `TENANT_SECRETS.md`; `INTEGRATION_ADAPTERS.md` (the provider N+1 checklist, Second-provider debt closed)                                                                                                                                                                                                                                                                                        | P1, P2          |
| P8  | **Weekly live contract workflow** (§13)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | P2              |
| P9  | **Operator enablement:** the `'pretix'` option in the **Sanity schema only**, settable by an operator in Studio. `server/schemas/conference.ts` and the org-admin router accept `'pretix'` only when the stored document already carries it (so an operator-bound conference can still save its other fields) and **refuse a transition to it**; the §10 grep. Then the **pre-live manual checks** (§13) on an operator-bound test conference against a real Pretix instance through a public URL, recorded on this ticket. | N2–N9, P1–P8    |
| P10 | **Org-admin enablement:** the router's refusal is lifted and the Settings Ticketing card offers Pretix. Released only after P9's manual checks pass.                                                                                                                                                                                                                                                                                                                                                                        | P9              |

### 12.1 Tickets

Every slice is filed as an issue under [Pretix as a ticketing provider: implementation](https://github.com/CloudNativeBergen/website/issues/1388), with the dependencies above as native blocking edges.

| Slice | Issue |
| ----- | ----- |
| N1    | #1389 |
| N2    | #1390 |
| N3    | #1391 |
| N4    | #1392 |
| N5    | #1393 |
| N6    | #1394 |
| N7    | #1395 |
| N8    | #1396 |
| N9    | #1397 |
| P1    | #1398 |
| P1b   | #1399 |
| P2    | #1400 |
| P3    | #1401 |
| P4    | #1402 |
| P5    | #1403 |
| P6    | #1404 |
| P7    | #1405 |
| P8    | #1406 |
| P9    | #1407 |
| P10   | #1408 |

## 13. Verification strategy

- **Per-PR CI uses recorded fixtures only.**
  - A committed recorder script (ported from `research/pretix-local`) boots
    `pretix/standalone` at a **pinned** version, builds the fixture event, and
    saves real API responses and webhook deliveries under
    `__tests__/fixtures/pretix/`.
  - To capture deliveries, the recorder sets
    `allow_http_to_private_networks=on` **in its own throwaway instance's
    config only**, never on a tenant instance.
  - Contract tests run against the fixtures: the adapter mapping, guards,
    exact-match scoping and the unscoped guard, idempotency (replay, 409 and
    the 404-after-delete path), delete-or-retire, the redeem-URL join, the
    uniform 401 and the transient-store 500, Basic parsing, the constant-time
    connection pick, and the code-hash claim match.
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

  These are the **pre-live manual checks**, run in P9 on an operator-bound test
  conference before P10 exposes Pretix to org admins:
  - one 100 % voucher order end to end
  - the webhook arriving through the public URL
  - the redeem link opening the shop with the voucher's hidden products
  - an "All ticket types" code refusing the speaker product
  - a speaker invitation claimed with a different email address

## 14. Known gaps and risks

- **The redeem page and custom-domain `public_url` are unverified** until P9.
  `discountRedeemUrl` reads `public_url` rather than composing it, for that
  reason.
- **The payment `method`** for Stripe or PayPal plugins comes through as the
  plugin's provider id (for example `stripe_cc`), unmapped.
- **A Pretix rename fails safe but visibly.** Types become `unclassified` until
  roles are updated, as on Checkin.
- **Duplicates and replays are accepted.** A delivery has no timestamp or
  nonce, so one captured from Pretix's 30-day call log can be replayed. Each
  replay re-fetches the order and re-sends workshop emails to that tenant's own
  attendees, on the platform's email quota. It stays within one tenant; a
  dedupe store would bound it, and is out of scope.
- **The narrow webhook oracle during a store outage** (§9) is accepted.
- **A self-hosted instance without a task queue never retries a webhook.** The
  runbook requires a worker and `runperiodic` (§11.2). Without them, a failed
  delivery skips that sale's workshop email, though the ticket itself still
  appears in the orders feed.
- **A multi-use sponsor code keeps uses consumed by expired orders**, because
  expiry doesn't free a Pretix voucher. Both a sponsor's and a speaker's
  use is freed by cancelling the expired order in Pretix (§8.7). Raising
  `max_usages` instead risks an extra redemption, because a late payment on the
  expired order isn't re-checked.

## 15. Decided in review

These were put to the user on [Write the Pretix provider spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1377)
on 2026-10-16, after the adversarial reviews raised them:

1. **The "All ticket types" sponsor code on Pretix** (§8.6). Offer it only when
   every voucher-only product is also hidden without a voucher, checked from a
   fresh catalogue read before writing (fails closed). Hiding is mandatory for
   speaker and volunteer products in the checklist (§11.1).
2. **The subprocessor and `/privacy` rule** (§11.3).
3. **The invitation marker stores `invitationCodeHash`, never the code** (§6,
   §8.7). This refines "Decide speaker invitations and registration links on
   Pretix", which had the marker store the code. Proposal reads expose the
   talk document to every co-speaker.
