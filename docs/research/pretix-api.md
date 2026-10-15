# Pretix data model and REST API for a ticketing provider

Research for #1368 (map #1367). Question: what does the Pretix REST API offer
for each thing our ticketing consumers need, and how does it differ between
pretix.eu and a self-hosted instance?

**Sources.** The REST API reference is served at
`https://docs.pretix.eu/dev/api/…` (`/en/latest/…` 301-redirects there; the
build is `pretix 2026.9.0.dev0`). The user guide moved to
`https://docs.pretix.eu/guides/…`. Source citations are against
`pretix/pretix@master` on 2026-10-15 (`__version__ = "2026.9.0.dev0"`), not a
pinned release. Three primary-source reading passes plus spot checks of the
load-bearing claims (webhooks, rate limit, voucher fields, free-order paid
signal) went into this.

**Legend.** `[verified]` = read on the cited page or source file.
`[inferred]` = follows from verified facts but no page states it.
`[unverified]` = could not be checked; treat as an open question.

## 1. Gist

- Pretix is one organizer → many events → **items** ("products") with optional
  **variations**, grouped by **categories**, capacity-limited by **quotas**,
  priced through **tax rules**. Orders have a string **code**, embedded
  **positions** (one per ticket) with attendee name/email, a per-position
  **voucher** reference, question **answers**, and embedded **payments** and
  **refunds**. Every id is an integer except order `code` and event/organizer
  `slug`.
- **Auth** is a team API token (`Authorization: Token …`) bound to one team of
  one organizer; it never spans organizers and can be limited to specific
  events. That matches the org-level Ticketing Connection + conference-level
  event slug decision exactly.
- **Vouchers are our discount codes**; pretix "Discounts" are code-less
  automatic cart rules and are not the analogue. A voucher scopes to **one**
  item, one variation, or one quota — not a list of items.
- **No invitation API.** The closest primitives are a voucher (redeem link
  emailed by us) or an organizer-created order (`POST /orders/`). There is no
  "send voucher by email" API either; that is control-panel-only.
- **Webhooks carry only ids and are unsigned.** The payload is a trigger; the
  order is re-fetched over the API. Tenant resolution is by `organizer` +
  `event` slug in the payload.
- **Prices:** an item's `default_price` is gross or net depending on its tax
  rule's `price_includes_tax`; a position's `price` is gross, after voucher and
  discount, with `tax_value` alongside. Pending amount is not a field; it is
  `total − confirmed payments + refunds`.
- **Self-hosted differences** are operational, not API-shaped: no rate limit,
  no webhook retries without a task queue, possibly older versions, custom
  domains. `GET /api/v1/version` (undocumented) reports the version.

## 2. Authentication and the Ticketing Connection

### Team API tokens

- Created in the control panel on an organizer **team** (form below the member
  list); shown once. Header: `Authorization: Token <token>`. `[verified]`
  https://docs.pretix.eu/dev/api/tokenauth.html
- Tokens can also be managed over the API:
  `GET/POST/DELETE /api/v1/organizers/<o>/teams/<team>/tokens/`; `token` is
  returned only on creation; `active=false` is permanent. `[verified]`
  https://docs.pretix.eu/dev/api/resources/teams.html
- A token "has the same access level as the team it belongs to"
  (`TeamAPIToken` docstring). A team belongs to exactly one organizer;
  `get_organizer_permission_set()` is empty for any other organizer, and
  `GET /api/v1/organizers/` returns only the token's organizer. **A token never
  spans organizers.** `[verified]`
  https://github.com/pretix/pretix/blob/master/src/pretix/base/models/organizer.py,
  https://github.com/pretix/pretix/blob/master/src/pretix/api/views/organizer.py
- Event restriction: a team has `all_events: bool` or `limit_events: [slug]`;
  event access = `team.all_events or event in team.limit_events`. The events
  list shows only events the token can access. `[verified]` teams.html,
  https://docs.pretix.eu/dev/api/resources/events.html

### Permissions

The current permission model is string-based; the `can_*` booleans on the team
resource are "DEPRECATED. Legacy interface". `[verified]` teams.html

Event-level strings: `event.settings.general:write`,
`event.settings.payment:write`, `event.settings.tax:write`,
`event.settings.invoicing:write`, `event.subevents:write`,
`event.items:write`, `event.orders:read|write|checkin`,
`event.vouchers:read|write`, `event:cancel`. Organizer-level:
`organizer.events:create`, `organizer.settings.general:write`,
`organizer.teams:write`, gift card / customer / media / device read|write,
`organizer.outgoingmails:read`. `[verified]` teams.html

What each endpoint we need checks (`permission` for safe methods,
`write_permission` otherwise, in `src/pretix/api/views/*.py`) `[verified]`:

| Endpoint                            | Read                               | Write                              |
| ----------------------------------- | ---------------------------------- | ---------------------------------- |
| orders, orderpositions, payments    | `event.orders:read`                | `event.orders:write`               |
| vouchers (incl. `batch_create`)     | `event.vouchers:read`              | `event.vouchers:write`             |
| items, variations, quotas, taxrules | event access only                  | `event.items:write`                |
| discounts                           | event access only                  | `event.items:write`                |
| event detail                        | event access only                  | `event.settings.general:write`     |
| webhooks (organizer-level)          | `organizer.settings.general:write` | `organizer.settings.general:write` |
| teams / tokens                      | `organizer.teams:write`            | `organizer.teams:write`            |

Note that even **reading** webhooks needs the organizer settings write
permission. `[verified]` source

**Least-privilege token for us** `[inferred]`: a dedicated team with
`event.orders:read`, `event.vouchers:read`, `event.vouchers:write`, either
`all_events` or `limit_events` = the conference events. Add
`organizer.settings.general:write` only if we want to create the webhook over
the API rather than have the tenant click it in. We never need
`event.orders:write` or `event.items:write`.

### OAuth and device auth (not recommended for us)

- OAuth ("Connect with pretix", since 1.16): apps are registered **per user**
  in user settings; authorization-code flow at `/api/v1/oauth/authorize`,
  scopes `read`, `write`, `profile`; access token 86400 s, refresh token
  without expiry; each grant carries an `organizers` set chosen at consent.
  `[verified]` https://docs.pretix.eu/dev/api/oauth.html,
  `src/pretix/api/models.py`. Operator-provisioned connections (the map's
  decision) do not need a user-interactive flow; token auth is simpler and
  revocable per team. `[inferred]`
- Device auth (`Authorization: Device …`) has hard-coded permissions and is
  meant for check-in hardware. `[verified]`
  https://docs.pretix.eu/dev/api/deviceauth.html

### Base URL

- All documented routes are `/api/v1/organizers/<organizer>/…` and
  `…/events/<event>/…` relative to the instance root; the hosted root is
  `https://pretix.eu`. `[verified]` https://docs.pretix.eu/dev/api/fundamentals.html,
  `src/pretix/api/urls.py`
- Self-hosted is `https://<host>/api/v1/…` `[inferred]` (same code,
  host-relative routes; no page says it in those words).
- The organizer resource has a read-only `public_url` and the event resource a
  read-only `public_url` — use these for shop/redeem links rather than
  composing `<base>/<org>/<event>/`, which a custom domain changes.
  `[verified]` organizers.html, events.html

## 3. Data model

### Organizer and event

- Organizer: `name` (plain string, **not** i18n), `slug`, `public_url`,
  `plugins`. Slug: globally unique, 2–50 chars,
  `^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$`. `[verified]` organizers.html,
  `src/pretix/base/models/organizer.py`
- Event: `name` (i18n dict), `slug`, `live`, `testmode`, `currency`,
  `date_from`, `date_to`, `date_admission`, `is_public`, `presale_start`,
  `presale_end`, `location`, `has_subevents` (immutable), `timezone`,
  `plugins` (enabled plugin package names), `meta_data`, `all_sales_channels`
  / `limit_sales_channels` (`sales_channels` deprecated), `public_url`.
  Slug: ≤50 chars, `^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$`, unique per
  organizer; used in order codes and bank references. `[verified]`
  events.html, `src/pretix/base/models/event.py`
- One **currency per event** (vs Checkin's price array per ticket).
  `[verified]` events.html

### Items (products), variations, categories, add-ons

https://docs.pretix.eu/dev/api/resources/items.html `[verified]`:

- `id` (int), `name` (i18n dict, e.g. `{"en": "Standard ticket"}`),
  `internal_name` (string, admin-only label), `default_price` (decimal
  string), `tax_rule` (id), `tax_rate` (read-only, from the rule), `category`,
  `active`, `description` (i18n Markdown), `position`, `admission`,
  `personalized`, `free_price`, `original_price` (display-only strike-through).
- Availability window: `available_from` / `available_until`, each with a
  `_mode` of `"hide"` (default) or `"info"`.
- Voucher gating: `require_voucher` (only buyable with a voucher),
  `hide_without_voucher` (invisible until a matching voucher is entered;
  setting it forces `require_voucher` — `src/pretix/base/models/items.py`).
- `hidden_if_item_available` (+ `_mode`), `require_approval`,
  `min_per_order` / `max_per_order`, `allow_cancel`, `show_quota_left`,
  `has_variations`, `meta_data`, `validity_*`, `require_membership*`,
  `checkin_attention` / `checkin_text`.
- `variations[]`: `id`, `value` (i18n), `default_price` (own price or null),
  `price` (effective: own or the item's), `active`, `description`,
  `available_from/until` (+`_mode`), `hide_without_voucher`, `position`,
  `meta_data`, sales-channel and approval fields.
- `addons[]`: `addon_category`, `min_count`, `max_count`, `multi_allowed`,
  `price_included`, `position`. `bundles[]`: `bundled_item`,
  `bundled_variation`, `count`, `designated_price`.
- Nested variations/addons/bundles are writable on POST only; later changes go
  through `/items/<id>/variations/` etc.
- List filters: `search`, `active`, `category`, `admission`, `tax_rate`,
  `free_price`; `ordering` = `id` | `position`. Supports
  `If-Modified-Since` → 304.
- **The items list carries no availability.** Availability lives on quotas
  (below) or on the undocumented widget endpoint.

Categories (`/categories/`): `id`, `name` (i18n), `internal_name`,
`description`, `position`, `is_addon`, `cross_selling_*`. `[verified]`
https://docs.pretix.eu/dev/api/resources/categories.html

**Identifying a ticket type** `[inferred from the above]`: the stable key is
the item `id` (plus variation `id` when the item has variations). Display name
= `name[<locale>]` (+ `variation.value[<locale>]`), falling back through the
event's locales. `internal_name` is an organizer-facing label that is not
i18n and is a candidate for our name-keyed conventions (`ticketTypeRoles`,
the `"Tier: Category"` grid parser), but it is optional and may be null.

### Quotas and "remaining"

https://docs.pretix.eu/dev/api/resources/quotas.html `[verified]`:

- `id`, `name`, `size` (null = unlimited), `items[]`, `variations[]`,
  `subevent`, `close_when_sold_out`, `closed`, `release_after_exit`.
- `?with_availability=true` adds `available` and `available_number` to the
  list ("may be slightly out of date").
  `GET /quotas/<id>/availability/` returns `available`, `available_number`,
  `total_size`, `pending_orders`, `paid_orders`, `exited_orders`,
  `cart_positions`, `blocking_vouchers`, `waiting_list`.
- Remaining = size − paid − pending-within-payment-window − unexpired carts −
  quota-blocking vouchers − waiting list; an item is buyable only when **all**
  its quotas are available; a product with no quota cannot be sold.
  `[verified]` https://docs.pretix.eu/dev/development/concepts.html,
  https://docs.pretix.eu/guides/products/
- Availability codes: `GONE=0`, `ORDERED=10`, `RESERVED=20`, `OK=100`.
  `[verified]` `src/pretix/base/models/items.py`

So our `PublicTicketType.available` = min `available_number` over the quotas
containing the item (or variation); null when any of them is unlimited.
`[inferred]`

### Public (unauthenticated) catalogue

The whole REST API requires a token or device (`EventPermission.has_permission`
is false without one). The widget uses an **undocumented** JSON endpoint
`/<org>/<event>/widget/product_list` returning per item: `id`, `name` (one
locale, string), `description` (HTML), `has_variations`, `price`
`{gross, net, tax, rate, name, includes_mixed_tax_rate}`, `avail`
`[availability_code, number_left|null]`, `order_min`/`order_max`, variations.
It lists only what the shop would show. `[verified]`
`src/pretix/presale/urls.py`, `src/pretix/presale/views/widget.py`. Stability
is not guaranteed `[inferred]`; our public prices page should use the
authenticated `/items/` + `/taxrules/` + `/quotas/?with_availability=true`
reads instead.

### Tax rules and prices

https://docs.pretix.eu/dev/api/resources/taxrules.html `[verified]`: `id`,
`name` (i18n), `internal_name`, `rate` (percent string), `code` (e.g.
`S/standard`, `AE`, `O`, `E`, `Z`), `price_includes_tax` (default **true**),
`default`, `home_country`, `keep_gross_if_rate_changes`, `custom_rules`;
`eu_reverse_charge` deprecated.

- `default_price` is a "naive" price: it is **gross if `price_includes_tax`**
  on the item's tax rule, **net otherwise**. `TaxRule.tax(price, 'auto')`
  returns `TaxedPrice(net, gross, tax, rate)`; with no tax rule gross = net.
  `[verified]` https://docs.pretix.eu/dev/development/algorithms/pricing.html,
  `src/pretix/base/models/tax.py`, `src/pretix/base/models/items.py`
- Guide example: €10 at 19% is €10 gross when the box is checked, €11.90 gross
  when not. `[verified]` https://docs.pretix.eu/guides/taxes/
- Voucher `set`/`subtract` values are naive in the same sense. `[verified]`
  pricing page

For our `TicketPrice {price, vat}` (Checkin semantics: net + VAT percent):
`vat = tax_rule.rate`; `price` = net, computed as `default_price` when
`price_includes_tax` is false, else `default_price / (1 + rate/100)`. The
Tito adapter's workaround (gross as `price`, `vat: '0'`) is avoidable here
because the rule tells us which it is. `[inferred]`

### Questions

https://docs.pretix.eu/dev/api/resources/questions.html `[verified]`:
`question` (i18n), `identifier` (short stable string), `type` (`N` number,
`S` string, `T` text, `B` boolean, `C` choice, `M` multi-choice, `F` file,
`D` date, `H` time, `W` datetime, `CC` country, `TEL` phone), `required`,
`items[]` (scope), `ask_during_checkin`, `hidden`, `print_on_invoice`,
`options[]` (`id`, `identifier`, `answer` i18n), dependency fields.

Company and job title:

- Order level: `invoice_address.company` (invoice address is asked by default;
  company is required only with `invoice_address_company_required`).
  `[verified]` orders.html, `src/pretix/base/settings.py`
- Ticket level: `position.company` is a built-in attendee field, off by
  default (`attendee_company_asked`). `[verified]` same
- **No built-in job title**; it is a custom question, read from
  `position.answers[]` by `question_identifier`. `[inferred from field lists]`

## 4. Orders, positions, payments, refunds

https://docs.pretix.eu/dev/api/resources/orders.html `[verified]` unless noted.

### Order

- `code` (string; charset `ABCDEFGHJKLMNPQRSTUVWXYZ379`, default length 5,
  grows on collision, test-mode codes have `0` as second character, column
  max 16 — `src/pretix/base/models/orders.py`, `settings.py`), `event`,
  `status` (`n` pending, `p` paid, `e` expired, `c` canceled), `testmode`,
  `secret`, `email`, `phone`, `locale`, `sales_channel`, `datetime`
  (placed), `expires`, `total` (decimal string), `comment`, `api_meta`,
  `checkin_attention`, `require_approval`, `valid_if_pending`, `url` (the
  buyer's order page), `last_modified`, `cancellation_date`,
  `invoice_address {company, is_business, name, name_parts, street, zipcode,
city, country, state, vat_id, internal_reference, …}`, `fees[]`,
  `positions[]`, `payments[]`, `refunds[]`, `downloads`.
- `payment_date` and `payment_provider` are "DEPRECATED AND INACCURATE"; use
  `payments[]`.
- Two derived states: "canceled with paid fee" = `p` with no live positions;
  "requires approval" = `n` with `require_approval: true`. `[verified]`
  concepts page
- Filters: `code`, `status`, `email`, `search` (names, emails, company),
  `item`, `variation`, `testmode`, `require_approval`, `customer`,
  `sales_channel`, `payment_provider`, `created_since`/`created_before`,
  `modified_since`, `subevent*`, `include_canceled_positions`,
  `include_canceled_fees`, `include`/`exclude` (field projection).
  `ordering`: `datetime` (default), `code`, `last_modified`, `status`,
  `cancellation_date`.
- Organizer-wide list `GET /api/v1/organizers/<o>/orders/` exists (since
  2023.8).
- **No `expand` on orders**; `expand` exists only on check-in-list endpoints.
  `[verified]` orders.html, checkinlists.html
- `POST /orders/` exists but "is not designed to be used to build your own
  shop frontend": it skips sales windows, voucher-only rules and price checks
  and trusts the prices sent. Fields: `positions[{item, variation, price,
attendee_name|attendee_name_parts, attendee_email, voucher (code),
answers[]}]`, `email`, `locale`, `status` (`n`|`p`; free orders default to
  paid), `payment_provider` (`free` for zero totals, `manual`), `send_email`
  (default false), `force` (ignore quotas), `simulate` (dry run, code
  `PREVIEW`), `consume_carts`, `require_approval`.

### Position (one per ticket)

`id` (int), `order` (code), `positionid`, `item`, `variation`, `price`,
`tax_rate`, `tax_value` ("VAT included"), `tax_rule`, `attendee_name`,
`attendee_name_parts`, `attendee_email`, `company`, `street`, `zipcode`,
`city`, `country`, `state`, `voucher` (voucher **id**), `voucher_budget_use`,
`discount` (automatic Discount id), `addon_to`, `subevent`, `secret`,
`pseudonymization_id`, `canceled`, `blocked`, `valid_from/until`,
`checkins[]`, `answers[] {question, answer, question_identifier, options,
option_identifiers}`, `seat`, `downloads`.

- **`price` is gross and after voucher and discount**: the pricing pipeline
  is listed price → `price_after_voucher` → tax → line gross → discount
  engine; `net_price = price − tax_value`. `[verified]` pricing page,
  `src/pretix/base/models/orders.py`
- `GET …/orderpositions/` (event- and organizer-level) filters: `order`,
  `item(__in)`, `variation(__in)`, `order__status(__in)`, `voucher`,
  `voucher__code`, `has_checkin`, `addon_to`, `secret`, `search`,
  `include_canceled_positions`. Positions are returned regardless of order
  status unless filtered.

### Payments and refunds

- Payment: `local_id`, `state` (`created`, `pending`, `confirmed`, `canceled`,
  `failed`, `refunded`), `amount`, `created`, `payment_date`, `provider`,
  `payment_url`, `details`. Refund: `local_id`, `state` (`created`,
  `transit`, `external`, `done`, `failed`, `canceled`), `source`, `amount`,
  `payment`, `provider`, `execution_date`, `comment`.
- Core provider ids: `free`, `boxoffice`, `manual`, `offsetting`, `giftcard`
  `[verified]` `src/pretix/base/payment.py`; `banktransfer` appears as a docs
  example; Stripe/PayPal ids are plugin-defined (e.g. `stripe_cc`)
  `[unverified]`.
- **Outstanding amount (our `sum_left`)** is not an API field. `[inferred]`
  `Order.pending_sum` `[verified]` `src/pretix/base/models/orders.py`:

  ```
  total       = 0 if status == 'c' else order.total
  pending_sum = total
              − Σ payments.amount  where state ∈ {confirmed, refunded}
              + Σ refunds.amount   where state ∈ {done, transit, created}
  ```

  Compute client-side from the embedded `payments[]`/`refunds[]`.

- Invoices (`/invoices/`): `number`, `order`, `is_cancellation`, `refers`,
  `date`, `invoice_from_*`, `invoice_to_*` (incl. company, vat_id),
  `lines[] {gross_value, tax_value, tax_rate, item, variation}`,
  `/download/`. `[verified]` https://docs.pretix.eu/dev/api/resources/invoices.html
  There is no KID / bank reference field on the order itself; the bank
  transfer reference convention is plugin-side. `[unverified]`

### Incremental fetch

The orders list returns `X-Page-Generated`; pass it back unchanged as
`modified_since`. The docs say to use it only with `testmode=false`, since
test orders can be deleted without a trace. Categories, items, questions,
quotas, subevents and tax rules support `If-Modified-Since` → 304.
`[verified]` fundamentals.html, orders.html

## 5. Vouchers, Discounts, invitations

### Voucher resource

https://docs.pretix.eu/dev/api/resources/vouchers.html,
`src/pretix/base/models/vouchers.py`, `src/pretix/api/views/voucher.py`
`[verified]`:

- Fields: `id`, `created`, `code`, `max_usages` (default 1), `redeemed`
  (read-only), `min_usages`, `valid_until`, `block_quota`,
  `allow_ignore_quota`, `price_mode` (`none` | `set` | `subtract` |
  `percent`), `value`, `item`, `variation`, `quota`, `seat`, `tag`,
  `comment`, `subevent`, `show_hidden_items` (default true),
  `all_addons_included`, `all_bundles_included`, `budget`, `budget_used`
  (read-only). **There is no `valid_from`.**
- Scope: exactly one of `item` (+ optional `variation`), `quota`, or none
  (any product). `quota` is "an exclusive alternative to item and variation";
  setting both is a validation error. **A voucher cannot name a list of
  items**; a quota is the only way to scope one code to several products.
- `code`: 5–255 chars, uppercased on save, unique per event
  case-insensitively, no charset validator for custom codes; omit to
  auto-generate (`ABCDEFGHKLMNPQRSTUVWXYZ23456789`).
- Verbs: GET list/detail; POST (atomic, 409 on lock contention); PATCH/PUT
  (everything but `id`/`redeemed`; `max_usages` cannot drop below
  `redeemed`); DELETE → 403 unless `redeemed == 0` and no order position
  references it. `POST …/vouchers/batch_create/` takes a JSON **array**,
  all-or-nothing, 201 with the created array.
- Filters: `code` (iexact), `tag`, `item`, `variation`, `quota`,
  `price_mode`, `redeemed`, `max_usages`, `subevent`, `search` (code, tag,
  comment), and `active` (= `redeemed < max_usages` and not expired; present
  in source, missing from the docs page). Ordering: `id`, `code`,
  `max_usages`, `valid_until`, `value`.
- Pricing: `percent` → `original × (100 − value) / 100`; `set` → `value`.
  A 100 % comp is `price_mode: "percent", value: "100"` (survives a list-price
  change) or `set`/`0`. The guide's free-ticket recipe uses "set to 0.00".
  `[verified]` `calculate_price`, https://docs.pretix.eu/guides/vouchers/
- One code for N tickets: `max_usages: N`; the redeem page offers up to
  `max_usages − redeemed` seats in one order. `[verified]`
  `src/pretix/presale/views/cart.py`
- Hidden products: `hide_without_voucher` items appear only for a voucher with
  `show_hidden_items` (and the voucher's scope narrows the list). The guide
  warns an unscoped voucher with `show_hidden_items` exposes every hidden
  product. `[verified]` items.py, guides/vouchers
- Redemption link: route `^redeem/?$` (`event.redeem`), GET param `voucher`;
  the control panel composes `<event public url>/redeem?voucher=CODE`
  (+`&subevent=ID`). `[verified]` `src/pretix/presale/urls.py`,
  `RedeemView`, control vouchers view

### `redeemed` semantics

- `redeemed += 1` **per position** when a cart becomes an order — a pending
  (unpaid) order counts. Decremented on cancel, cancel-with-fee, deny, and
  test-order delete; re-incremented on reactivate. **Expiry does not free the
  voucher.** `budget_used` sums over paid + pending orders. `[verified]`
  `src/pretix/base/models/orders.py`, `src/pretix/base/services/orders.py`
- For "paid redemptions" count `GET …/orderpositions/?voucher=<id>&order__status=p`
  (or `voucher__code=`). `redeemed` is "usages consumed incl. pending and
  expired". `[inferred]`
- Whether an API-created order (`POST /orders/` with a `voucher` on a
  position) increments `redeemed` was not read. `[unverified]`

### Sending vouchers by email

- **No API.** The voucher viewset's only extra action is `batch_create`;
  `vouchers_send` is called only from the control panel's bulk-create view
  ("Send vouchers via email", recipients one-per-line or CSV
  `email,number,name,tag`). `[verified]` `src/pretix/api/views/voucher.py`,
  `src/pretix/base/services/vouchers.py`,
  `src/pretix/control/views/vouchers.py`
- Our path: we email the code or the redeem URL ourselves (we already send
  sponsor discount and speaker invitation emails from this app). `[inferred]`

### Automatic Discounts (not our discount codes)

https://docs.pretix.eu/dev/api/resources/discounts.html `[verified]`:
condition-based cart rules (`condition_min_count`, `condition_min_value`,
`condition_limit_products`, `benefit_discount_matching_percent`,
`benefit_only_apply_to_cheapest_n_matches`, …) with no code. The page says:
"Discounts are available to everyone. If you want to give a discount just to
specific persons, look at vouchers instead." Shipped in pretix **4.10**
(first commit `6fee0ac0` "Discounts (#2510)", 2022-04-27, during
`4.10.0.dev0`) `[verified commit; release inferred]`. `sales_channels` on it
is deprecated in favour of `all_sales_channels` / `limit_sales_channels`.
A position's `discount` field names the Discount applied. We do not need this
resource; it matters only because a tenant may use it and our "what the buyer
paid" reads must not assume `price == default_price − voucher`.

### Invitations (speaker comps)

Pretix has no invitation object or email. Two primitives `[verified]`:

1. **Voucher per speaker**: `max_usages: 1`, `percent`/`100` (or `set`/`0`),
   `item` = the speaker ticket item (which should be `require_voucher` +
   `hide_without_voucher`), `tag: "speaker"`, `comment` = speaker id; we
   email the redeem link. Claim = a position with that `voucher` id (or
   `voucher__code`) on an order with status `p`; the speaker's email is on
   `attendee_email` / order `email` for the existing email-match path.
2. **Organizer-created order**: `POST /orders/` with the free item,
   `attendee_email`, `payment_provider: "free"`, `send_email: true`. With a
   zero total and status paid the API sends the "order free" email (and
   attendee emails if `mail_send_order_free_attendee`), contrary to the docs
   sentence that a paid order sends no mail. `[verified]`
   `src/pretix/api/views/order.py` l.778–794. This grants the ticket without
   a claim step, so "redeemed vs invited" collapses to "issued".

Option 1 preserves today's invited / claimed distinction
(`src/lib/tickets/speakerStatus.ts`). `[inferred]`

## 6. Webhooks

https://docs.pretix.eu/dev/api/webhooks.html,
https://docs.pretix.eu/dev/api/resources/webhooks.html,
`src/pretix/api/webhooks.py` `[verified]`:

- CRUD: `GET/POST /api/v1/organizers/<o>/webhooks/`,
  `GET/PATCH/DELETE …/webhooks/<id>/`. Fields: `id`, `enabled`,
  `target_url`, `all_events`, `limit_events` (slugs), `action_types`,
  `comment`.
- Payload for order actions:
  `{"notification_id": 123455, "organizer": "acmecorp", "event": "democon",
"code": "ABC23", "action": "pretix.event.order.placed"}` — **ids only, no
  order data**. "You should not trust data supplied to your webhook, but only
  use it as a trigger to fetch updated data."
- **No signature.** Delivery is a plain `requests.post(json=payload)` with no
  HMAC header. The only authentication offered is HTTP Basic embedded in the
  target URL (`https://user:pass@host/path`, HTTPS with a valid cert
  required). `[verified]` source + docs
- Order actions: `pretix.event.order.placed`,
  `.placed.require_approval`, `.paid`, `.canceled`, `.reactivated`,
  `.expired`, `.expirychanged`, `.modified`, `.contact.changed`,
  `.changed.*`, `.deleted` (test mode only), `.refund.created`,
  `.refund.created.externally`, `.refund.requested`, `.refund.done`,
  `.refund.canceled`, `.refund.failed`, `.payment.confirmed`, `.approved`,
  `.denied`; plus voucher (`pretix.voucher.added|changed|deleted`), item,
  quota, event, check-in, waiting-list, customer and gift-card actions.
- Webhooks fire from log entries; a free order gets a `free` payment that is
  confirmed at placement, and `confirm()` logs `pretix.event.order.paid`, so
  **`order.paid` fires for free (voucher-comped) orders too**, right after
  `order.placed`. `[verified]` `src/pretix/base/services/orders.py`
  (`_perform_order`), `src/pretix/base/models/orders.py` (`confirm`)
- Delivery: 2xx = success (redirects and 304 count as failure); non-2xx or a
  30 s timeout is retried for ~3 days with back-off (5 s, 30 s, 1 m, 5 m,
  20 m, 1 h, 4 h, 6 h, 12 h, 12 h, 24 h); `410 Gone` disables the webhook;
  duplicates possible; **self-hosted instances without a task queue do not
  retry**; send log kept 30 days.

For our `verifyWebhook` + `parseOrderCreated` seam: verification cannot be
cryptographic. The defensible shape is a per-connection secret in the URL
(Basic auth or an unguessable path segment) checked by the route, **and**
treating the body as nothing but `(organizer, event, code)` to look up and
re-fetch `GET …/orders/<code>/` with the Ticketing Connection's token before
acting. Tenant lookup = conference with `pretixEventSlug == event` whose
organization's Pretix connection has `organizerSlug == organizer`. The
workshop "ticket sold" email should key on `order.paid` (status `p`), not
`order.placed` (status `n` for a bank-transfer order). `[inferred]`

## 7. Platform mechanics

- **Pagination**: `{count, next, previous, results}`; 50 per page, `page_size`
  can only lower it (`max_page_size = 50`). `[verified]` fundamentals.html,
  `src/pretix/api/pagination.py`
- **Rate limit (pretix.eu only)**: 360 requests/min per organizer account for
  token auth (per device / per organizer+app for the others); 429 with
  `Retry-After`; "APIs of custom pretix installations do not enforce any rate
  limiting by default". `[verified]` https://docs.pretix.eu/dev/api/ratelimit.html
  Core `settings.py` has no DRF throttle config, so the hosted limit is
  enforced outside core. `[verified]`
- **Idempotency**: `X-Idempotency-Key` (UUID4 recommended) on
  POST/PUT/PATCH/DELETE; matched with the same `Authorization`; kept 24 h;
  responses incl. most errors are replayed; 409/429/500/503 are not cached;
  an in-flight key returns 409 (retry after 5 s). `[verified]` fundamentals
- **Versioning / stability**: a single `/api/v1/`. Breaking changes are
  announced "in the 'Changes to the REST API' section of our release notes",
  several releases ahead where possible. Compatible (must be tolerated): new
  endpoints, methods, query params, response fields, enum values, changed
  error text. Breaking: type changes, new required inputs, removals. The
  event/organizer `/settings/` endpoints carry **no** compatibility guarantee.
  Per-field history is in "Changed in version X" notes on each resource page;
  there is no API changelog page (404). `[verified]` fundamentals.html,
  events.html
- **Errors**: `{"detail": "…"}` or `{"field": ["msg"]}`; a missing event and
  a permission failure both return **403** ("does not exist or you have no
  permission"), so a wrong slug and a wrong token look the same.
  `[verified]` fundamentals
- **Server version**: `GET /api/v1/version` (no trailing slash,
  undocumented) returns `{"pretix": "<ver>", "pretix_numeric": <int>}` for
  any authenticated client; added 2020-01 (3.6). Its behaviour on pretix.eu
  was not exercised. `[verified source; hosted behaviour unverified]`
  `src/pretix/api/views/version.py`
- **Test mode**: event `testmode` flag; orders placed in test mode carry
  `testmode: true`, can be deleted, and are the only ones that fire
  `order.deleted`; `pretix.event.testmode.(de)activated` webhooks exist.
  `[verified]` events.html, orders.html

## 8. pretix.eu vs self-hosted

| Aspect                                                     | pretix.eu                                  | Self-hosted                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Base URL                                                   | `https://pretix.eu/api/v1/` `[verified]`   | `https://<host>/api/v1/` `[inferred]`; shop may sit on a custom domain                                                         |
| Rate limit                                                 | 360/min per organizer `[verified]`         | none by default `[verified]`                                                                                                   |
| Webhook retries                                            | ~3 days back-off `[verified]`              | none without a background task queue `[verified]`                                                                              |
| Version                                                    | current `[inferred]`                       | anything; probe `GET /api/v1/version` `[verified source]`                                                                      |
| Vouchers, orders, questions, webhooks, invoices, discounts | core `[verified]` `src/pretix/api/urls.py` | core; `discounts` only from 4.10 `[inferred]`                                                                                  |
| Payment provider ids                                       | plugin-defined                             | plugin-defined; `event.plugins` lists what is enabled `[verified]`                                                             |
| Enterprise plugins                                         | n/a                                        | commercial plugins from a private git with a licence `[verified]` https://docs.pretix.eu/self-hosting/installation/enterprise/ |
| Privacy                                                    | pretix.eu is a subprocessor                | the tenant's own system                                                                                                        |

Nothing we need is plugin-gated. The self-hosted guard the map decided on
(no private/internal addresses) is the main extra; additionally the
connection should store the base URL, not compose shop links from it (use
`public_url`). `[inferred]`

## 9. Mapping to `TicketingProvider` and to our consumers

Types referenced: `src/lib/tickets/provider/types.ts`, `src/lib/tickets/types.ts`,
`src/lib/discounts/types.ts`. "Gap" = something the neutral model or the
adapter must decide; "OK" = a direct read.

### Interface members

| Member                     | Pretix                                                                                                                                                                                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EventRef`                 | `{provider: 'pretix', organizerSlug, eventSlug}`; base URL and token from the org Connection                                                                                                          | New union variant; both ids are strings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `isConfigured`             | `!!apiToken && !!baseUrl`                                                                                                                                                                             | OK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `amountBasis`              | `'per-ticket'` — `position.price` is per seat                                                                                                                                                         | OK; better than Checkin's per-order split                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `amountsIncludeVat`        | `true` for `position.price`; `price − tax_value` is net                                                                                                                                               | Gap: the neutral model could carry both net and gross per ticket instead of one flag                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `fetchPublicTicketTypes`   | `GET /events/<e>/` (name, currency, `presale_start/end` → `registrationOpensAt/ClosesAt`); `GET /items/?active=true` (+ embedded variations); `GET /taxrules/`; `GET /quotas/?with_availability=true` | 4 reads, cacheable with `If-Modified-Since`. `name` → pick locale; `description`; `position`; `available_from/until` → `visibleStartsAt/EndsAt` (note `_mode: info` shows the item greyed-out, not hidden); `require_voucher` → `requiresInvitation`; `available` from quotas                                                                                                                                                                                                                                                                    |
| `TicketPrice[]`            | one entry: `price` = net via tax rule, `vat` = `tax_rate`; currency from the event                                                                                                                    | Gap: `PublicTicketType.id: number` holds an item id, but a variation needs `(item, variation)` — a string id `"<item>"` / `"<item>:<variation>"` is the neutral-model fix                                                                                                                                                                                                                                                                                                                                                                        |
| `fetchEventTickets`        | `GET /orders/?testmode=false` (paginate `next`; optionally `modified_since`), flatten `positions[]` where `!canceled` and `order.status in (p, n)` as the adapter decides                             | `EventTicket.id` ← position id; `order_id` ← **code (string)** — gap, today `number`; `order_date` ← `datetime`; `category` ← item (+variation) display name; `crm` ← `attendee_name_parts`/`attendee_email` falling back to order `email`; `sum` ← `price`; `sum_left` ← order `pending_sum` split per position; `coupon` ← voucher **code** via a voucher id→code map (`GET /vouchers/`); `fields` ← `invoice_address.company`, `position.company`; `additionals` ← `answers[]` keyed by `question_identifier`; `order.paid` ← `status == 'p'` |
| `fetchOrderPaymentDetails` | `GET /orders/<code>/` → `payments[]`, `refunds[]`, `invoice_address`, `total`, `url`; `GET /orders/<code>/invoices/`… via `/invoices/?order=<code>` for invoice number/date                           | Gap: input is `orderId: number`; must become the order code. `CheckinPayOrder.kid`/`dueAt`/`paymentMethod` have no exact analogue (`payments[0].provider`, `expires`)                                                                                                                                                                                                                                                                                                                                                                            |
| `listDiscounts`            | `GET /vouchers/` (+ `GET /items/` for `ticketTypes`)                                                                                                                                                  | `EventDiscount`: `triggerValue` ← `code`; `type`/`value` ← `price_mode`/`value` (`percent` ↔ percentage, `subtract` ↔ fixed); `times`/`timesTotal` ← `redeemed`/`max_usages`; `tickets` ← `[item]` or the quota's items; `stopsAt` ← `valid_until`; **no `startsAt`**                                                                                                                                                                                                                                                                            |
| `createDiscount`           | `POST /vouchers/` with `X-Idempotency-Key`; `price_mode: 'percent'`, `value`, `max_usages: numberOfTickets`, `item`                                                                                   | Gap: `ticketTypes: string[]` cannot map to one voucher. Options: (a) one voucher per type with suffixed codes, (b) require a quota grouping the sponsor types and scope the voucher to it, (c) restrict the UI to one type for Pretix. `startsAt` unsupported; `eventId: number` → slugs                                                                                                                                                                                                                                                         |
| `deleteDiscount`           | `DELETE /vouchers/<id>/` after `GET /vouchers/?code=`                                                                                                                                                 | Refused (403) once redeemed — today's "delete and recreate" flow needs a "deactivate" fallback (`PATCH max_usages = redeemed`, or `valid_until` in the past)                                                                                                                                                                                                                                                                                                                                                                                     |
| `verifyWebhook`            | no signature; check a per-connection secret in the URL (Basic auth or path token)                                                                                                                     | Gap: `WebhookVerifyResult` fits; the secret lives in the Connection, the registered `target_url` must carry it                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `parseOrderCreated`        | body `{organizer, event, code, action}`; accept `pretix.event.order.paid` (and `.placed` for pending if wanted); then `GET /orders/<code>/`                                                           | Gap: today returns `CheckinOrderCreatedData` synchronously; Pretix needs an async re-fetch — the neutral Sale Event must allow "fetch then normalize". Tenant found by `(organizer, event)` slugs, not `checkinEventId`                                                                                                                                                                                                                                                                                                                          |
| `sendTicketInvitation`     | none. Voucher per invitee + our own email with `<public_url>/redeem?voucher=CODE`; or `POST /orders/` with `send_email: true`                                                                         | Gap: signature `(ticketId: number, emails, message)` becomes "create voucher(s), return codes/links"; the handler in `src/lib/events/handlers/speakerTicket.ts` sends its own heads-up email already                                                                                                                                                                                                                                                                                                                                             |

### Consumer needs (from the map's Notes)

| Consumer                                                                  | Needs                                                           | Pretix source                                                                                                                                                       | Notes / gaps                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public `/tickets` grid (`buildPricingMatrix`, `"Tier: Category"`)         | tiers × categories, windows, position, VAT note                 | items + variations + tax rules + quotas                                                                                                                             | The name convention works on `name[locale]`, but Pretix's own shape — item = category, **variation = tier** with its own `price` and `available_from/until` — is a cleaner mapping. Decision: parse names (parity) or map variations (new). |
| Complimentary cards (`extractComplimentaryTickets`)                       | `requiresInvitation` + name patterns, registration links        | `require_voucher`/`hide_without_voucher`; shop URL `event.public_url`                                                                                               | Voucher-only items are invisible without a code; the "registration link" for a speaker is the redeem link, per speaker.                                                                                                                     |
| Admin tickets/orders/companies                                            | tickets with order, buyer, company, fields, paid/pending        | `/orders/` positions; `invoice_address.company`, `position.company`, `answers[]`                                                                                    | Company lives on the order's invoice address, not per attendee, unless `attendee_company_asked`. Job title is a custom question by identifier.                                                                                              |
| Order deep links (`OrdersTableWithSearch`, `speakerStatus`)               | organizer-facing order URL                                      | control panel `<base>/control/event/<org>/<event>/orders/<CODE>/` `[verified route; prefix inferred]` `src/pretix/control/urls.py`; buyer page = `order.url`        | Add a provider `orderAdminUrl(ref, code)` to the neutral model.                                                                                                                                                                             |
| Ticket types admin / `ticketTypeRoles` (keyed by name)                    | stable type identity                                            | item id (+ variation id); `name` is i18n and editable                                                                                                               | Keying roles by display name is fragile on Pretix (locale, renames). Recommend neutral string ids with name as label; migration is already in "Not yet specified".                                                                          |
| Discounts page + sponsor discount sends (`sponsor-crm/discount-codes.ts`) | 100 % code for N tickets on sponsor types; usage count; delete  | voucher `percent/100/max_usages/item                                                                                                                                | quota`; usage via `redeemed`or positions by`voucher`; delete only if unredeemed                                                                                                                                                             | `providerCodeId` ← voucher `id` (int, stringified). Multi-type scope is the open question (see `createDiscount`). Usage "ours" = positions with `voucher` on paid orders; "provider's" = `redeemed` (includes pending/expired). |
| Speaker invitations (`speakerTicket.ts`, `speakerStatus.ts`)              | send invite, detect claim by email + category                   | voucher per speaker (`tag`, `comment`), redeem link in our email; claim = position with `voucher` id on a paid order, or `attendee_email` match on the speaker item | Keep the invited/claimed split with vouchers; `POST /orders/` would skip the claim.                                                                                                                                                         |
| Sale webhooks → workshop access email                                     | buyer emails + ticket type names on sale                        | `order.paid` webhook → `GET /orders/<code>/` → positions `item`, `attendee_email`, order `email`                                                                    | Payload is a trigger only; route needs the Connection to re-fetch; dedupe on `notification_id` (duplicates are documented).                                                                                                                 |
| Workshop access (`workshop/eligibility.ts`)                               | tickets by user email, type → role                              | positions `attendee_email` (and order `email`) + item name/id                                                                                                       | Attendee email is optional in Pretix unless `attendee_emails_asked`; fallback to the order email is required.                                                                                                                               |
| Marketing outcomes / snapshots (`snapshots/sanity.ts`)                    | paid ticket definition, `order_date`, ex-VAT income, dedupe key | positions on `status == 'p'` with `price > 0`; `datetime`; `price − tax_value`; dedupe on position `id` or `(code, positionid)`                                     | Pretix answers "ex-VAT" exactly per position; the map's open "paid ticket" definition can be `status p && price > 0` or `status p` incl. comps.                                                                                             |
| Budget / revenue cards (`tickets/summary.ts`)                             | per-ticket sums                                                 | `price` per position, no splitting needed                                                                                                                           | OK.                                                                                                                                                                                                                                         |
| System status (`system-status/checks.ts`), activation                     | "is ticketing configured and reachable"                         | `GET /organizers/<o>/events/<e>/` → 200; 403 for wrong slug **or** wrong token                                                                                      | Health probe cannot distinguish the two failures; report "unreachable or no access".                                                                                                                                                        |
| `/privacy`, subprocessors                                                 | who processes attendee data                                     | pretix.eu (hosted) vs the tenant's instance                                                                                                                         | Copy depends on the Connection's base URL.                                                                                                                                                                                                  |

## 10. Implications for the open decisions

- **Neutral model**: Pretix forces string ids (`order.code`, event/organizer
  slugs), a per-position price with both gross and tax, an order-level
  `pending_sum` that is computed, and an async "Sale Event → re-fetch" shape
  for webhooks. All of these are already on the map's list; nothing here
  contradicts the string-id decision.
- **Product → ticket type**: identity is `(item, variation?)`; name is i18n.
  Decide whether a variation is a separate ticket type (likely yes — each has
  its own price and window) and whether the public grid keeps parsing names or
  maps variations to tiers.
- **Discounts**: one voucher = one code = one item/variation/quota. The
  sponsor flow's multi-type scope needs one of: per-type codes, a quota per
  sponsor-type group, or single-type-only. No `valid_from`; delete refused
  once redeemed. `redeemed` counts pending and expired orders.
- **Invitations**: no API; vouchers + our email keep the claim step.
- **Ticketing Connection / auth**: token per team per organizer; needs
  `event.orders:read` + `event.vouchers:read|write`; `organizer.settings.general:write`
  only if we register webhooks by API. OAuth is not a fit for operator
  provisioning.
- **Self-hosted**: same API; store base URL + guard; probe `GET /api/v1/version`
  and `event.plugins` in the system-status check; expect no webhook retries
  and no rate limit; shop links from `public_url`.

## 11. Open questions / not verified

- Does `POST /orders/` with a `voucher` on a position increment `redeemed`?
- Payment provider ids for Stripe/PayPal plugins (`stripe_cc`?).
- Does pretix.eu expose a real version at `GET /api/v1/version`?
- Default visibility of canceled positions inside a non-canceled order in
  `/orderpositions/` (the `include_canceled_positions` filter suggests
  "hidden by default").
- Whether any plugin adds a job-title attendee field.
- The control-panel URL prefix `/control/event/<org>/<event>/orders/<CODE>/`
  is composed from the route table, not read from a docs page.
- The docs pages contain a few self-contradictions (teams page lists
  `all_organizer_permissions` twice; device page says both "read vouchers"
  and "cannot access vouchers"; payment states list "pending" twice); none
  affect us.
