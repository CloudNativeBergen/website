# Tenant provisioning on the API platform (design, #1924)

Status: design only. No code changes in this PR. Part of #1772. Owner decisions of 2026-11-05 are folded in (one operator-tagged supergraph, no owner at provisioning, Sanity verification in step 2).

## Problem

A new tenant can't get tenant-directory rows through any product path, and if it could, they would carry the wrong ids.

- `provisionOrganization` is `tag: 'internal'` (`services/tenant-directory/src/subgraph.ts:112-126`). `publicContract` drops every internal field before composition (`api/src/supergraph.ts:30-47`). The gateway serves only that one supergraph. Rows exist only from the backfill (`scripts/backfill-tenant-directory.ts`).
- The directory mints `crypto.randomUUID()` for the org and conference (`services/tenant-directory/src/data/index.ts:149-150`). Content, identity and the member sync join on Sanity `_id`s (`services/tenant-directory/scripts/backfill.ts:4`, `services/identity/src/data/member-sync.ts:4`). A directory-minted org would point to no Sanity document.
- The site has its own working path: `provisionOrganization` in `src/lib/onboarding/provision.ts:429`. It runs one Sanity transaction with slug and domain checks, domain locks and an idempotency receipt (`provision.ts:412-421`, `:535-574`).

## Today

| Caller                              | Entry                                                                                                                                | Auth                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| kontroll (my.konf.app), server side | `POST /api/provisioning/organizations` (`src/app/api/provisioning/organizations/route.ts:15-44`)                                     | shared bearer `PROVISIONING_API_TOKEN`      |
| site operator wizard                | tRPC `onboarding.createOrganization` (`src/server/routers/onboarding.ts:161-164`)                                                    | platform-operator session                   |
| nobody                              | tenant-directory `provisionOrganization`                                                                                             | `requirePlatform` (`subgraph.ts:9`, `:123`) |
| backfill (operator, by hand)        | `scripts/backfill-tenant-directory.ts` writes SQL, applied with `wrangler d1 execute` (`scripts/backfill-tenant-directory.ts:13-14`) | Cloudflare account                          |

Both site entries land in the same function (`provision.ts:29-37`). kontroll is not in this repo. Evidence of what it calls: the route's header comment (`route.ts:17-20`) and `docs/ONBOARDING_CHECKLIST.md` §3.2-3.3. It sends one POST with the invite's `provisioningKey` as `Idempotency-Key`, then writes the org reference into its own invite record.

## 1. The id space

| Id           | Minted by today                                                                                               | Canonical (proposed)             |
| ------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| organization | site: `organization.<slug>` (`provision.ts:256`, `:513`); directory: UUID (`data/index.ts:149`)               | Sanity `_id`, minted by the site |
| conference   | site: `generateKey('conference')` (`provision.ts:514`); directory: UUID (`data/index.ts:150`)                 | Sanity `_id`, minted by the site |
| domain       | hostname is the key in both (`migrations/0001_init.sql:22-24`; Sanity `conference.domains[]`)                 | hostname                         |
| identity org | `ensure(id, slug)` takes the directory's id (`services/identity/src/index.ts:29-31`, `data/index.ts:120-129`) | the same Sanity `_id`            |

**Recommendation: the Sanity `_id` is the one id.** Content serves Sanity documents by it, the member sync reads `conference.organizers[]` and writes `member.organizationId` with it, and the backfill already writes it into D1 (`backfill.ts:89`, `:126`). Making Sanity follow D1 instead would mean rewriting every Sanity reference. The directory stops minting ids and takes them as arguments.

The hostname needs no mapping. The site and the directory mint the same platform hosts: `<org>.konf.run` and `<org>-<year>.konf.run` (`services/tenant-directory/src/data/naming.ts:5-8`; `ONBOARDING_CHECKLIST.md` §3.2). The directory's conference `slug` is the edition year (`backfill.ts:116`).

**Existing rows.** The production directory was filled by the backfill, which writes Sanity `_id`s. The one flag migration targets `eb7b16c6-00fa-44a0-adcd-4a480de34242` (`migrations/0003_backfill_cndn_2026_flags.sql:5-7`). It is UUID-shaped, but it is the Sanity `_id` of CNDN 2026, not a directory-minted id. Nothing in the repo calls `provision` except the internal mutation (`subgraph.ts:124`). The only rows with directory UUIDs would come from a direct subgraph call. Only that path writes `provisioning_requests` (`data/index.ts:185-188`), so the read-only check is `SELECT count(*) FROM provisioning_requests`. I did not run it against production; expected `0`. If it is not 0, those orgs have no Sanity counterpart: delete them, don't map them.

## 2. The single write path

One idempotency key (kontroll's `provisioningKey`) drives every step. Each step is re-runnable with that key and returns the first result.

| #   | Step                                                                                            | Where                                                            | Atomic unit                                     | On failure                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sanity org, conference, organizer speaker, receipt, platform hosts in `domains[]`, domain locks | site `provision.ts` (unchanged)                                  | one Sanity transaction (`provision.ts:535-574`) | Nothing written. Retry with the same key replays the receipt and returns the same ids (`provision.ts:418-421`), but only for 30 days: the receipt is purged after `PROVISIONING_RECEIPT_RETENTION_DAYS` (`src/lib/provisioning/constants.ts:38`). |
| 2   | Directory `organizations`, `conferences`, two platform `domains`, `provisioning_requests`       | tenant-directory `provisionOrganization` with the step-1 ids     | one D1 batch (`data/index.ts:165-189`)          | Nothing written. Step 1 without step 2 is benign: the site serves the tenant from Sanity. Detection: the site logs `[konf-api] no rollout flags for <host>` (`src/lib/conference/konf-api.ts:105`). Retry.                                        |
| 3   | identity organization                                                                           | `IDENTITY.ensure(id, slug)`, inside step 2 (`data/index.ts:143`) | one insert, `ON CONFLICT DO NOTHING`            | Step 2 rows stay. Every retry of step 2 calls `ensure` again and heals it (`data/index.ts:116-119`).                                                                                                                                              |
| 4   | Owner membership                                                                                | not written by provisioning; operator SQL runbook (see below)    | one `UPDATE`                                    | Re-runnable; a zero-owner org is not locked, only unprotected.                                                                                                                                                                                    |
| 5   | Custom domains                                                                                  | later, `addCustomDomain` per hostname (`subgraph.ts:136-147`)    | per hostname                                    | Per hostname; `hostname` is the primary key, so a claim can't be taken twice.                                                                                                                                                                     |
| 6   | Rollout flags                                                                                   | default off (`docs/PLATFORM.md` "Rollout flags")                 | -                                               | Set by operator SQL when the tenant moves to the API.                                                                                                                                                                                             |

**Who owns the transaction.** No step spans both stores. Sanity commits first because it holds the authorities that exist today: global slug uniqueness, routing-overlap domain checks, organizer matching. Step 2 cannot fail on a slug or host that step 1 accepted unless D1 and Sanity have drifted. That case is a `CONFLICT` for an operator, never an auto-suffix.

**Step 2 changes** (tenant-directory only):

- Required args `orgId` and `conferenceId`. Drop `crypto.randomUUID()`.
- Shape guards before any write: `orgId === 'organization.' + orgSlug` (the site's rule, `provision.ts:256`), and `conferenceId` matches the Sanity id charset `[A-Za-z0-9._-]{1,128}`. Legacy orgs such as `organization-cloud-native-days` fail this guard by design; they enter D1 through the backfill only.
- **Verify against Sanity, before the D1 batch.** Shape guards alone allow a permanent squat: an operator (or a typo) can register a well-formed `orgId` and conference id that Sanity never minted, or pair a real conference with the wrong org. The backfill cannot repair it later, because its upserts never update `conferences.org_id` or a domain owned by another org (`services/tenant-directory/scripts/backfill.ts:239`, `:243`). So step 2 reads Sanity and refuses with `BAD_USER_INPUT` unless:
  - the org `_id` exists with that slug;
  - the conference `_id` exists with `organization._ref == orgId`;
  - both platform hosts are in `conference.domains[]`;
  - the conference has a `startDate`.
- Take the edition year from the dated host found in Sanity, not by re-deriving it from `startDate`. The site minted the hosts once and never re-derives them (`provision.ts:186-191`, `:193-205`).
- Fetch with the raw-GROQ pattern from `services/identity/src/data/member-sync.ts:48-62`. tenant-directory gets a read token named `SANITY_API_TOKEN_READ`, the same name conference and identity use; this shared name is the accepted exception. The owner sets it with a script. No token values go in chat, docs or PRs.
- Idempotent by id as well as by key. If `organizations.id` exists with the same slug, return it and still `ensure`. This covers a retry with a new key after kontroll lost its key.
- Store a hash of the key, not the raw key. The site stores `sha256(key + AUTH_SECRET)` (`provision.ts:418`); tenant-directory has no `AUTH_SECRET`, so it stores a plain `sha256(key)`. The two stores never compare hashes.

**Domain-lock pattern.** Not needed in D1. The site's `provisioningDomainLock` documents (`provision.ts:239-256`) exist because Sanity has no unique index. In D1, `domains.hostname` is the primary key (`0001_init.sql:23`) and the batch is atomic, so the constraint is the lock.

**Initial owner (#1941, owner decision 2).** Provisioning writes no `member` row and names no owner. Until #1923 ships a member mutation, the owner grant is an SQL runbook run by an operator against identity D1:

```sql
UPDATE member SET role = 'owner,admin' WHERE organizationId = ? AND userId = ?;
```

Facts that make this safe for now:

- Customers are not blocked meanwhile. Site `/admin` access comes from the Sanity organizer list, not from identity membership (`src/lib/auth/identity-session.ts:126-133`).
- The hourly sync grants `admin` only for orgs that already exist in identity, and only to users whose verified email matches an organizer (`member-sync.ts:137-147`, `:153-155`, `:184-194`). The row the runbook updates comes from that sync, so the organizer must have signed in once.
- A zero-owner org is not locked. The last-owner triggers fire only when an `owner` row is deleted or demoted (`services/identity/migrations/0003_member_rules.sql:15`, `:21`); with no owner, the org is simply unprotected by them.
- HTTP org writes are refused by the org write gate until #1923 (`services/identity/src/org-write-gate.ts:15`).

The org goes into `MEMBER_SOURCE_ORGS` (drift mode) only once it has an owner.

**Orphans.** A Sanity tenant without directory rows is harmless: the site serves it from Sanity. A directory row without a Sanity org is the bad case. The check needs a code change first: `scripts/backfill-tenant-directory.ts --dry-run` prints counts and anomalies, not ids (`scripts/backfill-tenant-directory.ts:37-41`). PR 5 adds an id listing, and lists anomaly-skipped orgs separately, since those exist in Sanity but would otherwise read as false orphans. Compare that set with `SELECT id FROM organizations`. Any id only in D1 is an orphan. Delete it after confirming with the owner (production data).

## 3. Who may call it

Only operators. `provisionOrganization` already requires a `PlatformContext` (`subgraph.ts:9`, `:123`). The gateway mints one only in the operator lane, for a `platformOperator` user who names no tenant (`api/src/gateway.ts:466-487`). `packages/tenancy` lets no scoped repository accept it (`packages/tenancy/src/index.ts:38-44`, `:187-192`).

**Exposure: one supergraph, operator-tagged (owner decision 1).** There is no second supergraph or runtime.

- Tag `provisionOrganization` (and later the domain mutations) `operator` in place of `internal`. `publicContract` cuts only `internal` (`api/src/supergraph.ts:30-47`), so the mutation and its args become part of the one public schema.
- Access rests on two existing checks: `requirePlatform` in the resolver (`services/tenant-directory/src/subgraph.ts:9-15`, `:123`), and the gateway minting a `PlatformContext` only for a platform operator who sends no tenant header (`api/src/gateway.ts:466-487`).
- This changes the stated principle in `api/src/supergraph.ts:4-6` ("platform operations never reach the public gateway"). The owner approved that. PR 2 updates the comment.
- **Required gateway test:** anonymous, tenant-member and operator-with-tenant calls to `provisionOrganization` each get `FORBIDDEN`, and `data.provision` is never called. The operator-without-tenant call succeeds.
- Optional: turn introspection off for non-operator lanes.

The gateway reads one `OPERATOR_ORIGIN` (`gateway.ts:50-53`). identity has a list, `OPERATOR_ORIGINS` (`services/identity/service.cue:16-19`). Not needed for this work; align them only if a second operator origin appears.

**kontroll as caller.** The operator lane needs an identity token for a human `platformOperator` (`gateway.ts:466-473`). kontroll's setup form is filled in by the customer (`ONBOARDING_CHECKLIST.md` §3.1), who is not an operator. So step 2 starts as an operator action in kontroll: "Register on the API", using the operator's own session and the ids and key from the invite record. That matches when the rows are needed: only when the tenant moves to the API, which the operator already decides by setting flags. No machine principal for kontroll yet (owner decision 3); `PROVISIONING_API_TOKEN` stays for step 1.

kontroll's own `KONF_PLATFORM_OPERATORS` list is not identity's `user.platformOperator` flag (`services/identity/src/data/schema.ts:28`). The gateway checks only the latter, so the button must call with the operator's identity session, obtained through the handoff (#1922).

## 4. The site's `provision.ts` and the route

Keep both, unchanged. `provision.ts` is step 1. The org, the conference and their content stay in Sanity (`docs/DATA_OWNERSHIP.md`, entity table). It is the only code that holds the slug, domain-overlap and organizer rules. The site does not call the directory: that would need the site's signing key to mint a `PlatformContext`. A leak of that Vercel secret would then allow platform writes. Retire step 1 only when org and conference documents move to D1, which this issue does not cover.

## 5. Draft: `docs/ONBOARDING_CHECKLIST.md` API section

To be added after Phase 6 once PRs 1-3 below have merged:

> ### Phase 7: Move the tenant to the API: **[OPERATOR]**
>
> **7.1 Directory rows.** In kontroll, open the org and press **Register on the API**. It calls `provisionOrganization` in the operator lane with the org and conference ids from Phase 3 and the invite's `provisioningKey`. It creates `organizations`, `conferences`, `<slug>.konf.run` and `<slug>-<year>.konf.run` in tenant-directory D1, and the identity organization. Re-press is safe. **Verify:** `wrangler d1 execute DB --remote --env production --command "SELECT id, slug FROM organizations WHERE id = 'organization.<slug>'"` returns one row.
>
> **7.2 Domains.** For each custom domain verified in Phase 4, run `addCustomDomain` in kontroll. **Verify:** `SELECT hostname, verification FROM domains WHERE org_id = '<id>'` shows it `verified`.
>
> **7.3 Owner.** The organizer signs in through identity once; the hourly sync makes them `admin`. Until #1923 ships a member mutation, an operator promotes them with SQL on identity D1: `UPDATE member SET role = 'owner,admin' WHERE organizationId = '<orgId>' AND userId = '<userId>'`. **Verify:** `SELECT role FROM member WHERE organizationId = '<orgId>'` shows `owner,admin`. Do not put the org in `MEMBER_SOURCE_ORGS` before this.
>
> **7.4 Flags.** Before `d1_write`: confirm the member row from 7.3 exists. Turn on `identity_login`, then `api_read`, then `d1_write`, one at a time, as in `docs/PLATFORM.md` "Rollout flags". **If it went wrong:** set the flag back to `0`. The site falls back to Sanity within 5 minutes.
>
> **If 7.1 fails:** `CONFLICT` means D1 already holds the slug or host under another id. Do not pick a new slug. Compare with the orphan check in `docs/TENANT_PROVISIONING.md` §2 and ask the owner.

## 6. Rollout

| #   | PR                                                                                                                                          | Files                                                                                                                      | API session     | Prod schema/data  | Auth |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------- | ---- |
| 1   | tenant-directory: caller-supplied ids, shape guards, Sanity verification, idempotent by id, hashed key                                      | `services/tenant-directory/src/data/index.ts`, `src/subgraph.ts`, tests; `SANITY_API_TOKEN_READ` set by the owner's script | yes             | no (no migration) | no   |
| 2   | api: `operator` tag replaces `internal` on provisioning, required gateway FORBIDDEN test, principle comment                                 | `api/src/supergraph.ts`, `api/src/gateway.ts` tests, `services/tenant-directory/src/subgraph.ts` (tag)                     | yes             | no                | yes  |
| 3   | kontroll: "Register on the API" operator action, identity session via handoff (#1922)                                                       | RunKonf/kontroll                                                                                                           | no (other repo) | no                | yes  |
| 4   | docs: Phase 7 in `docs/ONBOARDING_CHECKLIST.md` with the owner-grant SQL runbook (7.3) and the d1_write check, link from `docs/PLATFORM.md` | docs only                                                                                                                  | no              | no                | no   |
| 5   | data: orphan-check id listing in `scripts/backfill-tenant-directory.ts`, rerun backfill for tenants created since, run the orphan check     | script change + SQL                                                                                                        | no              | **yes, owner OK** | no   |

Order: #1921 (operator writes, API session) merges first; then 1 → 2 → 3 → 4. PR 5 is independent of PR 1 and can run any time. PR 2 touches the gateway test and the `requirePlatform` boundary, so it needs a Fable review and the owner's OK before merging. The owner-grant runbook (7.3) is retired when #1923 ships the member mutation.

## 7. Owner decisions (2026-11-05)

1. **Exposure:** one supergraph, provisioning tagged `operator`; no second runtime. Approved change to the principle in `api/src/supergraph.ts:4-6`.
2. **Owner:** none at provisioning. SQL runbook until #1923.
3. **Accepted defaults:** step 2 verifies against Sanity; refuse until the conference has a start date, year from the Sanity host; no machine principal for kontroll, keep `PROVISIONING_API_TOKEN`; legacy orgs go through the backfill only.

Still open: run `SELECT count(*) FROM provisioning_requests` (read-only) before PR 1 merges. If it is not 0, decide before PR 5 whether to delete those rows.
