# Link attribution: from a Task's post to an outcome

Research for [#932](https://github.com/CloudNativeBergen/website/issues/932), a sub-issue of the
Marketing Plan wayfinder map ([#929](https://github.com/CloudNativeBergen/website/issues/929)).

**Question.** How can a click on a Task's link be attributed to an outcome on our side, and what is
the simplest mechanism that yields per-Task and per-Campaign numbers?

**Answer in one line.** Stamp each Task's outbound link with the five UTM parameters Pirsch already
parses (`utm_campaign` = Campaign, `utm_content` = Task), and read the numbers back through the
Pirsch statistics API by filtering the existing `data-pirsch-event` conversion events on those
parameters. No redirect route, no click table, no schema change.

Everything below is sourced: vendor claims cite the vendor's own documentation, repo claims cite the
file and line.

---

## 1. What the repo does today

| Fact                                                                                                                                                   | Where                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Pirsch snippet is the plain `pa.js`, not `pa.extended.js`, loaded `defer` / `afterInteractive`                                                         | `src/app/layout.tsx:176`                                                                                                   |
| The snippet renders only when the tenant set a code; there is deliberately no platform fallback                                                        | `src/lib/analytics.ts` (`resolvePirschCode`), `src/app/layout.tsx:170-171`                                                 |
| 21 declarative click events (`data-pirsch-event`), plus `data-pirsch-meta-<key>` metadata                                                              | `src/lib/analytics.ts` (`PIRSCH_EVENTS`), e.g. `src/components/ProgramHighlights.tsx:595`                                  |
| The only outbound event is `outbound-checkin-tickets-page`                                                                                             | `src/lib/analytics.ts:113`, used at `src/app/(main)/tickets/page.tsx:216` and `src/components/TicketsStatusNotice.tsx:154` |
| **No `utm_` handling anywhere.** A `grep` for `utm_` over `src/` (excluding the OpenBadges spec dumps) returns nothing                                 | —                                                                                                                          |
| **No short-link or redirect infrastructure.** The only redirect route is the PWA launcher; there is no `middleware.ts`                                 | `src/app/launch/route.ts`                                                                                                  |
| `conference.analyticsPirschCode` stores only the **public identification code**                                                                        | `sanity/schemaTypes/conference.ts:1377`, `src/lib/conference/types.ts:167`                                                 |
| Secret families are `ticketing \| email \| slack \| push \| badge` — there is **no** family for a Pirsch API client secret                             | `src/lib/secrets/types.ts:71`                                                                                              |
| `conference.registrationLink` is the outbound ticket URL, rendered `target="_blank"`                                                                   | `sanity/schemaTypes/conference.ts:527`                                                                                     |
| Checkin adapter selects `id order_id category customer_name sum sum_left coupon discount fields{key value} crm{…}` — no source or referrer field       | `src/lib/tickets/provider/checkin.ts` (`fetchEventTicketsRaw`)                                                             |
| `createDiscount` hardcodes `type: percent`, `value: "100"` — 100 %-off sponsor codes only                                                              | `src/lib/tickets/provider/checkin.ts` (`createDiscount`)                                                                   |
| Tito adapter maps `discount_code` → `coupon` and always returns `fields: []`; it reads `/tickets`, never `/registrations`                              | `src/lib/tickets/provider/tito.ts` (`mapTicket`, `fetchEventTickets`)                                                      |
| Tito discount methods throw `ProviderUnsupportedError` (the numeric `eventId` cannot address a slug pair)                                              | `src/lib/tickets/provider/tito.ts` (`listDiscounts` / `createDiscount` / `deleteDiscount`)                                 |
| Redemption counts are already derived by scanning tickets: key = `(coupon \|\| discount).toUpperCase()`, giving `usageCount`, `ticketIds`, `totalPaid` | `src/lib/discounts/usage.ts` (`calculateDiscountUsage`)                                                                    |
| That derivation is explicitly three-valued: `DiscountUsageStatus = 'resolved' \| 'unavailable'`, so "we could not look" is representable               | `src/lib/discounts/types.ts`                                                                                               |
| CFP submission: `proposal.create` → `CreateProposalSchema` → `createProposal`, which spreads the input straight into a Sanity `talk` document          | `src/server/routers/proposal.ts:328`, `src/server/schemas/proposal.ts:131`, `src/lib/proposal/data/sanity.ts:657`          |

The practical consequence: **the click-side machinery is already in place and unused**, while the
outcome-side machinery exists only for discount codes.

---

## 2. Pirsch: what it records and what it hands back

### 2.1 UTM capture

Pirsch supports exactly five parameters — `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
`utm_term` — read from the query string of the tracked page with no snippet configuration
([docs.pirsch.io/advanced/referrer-utm](https://docs.pirsch.io/advanced/referrer-utm)). The plain
`pa.js` we already load is sufficient: ingestion parses them server-side out of the submitted `url`
for both `POST /api/v1/hit` and `POST /api/v1/event`
([API v1](https://docs.pirsch.io/api-sdks/api-v1)).

Two details that shape the design:

- **The dashboard hides `utm_content` and `utm_term`** unless you first filter on one of the three
  "essential" parameters ([referrer-utm](https://docs.pirsch.io/advanced/referrer-utm)). This is a
  _dashboard_ constraint only — the API exposes `/statistics/utm/content` and `/statistics/utm/term`
  unconditionally. Since we are reading through the API, it does not bind us; it does mean an
  organizer poking at the Pirsch UI will not see per-Task rows without filtering first.
- **`utm_source` doubles as a referrer setter.** The referrer can be set by any of `ref`, `referer`,
  `referrer`, `source`, `utm_source` ([referrer-utm](https://docs.pirsch.io/advanced/referrer-utm)).
  So `utm_source=linkedin` also populates the `referrer` dimension — convenient, but it means the
  referrer number is not independent evidence.

Referrer is otherwise stored separately (`referrer`, `referrer_name`, `referrer_icon`) with its own
filters `referrer`, `referrer_name`, `channel`.

### 2.2 Custom events

Events can be sent four ways ([docs.pirsch.io/advanced/events](https://docs.pirsch.io/advanced/events));
we use the HTML-attribute form, `data-pirsch-event="…"` plus `data-pirsch-meta-<key>="…"`, which is
the form the plain snippet picks up. Limits, verbatim from that page:

- up to **20** metadata key–value pairs; key ≤ 100 chars; value ≤ 2000 chars
- **string values only**
- tags added by the JS snippet count toward the same limits
- "You must ensure that no Personally Identifiable Information (PII) is sent within a metadata field."
- events count toward billable page views

> ⚠️ The events page contradicts itself: one example's prose claims "There is no limit to the number
> of metadata fields you can send" while the Limits section says 20. Treat 20 as binding.

**Events carry UTM.** The docs never say so in prose, but the data model does: the `event` object in
`GET /api/v1/statistics/session/details` carries `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term` alongside `path` and `referrer`, and the `utm_*` filters are accepted on
the event endpoints ([API v1](https://docs.pirsch.io/api-sdks/api-v1)). This is the load-bearing
fact for the whole recommendation, and it is _inferred from response shapes rather than stated_. See
§6.

### 2.3 Reading it back

API v2 is not released ("work and progress … most likely released at the end of 2026" —
[api](https://docs.pirsch.io/api-sdks/api)), so v1 is the contract.

**Auth** ([API guide v1](https://docs.pirsch.io/api-sdks/api-guide-v1)): `POST https://api.pirsch.io/api/v1/token`
with `{"client_id", "client_secret"}` → a bearer `access_token`. Access keys (prefix `pa_`) are
**write-only** — "only to send data" — so **statistics reads require a client id _and_ secret.** We
store neither today. Rate limits: statistics reads are currently unlimited; security endpoints
10/min, configuration 60/min, with `X-RateLimit-*` and `Retry-After` headers.

**Endpoints** (all `GET`, all take one flat filter):

| Purpose               | Endpoint                                                                         | Returns                                                                     |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Campaign breakdown    | `/api/v1/statistics/utm/campaign`                                                | `{visitors, relative_visitors, utm_campaign}`                               |
| Task breakdown        | `/api/v1/statistics/utm/content`                                                 | `{visitors, relative_visitors, utm_content}`                                |
| Channel breakdown     | `/api/v1/statistics/utm/source`, `/utm/medium`, `/utm/term`                      | as above                                                                    |
| Conversion events     | `/api/v1/statistics/events`                                                      | `{name, count, visitors, views, cr, average_duration_seconds, meta_keys[]}` |
| Event metadata values | `/api/v1/statistics/event/meta`                                                  | one row per metadata value; **requires** `event` **and** `event_meta_key`   |
| Denominator           | `/api/v1/statistics/total`                                                       | `{visitors, views, sessions, bounces, bounce_rate, conversion_rate}`        |
| Multi-step drop-off   | `/api/v1/statistics/funnel` ([funnels](https://docs.pirsch.io/advanced/funnels)) | per-step counts                                                             |
| Filter option lists   | `/api/v1/statistics/options/utm/campaign` etc.                                   | distinct values, useful for reconciling against the plan                    |

**Filter params** (from the FILTER OPTIONS table, [API v1](https://docs.pirsch.io/api-sdks/api-v1)):
required `id`, `from`, `to` (YYYY-MM-DD); then `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term`, `event`, `event_meta_key`, `meta_(key)`, `path`, `pattern`, `referrer`,
`channel`, `tag`, `limit` (hard-capped at 100), `offset`, `sort`, `direction`. Operators: `!` not,
`~` contains, `^` does not contain; a repeated param ORs its values.

Crucially, `utm_*` and `event` live in **the same flat filter** with nothing marking them mutually
exclusive — so a single request answers "visitors from Campaign X who fired event Y":

```
GET /api/v1/statistics/events
      ?id=<domain>&from=2026-03-01&to=2026-03-31
      &utm_campaign=speaker-announce&event=cta-tickets-hero
→ { name, visitors, count, views, cr, … }
```

Swap `utm_campaign` for `utm_content` and the same call yields the per-Task number.

### 2.4 SDK

`pirsch-sdk` on npm (repo [pirsch-analytics/pirsch-js-sdk](https://github.com/pirsch-analytics/pirsch-js-sdk),
listed as official at [sdks](https://docs.pirsch.io/api-sdks/sdks)) wraps exactly these calls —
`utmCampaign()`, `utmContent()`, `events()`, `eventMetadata()`, `listEvents()`, `totalVisitors()`,
`funnel()` — over a `PirschFilter` carrying `utm_*`, `event`, `event_meta_key` and `event_meta`. It
needs `clientId` + `clientSecret`, consistent with the write-only access-key rule above. Adopting it
is optional; the endpoints are plain authenticated `GET`s and this repo's adapter pattern
(`docs/INTEGRATION_ADAPTERS.md`) would wrap them in a handful of lines either way.

---

## 3. Does a redirect route in the platform buy anything?

**No, provided every Task links to a page we serve.** Pirsch derives UTM from the landing page's own
URL, so `https://2026.cloudnativedays.no/tickets?utm_campaign=…&utm_content=…` is already a tracked,
attributed pageview. A `/r/:code` route would add a hop, a table, a cache-busting concern and a
second source of truth for a number Pirsch already holds.

There is exactly one case where it would buy something: a Task that links **straight to the ticket
vendor**, bypassing our site entirely. That click is invisible to us. The cheaper fix is a policy,
not a route — **a Task's link always points at our own domain**, and the vendor hand-off happens from
our page, where `outbound-checkin-tickets-page` already fires.

One real limitation to design around: the UTM parameters live on the **landing** URL. If someone
lands on `/?utm_campaign=x` and then client-navigates to `/tickets` before clicking the CTA, the
event's own URL no longer carries the parameters. Two mitigations, in order of preference:

1. **Point the Task at the page that carries the CTA** (a tickets Task links to `/tickets`, a CFP
   Task to `/cfp`). Then landing page and conversion page are the same URL and the question does not
   arise. This is free.
2. Fall back to session-scoped reading — `/statistics/session/list` and `/session/details` carry the
   `utm_*` fields per session — if the event-level join turns out not to survive a client navigation.

---

## 4. Can a ticket purchase carry a source through the vendor and back?

This is where the two providers diverge sharply.

### 4.1 Tito — yes, and it is documented

| Mechanism                   | Detail                                                                                                                                                                                                                                                               | Source                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Source Tracking      | `?source=CODE` on the event URL; sources must be **pre-created** in the event dashboard, each with a unique reference. Widget attribute form: `<tito-widget event="…" source="twitter">`. Appears in Reports → Source Tracking and as a column in the orders export. | [Source Tracking](https://help.tito.io/en/articles/3846161-source-tracking), [Vito](https://vi.to/hubs/teamtito/pages/source-tracking-in-tito) |
| UTM → registration metadata | Widget attribute `save-metadata-parameters="utm_*"` whitelists URL params onto the registration's `metadata`; unlisted params are dropped.                                                                                                                           | [Widget V2](https://ti.to/docs/api/widget)                                                                                                     |
| Discount prefill            | **Path segment, not query param**: `…/with/<release-slugs>/discount/FULL`. Tito also auto-generates a shareable per-code link.                                                                                                                                       | [Sharing URLs](https://help.tito.io/en/articles/2011547-sharing-urls)                                                                          |
| Read-back on registrations  | `GET /v3/:account/:event/registrations` exposes **`source`** ("The Source Tracking code that the person registered under"), **`metadata`**, **`discount_code`**, plus `ip_address`, `reference`, `state`.                                                            | [Admin API v3.0](https://ti.to/docs/api/admin/3.0)                                                                                             |
| Read-back on tickets        | `discount_code_used`, `metadata`, `tags` — but **no `source`**; reach it through the nested registration.                                                                                                                                                            | [Admin API v3.0](https://ti.to/docs/api/admin/3.0)                                                                                             |
| Webhooks                    | `registration.finished` / `.completed` / `.updated` payloads include `source`, `discount_code` and `metadata`. Ticket payloads include `discount_code_used` and `metadata` but not `source`.                                                                         | [Admin API v3.0](https://ti.to/docs/api/admin/3.0)                                                                                             |
| Discount CRUD               | Full CRUD at `/v3/:account/:event/discount_codes`, with read-only **`quantity_used`** — "the number of tickets this discount code has been applied to".                                                                                                              | [Admin API v3.0](https://ti.to/docs/api/admin/3.0)                                                                                             |

Two gaps between that and our code: our Tito adapter reads `/tickets` and never `/registrations`, so
`source` and `metadata` are not fetched at all; and its discount methods are unimplemented because
`CreateEventDiscountInput.eventId` is a Checkin-shaped number. Both are already recorded as debt in
`docs/INTEGRATION_ADAPTERS.md`.

Undocumented, flagged: whether `?source=` accepts arbitrary un-registered values (docs say sources
must be created in the dashboard first); whether a `PercentOffDiscountCode` accepts `value: "0.0"`
for a tracking-only code; and the widget's `source` attribute appears in the help centre but not in
the Widget V2 reference.

### 4.2 Checkin.no — effectively no

Checkin's API is GraphQL-only at `https://api.checkin.no/graphql` (explorer at `/graphiql/`), with an
API-key auth model whose header format is shown only inside the app UI and is **not published in
text** ([API documentation](https://www.checkinevent.com/en/helpcenter/api-documentation) → the
external [Developer Documentation](https://checkinno.atlassian.net/wiki/external/NTlmNmFhYjk5OWUwNGU4OTk5ZTk4ZjExOTYxMWYzNjU) page).

- **No source, referrer, UTM, campaign or free-form metadata field is documented on any order or
  attendee record.** A schema-wide sweep for `source|utm|referr|campaign|track` returned no
  attribution field on any order or attendee type.
- **No documented query-parameter contract on the registration URL.** The
  [publishing help article](https://www.checkinevent.com/helpcenter/publisering) covers only copying
  the registration URL and the HTML embed; it suggests Google Analytics / Meta Pixel for measuring
  sales and says nothing about params persisting to an order. Treat any such behaviour as unverified.
- `EventOrderUser` **does** expose `coupon: String` (and `EventAttendeeSummary` exposes `discount`,
  `coupon` and `campaign`) — but this comes from live schema introspection, **not from the docs**.
  Our adapter already reads `coupon`, so this is the one attribution carrier we are certain works.
- The nearest general-purpose carrier is `propertyValues` (custom CRM/form fields), which the JS
  embed can populate via `setCrmProperty(key, value, context)`
  ([github.com/checkin/event-registration](https://github.com/checkin/event-registration)). **That
  requires embedding the registration form on our own page**, which we do not do — we link out with
  `target="_blank"` (`src/app/(main)/tickets/page.tsx:216`).
- Discounts are a real product feature with usage tracking in the order summary
  ([Discounts](https://www.checkinevent.com/en/helpcenter/discounts)); the undocumented mutations
  `createEventDiscount` / `updateEventDiscount` / `deleteEventDiscount` are what our adapter already
  calls.
- Webhooks exist (Event – Order, at `/customer/[id]/integrations/provider-webhooks`) with an
  `EventOrder` payload carrying `users[].crm` and `users[].additionals` — no source field.

### 4.3 What that means

A **confirmed purchase** cannot be attributed to a Task on Checkin today without either embedding the
registration form or minting a per-Campaign discount code. Both are real work, and the discount route
also needs `createDiscount` to stop hardcoding `value: "100"` — a tracking code must be 0 %-off, and
whether either vendor accepts a zero-value percent code is unverified on both sides.

The honest, cheap alternative is to measure **purchase intent**: the existing
`outbound-checkin-tickets-page` event, filtered by `utm_campaign` / `utm_content`, counts the people a
Task sent to the checkout. Report it as "clicked through to checkout", never as "bought a ticket".
The repo already has the vocabulary for this kind of honesty — see the `DiscountUsageStatus`
`resolved | unavailable` split in `src/lib/discounts/types.ts`, and the "amount paid, not amount
discounted" note on `DiscountUsage.totalPaid`.

---

## 5. CFP submission attribution

Unlike ticketing, this leg is entirely ours, so it is a solved problem whenever we want it:

- **Zero-cost version (recommended for slice 1):** the CFP CTAs already emit `cta-cfp-hero`,
  `cta-cfp-callToAction`, `cta-cfp-featured-speakers`, `cta-cfp-featured-organizers`
  (`src/lib/analytics.ts`). Filtering `/statistics/events?event=cta-cfp-hero&utm_campaign=…` gives a
  per-Campaign CFP-intent number with no code change at all.
- **Durable version, if a submitted-proposal count is genuinely needed:** persist the source on the
  document. That is three edits — a field on the Zod input (`src/server/schemas/proposal.ts:131`), a
  field on the Sanity `talk` schema (`sanity/schemaTypes/talk.ts`), and a hidden input on the submit
  form (`src/app/(cfp)/cfp/submit/page.tsx`) fed from the landing URL's parameters. `createProposal`
  spreads its input straight into `clientWrite.create` (`src/lib/proposal/data/sanity.ts:657`), so no
  data-layer change is needed.

The durable version is genuinely more accurate — a proposal is written once and keeps its origin
forever, immune to Pirsch retention — but it needs the UTM values to survive an OAuth sign-in round
trip, which is the awkward part. It is not needed for slice 1.

---

## 6. What could not be verified

Named so nobody mistakes inference for documentation:

1. **Whether Pirsch scopes UTM per pageview or per session** is nowhere stated. It is inferred from
   the response shapes, where `utm_*` appears on the pageview object, the event object _and_ the
   session.
2. **Whether UTM parameters are automatically joined onto events** is likewise inferred, from the
   `event` object's `utm_*` fields in `/statistics/session/details` and from `utm_*` being accepted
   filters on the event endpoints. **This is the one assumption worth an empirical check before
   building on it** — a single tagged URL, one CTA click, then
   `GET /statistics/events?utm_campaign=<test>&event=<name>` settles it in ten minutes.
3. **The `cr` denominator** (filtered visitors or all visitors in range?) is not defined in the API
   reference.
4. The Pirsch events page's **20-metadata-pairs vs "no limit"** contradiction is unresolved upstream.
5. **Tito:** whether `?source=` accepts un-registered values; whether a 0 %-off `PercentOffDiscountCode`
   is accepted.
6. **Checkin.no:** the auth header format; whether registration URLs accept any query parameters at
   all; the `coupon` / discount mutations, which are real in the schema but absent from the docs.

---

## 7. Recommendation — the simplest mechanism that yields per-Task and per-Campaign numbers

**Tag the link, read it back through Pirsch. Nothing else in slice 1.**

### The link

Every Task's generated link points at a page **on our own domain** and carries:

| Parameter      | Value                               | Why                                                                    |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `utm_source`   | the Channel — `linkedin`, `bluesky` | matches how the plan is already organised; also sets Pirsch's referrer |
| `utm_medium`   | `social` (constant for slice 1)     | leaves room for `newsletter` later without reshaping anything          |
| `utm_campaign` | the Campaign's slug                 | **the per-Campaign key**                                               |
| `utm_content`  | the Task's stable id                | **the per-Task key**                                                   |

`utm_term` stays free for paid ads, which are out of scope for this map.

The link is generated when the Task is composed and stored on the Task, so the number is keyed by
something the plan owns rather than by whatever an organizer happened to paste. Prefer the page that
carries the CTA (`/tickets` for a ticket Task, `/cfp` for a CFP Task) so that landing page and
conversion page coincide — see §3.

### The read

One authenticated adapter over the Pirsch statistics API, following `docs/INTEGRATION_ADAPTERS.md`,
exposing three reads:

```
reach       GET /statistics/utm/content?id&from&to&utm_campaign=<campaign>
            → visitors per Task, and the Campaign total from /statistics/utm/campaign

conversions GET /statistics/events?id&from&to&utm_content=<task>&event=<name>
            → visitors + count + cr for that Task's conversion event

campaign    the same call with utm_campaign in place of utm_content
```

The events worth reading are the ones that already exist: `outbound-checkin-tickets-page` for ticket
intent, the four `cta-cfp-*` events for CFP intent, `cta-sponsor-*` for sponsor intent. **No new
events are needed** — the entire conversion funnel was instrumented and has been sitting unread.

### The one prerequisite

Reading statistics needs a **client id and client secret**, because access keys are write-only
([API guide v1](https://docs.pirsch.io/api-sdks/api-guide-v1)). `conference.analyticsPirschCode` holds
only the public identification code. So this needs a new **`analytics` secret family** in
`src/lib/secrets/types.ts:71` — following the same per-tenant bag pattern as `ticketing`, never in
Sanity. That is the single piece of new infrastructure the recommendation requires.

### What is deliberately excluded

- **No `/r/:code` redirect route, no click table, no cookie.** Pirsch already holds the number, and a
  second source of truth would immediately disagree with the first.
- **No purchase-level attribution in slice 1.** Checkin cannot carry a source through checkout (§4.2),
  so a confirmed-sale number would be honest for Tito tenants and fabricated for Checkin ones. Report
  checkout click-through and label it as intent.
- **No `source` field on the proposal document.** The `cta-cfp-*` events answer the same question at
  zero cost (§5).

### The natural follow-ups, in order

1. **Per-Campaign tracking discount codes.** The infrastructure is 90 % built — `calculateDiscountUsage`
   already reconstructs per-code counts from `ticket.coupon`, and both vendors expose a coupon field.
   It needs `createDiscount` to stop hardcoding `value: "100"`, and it needs the 0 %-code question
   answered empirically on both vendors (§6.5, §6.6). This is what turns intent into confirmed sales.
2. **Tito registration reads.** `GET /registrations` exposes `source` and `metadata`, and
   `save-metadata-parameters="utm_*"` on the widget carries our UTM straight into the order — a
   genuinely clean end-to-end attribution for Tito tenants, unavailable on Checkin.
3. **A `source` field on the proposal**, if a submitted-proposal count per Campaign ever matters more
   than a CFP-click count.
