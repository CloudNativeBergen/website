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
   database. Proposals, speakers and tickets are undecided and get decided one
   entity at a time.
2. **The API is the only door.** The site and kontroll talk only to
   `api.konf.app`. Clients use no `@sanity/client` and no direct D1 access.
   Subgraph resolvers call a data-source adapter, either a Sanity adapter or a
   D1 adapter, and clients cannot tell which. New dual-write windows live in the
   subgraph adapter. The existing site-side dual write in
   `src/lib/konf-api/conference-write.ts` (D1 first, then Sanity) is temporary:
   it stays until #1879 closes its window and is then deleted, not moved.
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

| Entity                                            | Owner                                       | Adapter                                                                                      | Write mode                                                            | Window end    |
| ------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------- |
| Conference settings                               | D1                                          | D1 (reads from D1 for all 4 conferences since 2026-11-05; d1_override=1, parity in_sync 4/4) | Dual write until #1879 closes and the site-side dual write is removed | #1879         |
| Tenants, domains and conference lifecycle (#1971) | D1 (tenant-directory)                       | D1                                                                                           | D1 only                                                               | Done          |
| Identity                                          | D1 (identity)                               | D1                                                                                           | D1 only                                                               | Done          |
| Editorial content                                 | Sanity (content subgraph)                   | Sanity                                                                                       | Sanity only                                                           | Permanent     |
| Proposals, speakers                               | Sanity, behind the site seam (#1876, #1887) | Sanity                                                                                       | Sanity only                                                           | Undecided     |
| Logos                                             | Sanity                                      | Sanity                                                                                       | Sanity only; R2 later (#1866)                                         | Not scheduled |
| Tickets                                           | Undecided                                   | -                                                                                            | -                                                                     | Undecided     |

Update the row in the same PR that changes an owner, an adapter or a write
mode.

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
  `organization` (`org_id`) and `domains`. Sanity still holds all 16, and
  reads come from Sanity until `d1_override` is on (#1879).
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
4. the write path: the keys in `src/lib/konf-api/conference-write.ts` so
   `applyConferencePatch` dual-writes them,
5. parity coverage in `services/conference/scripts/parity.ts`, reading D1 (see
   the caveat under rule 3),
6. the read flip per #1879: `d1_override` per tenant, then Sanity read-only
   for those fields, then delete them from the schema with a regenerated
   baseline.

| Phase | Fields                                                                                                                                                                         | Count | Shape                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------- |
| 1     | Dates (10), `travelSupportBudget`, `registrationEnabled`, `lifecycleStatus`, `organizer*` (3), `socialHashtag`, `ticketCustomization.showVanityMetrics`, `analyticsPirschCode` | 19    | Scalar columns on `conferences`. Most are already served by the content subgraph, so only the source moves. |
| 2     | Sponsor, speaker and volunteer registration links; contact, CFP and sponsor emails; notification and Slack channels; Slack invite URLs                                         | 11    | Scalar columns, or a `conference_contacts` table.                                                           |
| 3     | Ticketing provider and ids, capacity, `ticketTargets.*`, `ticketTypeRoles`, `publicFreeTicketIds`, workshop registration windows and early-access types, reminder state        | 19    | Scalars plus child tables (ticket types, target milestones, reminder state).                                |
| 4     | `formats`, `topics`, six CFP and sponsor goals, `crmInactivityThresholds`, `agentConfig.*`                                                                                     | 12    | Child tables and long text columns.                                                                         |
| 5     | `organizers`, `teams`, `features`                                                                                                                                              | 3     | Identity memberships and roles, team tables, a features table.                                              |

Phase 1 comes first because its fields are scalar, most are already in the
patch inputs and the content subgraph already serves many of them. Phase 5
comes last because it touches access control.

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
