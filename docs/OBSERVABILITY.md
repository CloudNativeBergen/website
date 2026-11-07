# Observability & Log Event Catalog

Catalog of structured log events and observability configuration across Cloudflare Workers in this repository (`api.konf.app` gateway and backend services), used for building Grafana Cloud alerts and monitoring dashboards (#1895, #1917).

## Where Logs Go

Workers Observability is configured per `wrangler.jsonc`:

- **Services (`konf-conference`, `konf-identity`, `konf-content`, `konf-tenant-directory`):**
  Configured in `services/*/wrangler.jsonc` with Workers Observability enabled:
  - Logs destination: `grafana-cloud-logs`
  - Traces destination: `grafana-cloud-traces`
- **Gateway (`konf-api`):**
  Configured in `api/wrangler.jsonc` with the same destinations (#1895). It logs the two events under [Gateway Events](#gateway-events-konf-api).

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
- **When it fires:** Emitted for each conference where a column still written to both D1 and Sanity (`PARITY_COLUMNS` in `services/conference/src/data/parity-core.ts`) differs during the daily parity sweep, or where Sanity no longer has the D1 row. Frozen moved fields (#2013) are not compared, so an organizer edit to one is not drift (#1917).
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
- **Fields:** `event`, `orgId`, `counts`, `missingInIdentity`, `missingInSanity`, `roleMismatch`, `ownersBelowTwo` (optional), `invitePending` (optional: the speaker ids in `missingInIdentity` with a pending, unexpired invitation)
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

### Gateway Events (`konf-api`)

All three are JSON lines on `console.error`, emitted from `api/src/gateway.ts`. String fields are capped at 64 characters, and the events carry no message, stack, token or request body. Yoga still logs every masked error's original (message and stack) on `console.error`, and with the `observability` block those lines reach Grafana too.

#### `gateway.response.5xx`

- **When it fires:** The gateway answers 500 or more, e.g. the 503 `UNAVAILABLE` when tenant-directory fails, or an uncaught throw such as an unset `ENVELOPE_PRIVATE_KEY` (logged with `uncaught: true`, then rethrown; the runtime answers 500).
- **Fields:** `event`, `status`, `uncaught` (only for a throw)
- **Suggested alert:** Critical (condition: `count > 0` over 5 min).

#### `gateway.error.masked`

- **When it fires:** Once per error masked to `Unexpected error.` / `INTERNAL_SERVER_ERROR`: a subgraph error outside the safe codes, a subgraph that answered non-2xx (including the 403 `TENANT_MISMATCH` a subgraph without the current `GATEWAY_PUBLIC_KEY` answers), or an unexpected gateway error. The response is HTTP 200 (Hive fills `data` with nulls even when a subgraph sends none), so `gateway.response.5xx` does not see it. Safe codes (`BAD_USER_INPUT`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`) do not log it. One query touching N failing fields logs N events.
- **Fields:** `event`, `subgraph` (Hive `serviceName`, when the error came from a subgraph), `path` (dot-joined), `code` (the original code, when it had one)
- **Suggested alert:** Critical (condition: `count > 0` over 5 min). This is the signal the 2026-11-04 missing-key incident produced.

#### `gateway.cache.purge_failed`

- **Emitting Worker:** `konf-api` (`api/src/gateway.ts`, #1789)
- **When it fires:** Purging a tenant's cached reads failed after a POST returned HTTP 200 that was a mutation, or whose body the gateway did not read (another content type, or over 64 KB), so it may have been one. It does not establish that a mutation succeeded. The response is unaffected; the tenant's entries may remain until they expire (`API_CACHE_TTL_SECONDS`).
- **Fields:** `event`
- **Suggested alert:** Warning (condition: `count > 0`).

#### `gateway.rejected`

- **When it fires:** The gateway refuses a request itself, before any subgraph: 429 `RATE_LIMITED` (per IP, 1200/min; per caller, 300/min; mutation budget, 60/min, with `limit: "mutation"`), 401 `UNAUTHENTICATED` (operator lane without a session, invalid identity token, unknown user), 403 `FORBIDDEN` (not authorized for the tenant) and 400 `BAD_USER_INPUT` (unknown operator tenant). The introspection refusal (403) does not log it.
- **Fields:** `event`, `status`, `code`, `limit` (mutation budget only)
- **Suggested alert:** Warning on `status = 429` above 5/min; Warning on a 401/403 spike over baseline. Cloudflare's rate limiting metrics count the 429s too.

#### Domain & Hostname Reconciliation Errors (inferred)

- **Emitting Worker:** `konf-tenant-directory` ([services/tenant-directory/src/data/index.ts:382](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L382), [L454](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L454), [L530](file:///Users/hans/go/src/github.com/RunKonf/website-obs/services/tenant-directory/src/data/index.ts#L530))
- **When it fires:**
  - `console.error(error)` on concurrent organization creation conflict (line 382).
  - `console.error(cleanup)` when deletion of orphaned Cloudflare custom hostname fails (line 454).
  - `catch(console.error)` when custom domain status check fails during scheduled cron (line 530).
- **Emitted format:** (inferred) Raw error object logged via `console.error` (no event name).
- **Fields:** (inferred) raw error object / stack trace.
- **Suggested alert:** Warning (condition: error count > 0).
