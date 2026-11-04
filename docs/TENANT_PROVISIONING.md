# Tenant provisioning on the API platform (design, #1924)

Status: design only. No code changes in this PR. Part of #1772.

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

| #   | Step                                                                                            | Where                                                            | Atomic unit                                     | On failure                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Sanity org, conference, organizer speaker, receipt, platform hosts in `domains[]`, domain locks | site `provision.ts` (unchanged)                                  | one Sanity transaction (`provision.ts:535-574`) | Nothing written. Retry with the same key replays the receipt and returns the same ids (`provision.ts:418-421`).          |
| 2   | Directory `organizations`, `conferences`, two platform `domains`, `provisioning_requests`       | tenant-directory `provisionOrganization` with the step-1 ids     | one D1 batch (`data/index.ts:165-189`)          | Nothing written. The Sanity tenant still works on the site, which does not need the directory until flags are on. Retry. |
| 3   | identity organization                                                                           | `IDENTITY.ensure(id, slug)`, inside step 2 (`data/index.ts:143`) | one insert, `ON CONFLICT DO NOTHING`            | Step 2 rows stay. Every retry of step 2 calls `ensure` again and heals it (`data/index.ts:116-119`).                     |
| 4   | Owner membership                                                                                | not written by provisioning (see below)                          | -                                               | -                                                                                                                        |
| 5   | Custom domains                                                                                  | later, `addCustomDomain` per hostname (`subgraph.ts:136-147`)    | per hostname                                    | Per hostname; `hostname` is the primary key, so a claim can't be taken twice.                                            |
| 6   | Rollout flags                                                                                   | default off (`docs/PLATFORM.md` "Rollout flags")                 | -                                               | Set by operator SQL when the tenant moves to the API.                                                                    |

**Who owns the transaction.** No step spans both stores. Sanity commits first because it holds the authorities that exist today: global slug uniqueness, routing-overlap domain checks, organizer matching. Step 2 cannot fail on a slug or host that step 1 accepted unless D1 and Sanity have drifted. That case is a `CONFLICT` for an operator, never an auto-suffix.

**Step 2 changes** (tenant-directory only):

- Required args `orgId` and `conferenceId`. Drop `crypto.randomUUID()`.
- Guard before any write: `orgId === 'organization.' + orgSlug` for new orgs (the site's rule, `provision.ts:256`), and `conferenceId` matches the Sanity id charset `[A-Za-z0-9._-]{1,128}`. This stops an operator typo from creating an id that content can't serve.
- Idempotent by id as well as by key. If `organizations.id` exists with the same slug, return it and still `ensure`. This covers a retry with a new key after kontroll lost its key.
- Store `sha256(key)` rather than the raw key, as the site does (`provision.ts:418`).

**Domain-lock pattern.** Not needed in D1. The site's `provisioningDomainLock` documents (`provision.ts:239-256`) exist because Sanity has no unique index. In D1, `domains.hostname` is the primary key (`0001_init.sql:23`) and the batch is atomic, so the constraint is the lock.

**Initial owner (#1941).** Provisioning writes no `member` row. The organizer usually has no identity user yet, and the hourly sync grants only `admin` (`member-sync.ts:2-7`). Proposed:

1. The sync grants `admin` after the organizer's first identity sign-in, as it does now.
2. A platform operator promotes them to `owner` in the operator lane. Only owners and operators may grant `owner`.
3. The org goes into `MEMBER_SOURCE_ORGS` (drift mode) only once it has two owners. The last-owner trigger then protects it.

**Orphans.** A Sanity tenant without directory rows is harmless: the site serves it from Sanity. A directory row without a Sanity org is the bad case, so it gets a check: run `scripts/backfill-tenant-directory.ts --dry-run` and compare its id set with `SELECT id FROM organizations`. Any id that exists only in D1 is an orphan. Delete it after confirming with the owner (production data).

## 3. Who may call it

Only operators. `provisionOrganization` already requires a `PlatformContext` (`subgraph.ts:9`, `:123`). The gateway mints one only in the operator lane, for a `platformOperator` user who names no tenant (`api/src/gateway.ts:466-487`). `packages/tenancy` lets no scoped repository accept it (`packages/tenancy/src/index.ts:38-44`, `:187-192`).

**Exposure: a separate operator contract, not an un-tag.** Removing `internal` would publish the mutation in the one public supergraph. `requirePlatform` would still refuse it, but the operation and its args become public schema. Instead:

- Add `tag: 'operator'` next to `internal` on `provisionOrganization` (and later the domain mutations).
- `api/src/supergraph.ts`: an `operatorContract` filter that keeps `internal` fields only when they also carry `operator`. Compose a second supergraph `api/supergraph.operator.graphql`.
- `api/src/gateway.ts`: a second runtime for that supergraph. Use it only when `operatorLane && envelope.typ === 'platform'`. Everyone else gets the public runtime and sees no operator fields, even in introspection.
- Contract test: the public SDL has no `provisionOrganization`, and the operator SDL has nothing tagged only `internal` (for example, `tenantByHost`).

The gateway reads one `OPERATOR_ORIGIN` (`gateway.ts:50-53`). identity has a list, `OPERATOR_ORIGINS` (`services/identity/service.cue:16-19`). Not needed for this work; align them only if a second operator origin appears.

**kontroll as caller.** The operator lane needs an identity token for a human `platformOperator` (`gateway.ts:466-473`). kontroll's setup form is filled in by the customer (`ONBOARDING_CHECKLIST.md` §3.1), who is not an operator. So step 2 starts as an operator action in kontroll: "Register on the API", using the operator's own session and the ids and key from the invite record. That matches when the rows are needed: only when the tenant moves to the API, which the operator already decides by setting flags. Automating it needs a machine principal (open question 1).

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
> **7.3 Identity org and owners.** The organizer signs in through identity once; the hourly sync makes them `admin`. Promote them to `owner` in kontroll, and add a second owner. Do not put the org in `MEMBER_SOURCE_ORGS` until both exist.
>
> **7.4 Flags.** Turn on `identity_login`, then `api_read`, then `d1_write`, one at a time, as in `docs/PLATFORM.md` "Rollout flags". **If it went wrong:** set the flag back to `0`. The site falls back to Sanity within 5 minutes.
>
> **If 7.1 fails:** `CONFLICT` means D1 already holds the slug or host under another id. Do not pick a new slug. Compare with the orphan check in `docs/TENANT_PROVISIONING.md` §2 and ask the owner.

## 6. Rollout

| #   | PR                                                                                                     | Files                                                                                                   | API session     | Prod schema/data  | Auth                        |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------- | ----------------- | --------------------------- |
| 1   | tenant-directory: caller-supplied ids, id guards, idempotent by id, hashed key                         | `services/tenant-directory/src/data/index.ts`, `src/subgraph.ts`, tests                                 | yes             | no (no migration) | no                          |
| 2   | api: operator contract and second runtime, contract test                                               | `api/src/supergraph.ts`, `api/src/gateway.ts`, `services/tenant-directory/src/subgraph.ts` (tag), tests | yes             | no                | yes                         |
| 3   | kontroll: "Register on the API" operator action                                                        | RunKonf/kontroll                                                                                        | no (other repo) | no                | yes (uses operator session) |
| 4   | docs: Phase 7 in `docs/ONBOARDING_CHECKLIST.md`, link from `docs/PLATFORM.md`                          | docs only                                                                                               | no              | no                | no                          |
| 5   | data: register tenants created in Sanity since the backfill (rerun backfill), and run the orphan check | SQL from `scripts/backfill-tenant-directory.ts`                                                         | no              | **yes, owner OK** | no                          |

Order: 1 → 2 → 3 → 4. 5 can run any time after 1. PR 2 gets a second-model review (security boundary).

## 7. Open questions for the owner

1. **Should kontroll run step 2 itself, without an operator?** That needs a machine principal for the operator lane, which is an auth design of its own. _Recommendation:_ no, not now. Moving a tenant to the API is already an operator act.
2. **What if a conference has no start date?** The directory needs the year as the conference slug; the site leaves the edition host out (`ONBOARDING_CHECKLIST.md` §3.2). _Recommendation:_ step 2 refuses with `BAD_USER_INPUT` until a start date is set.
3. **Should step 2 write the first owner when the identity user already exists?** _Recommendation:_ no. Keep one path to `owner`, the operator lane, so the #1941 rules sit in one place.
4. **Production check.** _Recommendation:_ run `SELECT count(*) FROM provisioning_requests` (read-only) before PR 1 merges. If it is not 0, decide before PR 5 whether to delete those rows.
5. **Retire `PROVISIONING_API_TOKEN`?** _Recommendation:_ keep it. Step 1 still runs through it, and replacing it is part of the work that moves orgs off Sanity.
