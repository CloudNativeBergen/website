# Authorization: inventory and target design

Status: proposal for owner decision (2026-11-07). Supersedes the agy draft of the same name.
Related: #1928 (role vocabularies), #1907 (organizer backfill), #2022 (speaker model),
#2077–#2079 (CFP steps a–c), #2093/#2097 (speaker profile), #2098 (per-org secrets),
#745/#2085 (vendor binding rule). Line numbers refer to `main` at `0f0c6953`.

**Summary.** Today six places decide "who may do what", against three sources of truth
(identity D1 `member`, Sanity `conference.organizers[]`, identity `user.platformOperator`
vs Sanity `PLATFORM_ORG_ID`), with at least six separate parsers for the role string.
The target keeps Better Auth `member` rows as the only source for org roles, adds one
`relation_tuple` table in identity D1 for per-conference roles, lets each subgraph keep
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
   reviewer, volunteer lead or per-conference organizer. Sponsor contacts and volunteers
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

| Role                                        | Scope                                   | Granted by                                               | Now / next 2 steps                                     |
| ------------------------------------------- | --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `owner`, `admin`, `member`                  | org                                     | Better Auth invitation (kontroll)                        | now                                                    |
| `operator`                                  | platform                                | identity `user.platformOperator` (set by hand/migration) | now                                                    |
| `organizer`                                 | conference (one edition)                | org owner/admin                                          | CFP c (#2079): help with one edition without org admin |
| `reviewer`                                  | conference                              | organizer                                                | CFP c (#2079)                                          |
| `speaker` (submitter, accepted, co-speaker) | talk                                    | the cfp data itself (who is on the proposal)             | CFP b (#2078)                                          |
| `volunteer`, `volunteer_lead`               | conference (edition = time bound)       | organizer                                                | later (tickets/volunteers move)                        |
| `sponsor_contact`                           | sponsor (one company in one conference) | organizer                                                | later (sponsors move)                                  |
| `profile_owner`                             | speaker profile                         | the person (#2022)                                       | now (#2097)                                            |
| `site:server`                               | machine, per tenant                     | site key pair                                            | now; narrowed                                          |
| job/cron actors                             | machine                                 | Worker binding                                           | now (unchanged)                                        |

Per-org vs per-conference: org roles apply to every conference of the org by inheritance;
conference roles never widen to the org. Time-bound roles: an edition is its own conference
id, so "volunteer for 2026" is a tuple on that conference; an optional `expires_at` covers
the rest (a reviewer until the review deadline).

### 2.2 Non-functional

- **Workers/D1.** Free plan now (ROADMAP "Workers Paid later"). No new Worker or cron is
  needed. One D1 query per request already happens in `principal()`; the design must stay
  at one. D1 read replicas lag; authorization reads go to the primary.
- **Latency.** Target: no extra network hop per check. Claims-based checks are in-memory
  (µs); resource checks reuse the query the resolver runs anyway.
- **Consistency.** A revoked role takes effect on the caller's next request (envelope is
  minted per request, TTL 60 s, `gateway.ts:98`). The site's 60 s memo
  (`live-organizer.ts:8`) stays the upper bound until the site reads identity.
- **Isolation.** Every decision is made inside the envelope's tenant; no role claim can
  name another org; `conferenceId` never comes from the client (AGENTS.md).
- **No existence oracle.** Org/conference checks run before any fetch; resource checks are
  folded into the query (`WHERE ... AND speaker = ?`) so "not yours" is `NOT_FOUND`.
- **Audit.** Every grant, revoke and operator action lands in `audit_event` in the same
  D1 batch as the change.
- **Erasure.** Deleting an identity user deletes their tuples (FK cascade) and profile
  (#2097 already cascades); audit rows keep the opaque user id only.
- **Fail closed.** Unknown action, unknown role string, missing resource fact: deny.

## 3. Model

### 3.1 Sources: one per relation

Zanzibar-shaped (object#relation@subject), but each relation has exactly one source.
No relation is stored twice.

| Relation                                                 | Source                                                                   | Why                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `org#owner/admin/member`                                 | Better Auth `member` (identity D1)                                       | Owns invitations, last-owner trigger, audit. Copying into tuples would be a dual write. |
| `platform#operator`                                      | `user.platformOperator` (identity D1, `auth.ts:117-121`, `input: false`) | Already the API's and kontroll's source.                                                |
| `conference#organizer/reviewer/volunteer/volunteer_lead` | new `relation_tuple` (identity D1)                                       | No existing owner; needs grant/revoke/audit next to members.                            |
| `sponsor#contact`                                        | `relation_tuple`                                                         | Same; object id is the sponsor-in-conference id.                                        |
| `talk#speaker`                                           | cfp D1 (talk speakers, CFP b)                                            | The proposal owns who is on it; co-speaker acceptance is a cfp workflow.                |
| `profile#owner`                                          | identity `speaker_profile.user_id` (#2097)                               |                                                                                         |

Decision: **org roles are derived from `member` rows, not tuples.** The Sanity
`organizers[]` list stops being an authorization source: existing synced people stay
`admin` (#1907 decision, nothing breaks), new per-edition helpers get a `conference#organizer`
tuple, and `organizers[]` becomes display data (or is removed with settings phase 5).

```sql
-- services/identity/migrations/00xx_relation_tuple.sql
CREATE TABLE relation_tuple (
  object_type TEXT NOT NULL,            -- 'conference' | 'sponsor'
  object_id   TEXT NOT NULL,
  relation    TEXT NOT NULL,            -- checked against the policy's list
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  org_id      TEXT NOT NULL,            -- tenant column: every read filters on it
  expires_at  INTEGER,                  -- null = no expiry
  granted_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (object_type, object_id, relation, user_id)
);
CREATE INDEX relation_tuple_user ON relation_tuple (user_id, org_id);
```

Subjects are users only. Usersets (`group#member`) and wildcards are not built (§6).

### 3.2 Inheritance (the policy)

```
platform#operator            -> acts for any org, only on the operator lane, audited
org#owner                    ⊇ org#admin ⊇ org#member
org#admin                    ⊇ conference#organizer for every conference of the org
conference#organizer         ⊇ conference#reviewer, conference#volunteer_lead
conference#volunteer_lead    ⊇ conference#volunteer
talk#speaker                 (no inheritance; co-speaker = speaker with accepted=false until accepted)
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

- `can()` is pure and synchronous: the envelope supplies org/conference roles, the caller
  supplies resource facts it already loaded (the Cedar "entity" shape). No I/O inside.
- The policy is a `Record<Action, Rule>` so a missing action is a compile error.
- `parseOrgRoles` is the one parser (lower-case, trim, split on `,`, drop unknown); I3's
  stricter owner rule stays inside the last-owner trigger only.
- Every subgraph check in §1.1 (C1–C5, D2–D3, I1, I4, I6) becomes a `can()` call. The site
  calls the same function once it reads identity (phase 2).

### 3.4 How subgraphs evaluate: claims vs lookup

|                | A. Claims in the envelope                 | B. Service-binding lookup to identity per check | C. Hybrid (recommended)                               |
| -------------- | ----------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Latency        | 0 extra hops                              | one RPC per check (~1–5 ms, D1 query each)      | 0 extra hops                                          |
| Consistency    | per request (envelope minted per request) | per check                                       | per request                                           |
| Envelope size  | grows with roles                          | small                                           | bounded: roles for **one** org and **one** conference |
| Resource roles | do not fit (unbounded talks)              | fit                                             | read locally by the owning subgraph                   |
| Coupling       | none at check time                        | every subgraph binds identity                   | none                                                  |

**Recommendation: C.** Extend `principal(userId, orgId, conferenceId)` to return
`conferenceRoles` from `relation_tuple` (same query, `UNION` on the indexed `user_id`,
`expires_at` filter) and add `conferenceRoles: string[]` to `TenantEnvelope`
(`tenancy/src/index.ts:25-33`; `verifyEnvelope` rebuilds known fields, so old subgraphs
ignore it). Resource relations (`talk#speaker`, `sponsor#contact` if moved to the sponsors
subgraph) are facts the owning subgraph loads in its own query. Identity is never called
at check time.

### 3.5 Caching and invalidation

No authorization cache is added. The gateway reads `principal()` live per request and the
envelope dies in 60 s; a grant or revoke is visible on the next request. The site's 60 s
per-instance memo (`live-organizer.ts:24-26`, `identity-session.ts:25-30`) is the only
staleness and disappears with phase 2. The gateway response cache must not cache responses
that depend on roles; phase 1 adds a test that proves it (`api/src/response-cache.ts` not yet checked for this).

### 3.6 Grants and audit

- Grants and revokes go through identity mutations (`grantConferenceRole`,
  `revokeConferenceRole`), guarded by `can(e, 'conference.manage_roles')`, written in one
  `db.batch` with an `audit_event` row (`action`, `userId` = actor, `detail` JSON with
  object, relation, subject). Same pattern as `members.ts:307`.
- Operator writes (`conference/src/data/index.ts:159-164`) move from log lines to an
  `audit_event`-shaped table in the writing service, or to identity via the existing event
  bus. Trigger: phase 1.
- `audit.read`: owners for their org; operators for all.

## 4. Role × action matrix

Y = allowed, N = denied, own = only their own resource, asg = only where assigned,
★ = needs an owner decision (§8). Org roles inherit downward (owner ⊇ admin ⊇ member);
admin ⊇ conference organizer. "Spk" = speaker on the talk; "CoS" = invited co-speaker
before acceptance; "Site" = `site:server` without a user.

| Action                                | Op  | Own | Adm | Mem | Org | Rev        | Vol  | Spk  | CoS | Spn | Site |
| ------------------------------------- | --- | --- | --- | --- | --- | ---------- | ---- | ---- | --- | --- | ---- |
| org.read_settings                     | Y   | Y   | Y   | Y   | Y   | N          | N    | N    | N   | N   | N    |
| org.update_settings / billing         | Y   | Y   | Y   | N   | N   | N          | N    | N    | N   | N   | N    |
| org.manage_members (admin, member)    | Y   | Y   | Y   | N   | N   | N          | N    | N    | N   | N   | N    |
| org.manage_owners                     | Y   | Y   | N   | N   | N   | N          | N    | N    | N   | N   | N    |
| org.create (provision)                | Y   | N   | N   | N   | N   | N          | N    | N    | N   | N   | N    |
| org.write_secrets (#2098, write-only) | Y   | Y   | Y★  | N   | N   | N          | N    | N    | N   | N   | N    |
| conference.read_draft                 | Y   | Y   | Y   | Y★  | Y   | Y          | N    | N    | N   | N   | Y    |
| conference.update_settings            | Y   | Y   | Y   | N   | Y★  | N          | N    | N    | N   | N   | N    |
| conference.set_lifecycle              | Y   | Y   | Y   | N   | N★  | N          | N    | N    | N   | N   | N    |
| conference.bind_ticketing             | Y   | N★  | N★  | N   | N   | N          | N    | N    | N   | N   | N    |
| conference.manage_roles               | Y   | Y   | Y   | N   | Y★  | N          | N    | N    | N   | N   | N    |
| proposal.submit (CFP open)            | Y   | Y   | Y   | Y   | Y   | Y          | Y    | Y    | Y   | Y   | N    |
| proposal.read                         | Y   | Y   | Y   | N   | Y   | asg★       | N    | own  | own | N   | N    |
| proposal.edit                         | N   | Y   | Y   | N   | Y   | N          | N    | own★ | N   | N   | N    |
| proposal.read_reviews                 | Y   | Y   | Y   | N   | Y   | after own★ | N    | N    | N   | N   | N    |
| proposal.review (score)               | N   | Y   | Y   | N   | Y★  | asg        | N    | N    | N   | N   | N    |
| proposal.set_status / email           | N   | Y   | Y   | N   | Y   | N          | N    | N    | N   | N   | N    |
| schedule.edit                         | Y   | Y   | Y   | N   | Y   | N          | N    | N    | N   | N   | N    |
| speaker_directory.read (#2097)        | Y   | Y   | Y   | N   | N★  | N          | N    | N    | N   | N   | N    |
| profile.read_private / update         | N   | N   | N   | N   | N   | N          | N    | own  | own | N   | N    |
| shift.read                            | Y   | Y   | Y   | N   | Y   | N          | own★ | N    | N   | N   | N    |
| shift.manage                          | Y   | Y   | Y   | N   | Y   | N          | N    | N    | N   | N   | N    |
| sponsor.read_crm                      | Y   | Y   | Y   | N   | Y   | N          | N    | N    | N   | N   | N    |
| sponsor.edit_own_profile              | Y   | Y   | Y   | N   | Y   | N          | N    | N    | N   | own | N    |
| attendee.read_pii                     | Y   | Y   | Y   | N   | Y★  | N          | N★   | N    | N   | N   | N    |
| person.erase (GDPR)                   | Y   | Y   | Y★  | N   | N★  | N          | N    | N    | N   | N   | N    |
| audit.read                            | Y   | Y   | N   | N   | N   | N          | N    | N    | N   | N   | N    |
| reminder_lock / jobs                  | Y   | N   | N   | N   | N   | N          | N    | N    | N   | N   | Y    |

Operator is N on reviewing and editing proposals by default: operators act for a tenant
for support, not as a juror. Operator access is only on the operator lane and is audited.

## 5. Migration plan

Each phase ships alone, keeps every current user's access, and carries a **cross-reader
test**: a table-driven test that runs the old predicate and `can()` over the same inputs
(every role string seen in production, plus `"Admin"`, `"member,admin"`, `" owner "`,
empty) and fails on any disagreement the phase did not intend. Intended changes are listed
in the test as explicit exceptions, so a reviewer sees them.

| Phase | What                                                                                                                                                                                                                                                 | Issues / milestone                            | Non-breaking because                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0     | This doc; fix `CONTROL_MODEL.md:3`; name canonical source per role                                                                                                                                                                                   | #1928                                         | docs only                                                                               |
| 1     | `parseOrgRoles` + `can()` for the actions that exist (C1–C5, D2–D3, I1, I4, I6); replace each check; operator audit to D1                                                                                                                            | #1928, Platform 5                             | Cross-reader test: identical except the parser fixes (case, `push.ts`), listed          |
| 1b    | Close the revocation gap: put all four orgs in `MEMBER_SOURCE_ORGS` after one week with zero drift, so Y1 only alerts                                                                                                                                | #1907, #1947                                  | Drift = 0 means no one loses access                                                     |
| 2     | Site reads roles from identity: operator from `platformOperator` (retire `PLATFORM_ORG_ID`, S3); admin waist from the member row through the API (S1); organizer invites through identity invitations (S7); `isOrganizer` in UI → per-org check (S6) | new issues, Platform 6 (next-auth retirement) | Shadow mode first: compute both, log `authz.shadow.mismatch`, switch after a clean week |
| 2b    | Vendor binding: C3 requires the operator scope from the user's own envelope; drop the `site:server` arm. Site forwards the user's identity token on that call                                                                                        | #2085 follow-up; ends with #2098              | Phase 2 made both lanes use the same operator list                                      |
| 3     | `relation_tuple`, `principal()` returns `conferenceRoles`, envelope field; grant/revoke mutations; kontroll UI for per-edition organizer and reviewer                                                                                                | CFP c (#2079)                                 | Additive table and claim; nobody has a tuple until granted                              |
| 3b    | `talk#speaker` from cfp D1; proposal reads/writes through `can()` with resource facts                                                                                                                                                                | CFP b (#2078)                                 | Same rules as S2 today; cross-reader test against `proposal.ts:921-960`                 |
| 4     | Volunteer and sponsor contact as identity users with tuples; bearer links stay as a fallback for existing invitations                                                                                                                                | tickets / sponsors phases                     | Token links keep working until expiry                                                   |
| 5     | Retire: `organizers[]` as authz source, member-sync cron, `withLiveOrganizerRights`, `PLATFORM_ORG_ID`, global `isOrganizer`, `adminProcedure` as a single waist                                                                                     | settings phase 5, Platform 6                  | Each removed after its replacement ran one clean week                                   |

## 6. Future-proofing

- **Custom roles per org.** Policy maps action → set of relations. A custom role is a row
  `(org_id, name, actions[])` plus a tuple `conference#role:<name>`; `can()` adds one
  lookup in the claims. Trigger: the first paying org asks for a role the matrix lacks.
- **More tenants.** Nothing scales with tenant count: checks are per request, one indexed
  query. `relation_tuple` grows with people × editions (thousands of rows).
- **SpiceDB / OpenFGA swap.** The store sits behind one function used by the gateway:
  `principal(userId, orgId, conferenceId) → { orgRole, platformOperator, conferenceRoles }`
  plus `grant/revoke`. Tuples already have the `object#relation@user` shape, and §3.2 is a
  direct schema (`definition conference { relation organizer: user; permission review =
reviewer + organizer + org->admin }`). The swap replaces `principal()` and `grant/revoke`;
  `can()` keeps reading claims. Resource facts move only if we choose to mirror them.
  Trigger: relations deeper than three levels, usersets/groups, or reverse queries
  ("everything this user can see") that SQL handles badly. Cost: a hosted service and a
  hop on every request, which Workers Free cannot hide.
- **Cedar as policy-as-data.** `can()`'s signature (principal, action, resource with
  attributes) is Cedar's. If org admins need to edit policy, or policies must be reviewed
  outside code, the `Record<Action, Rule>` can be compiled from Cedar (WASM in Workers).
  Trigger: custom roles with conditions, or an auditor asking for policies as data.
- **Not built now (YAGNI).** Usersets/groups (trigger: teams that grant as a unit; Sanity
  `teams[]` moving, settings phase 5); reverse-lookup API (trigger: "my conferences" across
  orgs for non-members); authz cache (trigger: `principal()` p95 > 10 ms); field-level ACLs
  (trigger: a column readable by a role that may not read its row); delegated operator
  roles (support vs superuser; trigger: a second operator who should not provision);
  per-org secrets store (#2098, its own design).

## 7. Fit with the trajectory

This **follows** the accepted plan: `api.konf.app` stays the only door and the only
enforcer; identity D1 stays the source for memberships (DATA_OWNERSHIP.md:72, 90); Sanity
`organizers[]` retires in phase 5 as already planned; #1907's "organizers are admin" stands
for existing people; #2022's three layers map to `profile#owner`, `talk#speaker` and
conference roles.

It **departs** in three places, each needing a decision or an issue:

1. A new table and new roles (per-conference organizer, reviewer) that no accepted
   document names. Needed by CFP c (#2079); without it reviewers must be org admins.
2. The site stops being an authorization source of its own (phase 2) earlier than
   next-auth retirement would force; this is what closes gaps 1–3.
3. `site:server` loses its trust for operator-only writes (phase 2b).

New milestone recommended: **Platform 7: Authorization** (phases 1–2b), with CFP b/c
carrying phases 3–3b. Issues to file: phase 1 (`can()` + parser), 1b (flip
`MEMBER_SOURCE_ORGS`), 2 (site reads identity roles; split per surface), 2b, 3
(`relation_tuple`), operator audit table, and a doc fix for `CONTROL_MODEL.md:3`.

## 8. Open decisions for the owner

1. **What is an org `member`?** (a) read-only insider: drafts and settings, no PII, no
   directory (today's C2/D2 behaviour, plus #2097); (b) nothing beyond "belongs to the org".
   _Recommend (a)_: it matches current code and needs no change.
2. **Close the revocation gap now?** (a) flip all orgs to identity-source after zero drift
   (phase 1b); (b) make the sync delete; (c) wait for phase 5. _Recommend (a)_: one env
   change, no new code path that deletes members.
3. **Per-conference organizer.** (a) add `conference#organizer` for new helpers, keep
   existing admins; (b) everyone stays org admin. _Recommend (a)_, needed for CFP c.
   Sub-decisions ★: may an organizer edit settings, set lifecycle, grant roles?
   _Recommend_: settings yes, lifecycle no, grant reviewer/volunteer only.
4. **Site operator source.** (a) identity `platformOperator` everywhere, retire
   `PLATFORM_ORG_ID`; (b) keep both. _Recommend (a)_.
5. **Vendor binding.** (a) operator-only until #2098 ships per-org credentials, then admins
   bind in their own account; (b) admins now. _Recommend (a)_; this is #745's rule.
6. **Review process.** Blind until the reviewer has scored (★ `proposal.read_reviews`),
   reviewers see only assigned proposals or all of the conference, operators never score.
   _Recommend_: blind until scored; all proposals of the conference unless the organizer
   assigns; operators read-only.
7. **Who may erase a person (GDPR) and read attendee PII.** Today any organizer. _Recommend_:
   erase = owner/admin/operator; attendee PII = admin and conference organizer; volunteers
   get check-in lookups only, never the export.
8. **Speaker edits after acceptance** (★ `proposal.edit`). _Recommend_: bio and links
   always (profile, #2022); title and abstract until the program is published, then via
   the organizer.
9. **Speaker directory for per-conference organizers** (★). #2097 limits it to owner/admin.
   _Recommend_: keep owner/admin until someone asks.
10. **Evaluation model** (§3.4). _Recommend_ C: org and conference roles as envelope
    claims, resource facts local, no per-check RPC.
