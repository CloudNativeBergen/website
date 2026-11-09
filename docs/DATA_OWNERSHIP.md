# Data ownership

Part of the federated API epic (#1772). This document says which system owns
each kind of data, how clients reach it, and how data moves between owners.

This document amends [CONTROL_MODEL.md](./CONTROL_MODEL.md). The model there,
one shared Sanity dataset that kontroll reads directly, is the starting point.
The target is kontroll on the API.

## Rules

1. **One owner per entity.** Editorial content (pages, rich text, images)
   stays in Sanity and is served by the content subgraph. Conference settings
   and tenants/domains live in D1. Users and memberships live in the D1 identity
   database (identity D1 is the source of truth; legacy Sanity `organizers[]` are
   synced via an hourly projection). Proposals, speakers and tickets are
   undecided and get decided one entity at a time.
2. **The API is the only door.** The site and kontroll talk only to
   `api.konf.app`. Clients use no `@sanity/client` and no direct D1 access.
   Subgraph resolvers call a data-source adapter, either a Sanity adapter or a
   D1 adapter, and clients cannot tell which. New dual-write windows live in the
   subgraph adapter. Conference settings moved fields are written only to D1 for
   d1_write tenants, with Sanity copies frozen (#1997); non-moved fields still go
   to Sanity.
3. **Cutover is per entity and per tenant, behind the adapter.**
   1. The subgraph proxies Sanity and clients move to the API. The data does not
      move.
   2. Backfill into D1, then a short dual-write window with a parity sweep.
      Today that is the `d1_write` rollout flag plus the daily conference parity
      cron. The cron (`services/conference/src/data/parity.ts`, daily at
      04:17 UTC) reads the D1 table directly through the Worker's `DB` binding,
      not the gateway, so it validates D1 whether or not `d1_override` is on.
      It compares every column of every row (published or not) with the row
      the backfill would write from Sanity today, with the backfill's
      normalisation (trimmed, empty and absent are null, `social_links` as a
      JSON array). It logs `conference.parity.drift` with the conference id
      and column names, never values, and one `conference.parity.sweep`
      summary with `status: in_sync | drift`. A failed or empty D1 or Sanity
      read logs `conference.parity.error` with `status: unknown`, never
      `in_sync`. At most 50 conferences per run; more rotate by day. If the
      optional secret `SLACK_CONFERENCE_PARITY_WEBHOOK_URL` is set, drift and
      unknown also post to Slack; unset, it logs only.
      What it proves: D1 matches what Sanity holds now, column by column. It
      does not prove the gateway serves those rows (rerun
      `scripts/parity-conference.ts` after the #1879 flip for that), and a
      Sanity edit that skipped the dual write shows up as drift, not as a D1
      fault. See [Write path](./PLATFORM.md#write-path-d1_write).
   3. Flip reads to D1 (the `d1_override` rollout flag). Sanity becomes read-only for that
      entity, then the fields are deleted. The current read mechanism is in
      [Read path](./PLATFORM.md#read-path-api_read).

   Every dual-write window has an end date and a removal step. Windows last
   weeks, not years.

4. **Guard rails.**
   - An import-boundary lint extends #1800 to the site and kontroll, per
     entity.
   - The entity table below is kept current in this file. A CI check against it
     comes later.
   - The parity sweep runs only while a window is open. Every parity alert has a
     resolve-by date.
5. **Biggest risk now.** kontroll (`my.konf.app`) reads Sanity directly. Moving
   kontroll onto the API (phase 5) comes before any further data moves.

## Entity table

| Entity                                                   | Owner                                       | Adapter                                                                                      | Write mode                                                                                                                                                             | Window end                           |
| -------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Conference settings                                      | D1                                          | D1 (reads from D1 for all 4 conferences since 2026-11-05; d1_override=1, parity in_sync 4/4) | D1 only for d1_write tenants, and Sanity copies frozen (core 14 fields; settings phase 1 writes 18 more fields, #2023)                                                 | Done                                 |
| Tenants, domains and conference lifecycle (#1971, #2015) | D1 (tenant-directory)                       | D1                                                                                           | D1 only                                                                                                                                                                | Done                                 |
| Identity (users, sessions, accounts)                     | D1 (identity)                               | D1                                                                                           | D1 only                                                                                                                                                                | Done                                 |
| Memberships                                              | D1 (identity)                               | D1                                                                                           | Identity D1 is the source; hourly sync from Sanity `organizers[]` runs from tenant-directory cron (grants for legacy orgs, drift check for `MEMBER_SOURCE_ORGS` #1947) | Phase 5 (retire Sanity organizers[]) |
| Editorial content                                        | Sanity (content subgraph)                   | Sanity                                                                                       | Sanity only                                                                                                                                                            | Permanent                            |
| Proposals, speakers                                      | Sanity, behind the site seam (#1876, #1887) | Sanity                                                                                       | Sanity only                                                                                                                                                            | Undecided                            |
| Logos                                                    | Sanity                                      | Sanity                                                                                       | Sanity only; R2 later (#1866)                                                                                                                                          | Not scheduled                        |
| Tickets                                                  | Undecided                                   | -                                                                                            | -                                                                                                                                                                      | Undecided                            |

Update the row in the same PR that changes an owner, an adapter or a write
mode.

## Tenant lifecycle and authoritative stores

Which store is authoritative for each tenant entity today and in the target architecture:

| Entity              | Store today                        | Store target                       | Authority & sync notes                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization        | D1 (tenant-directory)              | D1 (tenant-directory)              | Authoritative in D1. kontroll reads Sanity contract until moved to API (rule 5).                                                                                                                                                              |
| Conference settings | D1 (conference / tenant-directory) | D1 (conference / tenant-directory) | All 4 conferences read and write D1 (`d1_override=1`). Core moved fields written to D1 only with Sanity copies frozen (#2013). Settings phase 1 (#2023) writes 18 more fields to D1. `lifecycleStatus` is in tenant-directory (#2015).        |
| Domains             | D1 (tenant-directory)              | D1 (tenant-directory)              | Authoritative in D1 (`domains` table). Sanity copy is legacy, dropped when routing reads only D1.                                                                                                                                             |
| Memberships         | D1 (identity)                      | D1 (identity)                      | Identity D1 is the source. Hourly sync from Sanity `organizers[]` runs from tenant-directory cron: grants missing `admin` rows for legacy orgs, drift check for `MEMBER_SOURCE_ORGS` (#1947). Target retires Sanity `organizers[]` (Phase 5). |

Tenants and domains reach kontroll through the public `organization` query
(#1968, #1969): the session's own org (id, name, plan, slug, status) and its
`domains { hostname verification kind }`. The org is always the gateway
envelope's org, never an argument. Org members with any role get it, on a
tenant host or on the operator lane with that tenant selected, and so do
platform operators acting for a selected tenant. Everyone else, anonymous
callers included, gets `null`.

The operator view of all orgs uses `organizations` (#1973), and of all their
conferences `conferences` (#1985), operator lane with no tenant selected only;
see `api/README.md`.

## Members read (identity subgraph)

`members` and `invitations` (#1972) list the session org's members and pending
invitations for kontroll. The org is the envelope's, never an argument. The
subgraph decides access from the envelope before it reads anything.

| Caller                                    | `members`                        | `email` on a member | `invitations` (with email) |
| ----------------------------------------- | -------------------------------- | ------------------- | -------------------------- |
| Anonymous, or signed in but not a member  | null                             | -                   | null                       |
| Member with role `member`                 | user id, name, role, joined date | null                | null                       |
| Owner or admin                            | as above                         | yes                 | yes                        |
| Operator acting for the tenant (Kontroll) | as above                         | yes                 | yes                        |

No other person fields are exposed. Membership is checked live on every
request, so a removed member gets null on their next request.

## Conference fields: inventory and phasing

**16 of 131 fields in D1, 64 settings to move, 51 editorial.** The
per-field table is in [CONFERENCE_FIELDS.md](./CONFERENCE_FIELDS.md).

- **A, in D1 (16).** 14 in the conference D1 `conferences` table, served by
  the conference subgraph and written by `updateConference` (title, tagline,
  city, country, venue, dates, visibility, background pattern, two colours,
  registration link, social links). Two in tenant-directory D1:
  `organization` (`org_id`) and `domains`. Since 2026-11-05 all 4 conferences
  have `d1_override` on, and since #2013 writes go to D1 only with Sanity
  copies frozen. `lifecycleStatus` moved to tenant-directory D1 (#2015), and
  settings phase 1 (#2023) writes 18 more scalar fields to conference D1.
- **B, settings to move (64).** Dates, links, contacts and channels,
  ticketing, CFP taxonomy and goals, organizer teams, feature flags and
  workshop job state.
- **C, editorial (51).** Description, logos, announcement, info-page text,
  `speakerInfo`, ticket and sponsor page copy, featured speakers and talks,
  schedules, homepage sections and the lifecycle banner copy.

### Phasing for group B

Each phase needs the same six things:

1. a D1 migration in `services/conference/migrations/`,
2. the mapping in `services/conference/scripts/backfill.ts` and the read in
   `scripts/backfill-conference.ts`,
3. subgraph fields and `ConferencePatch` input in
   `services/conference/src/subgraph.ts`, replacing the content subgraph's
   copy where it serves the field,
4. the write path: the keys in `src/lib/konf-api/conference-write.ts` (writes
   to D1; dual-writes to Sanity only until the read flip),
5. parity coverage in `services/conference/scripts/parity.ts`, reading D1 (see
   the caveat under rule 3),
6. the read flip per #1879: `d1_override` per tenant, then Sanity read-only
   for those fields, then delete them from the schema with a regenerated
   baseline.

| Phase | Fields                                                                                                                                                                  | Count | Shape                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Dates (10), `travelSupportBudget`, `registrationEnabled`, `organizer*` (3), `socialHashtag`, `ticketCustomization.showVanityMetrics`, `analyticsPirschCode`             | 18    | Scalar columns on `conferences` (D1 write path in #2023). Most are already served by content subgraph. `lifecycleStatus` moved to tenant-directory D1 in #2015. |
| 2     | Sponsor, speaker and volunteer registration links; contact, CFP and sponsor emails; notification and Slack channels; Slack invite URLs                                  | 11    | Scalar columns on `conferences` (D1 write path in #2038).                                                                                                       |
| 3     | Ticketing provider and ids, capacity, `ticketTargets.*`, `ticketTypeRoles`, `publicFreeTicketIds`, workshop registration windows and early-access types, reminder state | 19    | Columns on `conferences`; the four lists are JSON text (D1 write path in #2080).                                                                                |
| 4     | `formats`, `topics`, six CFP and sponsor goals, `crmInactivityThresholds`, `agentConfig.*`                                                                              | 12    | Child tables and long text columns.                                                                                                                             |
| 5     | `organizers`, `teams`, `features`                                                                                                                                       | 3     | Identity memberships and roles, team tables, a features table.                                                                                                  |

Phase 1 comes first because its fields are scalar, most are already in the
patch inputs and the content subgraph already serves many of them. Phase 5
comes last because it touches access control.

### Running the conference backfill

Run `pnpm run doctor` first: it checks node, pnpm, fnox, the Sanity read
token, wrangler and gh.

1. Generate: `fnox exec -- pnpm backfill:conference -- --only settings-phase3 --out tmp/backfill`.
   The script stops early with a fix hint if `SANITY_API_TOKEN_READ` is not
   set, and creates `--out` if needed. Writing needs `--only <phase>` or
   `--all-columns`. `--all-columns` overwrites every column of existing rows
   with frozen Sanity values, which reverts D1-owned fields; avoid it.
2. Review the printed conference count and `ON CONFLICT UPDATE columns` list.
3. Apply: `wrangler d1 execute <conference-db> --remote --file tmp/backfill/conference.sql`.
4. Check: `pnpm tsx scripts/parity-conference.ts --all`.
5. Delete `tmp/backfill/conference.sql`. It can hold Slack invite URLs.

### Importing domain verification

Epic #2207 phase 4. `scripts/import-domain-verification.ts` copies Sanity
`domainVerification` state into tenant-directory D1 `domains`. It reads Sanity
and a D1 dump you make, writes one SQL file, and never touches D1 itself. Its
header lists which side wins per column; in short, a row claimed in D1
(`claimed_at` set) is never changed. It never changes live routing either:
new rows get the legacy `verification` column as `pending`, because
`tenantByHost` routes on it until phase 6. Hosts where that column disagrees
with Sanity are printed as "routing cutover candidates (phase 6)" and are not
applied.

The Sanity read token comes from fnox (`SANITY_API_TOKEN_READ`, else
`SANITY_API_TOKEN_READ_PROD`).
The task pins the RunKonf account, keeps the dump and SQL in a temporary
directory under `tmp/` and deletes them on exit, since both hold tokens.

1. Dry run: `mise run domains:import -- production`.
2. Review the row count, every `skipped` line, the routing cutover candidates
   and the update columns.
3. Apply, only with owner approval: `mise run domains:import -- production --apply`.
   It dumps again, writes the SQL, applies it, dumps once more and runs
   `--verify`, which exits 1 on any routing or allowlist difference, and if
   `2026.cloudnativedays.no` is not verified on both sides. The routing
   cutover candidates section is informational until phase 6.
4. Check later without writing: `mise run domains:import -- production --verify`.

### Hard parts

- **References.** `organizers` and `teams[].members` point at `speaker`
  documents, and `topics` at `topic` documents, which stay in Sanity. D1 can
  store the ids, but nothing enforces them across stores. `organizers` should
  become identity memberships rather than a copied ref list.
- **Arrays of objects.** `ticketTypeRoles`, `ticketTargets.milestones`,
  `crmInactivityThresholds` and `teams` need child tables, or JSON columns with
  validation in the subgraph. The `_key` values must survive the dual-write
  window so Studio edits still apply.
- **kontroll reads Sanity directly.** The contract
  (`src/lib/conference/contract.ts`) reads `title`, `organization`, `city`,
  `country`, `startDate`, `endDate`, `domains`, `visibility` and
  `lifecycleStatus`. All are in D1 (`lifecycleStatus` as tenant-directory
  `lifecycle`, which holds `cancelled` since its migration 0005), but kontroll
  still reads Sanity, so none of these may be deleted from Sanity until
  kontroll is on the API (rule 5).
- **GROQ filters across the site.** `organization._ref` (tenancy, ~100
  sites), `$domain in domains` (routing), `startDate` comparisons (previous
  and next edition), `$id in organizers[]._ref` (admin access) and
  `checkinEventId == $eventId` (check-in webhook lookup). Each one needs an
  API query or a D1 lookup before its field can leave Sanity.
- **Job state, not settings.** `workshopReminderLastSentAt`, `...Count` and
  `...ReservedAt` are written by `src/lib/workshop/reminder.ts`, and
  `ReservedAt` works as a lock. In D1 that lock needs a conditional `UPDATE`.
- **Possibly dead.** `analyticsPirschCode` has no consumer under `src/`;
  delete it rather than move it.
