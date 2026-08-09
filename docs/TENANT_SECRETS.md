# Per-Organization Secrets (CaaS #617)

This document describes the per-organization secret **resolution layer** and
**storage interface** that let each tenant (organization) eventually bring its
own third-party credentials — while the platform environment stays the default
for every tenant that has not been provisioned with its own.

> **What exists.** The resolution layer, the storage interface and **three**
> stores — the platform env, a JSON blob, and discrete per-tenant env vars.
> There is **no management UI**: secrets are set by an operator on the
> deployment. The global environment variables remain the **platform-default
> tenant's** credentials. A later wave adds the admin surface that writes
> secrets into a real secret manager behind the same interface.
>
> **Provisioning a tenant?** Jump to the
> [operator runbook](#operator-runbook--provisioning-a-tenant-with-discrete-vars).

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

| Family      | Type                      | Backing env (platform default)                                                                                                                                               |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticketing` | `TicketingCredentials`    | Checkin: `CHECKIN_API_KEY`, `CHECKIN_API_SECRET`, `CHECKIN_WEBHOOK_SECRET`. Tito: `TITO_API_KEY`, `TITO_WEBHOOK_SECRET` (via `platformTitoCredentials()`, not the env store) |
| `email`     | `EmailCredentials`        | `RESEND_API_KEY` (+ optional per-org `fallbackFrom`)                                                                                                                         |
| `slack`     | `SlackCredentials`        | `SLACK_BOT_TOKEN`                                                                                                                                                            |
| `push`      | `PushCredentials`         | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                                                                                                     |
| `badge`     | `BadgeSigningCredentials` | `BADGE_ISSUER_RSA_PRIVATE_KEY`, `BADGE_ISSUER_RSA_PUBLIC_KEY`, `BADGE_ISSUER_ED25519_SEED`, `BADGE_ISSUER_RSA_ONLY`                                                          |

`TicketingCredentials` is imported from the provider layer (#634), never
re-declared, so the secret layer and the provider layer cannot drift apart.

## The store interface + three implementations

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

### (a) `EnvSecretsStore` — the default tenant's credentials, and nobody else's

Returns the **environment** credentials **only to the organization they belong
to**, decided by `envCredentialsBelongToOrg`:

| `PLATFORM_ORG_ID` | org                    | result                                                                     |
| ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| unset             | any (incl. nullish)    | env credentials — single-tenant / self-hosted, the env _is_ the only org's |
| set               | the platform org       | env credentials                                                            |
| set               | any other org          | `null`                                                                     |
| set               | nullish / unresolvable | `null` (fail closed)                                                       |

It **fails closed**: a tenant with no secret of its own resolves to `null`, never
to the platform's account. This is what makes `resolveTenantSecrets(orgId,
family)` safe to call naively — the careless call and the correct call now have
the same answer. (Before, the store ignored `orgId` entirely, so ticketing had to
bypass the chain and Slack had to gate it; two of three consumers working around
a default is the signal that the default is wrong.)

Returns `null` for a family with zero configured env vars, so the chain can
terminate at `null` and the consumer's own soft-fail path runs (identical to
unconfigured behavior). `process.env` is read at call time (not import), so the
module is import-safe and honours test env stubbing.

`platformEnvCredentials(family)` is the **raw, org-blind** accessor beneath it,
for a caller that has already made its own authorization decision. It has exactly
one consumer — `resolveConferenceSlackToken`, on the far side of the
`slack-mirror` gate, which may grant the platform token to an override org that
`EnvSecretsStore` itself would refuse.

### (b) `JsonEnvSecretsStore` — the minimal per-org mechanism

Reads an optional `TENANT_SECRETS_JSON` env var: a JSON map
`orgId → family → credentials`.

```jsonc
{
  "<organization-doc-id>": {
    // Checkin-backed org:
    "ticketing": { "apiKey": "…", "apiSecret": "…", "webhookSecret": "…" },
    // A Tito-backed org instead sets just the token (opaque record; the provider
    // is selected by conference.ticketingProvider, not by the secret shape):
    //   "ticketing": { "apiKey": "tito_secret_…", "webhookSecret": "…" },
    "email": { "apiKey": "re_…", "fallbackFrom": "hello@tenant.example" },
    "slack": { "botToken": "xoxb-…" },
  },
}
```

It is **provider-agnostic**, which is why it remains the only per-org source that
can carry a Tito ticketing bag, and a malformed blob is logged **once** and
treated as empty (never throws), so a bad payload degrades to the env fallback
rather than breaking every tenant.

**Still supported, no longer the preferred mechanism.** It is edited by hand, is
coarse-grained, and — the decisive problem — Vercel marks secret env vars
**Sensitive**, meaning they cannot be read back after they are written. Editing
one tenant's entry therefore requires reconstructing the whole blob from a copy
of every tenant's credentials kept somewhere else, which is exactly the copy a
secret store exists to avoid. Use (c) for new tenants.

### (c) `EnvPerOrgSecretsStore` — discrete per-tenant env vars

Reads one variable per credential field:

```
TENANT_<SLUG>_<FAMILY>_<FIELD>
```

Each variable is **independently settable**, so adding a tenant or rotating one
field touches one variable and needs no knowledge of any other tenant's secrets.

**The `<SLUG>` comes from a map in CODE, never from Sanity.**
`TENANT_ENV_SLUGS` (`src/lib/secrets/env-per-org.ts`) maps the immutable
organization document `_id` to an opaque uppercase-alphanumeric label:

```ts
export const TENANT_ENV_SLUGS = validateTenantEnvSlugs({
  'organization-cloud-native-days': 'CNDN',
})
```

Adding a tenant is a **code change**, reviewed and visible in `git log`.

This is deliberate, and it is the same lesson as RunKonf/platform#43: platform
operator standing used to be derived from the organization **slug**, a
customer-writable field, and an org rename locked the platform out. Deriving env
var **names** from a customer-editable field is that mistake with a quieter
failure mode — a rename would not throw, `TENANT_<newslug>_EMAIL_*` would simply
not exist, every lookup would return `null`, and the tenant would silently drop
back to the platform account with dedicated sending off and the sender policy
back on. A deploy-time constant cannot be edited by an organizer.

The map is **validated at module load** (uppercase alphanumeric, non-empty org
id, no two orgs sharing a slug), so a bad entry fails loudly at build/boot rather
than resolving no credentials at send time.

**Families and fields** (only families with a wired consumer are served; every
other family — `slack`, `push`, `badge` — returns `null` here and falls through):

| Family      | Variables                                                                                                   | Required                 |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| `email`     | `TENANT_<SLUG>_EMAIL_API_KEY`, `TENANT_<SLUG>_EMAIL_FROM`                                                   | API key; `FROM` optional |
| `ticketing` | `TENANT_<SLUG>_CHECKIN_API_KEY`, `TENANT_<SLUG>_CHECKIN_API_SECRET`, `TENANT_<SLUG>_CHECKIN_WEBHOOK_SECRET` | **all three**            |

The ticketing segment is `CHECKIN`, not `TICKETING`, because the bag is
Checkin-shaped: it mirrors the platform's `CHECKIN_*` vars. A **Tito** tenant's
per-org secret still comes from (b) — `resolveTicketingCredentials` skips this
store on the Tito branch, because handing three Checkin values to `TitoProvider`
would authenticate a Tito call with a Checkin key.

**It fails closed.** An unmapped org, an unresolvable org, an unsupported family,
or an **incomplete** set of variables all resolve to `null` — never a bag with
`undefined` fields. A partial set is logged once and ignored: a half-configured
tenant that keeps sending on the platform account is indistinguishable from one
that was never configured, and that is the failure this store exists to prevent.
Values are trimmed, so a pasted trailing newline is not a different key.

This is a property of **this store**, not of the chain: (b) is deliberately
looser, accepting any non-empty object because it is provider-agnostic and
cannot know which fields a given vendor requires. A partial bag in
`TENANT_SECRETS_JSON` is still a chain hit.
`process.env` is read at **call** time, so a rotation needs no restart of any
object (though Vercel still requires a redeploy for the new value to reach the
running function).

## The fallback chain

```ts
resolveTenantSecrets(orgId, family)
//   discrete per-org vars  →  TENANT_SECRETS_JSON  →  env fallback  →  null
```

`DEFAULT_SECRETS_CHAIN = [envPerOrgSecretsStore, perOrgSecretsStore, envSecretsStore]`.
A real secret manager slots in front of `envSecretsStore` (or replaces the
per-org stores) behind the same interface. The chain is injectable
(`resolveTenantSecrets(orgId, family, stores)`) for tests and alternate
compositions; `PER_ORG_SECRETS_STORES` is the per-org prefix of it, used by
ticketing (which layers its own vendor-specific platform fallback) and by the
ticketing feature gate (so the gate can never be stricter than the resolver).

**Discrete vars beat the blob** because both are the tenant's own credentials, so
either is safe to hand out, and the order is what decides whether an operator can
rely on a cutover taking effect: setting `TENANT_<SLUG>_*` applies immediately and
the stale blob entry can be deleted afterwards.

The env fallback is **conditional on the org**, so for a non-platform tenant the
chain reads: its own secret, or `null`.

## Operator runbook — provisioning a tenant with discrete vars

Worked example: **CNDN** (`organization-cloud-native-days`, slug `CNDN`). Set
these in Vercel (Production; mark all as **Sensitive**) and redeploy — Vercel env
changes do not reach a running deployment until it is rebuilt.

| Variable                             | What it is                            | Effect once set                                                                             |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `TENANT_CNDN_EMAIL_API_KEY`          | Resend API key for CNDN's own account | CNDN becomes a **dedicated** sender: its own client, **sender policy no longer applied**    |
| `TENANT_CNDN_EMAIL_FROM`             | _(optional)_ tenant default `From:`   | **Sign-in emails only** — the one caller that reads it (`lib/auth/email-link/send.ts`)      |
| `TENANT_CNDN_CHECKIN_API_KEY`        | Checkin.no API key                    | with the two below, CNDN's ticketing **outbound** calls resolve per-org                     |
| `TENANT_CNDN_CHECKIN_API_SECRET`     | Checkin.no API secret                 | ″                                                                                           |
| `TENANT_CNDN_CHECKIN_WEBHOOK_SECRET` | Checkin.no webhook signing secret     | required for the bag to resolve, but **not yet used for inbound verification** — see step 3 |

**Order matters.**

**0. Pre-flight — do this before step 1.** Going dedicated switches
`enforceSenderPolicy` off, so `applySenderPolicy` stops running for CNDN and its
`From:` leaves **exactly as each call site built it**. Today an address on a
domain outside `EMAIL_SENDING_DOMAINS` is rewritten to `EMAIL_FALLBACK_FROM` with
the original in `Reply-To:`; afterwards it is not.

CNDN's `From:` is built from tenant-editable conference fields, and its three
conference documents do **not** agree on a domain — as of 2026-08 the 2024 and
2025 events carry `cfp@`/`contact@cloudnativebergen.dev` while the 2026 event
carries `cfp@`/`contact@cloudnativedays.no`. Older conferences still send
(speaker mail, sign-in), so **both** domains are live. Before step 1, confirm
**each** is verified on the account the new key belongs to:

```sh
# lists the domains and their status on the account behind $KEY
curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/domains
```

If one is not verified, Resend rejects the send and the only trace is an
`[email] send failed` line — precisely the silent failure the sender policy
exists to prevent.

1. **Mint a SECOND API key on the EXISTING Resend account** and set
   `TENANT_CNDN_EMAIL_API_KEY` to it, _before_ the platform Resend account is
   swapped. CNDN then sends through the same account it already uses — this is
   the checkpoint the whole cutover rests on (pinned by
   `src/lib/email/per-org-cutover.test.ts`). Given step 0, the messages
   themselves are unchanged; what changes is that the policy is no longer in the
   path.
   **Do not paste the platform's own `RESEND_API_KEY` value.** `getResendClient`
   identifies the shared platform client by comparing the key string, so an
   identical value collapses back to the shared client and CNDN is _not_
   dedicated.
2. Only then change the platform `RESEND_API_KEY` / `EMAIL_FALLBACK_FROM` to the
   new platform account. CNDN is already off the shared tier and is unaffected.
   **Do steps 1 and 2 in one sitting.** Between them, `/privacy` says CNDN is
   "Sent through this organizer's own Resend account" while that account is still
   the shared one — true after step 2, briefly false before it.
3. For ticketing, set **all three** `TENANT_CNDN_CHECKIN_*` variables in one go.
   Any proper subset resolves to `null` and CNDN silently stays on the platform
   fallback — safe, but not the cutover you intended.
   **This moves OUTBOUND calls only, and the account must not change.** As with
   step 1, these must be credentials for the **same Checkin account** already in
   use. Inbound webhook verification still runs on the platform
   `CHECKIN_WEBHOOK_SECRET`, so `TENANT_CNDN_CHECKIN_WEBHOOK_SECRET` is stored
   and required for the bag to resolve but is not yet read by the webhook route.
   Point the three variables at a **different** Checkin account, or repoint
   Checkin's webhook configuration at a different signing secret, and every
   inbound webhook fails verification — silently, with no error surface beyond a
   log line, and workshop signup emails simply stop. Set the webhook secret to
   the same value the platform uses until website#845 gives the route org-keyed
   paths.
4. Delete any superseded `TENANT_SECRETS_JSON` entry for the tenant last. It is
   already being ignored for the families the discrete vars cover.

**Rollback.** Deleting the variables and redeploying returns the tenant to
resolving with no per-org secret — but that is only "exactly as before" while
step 2 has not happened. Once `RESEND_API_KEY` points at the new platform
account, deleting `TENANT_CNDN_EMAIL_API_KEY` drops CNDN onto **that** account,
not the original one. After step 2, roll back step 2 as well.

**Out of scope of this mechanism, on purpose:** `platformCheckinCredentials()`
and the platform-org fallback stay. The inbound
`/api/webhooks/checkin/ticket-sold` route verifies a signature **before** any
tenant is known, so it needs a platform secret until website#845 gives it
org-keyed paths — removing the fallback would break CNDN's inbound webhooks with
no error, just no workshop emails.

## Wired consumers

| Family    | Boundary                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ticketing | `resolveTicketingCredentials` (`src/lib/tickets/provider/index.ts`)          | **Wired (Checkin + Tito).** Per-org secret wins — `TENANT_<SLUG>_CHECKIN_*` first (Checkin branch only), then `TENANT_SECRETS_JSON` (either vendor). The platform env is handed out **only to the platform org** (`PLATFORM_ORG_ID`). Any other org resolves to `null` ⇒ the conference reports unconfigured.                                                                                                                                                            |
| email     | `resolveEmailSender(orgId)` (`src/lib/email/config.ts`)                      | **Wired, and used by every send path.** A per-org key (`TENANT_<SLUG>_EMAIL_API_KEY` or the blob) gets the tenant's own Resend client; everyone else gets the cached platform client — the shared **T0 tier**, expressed in `config.ts` rather than by the secret store handing out the platform key. `src/lib/email/platform-client-usage.test.ts` allowlists the only direct `resend` consumer (the status-page deliverability probe) so no new send path can regress. |
| slack     | `resolveConferenceSlackToken(conference)` → `postSlackMessage({ botToken })` | **Wired + gated.** The ONLY token source — `postSlackMessage` has no env fallback. A per-org token always wins; the platform `SLACK_BOT_TOKEN` requires the `slack-mirror` entitlement (`src/lib/features/slack.ts`), which defaults to the platform org alone.                                                                                                                                                                                                          |
| push      | `resolveTenantSecrets(orgId, 'push')`                                        | **Seam only.** Env-only; VAPID config is process-global (see the TODO in `push/vapid.ts`).                                                                                                                                                                                                                                                                                                                                                                               |
| badge     | `resolveTenantSecrets(orgId, 'badge')`                                       | **Seam only.** Env-only; signing keys thread through pure config (TODO in `badge/config.ts`).                                                                                                                                                                                                                                                                                                                                                                            |

The one remaining direct `platformCheckinCredentials()` consumer is the inbound
`/api/webhooks/checkin/ticket-sold` route, which verifies a signature **before**
any tenant is known and so has no org to key on. Every org-aware surface —
including the `tickets` tRPC router and the admin ticket sub-pages — resolves
through `resolveTicketingCredentials`.

### Why the platform env is gated, not shared

Both env credentials are single upstream ACCOUNTS, and both are addressed by
TENANT-EDITABLE identifiers: a conference's `checkinEventId` / `titoEventSlug`,
and Slack's `cfpNotificationChannel` / `salesNotificationChannel`. Sharing the
account therefore lets a tenant's own document fields address the platform's
account, and no Sanity-side guard can see a provider id or a channel name.
Withholding the credential is the isolation. A tenant that legitimately needs the
integration gets its OWN secret provisioned, which addresses its own account and
needs no gate.

## What the later #617 wave adds

- An **admin management UI** to view/set per-org secrets (fingerprints only,
  never echoing values — mirroring `/admin/settings`).
- A **real secret-manager store** (e.g. Vercel/Infisical/Vault) implementing
  `TenantSecretsStore`, replacing `JsonEnvSecretsStore` in the chain.
- Optional **per-org wire-in for push and badge** once the process-global VAPID
  client and the badge issuer-key endpoints are made per-tenant.
