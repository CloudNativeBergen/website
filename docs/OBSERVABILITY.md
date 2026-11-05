# Observability & Log Event Catalog

Catalog of structured log events and observability configuration across Cloudflare Workers in this repository (`api.konf.app` gateway and backend services), used for building Grafana Cloud alerts and monitoring dashboards (#1895, #1917).

## Where Logs Go

Workers Observability is configured per `wrangler.jsonc`:

- **Services (`konf-conference`, `konf-identity`, `konf-content`, `konf-tenant-directory`):**
  Configured in `services/*/wrangler.jsonc` with Workers Observability enabled:
  - Logs destination: `grafana-cloud-logs`
  - Traces destination: `grafana-cloud-traces`
- **Gateway (`konf-api`):**
  `api/wrangler.jsonc` currently lacks an `observability` block (#1895). Gateway requests, 429s, masked errors, and latency are not yet piped to Grafana Cloud until #1895 adds the destinations. (inferred)

## Crons and Schedules

Triggered via Cloudflare Cron Triggers in `wrangler.jsonc`:

| Worker                  | Schedule      | Description                                                                                                                                                                                                           |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `konf-conference`       | `17 4 * * *`  | Daily at 04:17 UTC. Runs D1 vs Sanity parity sweep (`scheduled(env)` in `services/conference/src/data/parity.ts`).                                                                                                    |
| `konf-tenant-directory` | `*/5 * * * *` | Every 5 minutes. Checks custom domain status against Cloudflare (`refreshCustomDomain`). Hourly at minute 0, triggers `syncMembers()` on `konf-identity` via RPC (`services/tenant-directory/src/data/index.ts:536`). |
| `konf-identity`         | _None_        | No cron trigger. Membership sync rides `konf-tenant-directory`'s cron due to Cloudflare account limits on crons.                                                                                                      |
| `konf-content`          | _None_        | No cron trigger.                                                                                                                                                                                                      |
| `konf-api`              | _None_        | No cron trigger.                                                                                                                                                                                                      |

## Optional Slack Webhook Secrets

Workers check for optional incoming webhook secrets in code. If unset, events are logged to stdout only without sending Slack notifications:

- `SLACK_CONFERENCE_PARITY_WEBHOOK_URL` (`konf-conference`, `services/conference/src/data/parity.ts:18`)
- `SLACK_MEMBER_DRIFT_WEBHOOK_URL` (`konf-identity`, `services/identity/src/data/member-sync.ts:18`)

## Event Catalog

### Conference Parity Events (`konf-conference`)

#### `conference.parity.drift`

- **Emitting Worker:** `konf-conference` ([services/conference/src/data/parity.ts:111](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/data/parity.ts#L111))
- **When it fires:** Emitted for each conference where column values in D1 differ from Sanity during the daily parity sweep.
- **Fields:** `event`, `conferenceId`, `fields`
- **Suggested alert:** High (condition: `count > 0` over 24h).

#### `conference.parity.sweep`

- **Emitting Worker:** `konf-conference` ([services/conference/src/data/parity.ts:114](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/data/parity.ts#L114))
- **When it fires:** Concludes every scheduled D1 vs Sanity parity sweep run.
- **Fields:** `event`, `status`, `checked`, `total`, `drifted`
- **Suggested alert:** High if `status == "drift"` or `drifted > 0`. Heartbeat Warning if no sweep event arrives within 26 hours.

#### `conference.parity.error`

- **Emitting Worker:** `konf-conference` ([services/conference/src/data/parity.ts:99](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/data/parity.ts#L99))
- **When it fires:** When the sweep fails to read D1 or Sanity (e.g. missing token or empty query results); sweep status becomes `unknown`.
- **Fields:** `event`, `status`, `reason`
- **Suggested alert:** Critical (condition: `count > 0`).

#### `conference.parity.alert_failed`

- **Emitting Worker:** `konf-conference` ([services/conference/src/data/parity.ts:84](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/data/parity.ts#L84))
- **When it fires:** When posting the drift or error alert to `SLACK_CONFERENCE_PARITY_WEBHOOK_URL` fails or times out.
- **Fields:** `event`, `error`
- **Suggested alert:** Warning (condition: `count > 0`).

#### `conference.parity.summary` (inferred)

- **Status:** (inferred) Not present in code; the codebase implements this event as `conference.parity.sweep`.
- **Suggested alert:** none (use `conference.parity.sweep`).

---

### Operator Audit Events (`konf-conference`)

#### `operator.write`

- **Emitting Worker:** `konf-conference` ([services/conference/src/data/index.ts:142](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/data/index.ts#L142))
- **When it fires:** On any conference settings patch made through the operator lane (`platform:operator` envelope).
- **Fields:** `event`, `konf.user_id`, `konf.org_id`, `konf.conference_id`, `fields`, `at`
- **Suggested alert:** none (audit trail).

#### `operator.read`

- **Emitting Worker:** `konf-conference` ([services/conference/src/data/index.ts:177](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/data/index.ts#L177))
- **When it fires:** On cross-org edition lookup via `unscopedForPlatformOps` for the operator `conferences` list (#1985).
- **Fields:** `event`, `actor`, `role`, `reason`, `konf.conference_id`
- **Suggested alert:** none (audit trail).

---

### Identity & Membership Events (`konf-identity` & `konf-tenant-directory`)

#### `identity.membership.sync_failed`

- **Emitting Workers:**
  - `konf-identity` ([services/identity/src/data/member-sync.ts:116](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L116), [L125](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L125), [L135](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L135))
  - `konf-tenant-directory` ([services/tenant-directory/src/data/index.ts:542](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L542))
- **When it fires:**
  - In `konf-identity`: when sync aborted due to `missing_config`, Sanity query error (`sanity_read`), or no organizers found anywhere (`no_organizers`).
  - In `konf-tenant-directory`: when the hourly cron RPC call `syncMembers()` to `konf-identity` fails (`reason: 'rpc'`).
- **Fields:** `event`, `reason`, `error` (optional)
- **Suggested alert:** Critical (condition: `count > 0`).

#### `identity.membership.email_case_clash`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:151](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L151))
- **When it fires:** When multiple verified user records share the same case-insensitive email address; sync skips granting admin to both to prevent ambiguity.
- **Fields:** `event`, `count`
- **Suggested alert:** Warning (condition: `count > 0`).

#### `identity.membership.drift`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:278](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L278))
- **When it fires:** When membership differences (missing in identity, missing in Sanity, role mismatch, or < 2 owners) are detected for an org in `MEMBER_SOURCE_ORGS`.
- **Fields:** `event`, `orgId`, `counts`, `missingInIdentity`, `missingInSanity`, `roleMismatch`, `ownersBelowTwo` (optional)
- **Suggested alert:** High (condition: `count > 0`).

#### `identity.membership.drift_clean`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:276](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L276))
- **When it fires:** When a drift check for an org in `MEMBER_SOURCE_ORGS` finds zero differences.
- **Fields:** `event`, `orgId`
- **Suggested alert:** none.

#### `identity.membership.drift_failed`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:170](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L170))
- **When it fires:** When `checkDrift` throws an unexpected error for an org in `MEMBER_SOURCE_ORGS`.
- **Fields:** `event`, `orgId`, `error`
- **Suggested alert:** High (condition: `count > 0`).

#### `identity.membership.drift_alert_failed`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:299](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L299))
- **When it fires:** When posting the member drift alert to `SLACK_MEMBER_DRIFT_WEBHOOK_URL` fails.
- **Fields:** `event`, `orgId`, `status`
- **Suggested alert:** Warning (condition: `count > 0`).

#### `identity.membership.drift_alerted`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:308](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L308))
- **When it fires:** When Slack alert for member drift is sent successfully.
- **Fields:** `event`, `orgId`
- **Suggested alert:** none.

#### `identity.membership.drift_deduped`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:291](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L291))
- **When it fires:** When a drift Slack alert is suppressed because the drift hash hasn't changed in the last 24 hours.
- **Fields:** `event`, `orgId`
- **Suggested alert:** none.

#### `identity.membership.granted`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:197](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L197))
- **When it fires:** When a new `admin` row is inserted into D1 for an organizer.
- **Fields:** `event`, `orgId`, `userId`, `memberId`
- **Suggested alert:** none (audit trail).

#### `identity.membership.synced`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:205](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L205))
- **When it fires:** When member sync successfully completes across all organizations.
- **Fields:** `event`, `granted`
- **Suggested alert:** none.

#### `identity.membership.org_skipped`

- **Emitting Worker:** `konf-identity` ([services/identity/src/data/member-sync.ts:179](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/identity/src/data/member-sync.ts#L179))
- **When it fires:** When an organization is skipped during member sync because it has no organizers in Sanity.
- **Fields:** `event`, `orgId`, `reason`
- **Suggested alert:** none.

---

### Request Envelope Context (`konf-conference` & `konf-content`)

#### Request Envelope Context (no event name)

- **Emitting Workers:** `konf-conference` ([services/conference/src/worker.ts:27](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/conference/src/worker.ts#L27)), `konf-content` ([services/content/src/worker.ts:26](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/content/src/worker.ts#L26)), generated via `services/platform-service.cue`
- **When it fires:** On every incoming subgraph request with a verified envelope.
- **Fields:** `konf.org_id`, `konf.conference_id` (or `konf.platform_user`)
- **Suggested alert:** none.

---

### Gateway & Platform Errors, Authz, and Rate Limits (inferred)

The gateway (`konf-api`) emits status responses and GraphQL errors rather than named structured console events:

#### Gateway Rate Limits (`rate limits`) (inferred)

- **Emitting Worker:** `konf-api` ([api/src/gateway.ts:353](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L353), [L458](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L458), [L512](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L512))
- **When it fires:**
  - IP pre-check rate limit (`API_IP_LIMITER`, 1200 req/min).
  - Caller rate limit (`API_LIMITER`, 300 req/min).
  - Mutation rate limit (`API_MUTATION_LIMITER`, 60 mut/min).
- **Emitted format:** (inferred) Returns HTTP 429 response body `{ errors: [{ message: "too many requests", extensions: { code: "RATE_LIMITED" } }] }` or GraphQL error with `RATE_LIMITED` code and status 429. Also recorded in Cloudflare Rate Limiting metrics.
- **Fields:** (inferred) HTTP status 429, error `message`, `extensions.code`
- **Suggested alert:** Warning / High (condition: 429 rate > 5/min).

#### Gateway Authz / Authentication Failures (`authz`) (inferred)

- **Emitting Worker:** `konf-api` ([api/src/gateway.ts:307](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L307), [L487](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L487), [L533](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L533), [L554](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L554), [L590](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L590))
- **When it fires:**
  - Unauthenticated operator lane access or malformed token (HTTP 401 `UNAUTHENTICATED`).
  - Unknown user ID (HTTP 401 `UNAUTHENTICATED`).
  - Caller not authorized for tenant (HTTP 403 `FORBIDDEN`).
  - Unauthorized GraphQL introspection attempt (HTTP 403 `FORBIDDEN`).
- **Emitted format:** (inferred) Returns HTTP 401 / 403 JSON responses or GraphQL errors with extension codes `UNAUTHENTICATED` or `FORBIDDEN`.
- **Fields:** (inferred) HTTP status 401/403, error `message`, `extensions.code`
- **Suggested alert:** Warning (condition: 401/403 rate spike above baseline).

#### Gateway Masked & Unhandled Errors (`gateway errors`) (inferred)

- **Emitting Worker:** `konf-api` ([api/src/gateway.ts:194-214](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L194-L214), [L503](file:///Users/hans/go/src/github.com/RunKonf/website-obs/api/src/gateway.ts#L503))
- **When it fires:**
  - Runtime or subgraph errors masked by `maskError` to `Unexpected error.` with code `INTERNAL_SERVER_ERROR`. Yoga logs the original unmasked error via `console.error` (inferred from `api/src/gateway.test.ts:425`).
  - Tenant directory lookup failures return HTTP 503 `UNAVAILABLE` (`tenant lookup unavailable`).
- **Emitted format:** (inferred) Yoga `console.error` server log with original error stack; client receives masked GraphQL error or HTTP 503.
- **Fields:** (inferred) `message`, `extensions.code`, `extensions.unexpected`, stack trace in stdout.
- **Suggested alert:** Critical (condition: 5xx response count > 0 or `INTERNAL_SERVER_ERROR` > 0).

#### Domain & Hostname Reconciliation Errors (inferred)

- **Emitting Worker:** `konf-tenant-directory` ([services/tenant-directory/src/data/index.ts:382](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L382), [L454](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L454), [L530](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L530))
- **When it fires:**
  - `console.error(error)` on concurrent organization creation conflict (line 382).
  - `console.error(cleanup)` when deletion of orphaned Cloudflare custom hostname fails (line 454).
  - `catch(console.error)` when custom domain status check fails during scheduled cron (line 530).
- **Emitted format:** (inferred) Raw error object logged via `console.error` (no event name).
- **Fields:** (inferred) raw error object / stack trace.
- **Suggested alert:** Warning (condition: error count > 0).
