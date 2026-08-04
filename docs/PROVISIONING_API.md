# Machine Provisioning API

`POST /api/provisioning/organizations` creates a tenant — one `organization`, its first `conference`, and the first organizer's membership — for a caller that is **not a signed-in platform operator**. It exists for `RunKonf/kontroll` (the control panel at my.konf.app), which is a separate application with no Konf session.

The same caller also **writes** `organization` documents directly, with its own Sanity token, and must be able to bust this app's caches afterwards. That is `POST /api/provisioning/cache/invalidate` — same bearer secret, documented at the end of this file.

## One transaction, two front doors

There is exactly **one** tenant-creation implementation: `provisionOrganization()` in `src/lib/onboarding/provision.ts`.

| Surface                                | Caller                     | Authentication              | Idempotency  |
| -------------------------------------- | -------------------------- | --------------------------- | ------------ |
| `onboarding.createOrganization` (tRPC) | Platform operator, in-app  | Session + platform-org role | none         |
| `POST /api/provisioning/organizations` | RunKonf/kontroll (machine) | Shared bearer secret        | required key |

Both land on the same reads, the same validation authority, and the same all-or-nothing Sanity transaction. **Do not add provisioning logic to the route handler.** A second copy would fork the per-field document enumeration in `buildOnboardingDocuments` and start silently dropping new conference fields on whichever path was forgotten (#752).

## Environment

| Variable                 | Required | Purpose                                                                                                                                                                    |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROVISIONING_API_TOKEN` | yes      | The shared bearer secret. **Minimum 32 characters.** Unset, empty or shorter ⇒ endpoint refuses everybody.                                                                 |
| `AUTH_SECRET`            | yes      | Already required app-wide. Salts the idempotency-receipt id and the rate-limit bucket ids so neither the caller's key nor a client IP is ever written to the content lake. |

Both are read lazily at request time, never at module load.

## Request

```http
POST /api/provisioning/organizations
Authorization: Bearer <PROVISIONING_API_TOKEN>
Idempotency-Key: <opaque, 16-200 printable ASCII characters>
Content-Type: application/json
```

```json
{
  "organization": {
    "name": "Cloud Native Oslo",
    "slug": "cloud-native-oslo",
    "contactEmail": "hello@cno.no",
    "billingEmail": "faktura@cno.no"
  },
  "conference": {
    "title": "Cloud Native Days Oslo 2027",
    "city": "Oslo",
    "country": "Norway",
    "startDate": "2027-06-01",
    "endDate": "2027-06-02"
  },
  "organizer": { "name": "Kari Nordmann", "email": "kari@cno.no" },
  "domains": ["oslo.cloudnativedays.no"]
}
```

The body is validated with `CreateOrganizationSchema` from `src/server/schemas/onboarding.ts` — **the same schema the operator wizard posts through**, not a looser copy. `billingEmail` is optional; `startDate`/`endDate` are optional but travel as a pair; `domains` is normally **omitted** — see below.

## The tenant's addresses

Provisioning **mints the new edition's hostnames** and claims them in the same
transaction. Without them a self-service tenant would exist at no address at
all: tenant resolution is by request `Host` against `conference.domains[]`, so a
conference that claims nothing is served by nothing and its organizer cannot
reach `/admin`.

```
acme.konf.run         the SHORT address of the org's latest edition
acme-2026.konf.run    this edition's PERMANENT address
```

- **Both are a single label** under `PLATFORM_DOMAIN_SUFFIX`, which is what the
  live wildcard certificate covers — no per-tenant provider work, ever. A nested
  form (`2026.acme.konf.run`) is deliberately not produced; it does not work
  without a per-org wildcard and an aliased deployment.
- **The year is the edition's `startDate`.** With no dates yet the two collapse
  into the single bare host: a year is a factual claim about the event and the
  address is permanent, so an unknown year is never guessed at.
- **Reserved labels are refused** (`www`, `api`, `auth`, `admin`, …), checked on
  the org slug.
- **Renaming the org later does not move them.** The derivation runs once, at
  provisioning; nothing re-derives it at read time.
- The short address later **moves** to newer editions (see
  `docs/DOMAIN_VERIFICATION.md`); the dated one never does, so archive links keep
  resolving.
- Any `domains` the caller _does_ send are claimed **in addition**, after the
  minted hosts, and still have to prove themselves by DNS. The minted hosts route
  immediately, so they are what the organizer signs in on while a custom domain
  is still being verified.

Both minted hosts are allocated to the new conference as
`method: "platform-owned"` — see `docs/DOMAIN_VERIFICATION.md`. They are the
entries in `challenges` with no TXT record to publish.

## Responses

| Status | Body                                                                                              | Meaning                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `201`  | `{ organizationId, conferenceId, speakerId, speakerCreated, replayed: false, challenges: [...] }` | Tenant created.                                                                                      |
| `200`  | same shape, `replayed: true`                                                                      | This key already provisioned; the **original** ids are returned and nothing was written.             |
| `400`  | `{ error: "invalid_request", code, issues? }`                                                     | `idempotency_key_required`, `invalid_json`, or `schema_validation_failed` (with per-field `issues`). |
| `401`  | `{ error: "unauthorized" }`                                                                       | Any authentication failure. Uniform and detail-free.                                                 |
| `409`  | `{ error: "conflict", code, slug? \| domains? \| host? }`                                         | `slug_taken`, `domain_claimed`, `ambiguous_organizer`, `platform_host_taken`, `reserved_slug`.       |
| `429`  | `{ error: "rate_limited" }` + `Retry-After`                                                       | Over a cap, or the limiter could not persist a hit.                                                  |
| `500`  | `{ error: "internal_error", code? }`                                                              | The transaction failed, or `platform_domain_unconfigured`; nothing was written.                      |

`platform_host_taken` (with `host` and `slug`) means the slug is free but the address it mints is already claimed — the remedy is a different slug. `reserved_slug` means the slug would mint one of the platform's own hostnames. `platform_domain_unconfigured` is **not the caller's fault and not fixable by it**: no `PLATFORM_DOMAIN_SUFFIX` is set and no `domains` were sent, so the tenant would have no address; provisioning refuses rather than committing an unreachable one. Retrying will not help until the deployment is fixed.

`challenges` is a `DomainVerificationView[]` — one per claimed domain, carrying the TXT record the caller must publish (#683). Domains are **claims, not proofs**: a new conference routes nothing until its records verify.

`speakerCreated: false` means the organizer email matched a pre-existing speaker account, which was patched with the new org membership instead of duplicated.

## Security model

**Fail closed on misconfiguration.** An unset, empty, whitespace-only or under-32-character `PROVISIONING_API_TOKEN` refuses every caller. "No secret configured" never collapses into "no authentication required" — that is how endpoints like this ship open on the day someone forgets an env var in a new environment.

**Constant-time comparison.** Both the presented and the configured secret are hashed to a fixed 32-byte digest before `crypto.timingSafeEqual`, so the comparison has no length-dependent branch at all — neither the secret's length nor its bytes leak. (Stricter than the length-equalising `safeEqual` in `src/lib/auth/email-link/token.ts`, which must preserve its callers' raw strings.)

**The token is never echoed** into a response, an error or a log line.

**Opacity is scoped to the unauthenticated.** Every authentication failure produces a byte-identical `401 {"error":"unauthorized"}`, so a prober cannot learn whether the endpoint is configured, whether their token shape was accepted, or whether a slug or domain exists. Once a caller has proven it holds the secret it is trusted platform infrastructure, and conflicts are named — the control panel legitimately has to render "that slug is taken".

**Two rate limits**, both durable (Sanity-backed, revision-conditioned CAS — an in-process counter is not a limit in a serverless deployment):

- `attempt`, bucketed by client IP, charged **before** the token is compared — 10/min, 60/hour, 300/day. This is the bound on brute-forcing the secret. A missing IP charges a shared `unknown` bucket rather than skipping the limit.
- `create`, a **single global** bucket, charged after authentication and after validation — 5/min, 30/hour, 100/day. This is the bound on bulk tenant minting if the secret leaks, and it is deliberately not keyed on anything the caller can rotate.

Both **fail closed** in either direction, unlike the email sign-in limiter (which fails open on a read outage because locking everybody out of sign-in is worse than an absent cap). Here the guarded operation is a rare privileged write, so refusing it during an outage costs a retry and nothing else.

## Idempotency

`Idempotency-Key` is **required**. A machine caller that retries a timed-out request without one would create a second tenant — and the duplicate would already hold the domain claim.

The mechanism is a `provisioningRequest` receipt at a deterministic id, `sha256(key + AUTH_SECRET)`, **created inside the same transaction as the organization**. Sanity's `create` on an explicit id fails if the document exists, and the transaction is atomic, so a second request carrying the same key cannot commit an organization no matter how the two interleave.

This is a genuine compare-and-swap, not a read-then-write check. The pre-flight receipt read is only a fast path; the atomic create is the guarantee. Losing the race is indistinguishable from a commit failure, so the handler re-reads the receipt on failure and, if it now exists, returns the winner's ids.

The receipt also makes the retry **safe** rather than merely refused: a caller whose first response was lost gets the original ids back, so a timeout can never strand a tenant the control panel does not know about. The key, not the payload, is authoritative — replaying a used key with a different body returns the original tenant and writes nothing.

Receipts are purged 30 days after creation by the daily cleanup cron (`/api/cron/cleanup-notifications`), so **retention is the replay window**: past it, the same key would provision again.

Nothing about the caller's key is stored — only its salted hash, which is already the document id, so a reader of the content lake cannot confirm a guessed key and replay with it.

## Residual risk

Global slug and domain uniqueness are still enforced by a read-then-write check inside the transaction's preamble, not by a database constraint (Sanity has none). Two requests with **different** idempotency keys racing on the **same** slug can therefore both pass the check. The idempotency receipt does not close this — it is keyed on the request, not the slug. In practice the wizard and the control panel both preflight, and the window is milliseconds; closing it properly means deriving the organization's `_id` from its slug so Sanity's create-CAS enforces uniqueness, which is a follow-up.

---

# Cache Invalidation API

`POST /api/provisioning/cache/invalidate` lets kontroll bust this app's caches after it has written a document. Tracked as RunKonf/platform#36.

## Why it exists

Two applications write the same Sanity dataset, and only one of them could invalidate the other's cache. `getOrganizationById` (`src/lib/organization/sanity.ts`) is `'use cache'` with `cacheLife('hours')` — revalidate 1h, **expire 24h** — over `name`, `slug` and `contactEmail`: exactly the fields kontroll writes when an organizer edits organization settings. The only `revalidateTag(organizationTag(...))` in this repo was a platform-operator tRPC mutation kontroll cannot reach.

So an organizer edited their organization in kontroll, saw a success message, and their conference site kept serving the old values for up to a day. Both applications behaved exactly as written, which is what made it miserable to diagnose.

## Request

```http
POST /api/provisioning/cache/invalidate
Authorization: Bearer <PROVISIONING_API_TOKEN>
Content-Type: application/json
```

```json
{
  "targets": [
    { "type": "organization", "id": "<organization _id>" },
    { "type": "conference", "id": "<conference _id>" },
    { "type": "domain", "domain": "oslo.example.com" }
  ]
}
```

- **1 to 20 targets** per call (`MAX_INVALIDATION_TARGETS`).
- The caller names a **document**, never a tag. Which cache tag that implies is this app's decision, so the tag structure stays ours to change — and the broad `content:*` tags (which bust every tenant at once) are not in the vocabulary and cannot be reached.
- Ids are validated by **shape only** (`[A-Za-z0-9._-]{1,200}`); hostnames are lowercased and validated with the same helper the `domains[]` editor uses, so the computed tag is byte-identical to the one the cached read registered.
- **No `Idempotency-Key`.** Invalidation is naturally idempotent — revalidating a tag twice is indistinguishable from once — so a key would add a required header and a stored receipt to protect nothing.

## Responses

| Status | Body                                          | Meaning                                                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| `200`  | `{ invalidated: number, tags: string[] }`     | Every named target was revalidated. `tags` echoes the caller's own input. |
| `400`  | `{ error: "invalid_request", code, issues? }` | `invalid_json` or `schema_validation_failed` (with per-field `issues`).   |
| `401`  | `{ error: "unauthorized" }`                   | Any authentication failure. Uniform and detail-free.                      |
| `429`  | `{ error: "rate_limited" }` + `Retry-After`   | Over a cap, or the limiter could not persist a hit.                       |
| `500`  | `{ error: "internal_error" }`                 | Nothing was revalidated.                                                  |

**Invalidating something that does not exist is a no-op, not an error.** Nothing in this path reads Sanity: a tag is a pure function of the caller's input, so an unknown id revalidates a tag nothing is stored under and gets the same `200` as a real hit. There is no lookup, and therefore no existence oracle.

## Why it shares `PROVISIONING_API_TOKEN`

Same caller, same trust boundary, same rotation — and this endpoint is **strictly less powerful** than what that secret already grants. A holder can mint organizations, claim domains (which is also an OAuth redirect grant) and attach organizers; busting a cache entry is a subset of that blast radius. A second secret would protect nothing an attacker with the first one could not already do, while adding a rotation surface and one more environment variable to forget in a new environment — and a forgotten one fails closed, which for this endpoint means silent staleness.

If a caller ever legitimately needs invalidation **without** provisioning, split it then: `authenticateProvisioningRequest` is a pure function of the request headers and takes a different env name in one edit.

## Bounds — it must not become a stampede primitive

Two limits, both on the same durable, Sanity-backed limiter as provisioning but on **their own buckets**, so frequent invalidation traffic can never crowd out the rare, far more dangerous tenant-creation call:

- `invalidate-attempt`, bucketed by client IP, charged **before** the token is compared — 60/min, 600/hour, 3000/day. The bound on brute-forcing the secret.
- `invalidate`, a **single global** bucket, charged after authentication and after validation — 60/min, 600/hour, 5000/day. Not keyed on anything the caller can rotate, because `x-forwarded-for` is caller-controlled.

Together with the 20-target cap that is at most **1200 tag revalidations a minute, platform-wide**, no matter what is sent. Without both halves, a holder of the secret could drop every tenant's cached reads in a loop and turn the site into an uncached passthrough to Sanity.

Both fail **closed** on a limiter outage. When the limit does trip the cost is bounded and self-healing: the caller gets a `429`, and the entry it wanted to bust still revalidates on its own within the hour.

## What it is NOT for: authorization

`org.slug` is an authorization input — `PLATFORM_ORG_SLUG` names the organization whose organizers are platform operators — and it used to be derived two ways with different staleness: uncached in `getPlatformOrgId()`, and off the **cached** org document in the workshops gate and the platform router's gate. Production has one organization that is both the platform org and a tenant, so an admin editing its slug in kontroll lost operator standing instantly on one path while the workshop portal — which emails attendees — stayed live on the revoked grant for up to 24 hours.

That is now **one resolver**: `getPlatformOrgId()` (`src/lib/authz/platform.ts`), uncached, and every caller compares ids against it. Deliberately **not** solved by having kontroll invalidate a tag: a revocation that waits on a caller remembering to call an endpoint is not a revocation. This endpoint exists for content, not for grants.

The cost is one extra `_id`-only Sanity lookup per gate evaluation, not deduplicated within a request. If that ever shows up in latency the fix is request-scoped memoization (React `cache()`), which removes the duplicate fetch without reintroducing cross-request staleness — never a `'use cache'` entry.
