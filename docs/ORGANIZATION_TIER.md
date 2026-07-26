# Organization Tier (Multi-Tenant Foundation)

The **organization tier** is the foundation of the multi-tenant ("Conference
as a Service", CaaS) track. It introduces a top-level `organization` document —
the **tenant** — that owns a set of conference editions and every document
scoped to them, and it wires a tenant key onto all the document types that will
later need to be partitioned and access-controlled per tenant.

This is **wave 1** (issue #613, "T1-1"). It deliberately ships **only** the data
model plus a non-destructive backfill:

- It does **not** change authorization — no query is gated on the tenant key
  yet. Document-level security is **wave 2** (#614).
- It does **not** roll out query scoping — reads are not yet filtered by
  organization. That is **wave 3** (#616).

Server code must therefore treat the tenant key as **possibly absent** until the
backfill has run.

## The model

### `organization` — the tenant

A lean document (`sanity/schemaTypes/organization.ts`): `name` (required),
`slug` (required), optional `contactEmail`, `billingEmail`, `homepage`, and an
optional inline-SVG `logo` (same mechanism as conference branding). Billing/plan
fields are intentionally deferred to the billing issue.

### `conference` → `organization` (single reference)

Each conference edition belongs to exactly one organization
(`conference.organization`). The field carries a **required** validation rule so
new editions authored in Studio must pick an owner — but Sanity validation is
Studio-only, so adding the rule is safe for legacy documents: they remain
readable and writable until the backfill stamps them. Server code must not
assume `conference.organization` is present until then.

The main conference projection (`getConferenceForDomain` in
`src/lib/conference/sanity.ts`) already spreads the full document (`...`), so
`organization` is projected as a raw reference automatically — downstream waves
can read `conference.organization._ref` without a query rewrite.

### `speaker` → `organizations` (ARRAY of references) — global person

A speaker is a **global person**, not a tenant-owned record. The same human can
speak for several organizations, so membership is modeled as an **array**
(`speaker.organizations`), not a single owner reference. Membership accrues:

- The **backfill** seeds every existing speaker with the bootstrap org.
- On **login** (`getOrCreateSpeaker`, `src/lib/speaker/sanity.ts`) the current
  conference's organization is appended if absent (idempotent, best-effort —
  never a login gate).
- Admin-created speakers (`speaker.create` router) are born with the current
  organization as their first membership.

### The four other global types → `organization` (single reference)

`topic`, `staff`, `sponsor`, and `sponsorEmailTemplate` are owned by exactly one
organization and carry a single `organization` reference.

### The four transitively-scoped types → **denormalized** `organization`

`message`, `travelExpense`, `sponsorActivity`, and `conversationPreference` have
**no conference key of their own** — they hang off a parent (a `conversation`, a
`travelSupport`, a `sponsorForConference`) that carries the conference.

Document-level security (#614) is **reference-blind**: a Sanity document filter
cannot traverse a reference at read time to discover the tenant two hops up. So
the tenant key is **denormalized** — copied down onto each of these documents at
creation time — so the security filter can match it directly on the document.
These fields are `readOnly` in Studio; they are written by the server.

## Creation-path stamping

New documents are born carrying the tenant key. The helpers live in
`src/lib/organization/sanity.ts` and are **best-effort**: if the organization
can't be resolved (a legacy conference before the backfill, or a context without
a request domain), they return `null` and nothing is stamped.

| Type                     | Where stamped                                                                                                  | Org source                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `topic`                  | `topic.create` router                                                                                          | current conference                                                        |
| `staff`                  | `staff.create` router                                                                                          | current conference                                                        |
| `speaker` (create)       | `speaker.create` router                                                                                        | current conference                                                        |
| `speaker` (login)        | `getOrCreateSpeaker`                                                                                           | current conference                                                        |
| `sponsor`                | `createSponsor`                                                                                                | current conference                                                        |
| `sponsorEmailTemplate`   | `createSponsorEmailTemplate`                                                                                   | current conference                                                        |
| `message`                | `addMessage`                                                                                                   | parent conversation → conference                                          |
| `conversationPreference` | `setConversationPreference`                                                                                    | parent conversation → conference                                          |
| `travelExpense`          | `addTravelExpense`                                                                                             | parent travelSupport → conference                                         |
| `sponsorActivity`        | `createSponsorActivity`, `logBulkEmailSent`, `bulkUpdateSponsors`, Adobe Sign webhook, contract-reminders cron | parent sponsorForConference → conference (or current conference for bulk) |

- **Global types** take the tenant of the **current-domain conference**
  (`getOrganizationRefForCurrentConference`).
- **Transitive types** derive the tenant from their **parent's conference**
  (`getOrganizationRefViaParentConference`) so the child matches the conference
  two hops up, even in webhook/cron contexts with no request domain.

## The backfill

`migrations/044-organization-tier-backfill/` establishes the key on the current
(single-tenant) dataset. It is **additive and idempotent**:

1. Creates **one** organization (`createIfNotExists`, deterministic id
   `organization-cloud-native-days`) whose name is derived from the
   conferences' `organizer` field (default "Cloud Native Days").
2. Sets `conference.organization` on every conference lacking it.
3. Sets `speaker.organizations = [org]` on every speaker with no membership.
4. Sets `organization` on every `topic`, `staff`, `sponsor`,
   `sponsorEmailTemplate`, `message`, `travelExpense`, `sponsorActivity`, and
   `conversationPreference` lacking it.

It only ever **adds** the key where missing — it never changes an existing key,
touches other fields, deletes, or patches drafts. A re-run patches only what is
still missing. Because the dataset is currently one tenant, every document
receives the same organization reference; true multi-tenant partitioning is a
later concern.

### Running it

The migration is **NOT run automatically**. Run it, after review, via the
**Run Sanity Migration** GitHub workflow
(`.github/workflows/run-migration.yml`):

- `migration`: `044-organization-tier-backfill`
- `dataset`: `production`

The workflow exports a dataset backup (retained as an artifact) and performs a
dry run before applying with `--no-dry-run --no-confirm`.

## What waves 2 and 3 build on this

- **Wave 2 (#614) — document-level security.** With the tenant key present on
  every document (directly or denormalized), Sanity document filters can gate
  reads/writes per organization without traversing references.
- **Wave 3 (#616) — query scoping.** Application GROQ projections start
  filtering by `organization`, so a request only ever sees its own tenant's
  documents.
