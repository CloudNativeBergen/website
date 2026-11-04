# Organizer membership: identity as the source

Design for #1923 (epic #1772, follows #1907, #1909, #1913). No code yet. Line
references are to `origin/main` at 3364f583.

## Today

- The site grants `/admin` from `organizerOrgIds`: the orgs of every conference
  whose `organizers[]` holds the speaker (`src/lib/speaker/sanity.ts:51-52`),
  checked by `isOrganizerForOrg` (`src/lib/authz/organizer.ts:55`).
- That set is baked into the NextAuth token at sign-in (`src/lib/auth.ts:60`)
  and re-read only on `trigger === 'update'` (`src/lib/auth.ts:208`).
- `/admin` edits it as a whole array per edition: `updateOrganizers`
  (`src/server/routers/conference.ts:1076-1130`, UI in
  `src/components/admin/OrganizersEditor.tsx`). The only guards are "not
  yourself" (`:1079`) and "already has standing in this org" (`:1097`).
- Identity stores org-level `member(userId, organizationId, role)`, unique per
  pair (`services/identity/migrations/0001_init.sql:74-81`). It also has an
  unused `invitation` table keyed by email (`:83-92`).
- The gateway reads `member.role` live on every request
  (`api/src/gateway.ts:360-371` via `principal`,
  `services/identity/src/data/index.ts:131-148`) and puts it into a 60 s envelope
  (`api/src/gateway.ts:66`).
- The hourly cron (`services/identity/src/index.ts:54`,
  `services/identity/src/data/index.ts:152`) runs `syncMembers`. It is
  insert-only with role `admin` (`services/identity/src/data/member-sync.ts:6,25`).
  It skips ticket-granted addresses (`:78-83`) and email-case clashes
  (`:128-139`). It never deletes, so a removed organizer keeps `admin` in D1.
  This is the #1923 bug. #1920 (open) moves the cron to tenant-directory.
- Identity has no subgraph in the gateway: `BINDINGS` lists tenant-directory,
  content and conference only (`api/src/gateway.ts:57-61`), and
  `services/identity/src/subgraph.ts` is an empty schema.

## 1. Data model

- **The org is the unit of membership.** `member(userId, organizationId, role)`
  decides the rights. Roles are `owner` and `admin`, the same mapping as #1907.
- **Per edition.** Each edition's `organizers[]` in Sanity becomes a mirror that
  only decides who appears on that edition's team (display, teams, notification
  fan-out). It grants nothing once the site reads rights from identity. Adding
  someone in `/admin` creates the org member (if missing) and appends them to the
  current edition. Removing someone deletes the org member and strips them from
  `organizers[]` and `teams[].members` of **every** edition of the org, because a
  stale edition entry would grant `/admin` again through `organizerOrgIds`.
  Taking someone off one edition while keeping their org rights is a Sanity-only
  edit, with no identity write.
- **No identity account yet: an `invitation` row**, using the existing table:
  `email` (lowercased), `role`, `status='pending'`, `inviterId` and
  `expiresAt` (30 days). When a user with a **verified** email matching the
  invitation signs in, identity inserts the `member` row in the same
  transaction, marks the invitation `accepted`, and writes the audit row. Until
  then the person is in Sanity `organizers[]` (the site needs a speaker id) but
  has no API rights. That is correct, since they could not sign in to the API
  anyway.

## 2. Write path

```text
/admin -> tRPC addOrganizer | removeOrganizer | setOrganizerRole (adminProcedure)
       -> api.konf.app mutation, identity subgraph (new, behind the gateway)
       -> identity D1: member / invitation / audit_event, one batch
       -> on success: Sanity patch (organizers[], teams[]) for the edition(s)
```

- **Three mutations** on a new identity subgraph:
  `addOrganizationMember(email, role)`, `removeOrganizationMember(userId)`
  and `setOrganizationMemberRole(userId, role)`. The org always comes from the
  envelope (`orgId`), never from an argument. The site calls them with the
  caller's identity JWT and the site assertion, the same lane as
  `src/lib/konf-api/client.ts:57-72` and `conference-write.ts`.
- The site replaces `updateOrganizers` (whole array) with per-person
  procedures, so a stale form cannot remove someone by omission. The Sanity
  patch uses array ops, not read-modify-write (the same reason as
  `conference.ts:651`).
- **Authorisation** is enforced in the identity resolver, not in the site:
  - The caller's envelope `orgRole` must be `owner` or `admin`, or the caller is
    a platform operator. Operator context in the envelope is #1919 (the TODO at
    `api/src/gateway.ts:362`).
  - Only `owner` (or an operator) may grant, demote or remove an `owner`.
  - **Last owner:** removing or demoting is one conditional statement that
    counts other owners in the same `WHERE`
    (`... AND (SELECT count(*) FROM member WHERE organizationId=?1 AND role='owner' AND userId<>?2) > 0`).
    A count of zero changes no rows and returns `LAST_OWNER`. One statement, so
    two concurrent demotions cannot both pass.
  - Self-removal stays refused (today's guard, `conference.ts:1079`).
- **Idempotency:** add is `ON CONFLICT(userId, organizationId) DO NOTHING`
  (role changes go through `setRole` only); remove of a non-member is a no-op
  success; setRole to the current role is a no-op. Each mutation returns the
  resulting state, so a retry is safe.
- **Identity succeeds, then the Sanity mirror fails:** identity holds the truth
  and the API is already right. The tRPC call returns an error naming the
  mirror ("saved; the team list did not update, retry"). Retrying repeats the
  whole call, which is idempotent on both sides. The drift check (section 4)
  alerts if nobody retries. No outbox: the retry and the drift alert cover it,
  and an outbox adds a queue for a write that happens a few times a year.
- **Identity fails:** Sanity is not touched and the call fails, the same rule as
  the conference D1 write (`conference.ts:370-392`).

## 3. Revocation latency

- **Gateway: next request.** `principal` reads D1 on every request with no
  cache (`services/identity/src/data/index.ts:131-148`). The envelope is minted
  per request and lives at most 60 s (`api/src/gateway.ts:66`), but a subgraph
  never reuses it. The identity JWT (at most 300 s, `api/src/gateway.ts:65`)
  carries no role. Nothing that holds `orgRole` outlives the delete. The
  identity PR adds a test that removes the member between two requests and
  expects the second to be refused.
- **Site: the mirror is synchronous**, so Sanity lags identity by the length of
  one request, or until a failed mirror is retried. The real gap is
  older than this change: `organizerOrgIds` lives in the NextAuth token until
  the user signs in again or triggers an update (`src/lib/auth.ts:60,208`). A
  removed organizer keeps `/admin` on the site today for the life of their
  session. Closing it needs a live check in the admin gate (open question 2).

## 4. Sync changes

- `syncMembers` gets a mode, `MEMBER_SYNC_MODE=grant|drift` (identity env,
  default `grant`).
  - `grant`: today's behaviour. It is the backfill and stays until the switch.
  - `drift`: no writes. Per org it compares Sanity organizers (same matching as
    today) with `member` rows plus pending invitations. It logs
    `identity.membership.drift` with the org id, counts and user ids (ids only,
    never emails, #1310) for each of three cases: in Sanity but not in identity,
    in identity but not in Sanity, and owner missing. It alerts when any count is
    non-zero.
- **The switch, in order:**
  1. Rerun the #1909 backfill.
  2. Set `KONF_MEMBER_WRITE_TENANTS` on the site for one org.
  3. One clean drift run.
  4. All orgs.
  5. `MEMBER_SYNC_MODE=drift`.

  While some orgs are switched and others are not, `grant` mode skips the
  switched orgs, listed in `MEMBER_SOURCE_ORGS` (identity env), so the cron
  never re-grants someone an organizer just removed.

## 5. Security

- **Tenant isolation:** the org is taken from the envelope only. The target user
  must already be a member of, or invited to, that org; for remove and setRole
  the `WHERE organizationId = envelope.orgId` is part of every statement. A test
  sends a foreign org's userId and expects zero rows changed and the same error
  as for a non-member (no existence oracle).
- **Audit:** every add, remove, role change, invite and acceptance writes
  `audit_event` in the same D1 batch (`0001_init.sql:96-102`,
  `0002_handoff.sql:4-5`):
  - `action` = `member.add`, `member.remove`, `member.role`, `invite.create` or
    `invite.accept`;
  - `userId` = the subject;
  - `detail` = JSON `{orgId, actorId, from, to}` (ids and roles only).
- **Ticket grants (#1914/#1915):** an invitation is matched only to the user's
  verified primary email, never to an address the site records in
  `ticketEmailGrants`. The drift check keeps the exclusion at
  `member-sync.ts:78-83`.
- **Email matching:** trim and lowercase. Accept only `emailVerified = 1`. An
  email shared by two users (`member-sync.ts:128-139`) gets neither. The invite
  stays pending and the case is logged as a count.

## 6. Rollout

| #   | PR                                                                                                                         | Files                                                                            | Gate                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| 1   | identity: member data functions, last-owner statement, audit, tests                                                        | `services/identity/src/data/{index,member}.ts`                                   | none                         |
| 2   | identity: drift mode + `MEMBER_SOURCE_ORGS` (rebased on #1920)                                                             | `services/identity/src/data/member-sync.ts`, `service.cue`                       | after #1920                  |
| 3   | identity subgraph mutations, plus `identity` in `BINDINGS` and the supergraph, plus operator context                       | `services/identity/src/subgraph.ts`, **`api/src/gateway.ts`**, supergraph config | **waits for #1919**          |
| 4   | invitation acceptance on verified sign-in                                                                                  | `services/identity/src/data/auth.ts`                                             | owner review (identity auth) |
| 5   | site: per-person tRPC procedures, `konf-api/member-write.ts`, `OrganizersEditor` + story, flag `KONF_MEMBER_WRITE_TENANTS` | `src/server/routers/conference.ts`, `src/lib/konf-api/`, `src/components/admin/` | after 3                      |
| 6   | site: live organizer check in the admin gate (if Q2 = yes)                                                                 | `src/lib/authz/organizer.ts`, possibly **`src/lib/auth.ts`**                     | **owner approval (auth)**    |
| 7   | the switch: backfill rerun, flag per org, then `MEMBER_SYNC_MODE=drift`                                                    | env only                                                                         | clean drift run              |

None touches `packages/tenancy`: the envelope already carries `orgRole`
(`packages/tenancy/src/index.ts:30`). If #1919 adds the operator field there,
PR 3 builds on it.

**Rollback:** clear `KONF_MEMBER_WRITE_TENANTS`, and the site falls back to
`updateOrganizers` writing Sanity only. Set `MEMBER_SYNC_MODE=grant` and empty
`MEMBER_SOURCE_ORGS`. Identity rows written in the meantime stay; the drift log
lists any that must be removed by hand. Nothing is migrated destructively, so
there is no schema rollback.

## 7. Open questions for the owner

1. **Can `admin` manage members, or only `owner` and operators?** The issue
   says "operator or owner"; the brief says owner, admin or operator.
   _Recommended:_ admins can add and remove admins; only owners and operators
   touch owners.
2. **Close the site's session gap with a live check?** Today a removed
   organizer keeps `/admin` until their token refreshes. _Recommended:_ yes.
   `withOrgOrganizer` re-reads the caller's membership (Sanity mirror now,
   identity later) with a short tag-invalidated cache. This is PR 6, auth-adjacent.
3. **Remove from all editions, or only the current one?** _Recommended:_ all
   editions of the org (section 1). Anything else leaves a grant path through
   `organizerOrgIds`.
4. **Invitation expiry?** _Recommended:_ 30 days, re-sendable from `/admin`.
5. **Who becomes `owner` at the switch?** Today only one person, set by hand
   (#1907). _Recommended:_ the owner names at least two owners per org before its
   flag flips, so the last-owner guard never locks an org.
