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
      cron. Caveat: the parity script compares Sanity with anonymous gateway
      reads, which still come from Sanity while the override is off (#1879), so
      a clean result does not yet validate D1. A sweep that reads D1 is a
      prerequisite for closing the window. See [Write path](./PLATFORM.md#write-path-d1_write).
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

| Entity                                            | Owner                                       | Adapter    | Write mode                                   | Window end                           |
| ------------------------------------------------- | ------------------------------------------- | ---------- | -------------------------------------------- | ------------------------------------ |
| Conference settings                               | D1 (owner in transition)                    | D1, Sanity | Dual write on for CNDN 2026 since 2026-11-04 | One week of clean parity, then #1879 |
| Tenants, domains and conference lifecycle (#1971) | D1 (tenant-directory)                       | D1         | D1 only                                      | Done                                 |
| Identity                                          | D1 (identity)                               | D1         | D1 only                                      | Done                                 |
| Editorial content                                 | Sanity (content subgraph)                   | Sanity     | Sanity only                                  | Permanent                            |
| Proposals, speakers                               | Sanity, behind the site seam (#1876, #1887) | Sanity     | Sanity only                                  | Undecided                            |
| Logos                                             | Sanity                                      | Sanity     | Sanity only; R2 later (#1866)                | Not scheduled                        |
| Tickets                                           | Undecided                                   | -          | -                                            | Undecided                            |

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
