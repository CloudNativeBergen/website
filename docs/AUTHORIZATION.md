# Authorization: inventory and target design

Status: decided (owner, 2026-11-08, PR #2102). Supersedes the agy draft of the same name.
Related: #1928 (role vocabularies), #1907 (organizer backfill), #2022 (speaker model),
#2077–#2079 (CFP steps a–c), #2093/#2097 (speaker profile), #2098 (per-org secrets),
#745/#2085 (vendor binding rule). Line numbers refer to `main` at `0f0c6953`.

**Summary.** Today six places decide "who may do what", against three sources of truth
(identity D1 `member`, Sanity `conference.organizers[]`, identity `user.platformOperator`
vs Sanity `PLATFORM_ORG_ID`), with at least six separate parsers for the role string.
The target keeps Better Auth `member` rows as the only source for org roles, adds one
`conference_role` table in identity D1 for per-conference roles, lets each subgraph keep
the facts it owns (a talk's speakers, a sponsor's contacts), and puts one pure, typed
`can()` in `packages/tenancy` that every subgraph and the site call. Org and conference
roles travel as claims in the gateway envelope; resource facts are read locally.

## 1. Inventory of current decision points

### 1.1 Table

| #   | Where                                                                                                                                                                               | Decision                                                                                                   | Source of truth                                                                                                               | Vocabulary                                                              | Notes                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| G1  | `api/src/gateway.ts:618-664`                                                                                                                                                        | Operator lane: who gets a tenant envelope, a PlatformContext or a UserContext                              | identity `user.platformOperator`, `member.role` via `MEMBERSHIP.principal` (`services/identity/src/data/index.ts:164-180`)    | `orgRole` string, `platform:operator` scope, `platformRole: 'operator'` | Live per request; one refusal for unknown host and non-member (`:627-636`)                           |
| G2  | `api/src/gateway.ts:666-690`                                                                                                                                                        | Site lanes: tenant envelope with the caller's `orgRole`; `site:server` scope for a verified site assertion | same `principal()`; `SITE_PUBLIC_KEYS`                                                                                        | `orgRole`, `site:server`                                                | The assertion "grants no role" (`api/src/site-identity.ts:3`) but the scope is a capability (C3, C4) |
| T1  | `packages/tenancy/src/index.ts:129-141, 177-203`                                                                                                                                    | `requireTenant`, `ScopedRepository`: tenant isolation; refuses Platform/UserContext                        | envelope                                                                                                                      | `typ`                                                                   | No role logic; isolation only                                                                        |
| C1  | `services/conference/src/data/index.ts:23, 96-105`                                                                                                                                  | Settings write: owner/admin or operator scope                                                              | envelope                                                                                                                      | `WRITERS`, split on `,`, trimmed, case-sensitive                        | Guard before fetch                                                                                   |
| C2  | `services/conference/src/data/index.ts:65, 78`; `services/content/src/data/index.ts:172-173`                                                                                        | Unpublished edition readable                                                                               | envelope                                                                                                                      | any non-empty `orgRole`                                                 | Plain `member` sees drafts                                                                           |
| C3  | `services/conference/src/data/index.ts:117-128`                                                                                                                                     | Vendor binding change (#745, #2085)                                                                        | envelope                                                                                                                      | operator scope **or** `site:server`                                     | Trusts the site's own operator check (S3)                                                            |
| C4  | `services/conference/src/data/index.ts:180-183`                                                                                                                                     | Workshop reminder lock                                                                                     | envelope                                                                                                                      | `site:server` or operator scope                                         | Machine actor only                                                                                   |
| C5  | `services/conference/src/subgraph.ts:182-195`                                                                                                                                       | Ticket setup read: member or site lane                                                                     | envelope                                                                                                                      | non-empty `orgRole`, operator, `site:server`                            |                                                                                                      |
| I1  | `services/identity/src/subgraph.ts:69-77`                                                                                                                                           | Members list; emails and invitations for "manager"                                                         | envelope                                                                                                                      | lower-cased split; owner/admin                                          | Returns null, not an error                                                                           |
| I2  | `services/identity/src/data/members.ts:107-112, 146, 178`                                                                                                                           | Invite/remove/change role; only owners touch owners                                                        | live `member` row (re-read)                                                                                                   | lower-cased split                                                       | Good: re-reads D1 instead of trusting the envelope                                                   |
| I3  | `services/identity/src/data/auth.ts:43`, `member-sync.ts:281-286`                                                                                                                   | "Is owner" for last-owner trigger                                                                          | `member.role`                                                                                                                 | strips all whitespace, then split                                       | Deliberately differs from I2 (`member-sync.ts:332-338`, #1949)                                       |
| I4  | `services/identity/src/data/push.ts:22, 38`                                                                                                                                         | Who receives org notifications                                                                             | `member.role`, `user.platformOperator`                                                                                        | SQL `role IN ('owner','admin')`, exact                                  | `"member,admin"` gets nothing                                                                        |
| I5  | `services/identity/src/subgraph.ts:27-38`                                                                                                                                           | `asMember` / `asOperator` entry points                                                                     | envelope `typ`                                                                                                                |                                                                         |                                                                                                      |
| I6  | #2097 (open PR)                                                                                                                                                                     | `speakerDirectory`: owner/admin of session org, operator scope, PlatformContext                            | envelope                                                                                                                      |                                                                         | Owner decision: members excluded                                                                     |
| D1  | `services/tenant-directory/src/subgraph.ts:14-20` and every `requirePlatform` call (`:289-447`)                                                                                     | Provisioning, operator lists                                                                               | envelope `typ === 'platform'`                                                                                                 |                                                                         |                                                                                                      |
| D2  | `services/tenant-directory/src/subgraph.ts:28-32, 113-116, 245-248`                                                                                                                 | Session org id, draft editions, lifecycle read                                                             | envelope                                                                                                                      | any non-empty `orgRole`                                                 | Same "member sees drafts" rule as C2                                                                 |
| D3  | `services/tenant-directory/src/subgraph.ts:235, 350-367`                                                                                                                            | Lifecycle override write                                                                                   | envelope                                                                                                                      | own `WRITERS` copy, trimmed, case-sensitive                             | Duplicate of C1                                                                                      |
| S1  | `src/server/trpc.ts:217-238, 267`                                                                                                                                                   | `adminProcedure`: the site's single admin waist                                                            | NextAuth token `speaker.organizerOrgIds`, re-read live from Sanity every 60 s (`src/lib/authz/live-organizer.ts:8-20, 59-82`) | "organizer of this org"                                                 | All admin routers (sponsor 66 uses, marketing 46, conference 43, proposal 35...) collapse into it    |
| S2  | `src/server/trpc.ts:251-268`; `src/server/routers/proposal.ts:921-960, 1143-1200`                                                                                                   | `organizerProcedure`: organizer **or** speaker of the resource                                             | same + `talk.speakers[]` in Sanity                                                                                            | `isOrgOrganizer`                                                        | Reviews shown to every organizer (`proposal.ts:927`)                                                 |
| S3  | `src/lib/authz/platform.ts:39-80`; callers `src/server/routers/conference.ts:636`, `onboarding.ts:50`, `admin/settings/page.tsx:127`, `admin/platform/new-organization/page.tsx:27` | Platform operator                                                                                          | Sanity: organizer of `PLATFORM_ORG_ID`                                                                                        |                                                                         | Different set from G1                                                                                |
| S4  | `src/app/api/admin/*/route.ts` (e.g. `privacy/erase/route.ts:37`)                                                                                                                   | Route handlers                                                                                             | `isOrganizerForOrg`                                                                                                           |                                                                         | GDPR erasure open to every organizer                                                                 |
| S5  | `src/server/routers/registration.ts:23-80`; `volunteer.ts:95-346`; `sponsorMessages.ts:22-45`                                                                                       | Sponsor portal, volunteer confirm                                                                          | bearer tokens                                                                                                                 | none                                                                    | No identity; capability URLs                                                                         |
| S6  | `src/app/(cfp)/layout.tsx:32`; `src/components/notifications/NotificationPanel.tsx:52`; `UserMenu.tsx:191`                                                                          | UI gating                                                                                                  | global `speaker.isOrganizer` (organizer of **any** org)                                                                       |                                                                         | UI only, but cross-tenant: shows admin links on a foreign host                                       |
| S7  | `src/server/routers/organizerInvite.ts:413-420`                                                                                                                                     | Accepting an organizer invite                                                                              | appends to Sanity `organizers[]`                                                                                              |                                                                         | Grant path outside identity                                                                          |
| K1  | kontroll `src/lib/authz/platform.ts:23-27`                                                                                                                                          | Operator screens                                                                                           | identity `platformOperator` from the session                                                                                  |                                                                         | `KONF_PLATFORM_OPERATORS` is gone; only a comment remains (`:14`)                                    |
| K2  | kontroll `src/lib/authz/org.ts:28-39, 166-200`                                                                                                                                      | Org screens: `requireOrg(minimumRole)`, rank member < admin < owner                                        | `myOrganizations` via the API                                                                                                 | `strongestRole`                                                         | Presentation only; the subgraphs enforce                                                             |
| Y1  | `services/identity/src/data/member-sync.ts:1-34, 245`                                                                                                                               | Hourly Sanity → identity sync                                                                              | Sanity `organizers[]`                                                                                                         | grants `admin`                                                          | Insert-only: never revokes                                                                           |

### 1.2 Contradictions and gaps (ranked)

1. **Revocation gap (security).** The hourly sync grants `admin` to every Sanity organizer
   and never deletes (`member-sync.ts:2-3, 33-34`). The site re-reads Sanity live
   (`live-organizer.ts:5-12`). Removing someone from `organizers[]` removes their site
   admin within 60 s but leaves their API `admin`: conference settings (C1), lifecycle (D3),
   member management and invitations (I2), and through kontroll a full admin UI. Only orgs
   listed in `MEMBER_SOURCE_ORGS` are drift-checked instead (`member-sync.ts:3, 19`).
   **The mirror gap:** removing a member in kontroll (I2) leaves them site admin, because
   S1 reads Sanity `organizers[]` (`live-organizer.ts:16-20`), not identity. Fixed in phase 2.
2. **Two operator sets.** Site: organizers of the `PLATFORM_ORG_ID` org in Sanity (S3).
   API and kontroll: `user.platformOperator` (G1, K1). C3 trusts `site:server` for the
   vendor binding because "the site router enforces the platform-operator rule"
   (`conference/src/data/index.ts:117-123`); so the #745 rule is enforced against a
   different list depending on the lane. A Sanity organizer of the platform org who is
   not flagged in identity can rebind through the site.
3. **`site:server` is a role-less capability.** Any request carrying a valid site
   assertion gets it (`gateway.ts:683`), independent of the user. It unlocks C3, C4, C5.
   The site's whole server is therefore a confused-deputy surface; #2085 locks one schema
   with a test, not the lane. Assertion replay is checked per isolate only
   (`site-identity.ts:10-19`).
4. **Role parsing is copied, and copies disagree.** C1 and D3 trim but are case-sensitive;
   I1 and I2 lower-case; I3 strips internal whitespace; I4 does an exact SQL match.
   `"Admin"` writes nothing in conference but manages members in identity;
   `"member,admin"` is admin everywhere except notification fan-out.
5. **One site waist for everything.** S1 gives every organizer the same power: proposal
   scores and reviews, attendee PII, sponsor CRM, GDPR erasure (S4), schedule. There is no
   reviewer, volunteer coordinator or per-conference organizer. Sponsor contacts and volunteers
   have no identity at all (S5).
6. **"Member" has no defined meaning.** C2, C5, D2 let a plain `member` read drafts and the
   ticket setup; I1 shows them the member list without emails; I6 (owner decision) keeps
   them out of the speaker directory. Nobody decided what `member` is for.
7. **Docs contradict code.** `docs/CONTROL_MODEL.md:3` calls Sanity `organizers[]` "an
   hourly projection" of identity; the code projects Sanity into identity (Y1).
8. **A second grant path.** S7 makes someone an organizer by writing Sanity, which Y1 then
   turns into identity `admin` up to an hour later. Kontroll invitations (I2) are the other path.
9. **Audit is uneven.** Identity writes `audit_event` for member changes
   (`members.ts:205, 307`); operator writes in conference are log lines only
   (`conference/src/data/index.ts:159-164`); site admin actions have no audit.

What is good and must be kept: tenant from host, never from arguments (`gateway.ts:530-540`);
live `principal()` per request with a 60 s envelope (`gateway.ts:98`); guard before fetch
(C1, D3, I1); one refusal for "unknown" and "not yours" (`gateway.ts:627-636`); PlatformContext
accepted by no repository (`tenancy/src/index.ts:177-182`); identity re-reading the live row
for member management (I2).

## 2. Requirements

### 2.1 Functional: roles

| Role                                        | Scope                                  | Granted by                                               | When                                                   |
| ------------------------------------------- | -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `owner`, `admin`, `member`                  | org                                    | Better Auth invitation (kontroll)                        | now                                                    |
| `operator`                                  | platform                               | identity `user.platformOperator` (set by hand/migration) | now                                                    |
| `organizer`                                 | conference (one edition)               | org owner/admin                                          | CFP c (#2079): help with one edition without org admin |
| `reviewer`                                  | conference                             | organizer                                                | CFP c (#2079)                                          |
| `volunteer`                                 | conference (edition = time bound)      | organizer                                                | later (volunteers move)                                |
| `speaker` (submitter, accepted, co-speaker) | talk, resource-local in cfp D1         | the proposal itself                                      | CFP b (#2078)                                          |
| `sponsor_contact`                           | sponsor, resource-local in sponsors D1 | organizer, in the sponsors subgraph                      | later (sponsors move)                                  |
| `profile_owner`                             | speaker profile                        | the person (#2022)                                       | now (#2097)                                            |
| `site:server`                               | machine lane marker, per tenant        | site key pair                                            | now; narrowed to two capabilities                      |
| job/cron actors                             | machine                                | Worker binding                                           | now (unchanged)                                        |

Per-org vs per-conference: org roles apply to every conference of the org by inheritance;
conference roles never widen to the org. Time-bound roles: an edition is its own conference
id, so "volunteer for 2026" is a row on that conference; an optional `expires_at` covers the
rest (a reviewer until the review deadline).

### 2.2 Non-functional

- **Workers/D1.** Free plan now (ROADMAP "Workers Paid later"). No new Worker and no new
  cron. One D1 query per request already happens in `principal()`; the design stays at one.
  D1 read replicas lag; authorization reads go to the primary.
- **Latency.** No extra network hop per check. Claims are checked in memory; resource
  checks reuse the query the resolver runs anyway.
- **Consistency: the hard bounds.**
  - Role grant or revoke in identity D1: next request (the gateway calls `principal()` per
    request and mints a 60 s envelope, `gateway.ts:98`).
  - User deletion: next request (`principal()` returns null → 401, `gateway.ts:670-673`).
  - Session revocation (sign-out, ban): **up to 300 s**. The identity JWT is verified
    statelessly with `JWT_MAX_SECONDS = 300` (`gateway.ts:97`); the gateway does not check
    the session row.
  - Site: up to 60 s more from the per-instance memos (`identity-session.ts:25`,
    `live-organizer.ts:8`), until phase 2 removes the second one.
- **Isolation.** Every decision is inside the envelope's tenant; no role claim can name
  another org; `conferenceId` never comes from the client.
- **No existence oracle.** Org/conference checks run before any fetch; resource checks are
  folded into the query (`WHERE ... AND speaker = ?`) so "not yours" is `NOT_FOUND`.
- **Audit.** One sink: identity `audit_event`. Identity's own writes insert it in the same
  batch; other services emit on the existing event bus and identity records it. Add an
  indexed `subject_user_id` column so "everything done to or by this person" is one query.
- **Erasure.** Deleting an identity user cascades their `conference_role` rows and profile
  (#2097 cascades). Audit rows keep the opaque user id (§9 decision 8). cfp `talk.speakers`
  user ids: the talk is org-owned (#2022 layer 3), so erasure replaces the user id with a
  tombstone id and clears the profile snapshot; published program entries drop name and
  photo unless the speaker consented to archival (§9 decision 8).
- **Fail closed.** Unknown action, unknown role string, expired row, missing resource fact:
  deny.

## 3. Model

### 3.1 Sources: one per relation

Each relation has exactly one source; nothing is stored twice.

| Relation                                | Source                                                                   | Why                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| org owner/admin/member                  | Better Auth `member` (identity D1)                                       | Owns invitations, last-owner trigger, audit. A copy would be a dual write. |
| platform operator                       | `user.platformOperator` (identity D1, `auth.ts:117-121`, `input: false`) | Already the API's and kontroll's source.                                   |
| conference organizer/reviewer/volunteer | new `conference_role` (identity D1)                                      | No existing owner; grant/revoke/audit next to members.                     |
| talk speaker                            | cfp D1 (talk speakers, CFP b)                                            | The proposal owns who is on it; co-speaker acceptance is a cfp workflow.   |
| sponsor contact                         | sponsors D1                                                              | The sponsors subgraph owns the sponsor and its contacts.                   |
| profile owner                           | identity `speaker_profile.user_id` (#2097)                               |                                                                            |

Decision: **org roles come from `member` rows.** Sanity `organizers[]` stops being an
authorization source: people already synced stay `admin` (#1907, nothing breaks), new
per-edition helpers get a `conference_role` row, and `organizers[]` becomes display data
(or goes with settings phase 5).

With sponsor contacts resource-local, only one object type is left, so the table is a
plain role table, not a generic tuple store:

```sql
-- services/identity/migrations/00xx_conference_role.sql
CREATE TABLE conference_role (
  org_id        TEXT NOT NULL,
  conference_id TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('organizer', 'reviewer', 'volunteer')),
  expires_at    INTEGER,          -- null = no expiry
  granted_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (org_id, conference_id, user_id, role)
);
CREATE INDEX conference_role_user ON conference_role (user_id, org_id, conference_id);
```

Mint-time read: `WHERE user_id = ? AND org_id = <envelope orgId> AND conference_id =
<envelope conferenceId> AND (expires_at IS NULL OR expires_at > now)`. Both tenant ids
come from the resolved host, never from the caller. Expired rows are filtered at read and
purged by the existing hourly identity job (`services/identity/src/index.ts:56`, run by
tenant-directory's cron); no new cron.

### 3.2 Inheritance (the policy)

```
operator              -> acts for any org, only on the operator lane, audited
org owner             ⊇ admin ⊇ member
org admin             ⊇ conference organizer for every conference of the org
conference organizer  ⊇ reviewer, volunteer (for management actions)
talk speaker          resource-local; co-speaker = speaker with accepted=false
sponsor contact       resource-local
```

### 3.3 Typed policy and one `can()`

In `packages/tenancy/src/authz.ts`, exported from the barrel:

```ts
type Action = 'conference.update' | 'conference.read_draft' | 'proposal.review' | ... // closed union
type Resource =
  | { type: 'org' } | { type: 'conference' }
  | { type: 'talk'; speakers: string[]; status: TalkStatus }
  | { type: 'sponsor'; contacts: string[] }
  | { type: 'profile'; ownerId: string }
export function can(e: Envelope, action: Action, r: Resource = { type: 'conference' }): boolean
export function parseOrgRoles(raw: string | null): Set<'owner' | 'admin' | 'member'>
```

- Pure and synchronous: the envelope supplies org/conference roles, the caller supplies
  resource facts it already loaded. No I/O.
- The policy is a `Record<Action, Rule>`, so a missing action is a compile error.
- `parseOrgRoles` is the one parser (lower-case, trim, split on `,`, drop unknown); I3's
  stricter owner rule stays inside the last-owner trigger only.
- Every subgraph check in §1.1 (C1–C5, D2–D3, I1, I4, I6) becomes a `can()` call. The site
  calls the same function once it reads identity (phase 2).
- **`site:server` is a lane marker, not a role.** `can()` grants it exactly two machine
  capabilities: the reminder lock (C4) and the ticket-setup read (C5). It does **not** get
  `conference.read_draft`; drafts follow the user token the site forwards. Its C3 arm goes
  in phase 2b.
- **Tests.** The `can()` test table is generated from the §4 matrix as a fixture (one file
  both the doc table and the test read), plus negative tests: unknown role strings,
  `"Admin"`, `"member,admin"`, an expired row, a role row for another conference, an
  envelope with an oversized or unknown `conferenceRoles`.

### 3.4 How subgraphs evaluate: claims vs lookup

|                | A. Claims in the envelope | B. Lookup to identity per check | C. Hybrid (recommended)             |
| -------------- | ------------------------- | ------------------------------- | ----------------------------------- |
| Latency        | 0 extra hops              | one RPC + D1 query per check    | 0 extra hops                        |
| Consistency    | per request               | per check                       | per request                         |
| Envelope size  | grows with roles          | small                           | bounded: one org + one conference   |
| Resource roles | do not fit                | fit                             | read locally by the owning subgraph |
| Coupling       | none at check time        | every subgraph binds identity   | none                                |

**Recommendation: C.** Extend `principal(userId, orgId, conferenceId)` to return
`conferenceRoles` (same query, one extra indexed lookup) and add `conferenceRoles: string[]`
to `TenantEnvelope` (`tenancy/src/index.ts:25-33`). `verifyEnvelope` (`:102-119`) defaults
it to `[]` when absent, refuses more than 8 entries, and drops values outside the role
vocabulary, so gateway and subgraphs can deploy in either order. Resource facts (talk
speakers, sponsor contacts) are loaded by the owning subgraph in its own query. Identity is
never called at check time.

**The gateway must admit role holders without a member row (phase 3 blocker).** Today the
operator lane refuses anyone without `orgRole` (`gateway.ts:636`), and kontroll admission
counts only member rows (`services/identity/src/data/index.ts:144-152`,
`mayUseOperatorOrigin`). Phase 3 changes both: `principal()` and `mayUseOperatorOrigin`
count `conference_role` rows, and `:636` becomes `orgRole || conferenceRoles.length`. A
gateway test proves a role holder with no member row gets a tenant envelope and a stranger
still gets the single 403. The insider checks C2, C5, D2 (`!!e.orgRole`) become
`can(e, 'conference.read_draft')` in the same PR, or a reviewer could not read the edition
they review.

### 3.5 Caching and invalidation

No authorization cache. Bounds are in §2.2: role changes next request, session revocation
up to 300 s, site memos up to 60 s on top. The gateway response cache must not serve
role-dependent responses across callers; phase 1 adds a test (`api/src/response-cache.ts`
not yet checked for this).

### 3.6 Grants, emergency revocation, audit

- Grants and revokes: identity mutations `grantConferenceRole` / `revokeConferenceRole`,
  guarded by `can(e, 'conference.manage_roles')`, written in one `db.batch` with an
  `audit_event` row. Same pattern as `members.ts:307`.
- **`revokeAll(userId)`**: operator-only (PlatformContext), audited, one batch: deletes
  member rows (respecting the last-owner trigger: an orphaned org is reported, not left
  ownerless), `conference_role` rows, sessions, and clears `platformOperator`. Takes
  effect next request for the API; up to 300 s for an already-issued JWT.
- **Break-glass** (documented in `docs/AUTH.md` in phase 1): if no operator can sign in,
  an engineer with Cloudflare access sets `platformOperator = 1` with
  `wrangler d1 execute` against identity, records an `audit_event` row by hand with the
  reason, and reverts within 24 h. Rotating `ENVELOPE_PRIVATE_KEY` invalidates every
  envelope at once.
- Operator writes (`conference/src/data/index.ts:159-164`) move from log lines to the bus →
  identity `audit_event`.
- `audit.read`: owners for their org; operators for all.
- **`operator.cli_token`** (#2168): `POST /operator/cli-token` on identity mints the
  gateway's own identity JWT (EdDSA, `aud: konf-gateway`, 300 s, `origin` = the
  operator origin) with `cli: true` and a `jti`, for CLI scripts on the operator lane.
  Only a real session handed off to an `OPERATOR_ORIGINS` entry, with
  `user.platformOperator` read live from D1 at mint time; anyone else gets the same 403
  before any write. A JWT credential (a CLI token included) never mints, so it cannot
  renew itself. Audited as `operator.cli_token.mint` with actor, `jti` and `exp`, never
  the token. Revocation: the gateway re-reads `platformOperator` on every request, so a
  revoked role stops the token at once; a revoked session leaves it valid for at most
  the remaining 300 s, like any identity JWT.

## 4. Role × action matrix

Y = allowed, N = denied, own = only their own resource, asg = only where assigned,
All cells are owner-decided (§9). Org roles inherit downward (owner ⊇ admin ⊇ member);
admin ⊇ conference organizer. "Spk" = speaker on the talk; "CoS" = invited co-speaker
before acceptance; "Site" = `site:server` with no user token.

| Action                                | Op  | Own | Adm | Mem | Org | Rev                 | Vol | Spk | CoS | Spn | Site |
| ------------------------------------- | --- | --- | --- | --- | --- | ------------------- | --- | --- | --- | --- | ---- |
| org.read_settings                     | Y   | Y   | Y   | Y   | Y   | N                   | N   | N   | N   | N   | N    |
| operator.cli_token                    | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| org.update_settings / billing         | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| org.manage_members (admin, member)    | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| org.manage_owners                     | Y   | Y   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| org.create (provision)                | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| org.write_secrets (#2098, write-only) | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| conference.read_draft                 | Y   | Y   | Y   | Y   | Y   | Y                   | N   | N   | N   | N   | N    |
| conference.read_ticket_setup (C5)     | Y   | Y   | Y   | Y   | Y   | N                   | N   | N   | N   | N   | Y    |
| conference.update_settings            | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| conference.set_lifecycle              | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| conference.bind_ticketing             | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| conference.manage_roles               | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| proposal.submit (CFP open)            | Y   | Y   | Y   | Y   | Y   | Y                   | Y   | Y   | Y   | Y   | N    |
| proposal.read                         | Y   | Y   | Y   | N   | Y   | Y (asg if assigned) | N   | own | own | N   | N    |
| proposal.edit                         | N   | Y   | Y   | N   | Y   | N                   | N   | own | N   | N   | N    |
| proposal.read_reviews                 | Y   | Y   | Y   | N   | Y   | after own           | N   | N   | N   | N   | N    |
| proposal.review (score)               | N   | Y   | Y   | N   | Y   | asg                 | N   | N   | N   | N   | N    |
| proposal.set_status / email           | N   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| schedule.edit                         | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| speaker_directory.read (#2097)        | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| profile.read_private / update         | N   | N   | N   | N   | N   | N                   | N   | own | own | N   | N    |
| shift.read                            | Y   | Y   | Y   | N   | Y   | N                   | own | N   | N   | N   | N    |
| shift.manage                          | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| sponsor.read_crm                      | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| sponsor.edit_own_profile              | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | own | N    |
| ticketing.read (sales summary, #2148) | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| attendee.read_pii                     | Y   | Y   | Y   | N   | Y   | N                   | N   | N   | N   | N   | N    |
| person.erase (GDPR)                   | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| audit.read                            | Y   | Y   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| api_client.read (list, no secrets)    | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| api_client.create / rotate            | N   | Y   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| api_client.revoke                     | Y   | Y   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| pat.manage_own (self-service)         | N   | Y   | Y   | Y   | N   | N                   | N   | N   | N   | N   | N    |
| user.revoke_all                       | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| billing.read (#2129)                  | Y   | Y   | Y   | N   | N   | N                   | N   | N   | N   | N   | N    |
| billing.manage (checkout, portal)     | N   | Y   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| signup.create_org (user lane)         | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| signup.manage_codes                   | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | N    |
| reminder_lock (C4)                    | Y   | N   | N   | N   | N   | N                   | N   | N   | N   | N   | Y    |

API clients and PATs (`api_client.*`, `pat.manage_own`): see `docs/API_CLIENTS.md`.
They are never client-callable.

Billing and sign-up (`billing.*`, `signup.*`): see `docs/BILLING.md`. `signup.create_org`
is the user lane: any signed-in user on a session with no tenant (a UserContext, which
holds no column, or an operator's PlatformContext) with a valid invite code. No org role
is involved, so the resolver checks the envelope type, not `can()`.

Operator is N on reviewing and editing proposals by default: operators act for a tenant
for support, not as a juror. Operator access is only on the operator lane and is audited.

### 4.1 Plan dimension (billing phase 1, #2129)

A role check passes first; a paid-only action then also needs the org's **effective plan**
(`packages/tenancy/src/plan.ts`, `PLAN_GATES`). The gateway mints it into the tenant
envelope per request from tenant-directory's `tenantByHost`; `verifyEnvelope` caps it to
`free | basic | pro` and reads an absent or unknown value as `free`.

These are the only gated paths:

| Gate                          | Needs | Gated path                                                                                                                                          |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference.publish_ticketed` | basic | Site `conference.updateVisibility` to `live` from an explicit non-live visibility, when the edition's `ticketingProvider` is set (the real publish) |
| `conference.publish_ticketed` | basic | Gateway `setConferenceLifecycle(null)` putting a cancelled or archived ticketed edition back live                                                   |
| `domain.connect_custom`       | basic | Site `conference.updateDomains` adding an entry that was not in the list and is not a platform-zone host                                            |
| `domain.connect_custom`       | basic | Gateway `provisionConference` with a `domain`, tenant lane                                                                                          |
| `api_client.create`           | basic | Policy row only: API client creation (#2115, resolver not built yet)                                                                                |
| `pat.create_write`            | basic | Policy row only: a PAT with any write scope (#2115, resolver not built yet)                                                                         |

Not gated: unlisting, an already live edition, free-to-attend editions, keeping or
removing domains, cancelling or archiving, drafts created by `provisionConference`, and
the operator lane (`createOrganization`, `provisionConference` naming `orgId`, the
internal `addCustomDomain`). Staff grant a plan with `setComplimentaryPlan` instead. The
live-event count limit waits for the owner's Pro decision.

On the gateway a refusal is `BAD_USER_INPUT` with `extensions.reason = PLAN_REQUIRED`
and `extensions.requiredPlan`, and the gateway passes both. On the site it is tRPC
`FORBIDDEN`, with the same `reason` and `requiredPlan` in `error.data`. The site reads the
plan from the gateway (`organization { effectivePlan }`) as the signed-in organizer. If
that read fails, the site refuses with `SERVICE_UNAVAILABLE`, which is retryable.
"Ticketed" means `ticketingProvider` is set.

**Effective plan:** `comp` gives the stored plan while `comp_until` is unset or ahead.
`stripe` gives it while `active`, or while `past_due` and within 14 days of
`current_period_end`. Everything else is `free`. A demo org (`organizations.kind =
'demo'`, #2150) is `pro` whatever its billing columns say, and is never billed: phase 2's
Stripe checkout must refuse an org with kind `demo`.

**Existing orgs:** migration 0009 gives `organization-cloud-native-days` comp `pro`
(no end date, reason "existing customer (owner decision 2026-11-08)"). It ships in the
same deploy as the gates, so CNDN is never blocked. `kkdemo.org` is the demo org
(migration 0010, #2150) and so `pro`: it is no longer where the gates are tested. The
gates are covered by unit tests (`packages/tenancy/src/plan.test.ts`, the subgraph
tests) and, end to end, by a `free` test org on a preview.

**Runbook:** grant or change a plan on the operator lane with
`setComplimentaryPlan(orgId: "...", plan: basic|pro, until: "...", reason: "...")`.
Leave out `until` for no end date; `plan: free` ends a grant. Each change is audited as
`operator.write` in identity's `audit_event`, before the plan is written.

**Org kind (#2150):** `organizations.kind` is `customer` or `demo` (triggers hold the
vocabulary). The gateway mints it into the tenant envelope as `orgKind`; absent or
unknown is `customer`. A demo org mails only its own members (`allowedRecipients` in
`@runkonf/tenancy`); invitations are exempt, because a prospect is invited to become a
member. `Organization.kind` lets Kontroll leave demo orgs out of operator totals, and
`ConferenceEdition.orgKind` lets the site set `robots: noindex`.

## 5. Migration plan

Each phase ships alone, keeps every current user's access, and carries a **cross-reader
test**: the old predicate and `can()` run over the same inputs (every role string seen in
production, plus `"Admin"`, `"member,admin"`, `" owner "`, empty) and the test fails on any
disagreement the phase did not intend. Intended changes are listed as explicit exceptions.

| Phase | What                                                                                                                                                                                                                                                                                                                             | Issues / milestone               | Non-breaking because                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| 0     | This doc; fix `CONTROL_MODEL.md:3`; canonical source per role                                                                                                                                                                                                                                                                    | #1928                            | docs only                                                                         |
| 1     | `parseOrgRoles` + `can()` for existing actions (C1–C5, D2–D3, I1, I4, I6); `site:server` limited to C4/C5 (+C3 until 2b); operator audit via bus; `audit_event.subject_user_id`; `revokeAll`; break-glass doc                                                                                                                    | #1928, Platform 7                | Cross-reader test: identical except parser fixes (case, `push.ts`), listed        |
| 1b    | **Together:** organizer invites (S7) go through identity invitations, **and** all four orgs move to `MEMBER_SOURCE_ORGS` after one week of zero drift, so Y1 only alerts. Shipping only the flag would leave a site-invited organizer without API admin                                                                          | #1907, #1947                     | Drift = 0 means no one loses access; new invites land in identity directly        |
| 2     | Site reads roles from identity: operator from `platformOperator` (retire `PLATFORM_ORG_ID`, S3); admin waist from the member row via the API (S1), which closes the mirror gap; UI `isOrganizer` → per-org check (S6)                                                                                                            | new issues, Platform 7           | Shadow mode: compute both, log `authz.shadow.mismatch`, switch after a clean week |
| 2b    | Vendor binding: C3 requires the operator scope from the user's own envelope; drop the `site:server` arm. The site forwards the user's identity token. **Depends on identity login for the tenant** (`isIdentityTenant`): a NextAuth-only tenant has no identity token, so its binding changes go through kontroll until it moves | #2085 follow-up; ends with #2098 | Phase 2 put both lanes on one operator list                                       |
| 3b    | Talk speaker from cfp D1; proposal reads/writes through `can()` with resource facts                                                                                                                                                                                                                                              | CFP b (#2078)                    | Same rules as S2 today; cross-reader test against `proposal.ts:921-960`           |
| 3     | `conference_role`, `principal()`/`mayUseOperatorOrigin` count it, gateway `:636` relaxed, `conferenceRoles` claim (capped, defaulted), C2/C5/D2 → `can()`; grant/revoke mutations; kontroll UI. **Gated on** phase 2, or on proposal mutations living in the cfp subgraph, so a reviewer role is enforced where reviews happen   | CFP c (#2079)                    | Additive table and claim; no rows until granted                                   |
| 4     | Volunteers as identity users with `conference_role`; sponsor contacts as identity users in sponsors D1; bearer links stay for existing invitations                                                                                                                                                                               | volunteers / sponsors phases     | Token links keep working until expiry                                             |
| 5     | Retire `organizers[]` as authz source, member-sync cron, `withLiveOrganizerRights`, `PLATFORM_ORG_ID`, global `isOrganizer`, `adminProcedure` as one waist                                                                                                                                                                       | settings phase 5, Platform 6     | Each removed after its replacement ran one clean week                             |

## 6. Future-proofing

- **The envelope fixes the shape:** roles for one org plus one conference, never a list
  of everything a user may do. That keeps it small and is the line every extension below
  respects.
- **Custom roles per org.** A row `(org_id, name, actions[])` assigned through
  `conference_role.role`. `principal()` expands role → actions at mint time and the
  envelope carries the action list for that one conference; `can()` stays pure and just
  checks membership. Trigger: the first paying org asks for a role the matrix lacks.
- **More tenants.** Nothing grows with tenant count: one indexed query per request.
  `conference_role` grows with people × editions (thousands of rows).
- **SpiceDB / OpenFGA.** The store sits behind `principal()` and `grant/revoke`. A swap
  replaces those two; `can()` keeps reading claims and resource facts stay local. The
  table would become `conference#<role>@user` tuples one-to-one. Trigger: groups or
  reverse queries ("everything this user can see") across orgs. Cost: a hosted service
  and a hop per request.
- **Not built now (YAGNI).** Generic tuple store and other object types (trigger: a second
  object type that identity, not its subgraph, must own); groups/teams (trigger: Sanity
  `teams[]` moving in settings phase 5); reverse-lookup API; authz cache (trigger:
  `principal()` p95 > 10 ms); field-level ACLs; delegated operator roles (trigger: a second
  operator who should not provision); session-row check in the gateway (trigger: 300 s
  revocation is not enough); policy-as-data (trigger: admins editing policy); per-org
  secrets (#2098, own design).

## 7. Fit with the trajectory

This **follows** the accepted plan: `api.konf.app` stays the only door and enforcer;
identity D1 stays the source for memberships (`DATA_OWNERSHIP.md:72, 90`); Sanity
`organizers[]` retires in phase 5 as planned; #1907's "organizers are admin" stands for
existing people; #2022's three layers map to profile owner, talk speaker and conference
roles.

It **departs** in four places:

1. A new table and per-conference roles (organizer, reviewer, volunteer) that no accepted
   document names. Needed by CFP c (#2079).
2. The gateway admits users with a conference role but no member row (phase 3).
3. The site stops being its own authorization source (phase 2) before next-auth retirement
   would force it; this closes gaps 1–3 and the mirror gap.
4. `site:server` shrinks to a lane marker with two machine capabilities.

New milestone: **Platform 7: Authorization** (phases 1–2b); CFP b/c carry 3b and 3. Milestone "Platform 7: Authorization": phase 0 #2105, phase 1 #2106 and #2107 (break-glass), 1b #2101, 2 #2108, 2b #2109, 3 #2110; 3b is CFP b (#2078).

## 8. Where things are managed

Owner decision, 2026-11-08 (PR #2102). The API is the only write path, so a field may be
editable in more than one place.

- **Same mutation everywhere.** A field editable in both Kontroll and the conference admin
  uses the same API mutation from both. No surface gets its own write path.
- **Org members and roles** (owner/admin/member, invitations): **Kontroll only.** The site
  shows them read-only with a link to Kontroll. Sanity `organizers[]` is no longer an
  editing surface.
- **Per-conference roles, split:** conference organizers are granted in **Kontroll**;
  reviewers and volunteers in the **conference admin**. Both show every role read-only,
  with a link to where it is managed.
- **Conference details** (name, dates, venue and the other settings): mainly the
  **conference admin**, which has onboarding and the pre-conference checklist. Kontroll
  may offer them through the same mutation, kept minimal, linking to the conference admin
  (kontroll#84).
- **Kontroll** is mostly for org admins: the org, members, plan, integrations and secrets,
  and the conference lifecycle (create edition, publish, archive).

## 9. Owner decisions (all decided)

Settled by the Fable review (2026-11-07): evaluation model C (claims + local resource
facts); one object type (`conference_role`), sponsor contacts resource-local, no Cedar, no
`volunteer_lead`; `site:server` limited to C4/C5; one audit sink in identity; phase 3b
before 3; 1b ships with S7.

Decided by the owner, 2026-11-08 (PR #2102), all as recommended:

1. **Org member:** read-only insider: drafts, settings and ticket setup; no personal data,
   no directory, no writes.
2. **Revocation gap:** identity becomes the source of org roles for all orgs after a week
   with no drift, shipped together with site invites through identity (phase 1b; closes
   #2101 in both directions).
3. **Per-conference organizer:** may edit settings, not lifecycle; may grant reviewer and
   volunteer for that conference only.
4. **Site operator:** identity `platformOperator`; `PLATFORM_ORG_ID` retires.
5. **Vendor binding:** operator-only until per-org credentials (#2098).
6. **Review:** blind until the reviewer has scored; covers the whole conference unless
   assigned; operators never score.
7. **GDPR erasure:** owner, admin or operator. **Attendee personal data:** org admin and the
   conference's organizers.
8. **Erasure vs archive:** audit rows keep an opaque id; published program entries drop
   name and photo unless the speaker consented. Refines #2022's archive rule.
9. **Speaker edits:** accepted speakers edit title and abstract until the program is
   published, then through the organizer.
10. **Speaker directory:** owner, admin and operator only.
11. **Session revocation:** up to 300 s accepted; `revokeAll` and key rotation for
    emergencies.
