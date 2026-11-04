# Organizer membership: identity as the source

Design for #1923 (epic #1772, follows #1907, #1909, #1913, #1920). No code yet.
Line references are to `origin/main` at 24dd262a.

## Today

- The site grants `/admin` from `organizerOrgIds`: the orgs of every conference
  whose `organizers[]` holds the speaker (`src/lib/speaker/sanity.ts:51-52`),
  checked by `isOrganizerForOrg` (`src/lib/authz/organizer.ts:48`).
- That set is baked into the NextAuth token at sign-in (`src/lib/auth.ts:60`)
  and re-read only on `trigger === 'update'` (`src/lib/auth.ts:208`). The
  session is a JWT (`src/lib/auth.ts:648`) on Auth.js defaults: re-issued every
  24 h with unchanged claims, expiring after 30 days idle
  (`@auth/core/lib/init.js:38,76`). **A removed organizer keeps `/admin` for as
  long as they stay active.**
- `/admin` edits `organizers[]` as a whole array per edition: `updateOrganizers`
  (`src/server/routers/conference.ts:1076-1130`). The guards are "not yourself"
  (`:1079`) and "standing in this org" (`:1097`).
- Identity stores `member(userId, organizationId, role)`, unique per pair
  (`services/identity/migrations/0001_init.sql:74-81`), and has an unused
  `invitation` table (`:83-93`). `audit_event.userId` is `NOT NULL` (`:100`).
- Better Auth's organization plugin is live on id.konf.app
  (`services/identity/src/data/auth.ts:117-131`, with
  `requireEmailVerificationOnInvitation`), and every `/api/auth/*` path reaches
  it (`services/identity/src/index.ts:36-37`).
- The gateway reads `member.role` live per request
  (`services/identity/src/data/index.ts:131-148`, `api/src/gateway.ts:459-463`)
  into a 60 s envelope (`api/src/gateway.ts:72`). Operators get a tenant
  envelope when a tenant resolves, otherwise a `PlatformContext`
  (`api/src/gateway.ts:443-453`), which has no `orgId`
  (`packages/tenancy/src/index.ts:38-42`).
- `syncMembers` is insert-only with role `admin`
  (`services/identity/src/data/member-sync.ts:6,25-26`). It never deletes, so a
  removed organizer keeps `admin` in D1: the #1923 bug. Since #1920
  tenant-directory's hourly cron calls it
  (`services/tenant-directory/src/data/index.ts:67,342`).
- Identity has no subgraph: `BINDINGS` lists tenant-directory, content and
  conference only (`api/src/gateway.ts:64-68`).

## 1. Data model

- **The org is the unit of membership.** `member` decides rights; roles are
  `owner` and `admin` (#1907).
- **Editions are a mirror.** Each edition's `organizers[]` decides who appears
  on its team (display, teams, notifications). Until the last PR it still
  grants `/admin` too (`sanity.ts:51-52`). Adding someone creates the org member
  and appends them to the current edition.
- **Removing someone removes them from every edition's `organizers[]`**, because
  any stale entry grants `/admin` again. Past editions' `teams[].members` are
  **not** rewritten: they are a historical record, and `teams[]` grants
  nothing. Taking someone off one edition while keeping org rights is a
  Sanity-only edit.
- **Invites** use the plugin's `invitation` rows: lowercased email, role,
  `pending`, 30 days (`invitationExpiresIn: 30 * 24 * 3600`, set in the plugin
  config, so the plugin and our mutations share one expiry). A new migration
  adds a unique partial index on `(organizationId, lower(email)) WHERE status =
'pending'`. An expired invite keeps `status = 'pending'` in the table (the
  plugin filters expiry on read), so a `beforeCreateInvitation` hook cancels
  expired pending rows for the address before a new invite is written. **Invites do not touch Sanity.** The person is added to
  `organizers[]` only when the invite is accepted, because Sanity grants
  `/admin`.

## 2. Write path

```text
/admin -> tRPC addOrganizer | removeOrganizer | setOrganizerRole | cancelInvite
       -> api.konf.app mutation, identity subgraph (new)
       -> resolver calls auth.api.* (organization plugin), audit in its hooks
       -> on success: Sanity array patch (organizers[]) for the edition(s)
```

- **Four mutations** on a new identity subgraph: `inviteOrganizationMember(email,
role)`, `removeOrganizationMember(userId)`, `setOrganizationMemberRole(userId,
role)` and `cancelOrganizationInvitation(invitationId)`. Each calls the
  matching `auth.api.*` (`createInvitation`, `removeMember`, `updateMemberRole`,
  `cancelInvitation`), so there is one implementation. Acceptance is the
  plugin's `acceptInvitation` on verified sign-in; its `afterAcceptInvitation`
  hook mirrors to Sanity.
- **Arguments (better-auth 1.7.14):** `removeMember` takes `memberIdOrEmail`
  and `updateMemberRole` takes `memberId`, not a user id, so the resolver maps
  `userId` to the `member.id` first. Both take an optional `organizationId`.
- **The plugin's endpoints need a member session.** Every `auth.api.*` call
  above runs `orgSessionMiddleware` and then looks up the caller's own
  `member` row in the org (`MEMBER_NOT_FOUND` otherwise). An operator who is
  not a member of the org cannot use them; the operator path in PR 3 needs
  its own write (adapter or D1) with the same audit row, or a decision to
  make operators members.
- **Org scope.** Tenant callers: the org comes from the envelope only. Operators
  with a `PlatformContext` have no org, so the operator path alone takes an
  explicit `organizationId` argument, checked to exist and recorded in the audit
  row. A tenant caller who passes it is refused.
- **Role rules the plugin already enforces** (default `creatorRole` `owner`):
  only an owner may invite with role `owner`, change an owner's role, grant
  `owner`, or remove an owner; `admin` holds `member: create, update, delete`
  and `invitation: create, cancel`, so admins manage admins. The plugin does
  not stop an admin cancelling an owner's invitation; a
  `beforeCancelInvitation` hook does. No custom access control is needed.
- **Authorisation** in the resolver, before any fetch: `orgRole` `owner` or
  `admin`, or operator scope. Admins manage admins; only owners and operators
  grant, demote or remove an owner. Self-removal stays refused
  (`conference.ts:1079`).
- **Last owner: a trigger on `member`**, so every path hits it (our mutations,
  the plugin's HTTP routes, `leave`, hand-run SQL). `BEFORE DELETE` and
  `BEFORE UPDATE OF role, organizationId` raise `LAST_OWNER` when the row is
  the org's only `owner` (roles are comma lists). A cascade from a deleted
  organization passes. D1 serialises writes and a statement is atomic, so two
  demotions cannot both pass, and a multi-row demotion rolls back whole. The
  plugin's own only-owner checks on `remove-member`, `update-member-role` and
  `leave` are read-then-write; the trigger is what makes them hold.
- **Idempotency:** remove of a non-member and setRole to the current role are
  no-op successes. A second invite to the same live pending email is refused
  by the plugin (`USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION`) before the
  index is reached; the resolver passes `resend: true` to get the existing
  invite back (the plugin then extends its expiry). The index is the backstop
  for races and direct writes. Retries are safe.
- **Audit:** the plugin hooks write `audit_event` for `member.add`,
  `member.remove`, `member.role`, `invite.create`, `invite.cancel`,
  `invite.accept` and `invite.reject`, with `detail = {orgId, actorId,
memberId, from, to, invitationId}` (ids only, #1310). For invite events the
  subject has no user yet, so `userId` is the actor (inviter or canceller);
  accept and reject use the invitee. `afterRemoveMember` and
  `afterUpdateMemberRole` get no actor, so it is read from the request context
  (`@better-auth/core/context`). Accepting fires `afterAcceptInvitation` only,
  not `afterAddMember`. `leave` runs no organization hook: a top-level
  `hooks.after` on `/organization/leave` writes `member.leave`.
- The site replaces `updateOrganizers` with per-person procedures, and patches
  with array ops, not read-modify-write (as `conference.ts:651`).

### Failures

- **Identity fails:** Sanity untouched, the call fails (as
  `conference.ts:375-392`).
- **Add, then the mirror fails:** harmless. API rights exist, `/admin` does not
  yet. The error says "saved; the team list did not update, retry".
- **Remove, then the mirror fails: the dangerous half.** API access is gone,
  `/admin` stays open through `organizers[]`. With PR 0 the site re-reads
  `organizerOrgIds` every 60 s, so the window is the mirror retry: the user's
  retry, else the next drift run (hourly) alerts and a person removes the entry.
  **No outbox**, which holds only while the drift alert reaches someone (open
  question 2): removals happen a few times a year. Without a watched sink, add
  an outbox.

## 3. Plugin HTTP endpoints

Every `/api/auth/organization/*` route is reachable today
(`index.ts:36-37`). An org `admin` with an identity session can call, directly:
`invite-member`, `cancel-invitation`, `remove-member`, `update-member-role`,
plus `accept-invitation`, `reject-invitation` and `leave` for themselves.

- **Gated now.** An interim gate (separate PR, refs #1933) blocks the plugin's
  organization **write** routes over HTTP in `services/identity/src/index.ts`.
- **#1923 is not affected:** its mutations call `auth.api.*` server-side, which
  does not pass the fetch handler.
- **The gate stays** (or narrows to let `accept-invitation` through, if
  acceptance moves to a browser flow) once the mutations exist. Open HTTP
  routes would skip the resolver's role rules and the Sanity mirror. Audit
  (hooks) and the last-owner trigger would still hold, and drift would catch
  the mirror, but that is a backstop, not the path.

## 4. Revocation latency

- **Gateway: next request.** `principal` reads D1 per request with no cache;
  the envelope is minted per request (60 s max) and never reused; the identity
  JWT (300 s, `gateway.ts:71`) carries no role. The identity PR tests a member
  removed between two requests.
- **Site:** PR 0 (below) bounds it to 60 s plus the mirror retry.

## 5. Sync changes

- `syncMembers` gets `MEMBER_SOURCE_ORGS` (identity env, comma-separated org
  ids; the sync code runs in identity, tenant-directory's cron only calls it).
  **Drift is per org:**
  - orgs not listed: `grant`, today's behaviour (the backfill);
  - listed orgs: no grants. Drift compares Sanity organizers (same matching)
    with `member` plus pending invites, writes nothing, and logs `identity.membership.drift` with org id, counts and user ids
    (never emails) for: in Sanity not identity, in identity not Sanity, fewer
    than two owners.
- **Alert sink:** the drift log goes to the identity Worker's logs; the alert
  destination is open question 2.
- **Site flag:** `KONF_MEMBER_WRITE_TENANTS` holds **organization** ids and is
  checked against the resolved org, unlike its per-conference siblings
  (`src/lib/konf-api/conference-write.ts:34-36`). Switching one edition of an
  org would leave the others writing Sanity alone.

## 6. Prerequisites per org

- The org is in `KONF_IDENTITY_TENANTS` (`src/lib/auth/identity-handoff.ts:33`).
- Every organizer who will use the editor signs in through identity: the write
  needs an identity JWT (`conference-write.ts:78-93`) and a `member` row, or it
  fails `PRECONDITION_FAILED` like `conference.ts:379-385`. NextAuth-only
  sessions see a dead editor.
- At least two owners. Each owner's identity primary email matches one of their
  speaker `knownEmails`, or the sync cannot match them and they are locked out.

## 7. Rollout

| #   | PR                                                                                                         | Gate                    |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0   | site: 60 s live refresh of `organizerOrgIds` in `getAuthSession` (`src/lib/auth.ts:912`), in progress      | owner review (auth)     |
| -   | identity: interim HTTP gate on plugin org write routes (separate PR, refs #1933)                           | owner review            |
| 1   | identity: migration (trigger, pending-invite index), `invitationExpiresIn`, audit hooks, tests             | owner review (identity) |
| 2   | identity: per-org drift in `syncMembers`, `MEMBER_SOURCE_ORGS`                                             | after 1                 |
| 3   | identity subgraph: four mutations over `auth.api.*`, operator org argument, `identity` in `BINDINGS`       | after 1                 |
| 4   | site: per-person procedures, cancel, `OrganizersEditor` + story, `KONF_MEMBER_WRITE_TENANTS` by org        | after 0 and 3           |
| 5   | switch, per org: prerequisites (section 6), backfill rerun, flag, then add the org to `MEMBER_SOURCE_ORGS` | clean drift run         |
| 6   | site: `/admin` gate reads rights from identity; `organizers[]` stops granting                              | open question 1         |

**Rollback** (clear the org from `KONF_MEMBER_WRITE_TENANTS` and
`MEMBER_SOURCE_ORGS`) restores the Sanity write path, not access. Grant mode
re-adds anyone still in `organizers[]`, and removals made in identity whose
mirror failed stay open in Sanity. Steps:

1. Read the last drift log for the org: "in Sanity, not in identity".
2. Remove those speakers from `organizers[]` in `/admin` before clearing
   `MEMBER_SOURCE_ORGS`, or grant mode puts them back in identity.
3. Then clear the flags. No schema rollback: the migration only adds.

## 8. Open questions for the owner

1. **When does the site read rights from identity (PR 6)?** _Recommended:_ per
   org, once it has two owners and drift has been clean for 7 days.
2. **Where do drift alerts go?** Worker logs alone are not watched.
   _Recommended:_ the same channel as other production alerts; name it.
