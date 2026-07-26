# Per-Organization Secrets (CaaS #617)

This document describes the per-organization secret **resolution layer** and
**storage interface** that let each tenant (organization) eventually bring its
own third-party credentials — while the platform environment stays the default
for every tenant that has not been provisioned with its own.

> **Scope of this wave (#617 groundwork).** This lays the resolution layer +
> storage interface only. It does **not** migrate today's setup, and it does
> **not** ship a management UI. The global environment variables remain the
> **platform-default tenant's** credentials indefinitely. A later wave adds the
> admin surface that writes secrets into a real secret manager behind the same
> interface.

## Design constraints

- **Secrets never live in Sanity.** They are resolved at the request boundary,
  never stored in the CMS.
- **Keyed by organization.** The tenant key is `conference.organization._ref`
  (see [Organization Tier](./ORGANIZATION_TIER.md)).
- **Env stays the fallback / platform default.** Every resolution falls through
  to the platform environment, so behavior is unchanged until a per-org secret
  is provisioned.
- **Providers never read `process.env`.** Credentials are injected at the
  boundary — the same rule the ticketing/contract providers already follow (see
  [Integration Adapters](./INTEGRATION_ADAPTERS.md)).

## Credential families

`src/lib/secrets/types.ts` defines one typed credential bag per integration,
unioned as `SecretFamily`:

| Family      | Type                      | Backing env (platform default)                                                                                      |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ticketing` | `TicketingCredentials`    | `CHECKIN_API_KEY`, `CHECKIN_API_SECRET`, `CHECKIN_WEBHOOK_SECRET`                                                   |
| `email`     | `EmailCredentials`        | `RESEND_API_KEY` (+ optional per-org `fallbackFrom`)                                                                |
| `slack`     | `SlackCredentials`        | `SLACK_BOT_TOKEN`                                                                                                   |
| `push`      | `PushCredentials`         | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                                            |
| `badge`     | `BadgeSigningCredentials` | `BADGE_ISSUER_RSA_PRIVATE_KEY`, `BADGE_ISSUER_RSA_PUBLIC_KEY`, `BADGE_ISSUER_ED25519_SEED`, `BADGE_ISSUER_RSA_ONLY` |

`TicketingCredentials` is imported from the provider layer (#634), never
re-declared, so the secret layer and the provider layer cannot drift apart.

## The store interface + two implementations

`src/lib/secrets/store.ts` defines:

```ts
interface TenantSecretsStore {
  get<F extends SecretFamily>(
    orgId: string | null | undefined,
    family: F,
  ): Promise<FamilyCredentials<F> | null>
}
```

An implementation **must not throw** on a missing/partial secret — a miss is
`null` so the resolver can fall through to the next store.

### (a) `EnvSecretsStore` — the platform default

Returns the **environment** credentials **regardless of `orgId`** — today's
shared-account behavior verbatim. Returns `null` for a family with zero
configured env vars, so the chain can terminate at `null` and the consumer's own
soft-fail path runs (identical to unconfigured behavior today). `process.env` is
read at call time (not import), so the module is import-safe and honours test env
stubbing.

### (b) `JsonEnvSecretsStore` — the minimal per-org mechanism

Reads an optional `TENANT_SECRETS_JSON` env var: a JSON map
`orgId → family → credentials`.

```jsonc
{
  "<organization-doc-id>": {
    "ticketing": { "apiKey": "…", "apiSecret": "…", "webhookSecret": "…" },
    "email": { "apiKey": "re_…", "fallbackFrom": "hello@tenant.example" },
    "slack": { "botToken": "xoxb-…" },
  },
}
```

**Why this mechanism** (chosen over a per-org env-var naming convention such as
`TENANT_<ORGID>_CHECKIN_API_KEY`):

- Works **today on Vercel with no new infra** — a single encrypted env var.
- Org ids are Sanity document ids **not known at deploy time**; a flat env
  convention would explode the env surface and require redeploys per tenant.
- A single JSON blob is self-contained and **encrypted at rest by Vercel's env
  storage** — encryption-at-rest is delegated to the platform env either way.
- A malformed blob is logged **once** and treated as empty (never throws), so a
  bad payload degrades to the env fallback rather than breaking every tenant.

Trade-off: it is edited by hand and is coarse-grained. That is acceptable for
groundwork — it is trivially superseded by a real secret-manager store behind the
same `TenantSecretsStore` interface later, with **no consumer changes**.

## The fallback chain

```ts
resolveTenantSecrets(orgId, family)
//   per-org store hit  →  env fallback  →  null
```

`DEFAULT_SECRETS_CHAIN = [perOrgSecretsStore, envSecretsStore]`. A real secret
manager slots in front of `envSecretsStore` (or replaces `perOrgSecretsStore`)
behind the same interface. The chain is injectable (`resolveTenantSecrets(orgId,
family, stores)`) for tests and alternate compositions.

## Wired consumers

| Family    | Boundary                                                                     | Status                                                                                        |
| --------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ticketing | `resolveTicketingProvider` (`src/lib/tickets/provider/index.ts`)             | **Wired.** Resolves per-org creds, falls back to `platformCheckinCredentials()`.              |
| email     | `resolveEmailSender(orgId)` (`src/lib/email/config.ts`)                      | **Wired (seam).** Lazily-constructed per-credentials client factory + cached default.         |
| slack     | `resolveConferenceSlackToken(conference)` → `postSlackMessage({ botToken })` | **Wired.** Notify paths, weekly-update cron, and the status probe inject the org token.       |
| push      | `resolveTenantSecrets(orgId, 'push')`                                        | **Seam only.** Env-only; VAPID config is process-global (see the TODO in `push/vapid.ts`).    |
| badge     | `resolveTenantSecrets(orgId, 'badge')`                                       | **Seam only.** Env-only; signing keys thread through pure config (TODO in `badge/config.ts`). |

Direct `platformCheckinCredentials()` callers that operate **outside** an org
context (the Checkin webhook, the public event lookup, cross-tenant admin ticket
pages) intentionally keep using the platform env default.

## What the later #617 wave adds

- An **admin management UI** to view/set per-org secrets (fingerprints only,
  never echoing values — mirroring `/admin/settings`).
- A **real secret-manager store** (e.g. Vercel/Infisical/Vault) implementing
  `TenantSecretsStore`, replacing `JsonEnvSecretsStore` in the chain.
- Optional **per-org wire-in for push and badge** once the process-global VAPID
  client and the badge issuer-key endpoints are made per-tenant.
