# Pretix webhooks: authenticity and tenant routing

Research for #1369 (map #1367). Answers: how Pretix webhooks are registered
and scoped, what a delivery contains, whether it is authenticated, how retries
and duplicates behave, how self-hosted differs, and how a multi-tenant receiver
can trust and route one. Compared throughout with the Checkin receiver at
`src/app/api/webhooks/checkin/ticket-sold/route.ts`.

Sources are the pretix docs and the pretix source at commit `2e4e60db`
(2026-10-14, `github.com/pretix/pretix`). Each claim is marked **[doc]**,
**[src]** or **[inference]**; file paths are relative to that repo.

## 1. One-paragraph gist

A Pretix webhook is an unauthenticated `POST` of a five-field JSON trigger
(`notification_id`, `organizer`, `event`, `code`, `action`) with **no
signature, no secret header and no timestamp**; the only authenticity
mechanism pretix offers is a secret embedded in the target URL (Basic auth
userinfo, which `requests` turns into an `Authorization: Basic` header). Pretix
itself says not to trust the body and to re-fetch the order over the REST API.
Webhooks are organizer-level, optionally limited to events by slug, filtered by
action type, and can be created via the API with a team token holding
`organizer.settings.general:write`. Retries run for ~3 days on a fixed
backoff ladder (5 s → 24 h); a 410 disables the hook; duplicates and
out-of-order delivery are possible; self-hosted without Celery never retries.

## 2. Registration and scope

- **Where.** Webhooks live under the organizer account ("Webhook" section),
  created with a target URL, a set of notification types and an optional event
  filter. **[doc]** <https://docs.pretix.eu/dev/api/webhooks.html>
- **Model.** `WebHook(organizer, enabled, target_url ≤1024 chars, all_events,
limit_events M2M Event, comment)` plus `WebHookEventListener(action_type)`
  rows. There is no secret, token or signing-key column anywhere on the model.
  **[src]** `src/pretix/api/models.py` lines 118–141.
- **Scope.** Organizer-level, never event-level: `all_events=True` or a list of
  event slugs (`limit_events`). Validation refuses an event from another
  organizer and refuses setting both. **[src]** `src/pretix/api/serializers/webhooks.py`
  lines 60–73.
- **API.** `GET/POST /api/v1/organizers/{organizer}/webhooks/`,
  `GET/PATCH/PUT/DELETE .../webhooks/{id}/`. `DELETE` only sets
  `enabled=false`. Fields: `id, enabled, target_url, all_events, limit_events
(slugs), action_types, comment`. **[doc]**
  <https://docs.pretix.eu/dev/api/resources/webhooks.html> **[src]**
  `src/pretix/api/views/webhooks.py` (`perform_destroy` disables).
- **Permission.** Both the API viewset and every control-panel view require
  `organizer.settings.general:write` (legacy name
  `can_change_organizer_settings`) on the team the token belongs to. The docs
  do not name it. **[src]** `src/pretix/api/views/webhooks.py` lines 39–40;
  `src/pretix/control/views/organizer.py` `WebHook*View.permission`;
  `src/pretix/base/models/organizer.py` line 424.
- **Consequence for us.** A Ticketing Connection token that only has order
  permissions cannot self-register the webhook. Either the operator registers
  it in the control panel (runbook step) or the token's team also carries
  organizer-settings write, which is a wider grant than the sale sync needs.
  **[inference]**

## 3. Action types

The complete core list (plugins may add more) is registered in
`register_default_webhook_events`. **[src]** `src/pretix/api/webhooks.py`
lines 291–487. The ones that matter for a sale feed:

| Action                                                          | Fires when                                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pretix.event.order.placed`                                     | Every new order, paid or not (`_perform_order` logs it unconditionally). **[src]** `src/pretix/base/services/orders.py` line 1126                         |
| `pretix.event.order.placed.require_approval`                    | Additionally, when the order needs organizer approval. **[src]** line 1128                                                                                |
| `pretix.event.order.paid`                                       | Status flips to paid; logged by `OrderPayment.confirm`. **[src]** `src/pretix/base/models/orders.py` line 1840                                            |
| `pretix.event.order.approved` / `.denied`                       | Approval outcome; approving a zero-total order creates a `free` payment and confirms it (so `paid` follows). **[src]** `services/orders.py` lines 398–409 |
| `pretix.event.order.canceled`, `.expired`, `.reactivated`       | Lifecycle                                                                                                                                                 |
| `pretix.event.order.changed.*`, `.modified`, `.contact.changed` | Positions/attendee data or contact edited                                                                                                                 |
| `pretix.event.order.refund.*`, `.payment.confirmed`             | Money                                                                                                                                                     |
| `pretix.event.order.deleted`                                    | Test-mode orders only. **[doc]**                                                                                                                          |
| `pretix.event.checkin` / `.checkin.reverted`                    | Carries extra `orderposition_id`, `orderposition_positionid`, `checkin_list`, `type`, `first_checkin`. **[src]** lines 248–262                            |

Also present: event/subevent/item/quota/voucher/waiting-list/customer/gift-card
types. The wildcard forms (`order.changed.*`, `item.*`, `quota.*`,
`giftcards.transaction.*`) match by prefix: `LogEntry.webhook_type` walks the
dotted action type upward until a registered `.*` matches. **[src]**
`src/pretix/base/models/log.py` lines 108–116.

**Which is "the sale"?** `placed` is the Checkin `event-order-created`
analogue in timing but not in meaning: a placed order may be pending and never
pay. `paid` is the one that means a seat is sold. For a free ticket the `free`
payment provider confirms at checkout so `paid` follows `placed` within the
same request **[inference** from `services/orders.py` line 403 and the
`FreeOrderProvider` pattern; not traced end to end**]**. A receiver that wants
"one ticket sold" semantics should subscribe to `paid` (and treat
`placed`+`require_approval` as not-yet-sold).

## 4. Payload

Built per action by `build_payload(logentry)`. For every order action:
**[src]** `src/pretix/api/webhooks.py` lines 127–139; **[doc]** webhooks page.

```json
{
  "notification_id": 123455,
  "organizer": "acmecorp",
  "event": "democon",
  "code": "ABC23",
  "action": "pretix.event.order.placed"
}
```

- `notification_id` is the `LogEntry` primary key — unique per pretix
  **instance**, not across instances. **[src]** line 134
- `organizer` and `event` are **slugs**, not numeric ids. **[src]**
- `code` is the order code; pretix documents it as "only unique within a single
  conference" (event). **[src]** `src/pretix/base/models/orders.py` docstring
  lines 146–152
- Nothing else: no attendee, no email, no amount, no timestamp, no test-mode
  flag. `pretix.event.order.deleted` carries the code from the log data because
  the object is gone. **[src]** lines 142–149

The test suite asserts the body is exactly those five keys. **[src]**
`src/tests/base/test_webhooks.py` lines 92–104.

## 5. Authenticity: what is on the wire

**Verified from source:** the delivery is

```python
requests.post(webhook.target_url, json=payload, allow_redirects=False, timeout=30)
```

**[src]** `src/pretix/api/webhooks.py` lines 602–607. No custom headers, no
HMAC, no shared secret, no nonce, no timestamp. The `WebHook` model has no
secret field (section 2). Pretix's own warning: "You should not trust data
supplied to your webhook, but only use it as a trigger to fetch updated data.
Anyone could send data there if they guess the correct URL and you won't be
able to tell." **[doc]**

The one offered mechanism: "you can also use Basic authentication and supply
the URL to us in the format of `https://username:password@domain.com/path/`."
**[doc]** This works because `requests.PreparedRequest.prepare_auth` falls
back to `get_auth_from_url(self.url)` and wraps it in `HTTPBasicAuth` when no
explicit `auth` is given — so the credentials arrive as an `Authorization:
Basic …` header, not in the request line. **[src]**
<https://github.com/psf/requests/blob/main/src/requests/models.py>
(`prepare_auth`).

Caveats on URL-embedded secrets:

- The URL (with userinfo) is stored in `WebHook.target_url` and copied into
  every `WebHookCall.target_url` log row, kept 30 days, visible to anyone with
  `organizer.settings.general:write` on the Pretix organizer account.
  **[src]** `webhooks.py` lines 608–618; `src/pretix/api/signals.py` lines 72–73
- A query-string or path secret is equivalent in strength and lands in our
  own access logs; a Basic-auth secret lands in an `Authorization` header,
  which Vercel/Next request logs do not record by default. **[inference]**
- Outgoing IP ranges for pretix.eu are not documented anywhere I could find
  (docs search and web search, 2026-10-15), so IP allowlisting is not an
  option. **[inference]**

### HTTPS

Pretix recommends HTTPS and requires a valid certificate when used; it "might
require it in the future." **[doc]** Nothing in the model enforces `https://`
today (`URLField`). **[src]** `models.py` line 121.

## 6. Delivery, retries, duplicates, ordering

**Trigger path.** `LogEntry.bulk_postprocess` enqueues
`notify_webhooks([ids])`, which selects every enabled hook of the log entry's
organizer that listens to the action type and either has `all_events` or
lists the event, then enqueues one `send_webhook(logentry_id, action_type,
webhook_id)` task per hook. **[src]** `log.py` lines 186–209; `webhooks.py`
lines 489–531.

**Success.** Any 2xx. 3xx is failure (redirects are not followed), 304 is
failure, response body/headers are ignored. **[doc]** **[src]** line 605
`allow_redirects=False`; line 617 `success=200 <= status <= 299`.

**Retry ladder** (verified; the doc says only "up to three days with
exponential back off"): **[src]** `webhooks.py` lines 569–581

```
+5s, +30s, +1m, +5m, +20m, +60m, +4h, +6h, +12h, +12h, +24h   (11 retries ≈ 3 days)
```

Retries under 5 minutes are re-queued directly in Celery; longer ones go to a
`WebHookCallRetry` row that a periodic task promotes. Timeout per attempt is
30 s. A `RequestException` (DNS, TLS, timeout) is retried the same way as a
non-2xx. **[src]** lines 582–676.

**410 Gone** disables the hook permanently (`enabled=False`). **[src]** lines
619–622. Do not return 410 for a tenant we merely do not recognise.

**Duplicates.** Documented as "in very rare cases … twice." **[doc]** The
source explains why: `send_webhook` runs with `acks_late=True` and
`max_retries=5` for database errors, so a worker crash after the POST but
before the ack re-delivers. Both `notification_id` and the `(webhook,
logentry)` retry row are stable across re-deliveries, so `notification_id` is
the natural idempotency key. **[src]** line 534; `models.py` line 169

**Ordering.** Each (log entry, webhook) pair is an independent Celery task
with its own retry clock; nothing sequences them. `paid` can arrive before
`placed`, and a retried `placed` can arrive after `canceled`. **[inference**
from the task structure; Celery makes no ordering promise**]** Treat the
payload as "something changed on order X" and read the current state over the
API, which is also what pretix recommends.

**Log.** Every attempt is stored (`WebHookCall`: payload, status, response
body up to 1 MiB, `is_retry`) for 30 days and shown next to the configuration,
with "retry all" and "stop retrying" buttons. **[src]** `models.py` lines
144–158; `control/views/organizer.py` `WebHookLogsView.post`.

## 7. Self-hosted differences

- **No Celery → no retries.** Without `[celery] broker` in `pretix.cfg`,
  `CELERY_TASK_ALWAYS_EAGER = True`: the POST runs inline in the request that
  created the log entry and a failure is logged but never retried. **[doc]**
  **[src]** `src/pretix/settings.py` lines 372, 421. The 30 s timeout then
  stalls the buyer's checkout request. **[inference]**
- **No rate limit by default** on the REST API; pretix.eu enforces 360
  requests/minute per organizer account for token auth, with `Retry-After`.
  **[doc]** <https://docs.pretix.eu/dev/api/ratelimit.html>
- **Base URL** is `https://<host>/api/v1/`; the docs only show `pretix.eu`.
  **[doc]** <https://docs.pretix.eu/dev/api/fundamentals.html>
- Plugins installed on a self-hosted instance may register extra action types
  that pretix.eu does not emit. **[doc]** webhooks resource page.
- `notification_id` values collide across instances (section 4), so an
  idempotency key must include the Ticketing Connection.

## 8. The REST re-fetch that establishes truth

- Auth: `Authorization: Token <64 lowercase alnum chars>`, team-level, scoped
  by the team's permissions and event list; not retrievable after creation;
  no documented expiry. **[doc]** <https://docs.pretix.eu/dev/api/tokenauth.html>
  **[src]** `organizer.py` lines 339–340, 545–561
- `GET /api/v1/organizers/{organizer}/events/{event}/orders/{code}/` returns
  `status` (`n` pending, `p` paid, `e` expired, `c` canceled), `email`,
  `testmode`, `datetime`, `last_modified`, `total`, `positions[]` with `item`,
  `variation`, `attendee_name`, `attendee_email`, `secret`, and `payments[]`.
  **[doc]** <https://docs.pretix.eu/dev/api/resources/orders.html>
- 403 is returned both when the organizer/event does not exist and when the
  token lacks permission — pretix itself does not distinguish. **[doc]**
- The org token needs the team permission that covers viewing orders on that
  event (`event.orders:read` family; the docs phrase it as "can view
  orders"). **[doc]** fundamentals page.

## 9. Authenticity schemes for a multi-tenant receiver

The Checkin route's contract (#886) is: parse → shape pre-filter → resolve
the tenant from the body → load **that tenant's** secret → verify → act, with
every pre-verification failure returning one byte-identical 401 so the
tenant lookup is not an existence oracle. Pretix gives us no signature to
verify, so the "verify" step has to be built from one of these.

### A. Per-connection secret in the target URL (Basic auth userinfo)

Operator registers `https://pretix-webhook:<secret>@<host>/api/webhooks/pretix`
(or a path/query form). Receiver: constant-time compare of the presented
secret against the secret of the connection that the body's `organizer` slug
(+ base URL, see §10) names.

- Pro: the only mechanism pretix offers; verifies **before** any outbound
  call; no fetch for garbage; ordering identical to the Checkin route (lookup
  tenant → load its secret → compare → act), so the uniform-401 discipline
  carries over unchanged.
- Con: the secret sits in Pretix's webhook config and 30-day call log
  (readable by organizer-settings admins); rotation means editing the Pretix
  hook. Header-based (Basic) keeps it out of our request logs; path/query does
  not.
- Cost: one small Sanity read per well-formed request, same as Checkin.

### B. Re-fetch the order with the tenant's own token (pretix's recommendation)

Treat the body as a hint; look up the connection by `organizer` slug; `GET`
the order with that connection's token; act only on what the API returns.

- Pro: the data acted on is authoritative regardless of who sent the trigger;
  tolerates ordering and duplicates by construction.
- Con, and it is the blocker on its own: **it is "fetch then refuse"**. An
  unauthenticated POST naming any organizer slug makes us spend one Pretix
  API call on that tenant's token — an amplification and quota (360/min on
  pretix.eu) drain controlled by the attacker, and a 404-vs-200 timing
  difference that leaks whether an order code exists. AGENTS.md's "guard
  before fetch" rule forbids this alone.
- Verdict: **necessary as the data source** (the payload has no attendee
  data anyway) but not sufficient as the guard.

### C. A + B (recommended shape)

Secret gate first (A), then re-fetch (B) for the data. The fetch only ever
runs for a caller who proved possession of the connection secret, so the
oracle and quota concerns collapse to "an admin of that Pretix organizer
account can make us read their own orders," which is fine.

### D. Per-connection random URL path (capability URL) without Basic auth

Same trust as A, weaker hygiene (secret in our access logs and any proxy
logs). Only worth it if Basic auth proves awkward for the operator.

### E. IP allowlisting

Not available: pretix.eu does not publish egress ranges, and self-hosted
ranges vary per tenant. **[inference]**

### F. Reject on "test mode"

Not an authenticity scheme, but B exposes `testmode`; act on test orders
only if the binding says so (Checkin has no equivalent). **[inference]**

Any of A/C/D still needs the Checkin route's **uniform rejection**: unknown
organizer slug, slug bound to another provider, connection without a secret,
and a wrong secret must all answer the same 401; return 2xx for action types
we ignore (to stop retries) and never 410.

## 10. Finding the tenant from the payload

The body carries `organizer` (slug) and `event` (slug). Under the map's split
binding, the Ticketing Connection (org-level) holds `baseUrl + organizerSlug +
token (+ webhook secret)`, and the conference holds `ticketingProvider:
'pretix'` + `pretixEventSlug`.

- **Slugs are only unique per instance.** `acmecorp` on pretix.eu and
  `acmecorp` on a self-hosted instance are different organizers; the payload
  does not say which instance sent it. The connection key must therefore be
  `(baseUrl, organizerSlug)`, or the webhook URL must carry the connection
  identity (which scheme A/D does anyway via the secret, and which could also
  be made explicit with a per-connection path segment). **[inference]**
- **Resolution, mirroring `getConferenceTenantByCheckinEventId`:** find the
  single Organization whose Pretix connection matches the sender (by secret
  under A, by `(baseUrl, organizerSlug)` under B), then the single conference
  of that org with `ticketingProvider == 'pretix' && pretixEventSlug ==
$event`, collapsing `drafts.` onto the published id and refusing ambiguity
  rather than tie-breaking (the #731 rule). The projection stays three
  fields. Where the connection lives (Organization document vs env store,
  #1371) decides whether this is one GROQ read or an env lookup plus one
  read.
- **Order identity** for idempotency is `(connection, event slug, code)`;
  `notification_id` is a per-delivery dedupe key scoped to the connection.
  Order codes repeat across events. **[src]** §4.
- **What triggers what.** `paid` → workshop instructions (today's
  `event-order-created` handler), with attendee emails read from
  `positions[].attendee_email` (falling back to order `email`) via the
  re-fetch; `canceled`/`expired` → nothing today (Checkin has no handler
  either); `changed.*` → re-sync if a speaker-claim or workshop-eligibility
  check depends on the item. Speaker-ticket claim status is read live today,
  not webhook-driven, so it needs no new trigger. **[inference** from the
  current route**]**

## 11. Comparison with the Checkin receiver

|                        | Checkin (`ticket-sold`)                                                | Pretix                                                       |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Tenant key in body     | numeric `eventId` (globally unique at the vendor)                      | `organizer` + `event` slugs (unique per instance only)       |
| Authenticity           | HMAC-SHA256 over `data`, `checkin-signature` header, per-tenant secret | none; optional Basic auth in URL (per-hook secret we choose) |
| Payload                | full order with attendee rows                                          | five-field trigger, no attendee data                         |
| Data source for action | the signed body                                                        | REST re-fetch with the tenant's token                        |
| Retry                  | vendor-defined; we ACK ignored events                                  | 11 attempts over ~3 days; 2xx stops, 410 disables            |
| Duplicates             | `payloadId` present                                                    | `notification_id` present, duplicates documented             |
| Ordering               | one event type consumed                                                | several types, no ordering guarantee                         |

## 12. Open items this does not settle

- Whether the operator runbook registers the hook by hand or the connection
  token is granted `organizer.settings.general:write` so we can register it
  via the API (§2).
- Whether the per-hook secret is a fourth field of the Ticketing Connection
  (`ticketing.pretix.webhookSecret`) or derived from the API token; storing
  it separately keeps a leaked webhook URL from exposing the API token.
- The free-order `placed`→`paid` timing (§3) was inferred, not traced; a
  recorded-fixture test against a live test event should confirm it before
  the "subscribe to `paid` only" choice is locked.
- Pretix egress IPs: unconfirmed absence, not confirmed absence.
