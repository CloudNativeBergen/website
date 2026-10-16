# Pretix as a Ticketing Provider

Status: **ready for implementation**. This spec is where the wayfinder map
[Pretix as a ticketing provider](https://github.com/CloudNativeBergen/website/issues/1367)
ends up. Every decision below was made on a closed map ticket. The spec gathers
them and links to the ticket that holds each one's reasoning; to change a
decision, reopen its ticket.

Two kinds of statement aren't map decisions, and each is marked where it
appears:

- **Refinement (spec):** a correction made while writing this spec or during its
  adversarial review, usually because a decided rule couldn't be implemented as
  written. Each one is posted as an amendment on the ticket it refines.
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
| Verification strategy, and the refinements      | [Write the Pretix provider spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1377)                                                                      |

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
  doesn't provide is absent, never guessed.
- **Every id that reaches a URL path, a GROQ patch path or a vendor request is
  shape-checked first.** Path segments are `encodeURIComponent`-encoded
  (§8.1).

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
  firstName?: string // when the vendor supplies the parts (participant export needs them)
  lastName?: string
  email: string | null
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
  attendee: Person
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
  status: 'paid' | 'pending' | 'canceled' | 'refunded' // mapping tables in §8.5 and §5.4
  statusLabel: string // the vendor's own wording, displayed as today
  total: Money
  /** A VAT amount has no net/gross basis. Refinement (spec): the decided `vat: Money` can't be filled meaningfully. */
  vat?: number
  outstanding: Money
  currency: string
  method?: string
  placedAt: string
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
  kind: 'percent' | 'fixed' | 'set' | 'none'
  value: number
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
  ticketTypeIds: string[] // must be a listed scope on a provider whose scopes are a list
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
  existing?: { invitationId: string; code: string } // from the marker, on resend
}

type InvitationResult =
  | { delivery: 'provider-sent' } // Checkin mailed its own invitation
  | { delivery: 'link'; url: string; invitationId: string; code: string } // Pretix: we mail the link
  | { delivery: 'already-redeemed' } // Pretix resend on a used voucher: send nothing

interface Capabilities {
  discounts: boolean
  paymentDetails: boolean
  /** Known BEFORE issuing, so the handler can run the right pre-write guard. */
  invitations: false | 'provider-sent' | 'link'
  saleWebhook: boolean
}
```

### 4.3 The interface

N1 adds this as **`NeutralTicketingProvider`**, a separate interface that every
adapter implements **in addition to** today's `TicketingProvider`. Several of
today's method names (`fetchPublicTicketTypes`, the discount methods,
`verifyWebhook`) have incompatible signatures, so the two can't share names
until the old one is gone. N9 deletes the old interface and renames this one to
`TicketingProvider`.

```ts
interface NeutralTicketingProvider {
  readonly name: string
  readonly capabilities: Capabilities
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

| Capability       | Checkin           | Tito    | Pretix   |
| ---------------- | ----------------- | ------- | -------- |
| `discounts`      | ✓                 | ✗       | ✓        |
| `paymentDetails` | ✓                 | ✗       | ✓        |
| `invitations`    | `'provider-sent'` | `false` | `'link'` |
| `saleWebhook`    | ✓                 | ✗       | ✓        |

### 4.4 Money and VAT

- **Revenue cards** show `net` when present, else `gross`, and label which one.
  The label comes from the basis present, replacing `amountsIncludeVat`, which
  leaves the interface. `amountBasis` and `toPerTicketAmounts` become internal
  to the Checkin adapter.
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
- **Dating:** a sale is dated by `order.placedAt`. Snapshots store counts per
  day under deterministic ids, so no per-ticket dedupe key exists or is needed.

## 5. The refactor (Checkin and Tito onto the neutral model)

### 5.1 Strangler, in nine slices

Each adapter implements `NeutralTicketingProvider` **alongside** the old
interface. Consumers move group by group, and the old interface and the
Checkin-shaped types are deleted last, so the type checker proves nothing still
uses them. Each slice is independently mergeable and green. Every live consumer
of the old methods is assigned to exactly one slice below.

| #   | Slice                           | Moves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | After |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| N1  | Foundation                      | `NeutralTicketingProvider`, the types, `capabilities` and `ticketsOf()`. Both adapters implement it. Tito's invented `-ticketId` order id becomes an explicit synthetic string id. **Recorded-fixture tests per adapter** (vendor response → neutral output, value by value). `getTicketingProvider` stops silently defaulting to Checkin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | —     |
| N2  | Read path: analytics and status | `ticketsOf()` consumers: `tickets/summary.ts`, `tickets/utils.ts`, `tickets/api.ts`, classification and `classificationContext`, participants (the export keeps first and last name), discovery, `status/summary.ts`, `dashboard/widget-data.ts`, Marketing snapshots (§4.5), budget income (§4.4). Speaker and volunteer status, **including** their deep links via `orderAdminUrl`. Workshop eligibility. The revenue label from the price basis (`admin/tickets/page.tsx`, `TicketAnalysisClient`, `TicketSalesChartDisplay`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | N1    |
| N3  | Read path: admin pages          | The orders page and `OrdersTableWithSearch` onto `Order[]`, with `orderAdminUrl` (Checkin keeps the orders-table form) and unpaid/overdue on `outstanding > 0`. The companies page (`ticket.company ?? order.company`). The ticket-types page (`admin/tickets/types/page.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | N1    |
| N4  | Payment Summary                 | `getPaymentDetails` onto the resolver and `PaymentSummary`. **`requireOrderInCurrentEvent` is rewritten**: it guards on the order id (a string) being in this conference's neutral feed, resolved via the resolver, not on `checkinEventId` / `checkinCustomerId`. `schemas/tickets.ts` `orderId` becomes a shape-checked string. `PaymentDetailsModal` renders optional fields only when present; reconcile reads `total` / `vat`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | N1    |
| N5  | Discounts, status, activation   | The tickets router: the `checkin()` helper, `requireCheckinEventId` and `listEventDiscounts` go, reusing N4's resolver guard. `sponsor-crm/discount-codes.ts`; the discount page's `providerType === 'checkin'` gate becomes the `discounts` capability. The discount manager: the "Total Order (N)" and "Tickets Only / All Items" columns dropped; "Price set to X" / "Unlocks only" for the new kinds; scope choices from `scopes`; the notice "retired: used N times, so Pretix keeps it", with the row staying listed as used up. `discounts/usage.ts`. `removesFullPrice` stays tri-state: true for `percent ≥ 100` and `set` 0, false for `none`, `'unknown'` for `fixed` and anything unparseable. `providerCodeId = Discount.id`, stored from the created discount. The sponsor email via `discountRedeemUrl` with today's fallback chain. `system-status/checks.ts` and `settings/activation.ts` select the provider through the resolver, with **Checkin's status and activation output unchanged** (they still check configuration; the Pretix probe is new, in P1). | N4    |
| N6  | Webhook                         | `handleSaleWebhook(providerType, request)` (§9); Checkin's route onto it, path unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | N1    |
| N7  | Invitations                     | `issueInvitation` in `events/handlers/speakerTicket.ts`. The `speakerRegistrationLink` pre-write guard runs **only when `capabilities.invitations === 'provider-sent'`**. The marker gains `invitationId` / `invitationCode` (§6). The link-delivery email variant (§8.7). `scripts/backfill-speaker-ticket-markers.ts` onto the neutral methods.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | N1    |
| N8  | Public types and stored ids     | Public prices `{net?, gross?, vatRate?}` through `public.ts`, the pricing grid and the JSON-LD offer. `WorkshopTickets.tsx`. `publicFreeTicketTypeIds` and the grant's `providerTicketId` (§6). `Hero`, `PhaseCtaRow` and the `TicketPricingGrid` caption stop hard-coding "excl. VAT" and use the price basis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | N1    |
| N9  | Delete                          | The old `TicketingProvider` interface, renaming `NeutralTicketingProvider` to it. `EventTicket` / `EventTicketWithoutDate`, `CheckinPayOrder`, `EventDiscount` / `TicketType` / `CreateEventDiscountInput`, the Checkin webhook types outside the adapter, and `toPerTicketAmounts` outside the Checkin adapter. `scripts/dump-ticket-shape.ts` becomes a Checkin-adapter-internal probe (it needs raw amounts, which the neutral model has no equivalent for).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | N2–N8 |

**File ownership.** N2 owns `speakerStatus.ts` and `volunteerStatus.ts`; N3 owns
the orders and companies pages; N4 owns `requireOrderInCurrentEvent`, and N5
builds on it.

**Parallel work.** N2, N3, N6, N7 and N8 can run in parallel after N1, and N4
then N5 run in sequence. **Pretix work (§12) can start after N1.**

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

| Change                                                                                 | Who sees it                                                       | Decided on            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| Discount manager drops the "Total Order (N)" and "Tickets Only / All Items" columns    | Checkin admins (only codes made outside the app had other values) | Neutral model         |
| Payment modal drops `deliveryDate`                                                     | Checkin admins                                                    | Neutral model         |
| Tito surfaces show a "not available on this provider" state instead of a Checkin error | Tito admins                                                       | Neutral model         |
| Snapshots use `isPaidTicket` with context instead of `sum > 0`                         | Outcomes, where a 100 %-off sponsor grant carries an amount       | Outcomes and budget   |
| Counts exclude types whose effective `admits` is false                                 | Outcomes and budget counts, where an organizer declared one       | Outcomes and budget   |
| Tito budget income is ex-VAT, derived at the budget's VAT rate                         | Tito budget                                                       | Outcomes and budget   |
| Hero, PhaseCtaRow and the pricing-grid caption follow the price basis                  | Tito public pages (already wrong today)                           | Neutral model         |
| The shared webhook handler logs ticket ids, not attendee emails                        | Server logs only                                                  | Refinement (spec), §9 |

Nothing else may change for a Checkin or Tito tenant. A diff that changes
anything else is a defect.

### 5.4 Checkin and Tito status mappings

| Neutral                 | Checkin                                                                                                                         | Tito                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `Order.status`          | `outstanding > 0` → `pending`, else `paid` (today's `amountLeft` rule in `tickets/api.ts`)                                      | the registration's paid state |
| `PaymentSummary.status` | `paymentStatus` `'PAID'` → `paid`, `'PENDING'` → `pending`, anything else → `pending`, with the raw value kept in `statusLabel` | — (no payment details)        |

## 6. Stored ids and schema additions

All additions are append-only. Nothing is retyped or removed, so
`sanity/schema-shape.baseline.json` only grows. (The baseline records paths and
types only, not `hidden` or option lists, so hiding a field and adding an
option can't fail the contract test.)

| Document       | Addition                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference`   | `ticketingProvider` option `'pretix'`                                   | Added **last**, in P9 (§12), so no conference can be bound to Pretix before every surface handles it.                                                                                                                                                                                                                                                                                                         |
| `conference`   | `pretixEventSlug: string`                                               | The Ticketing Binding's event key. Validated against Pretix's slug shape at save. Shown only when the provider is Pretix.                                                                                                                                                                                                                                                                                     |
| `conference`   | `publicFreeTicketTypeIds: string[]`                                     | Replaces `publicFreeTicketIds: number[]`, which stays declared but hidden. Checkin ids are stored as `String(id)`. The toggle input becomes `z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/)`, and the patch path **quotes** the value (`publicFreeTicketTypeIds[@ == "<id>"]`). A test asserts that a `"]` payload is refused. **No migration**: no production conference has the old field (checked 2026-10-16). |
| `organization` | `pretixBaseUrl: url`, `pretixOrganizerSlug: string`                     | **Operator-only**, edited like `secretEnvSlug`, never by org admins. Canonicalised and validated by the base-URL guard (§7.2) and the uniqueness rule (§7.3).                                                                                                                                                                                                                                                 |
| `speaker`      | `ticketEmailGrants[].providerTicketId: string`                          | New grants write it; `TicketAddressModal` shows `providerTicketId ?? ticketId`; the old `ticketId` is hidden. **No production write**: the 13 existing grants keep their number.                                                                                                                                                                                                                              |
| `talk`         | `issuedSpeakerTickets[].invitationId: string`, `invitationCode: string` | Optional; written only for `link` deliveries (§8.7). Not a locked schema.                                                                                                                                                                                                                                                                                                                                     |

- `linkedDiscountCodes[].providerCodeId` is already a string. Its meaning is
  fixed as the neutral `Discount.id`.
- `ticketTypeRoles` stays keyed by name.
- `src/lib/conference/contract.ts`, the cross-app read contract, gains nothing,
  because it has no ticketing field.

## 7. The Pretix Ticketing Connection

### 7.1 Storage

- **On the Organization:** base URL and Pretix organizer slug (§6).
- **In env: only secrets**, as a new **per-org-only `pretix` secret family**,
  separate from `ticketing`, so a Checkin bag can never reach a Pretix
  conference:
  - `TENANT_<SLUG>_PRETIX_API_TOKEN`
  - `TENANT_<SLUG>_PRETIX_WEBHOOK_SECRET`
  - optional `TENANT_<SLUG>_PRETIX_WEBHOOK_SECRET_PREVIOUS`
  - or the same fields in `TENANT_SECRETS_JSON`
- **Store changes:** P1 adds `pretix` to the `SecretFamily` union
  (`lib/secrets/types.ts`), to `FAMILY_SEGMENT` / `REQUIRED_FIELDS` in
  `env-per-org.ts`, and to `JSON_REQUIRED_FIELDS` in `store.ts`. The required
  fields are `apiToken` and `webhookSecret`; the previous secret is optional.
  This keeps a half-filled JSON bag from shadowing the chain.
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
  - redirects are never followed (`redirect: 'manual'`; any 3xx is an error)
  - a 10 s timeout
- **Canonical form,** applied at save and again in the resolver: lower-cased
  scheme and host, the default port dropped, no trailing slash. `www.` is not
  folded. Uniqueness, the binding claim and `EventRef.baseUrl` all use the
  canonical form.
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
  `requiresInvitation` comes from the item's `require_voucher` and is inherited
  by its variations. The adapter reads `GET /items/?active=true`, which
  includes voucher-only and `hide_without_voucher` items and excludes inactive
  ones (observed).
- **Display order** is the lexicographic rank of (category position, item
  position, variation position).
- **Price, window and availability:** a variation's price and window override
  the item's. `available` is the tightest quota covering the type, from
  `/quotas/?with_availability=true`. Pretix's own product categories aren't
  used.

### 8.3 Public ticket types

- **Reads:** `GET /events/<e>/` (name, currency, `public_url`),
  `/items/?active=true` (variations embedded), `/taxrules/` and
  `/quotas/?with_availability=true`. _Adapter detail:_ cached with
  `If-Modified-Since`.
- **Prices:** `vatRate` comes from the tax rule. `gross` and `net` are computed
  from `default_price` and the rule's `price_includes_tax`.
- **Windows:** `available_from` / `available_until` become `visibleFrom` /
  `visibleUntil`.

### 8.4 Orders feed

`GET /orders/?testmode=false`, keeping status `p` and `n`. Expired (`e`) and
canceled (`c`) orders are excluded. Canceled positions are hidden by default
(observed).

| Neutral field             | Pretix source                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Order.id`                | order `code`                                                                                                                                                                                                                                                                         |
| `Order.placedAt`          | `datetime`                                                                                                                                                                                                                                                                           |
| `Order.status`            | `p` → `paid`, `n` → `pending`                                                                                                                                                                                                                                                        |
| `Order.buyer`             | invoice-address name parts, else none; order `email`                                                                                                                                                                                                                                 |
| `Order.company`           | `invoice_address.company`                                                                                                                                                                                                                                                            |
| `Order.outstanding.gross` | `total − Σ payments{confirmed, refunded} + Σ refunds{done, transit, created}`. **May be negative.**                                                                                                                                                                                  |
| `Ticket.id`               | position `id`                                                                                                                                                                                                                                                                        |
| `Ticket.ticketType`       | `(item, variation)` per §8.2, id always present                                                                                                                                                                                                                                      |
| `Ticket.attendee`         | the position's own attendee (`attendee_name_parts` gives the first and last name when the name scheme has them), else the **parent position's** (for an add-on, `addon_to`), else the order's buyer. The API doesn't enforce attendee email (observed), so the fallback is required. |
| `Ticket.price`            | `gross = price`, `net = price − tax_value`                                                                                                                                                                                                                                           |
| `Ticket.discountCode`     | the voucher id mapped to its code via one `GET /vouchers/` per fetch                                                                                                                                                                                                                 |
| `Ticket.company`          | `position.company`                                                                                                                                                                                                                                                                   |
| `Ticket.jobTitle`         | the answer whose `question_identifier` is `job_title`                                                                                                                                                                                                                                |
| `Ticket.answers`          | `answers[]`, keyed by `question_identifier`, labelled in the default locale                                                                                                                                                                                                          |

### 8.5 Payment Summary and deep links

- **`fetchPaymentSummary(ref, code)`** reads `GET /orders/<code>/`, its
  `payments[]` and `refunds[]`, and `/invoices/?order=<code>` for the invoice
  number and date.
  - `status`: `p` → `paid`, `n` → `pending`, `e` → `canceled`, and `c` →
    `refunded` if any refund is done, else `canceled`. `statusLabel` is the
    Pretix status name.
  - _Adapter detail:_ `dueAt` comes from `expires`, and `method` is the first
    confirmed payment's `provider`.
  - `paymentReference` is absent and `notices` is `[]`.
- **`orderAdminUrl`** returns
  `<baseUrl>/control/event/<org>/<event>/orders/<CODE>/`. The route exists: it
  redirects a logged-out request to login with the order path preserved
  (observed while writing this spec).

### 8.6 Discounts (vouchers)

Pretix's automatic Discounts are neither read nor written.

**Scopes.** A voucher can name one item (+ variation), one quota, or nothing.
`listDiscounts().scopes` lists exactly what Pretix can express, so the token
gains no privilege and the form offers only valid choices:

| Scope offered                | Voucher                              | Offered when                                                                                                           |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| "All ticket types"           | unscoped, `show_hidden_items: false` | **only if every `require_voucher` item in the event is also `hide_without_voucher`** (decided during spec review, §15) |
| one Ticket Type              | `item` (+ `variation`)               | always                                                                                                                 |
| every variation of one item  | `item`                               | the item has variations                                                                                                |
| an existing quota (its name) | `quota`                              | always; `ticketTypeIds` = the quota's items and variations                                                             |

- **Exact match before writing.** `createDiscount` refuses any `ticketTypeIds`
  that isn't exactly one listed scope, and any id not in the fetched catalogue,
  **before any write**; the claim hold is released. Message: "On Pretix a code
  can cover one ticket type, one product, or one quota. Create a quota for
  these types in Pretix, or pick fewer."
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
- **Usage:** `redeemed` becomes `providerUses`. It counts pending and expired
  orders and is incremented by API-created orders too (observed). Our own count
  (`Ticket.discountCode` over the feed) can read lower;
  `resolveRedemptionCount` already labels the source.
- **Create:** `POST /vouchers/` with
  `X-Idempotency-Key = sha256(JSON.stringify(["voucher", baseUrl, organizerSlug, eventSlug, code]))`.
  - _Refinement (spec):_ the key is built from the `EventRef`, which identifies
    the tenant's event as uniquely as the decided conference id, and which the
    adapter actually receives. A domain tag and JSON encoding rule out
    collisions with invitation keys.
  - A 409 for a reused key is resolved by reading the voucher by code and
    adopting it only if code, scope and value match; otherwise it's an error.
  - `validFrom` is refused as unsupported.
  - The `discountCodeClaim` lock is unchanged, because it keys on the code.
- **Delete or retire:**
  - an unused voucher is deleted
  - a used one gets 403 on delete (observed), so it is **retired**:
    `max_usages = redeemed`, the floor Pretix allows (observed), and
    `valid_until = now`
  - sponsor links are untouched
- **Redeem link:** `discountRedeemUrl` returns `new URL('redeem', public_url)`
  with `voucher=CODE`. The URL is built by URL joining, never by string
  concatenation, so it's right with or without a trailing slash. It pre-fills
  the code and shows the hidden products in the voucher's scope.

### 8.7 Speaker invitations

- **`issueInvitation`**, with no `existing`, creates one voucher on the speaker
  Ticket Type:
  - `max_usages: 1`, `percent`/100
  - `tag: "speaker"`, with the speaker reference in `comment`
  - `X-Idempotency-Key = sha256(JSON.stringify(["invite", baseUrl, organizerSlug, eventSlug, reference]))`
    (same refinement as §8.6)

  It returns `{ delivery: 'link', url, invitationId, code }`.

- **Resend**, with `existing`, reuses the voucher: look it up by
  `invitationId`, falling back to `tag` plus the reference, and return the same
  link. A redeemed voucher returns `{ delivery: 'already-redeemed' }`, and the
  handler sends nothing. A new voucher is minted only if none exists. There is
  no revocation.
- **Claimed** means an email match, as today (grants included), **or** a ticket
  whose `discountCode` is the speaker's invitation code.
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
keeps its path. Pretix gets **`/api/webhooks/pretix`**.

**Uniform 401.** Every failure before verification, **including a throw from
the secrets store** (`TenantEnvSlugUnavailableError`), is logged and answered
with the byte-identical 401. A 500 there would be an existence oracle for known
organizer slugs and would make Pretix retry for days.

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
     collapsed onto published ids. This is a `groq-global` read, annotated with
     the same justification as the Checkin route.
   - For each, compare `sha256(presented)` with `sha256(secret)`, current and
     previous, using `timingSafeEqual` on the fixed-length digests.
   - **Exactly one distinct Organization** with a matching secret proceeds;
     zero or several get the uniform 401.
   - With no candidates, one comparison round runs against a dummy, so 0, 1 and
     many candidates cost the same work. The residual timing channel (one small
     read) is stated, as in the Checkin route.
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
   - 5xx **only** when the re-fetch fails, so Pretix retries for about 3 days
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
  `conferenceProviderType`
- `lib/conference/types.ts`, `lib/conference/sanity.ts`,
  `lib/features/ticketing.ts`
- `lib/tickets/summary.ts`, `lib/tickets/admin-access.ts` (including the label
  ternary), `lib/tickets/classificationContext.ts` (which returns `undefined`
  for Tito), `lib/tickets/volunteerStatus.ts`
- `lib/legal/subprocessors.ts` and `subprocessors.resolve.ts`, including
  `registrationLinkVendor`, which must learn the Pretix hosts (§12 P7)
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
  which must add `pretixEventSlug`, because a missing projected field is
  silently `undefined`
- `scripts/backfill-speaker-ticket-markers.ts`, `scripts/dump-ticket-shape.ts`

**Settings:**

- The Ticketing card offers Pretix with one field, the event slug. The
  Organization's fields are operator-only and shown read-only with their
  status.
- The registration-link help text explains the shared-voucher volunteer link
  for Pretix.

**Discount form:** on Pretix, it offers `scopes` (§8.6) instead of a free
multi-select, and never lists add-on types.

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
- **Volunteers:** one shared voucher (max usages = number of volunteers), with
  its redeem link pasted as the volunteer registration link.

### 11.2 Operator runbook

Goes into `docs/TENANT_SECRETS.md` and `docs/INTEGRATION_ADAPTERS.md`.

1. In Pretix, create a team with exactly the three permissions (§7.1) and
   generate its API token.
2. Generate a webhook secret matching `[A-Za-z0-9_-]{32,}`. Set the
   `TENANT_<SLUG>_PRETIX_*` secrets and deploy, then set the Organization's
   `pretixBaseUrl` and `pretixOrganizerSlug` (the binding resolves as "not
   configured" until both are present).
3. Register the webhook by hand: the URL with the secret (§9), `order.paid`
   only.
4. **Rotation:** set the new secret as current and the old one as previous,
   update the Pretix hook, wait about 3 days for retries to drain, then remove
   the previous one. **If the old secret leaked, don't set it as previous.**
5. Verify in System status (connected), then with one real 100 % voucher order.

### 11.3 Privacy and subprocessors

Implemented in P7, in `lib/legal/subprocessors.ts`, `subprocessors.resolve.ts` and `/privacy`.

- **Hosted:** when the connection's canonical base URL host is `pretix.eu` or a
  subdomain of it, list **"Pretix (pretix GmbH, pretix.eu)"** as a
  subprocessor, as Checkin and Tito are listed today. The hosted API always
  lives on pretix.eu, even when the shop uses a custom domain.
- **Self-hosted:** **no platform subprocessor.** The instance is operated by
  the organization itself, or its own hosting provider. `/privacy` states that
  the organization's own Pretix instance at `<host>` handles ticket purchases.
- **`registrationLinkVendor`** learns the pretix.eu hosts, plus the
  connection's base-URL host and the event's `public_url` host, so a pasted
  redeem link is attributed correctly.
- **`/privacy` adds one line for every provider:** order data, including
  answers to custom questions (which may include dietary or accessibility
  information), is read from the ticketing provider to run the event.

## 12. Pretix slices

| #   | Slice                                                                                                                                                                                                                                                                           | After        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| P1  | **Connection:** the Organization fields and `pretixEventSlug` (§6), the `pretix` secret family and store changes (§7.1), canonicalisation and the base-URL guard (§7.2), uniqueness and the binding claim (§7.3), the status probe (§7.4). No conference can select Pretix yet. | N1, N5       |
| P2  | **Adapter read path:** the client (§8.1), public ticket types (§8.3), products mapping (§8.2), orders feed (§8.4); the fixture recorder and fixtures (§13)                                                                                                                      | P1           |
| P3  | **Payment Summary and deep links** (§8.5)                                                                                                                                                                                                                                       | P2, N3, N4   |
| P4  | **Discounts** (§8.6), including scopes, the exact-match guard and the form                                                                                                                                                                                                      | P2, N5       |
| P5  | **Invitations** (§8.7)                                                                                                                                                                                                                                                          | P4, N7       |
| P6  | **Webhook** (§9): `/api/webhooks/pretix` on the shared handler                                                                                                                                                                                                                  | P2, N6       |
| P7  | **Privacy, subprocessors and docs:** `/privacy` and the subprocessor list per §11.3; the §11.1 checklist into `TICKET_SYSTEM.md`; the secret family and runbook into `TENANT_SECRETS.md`; `INTEGRATION_ADAPTERS.md` (the provider N+1 checklist, Second-provider debt closed)   | P1           |
| P8  | **Weekly live contract workflow** (§13) and the pre-live manual checks                                                                                                                                                                                                          | P2           |
| P9  | **Enable Pretix:** the `'pretix'` option in the Sanity schema, `server/schemas/conference.ts` and the Settings card; the §10 grep; the release gate (every N slice and P1–P8 merged)                                                                                            | N2–N9, P1–P8 |

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
    exact-match scoping and the unscoped guard, idempotency keys and the 409
    path, delete-or-retire, the uniform 401 (including a throwing secrets
    store), Basic parsing and the constant-time connection pick.
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
  - one 100 % voucher order end to end
  - the webhook arriving through the public URL
  - the redeem link opening the shop with the voucher's hidden products
  - an "All ticket types" code refusing the speaker product

## 14. Known gaps and risks

- **The redeem page and custom-domain `public_url` are unverified.**
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

## 15. Decided during spec review

Both were put to the user on [Write the Pretix provider spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1377)
on 2026-10-16, after the security review found the first and the fidelity
review flagged the second as undecided:

1. **The "All ticket types" sponsor code on Pretix** (§8.6). Offer it only when
   every voucher-only product is also hidden without a voucher, checked from the
   catalogue before writing (fails closed). Hiding is mandatory for speaker and
   volunteer products in the checklist (§11.1).
2. **The subprocessor and `/privacy` rule** (§11.3).
