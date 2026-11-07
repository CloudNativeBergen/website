# Authorization Design: Fine-Grained Relations & Decentralized Checks

## 1. Current State & Disagreements

Authorization is split across three disconnected layers:

1. **Gateway (`api/src/gateway.ts`)**: Resolves tenant from Origin, verified site assertion (`api/src/gateway.ts:532`), or operator header (`api/src/gateway.ts:544`). It verifies identity JWTs (`api/src/gateway.ts:594`), queries live membership via RPC `MEMBERSHIP.principal(userId, orgId)` (`api/src/gateway.ts:622, 670` -> `services/identity/src/data/index.ts:164`), and mints an EdDSA-signed `Envelope` (`api/src/gateway.ts:661, 686`). Scopes: `platform:operator` (`api/src/gateway.ts:107`) and `site:server` (`api/src/gateway.ts:114`).
2. **Workers Subgraphs**:
   - `packages/tenancy/src/index.ts:129, 177`: `requireTenant` and `ScopedRepository` enforce tenant/org boundaries.
   - `services/conference/src/data/index.ts:23, 96-105`: Hardcodes `WRITERS = Set(['owner', 'admin'])`. Rejects org `member`. Ticketing event changes require `OPERATOR_SCOPE` or `SITE_SCOPE` (`index.ts:124`), reminder locks require either scope (`index.ts:182`). Unpublished editions are hidden unless the caller has `orgRole` (`index.ts:65, 78`).
   - `services/identity/src/subgraph.ts:27-77`: Better Auth roles (`owner`, `admin`, `member`, `services/identity/src/data/auth.ts:32`). Reading member emails/invites requires `manager` (`owner`, `admin`, or operator, `subgraph.ts:75`). Cancelling/resending owner invites requires `owner` (`auth.ts:211, 301`). Last-owner trigger prevents orphaned orgs (`auth.ts:269`).
   - `services/tenant-directory/src/subgraph.ts:14, 28, 111`: `requirePlatform` protects provisioning; `sessionOrgId` and `ConferenceEdition` filter non-live editions unless caller has `orgRole` or operator scope.
3. **Site tRPC (`src/server`)**:
   - Reads NextAuth session carrying `speaker.organizerOrgIds` populated from Sanity `conference.organizers[]` (`src/lib/authz/organizer.ts:8-13`).
   - `adminProcedure` (`src/server/trpc.ts:217-237`) restricts access via `isOrganizerForOrg` (`src/lib/authz/organizer.ts:48`).
   - `isPlatformOperator` checks membership in `PLATFORM_ORG_ID` (`src/lib/authz/platform.ts:58-80`).
   - All admin actions collapse into `adminProcedure`: proposal scoring (`src/server/routers/proposal.ts:2774`), schedule edits (`src/server/routers/schedule.ts:68`), volunteer actions (`src/server/routers/volunteer.ts:475`), sponsor CRM (`src/server/routers/sponsor.ts:1171`), and ticket attendee PII export (`src/server/routers/tickets.ts:756`). Proposal reviews are shown if `isOrganizer` (`proposal.ts:927`). Speaker talk edits use `organizerProcedure`, allowing self-edits while CFP is open (`proposal.ts:1117-1160`).

### Disagreements & Duplication

- **Identity source of truth**: Better Auth `member` rows in identity D1 (`services/identity/src/data/schema.ts:32`) vs Sanity `conference.organizers[]` (`src/lib/authz/organizer.ts:8`). An hourly cron projects Sanity into D1 (`services/identity/src/data/member-sync.ts:168`).
- **Platform operator representation**: D1 column `user.platformOperator` (`services/identity/src/data/auth.ts:117`) vs env `PLATFORM_ORG_ID` matched against session arrays (`src/lib/authz/platform.ts:58`).
- **Coarse vs fine boundaries**: Conference D1 distinguishes `owner`/`admin` from `member` (`services/conference/src/data/index.ts:23`), while site tRPC collapses reviewer, schedule planner, volunteer manager, sponsor CRM, and attendee PII access into a single `adminProcedure` flag (`src/server/trpc.ts:217`).
- **Duplicate ticketing guards**: Ticketing event rebinds are gated in tRPC by `isPlatformOperator` (`src/server/routers/conference.ts:636`) and re-checked in conference D1 via `SITE_SCOPE` (`services/conference/src/data/index.ts:124`).

## 2. Proposal: Zanzibar-Shaped Relations & Local `can()`

### Schema & Org Role Strategy

Add a `relation_tuples` table to identity D1:

```sql
CREATE TABLE relation_tuples (
  namespace TEXT NOT NULL, object_id TEXT NOT NULL, relation TEXT NOT NULL,
  subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (namespace, object_id, relation, subject_type, subject_id)
);
CREATE INDEX idx_tuples_subject ON relation_tuples (subject_type, subject_id);
```

**Org roles are derived from Better Auth `member` rows**, not duplicated into tuples. Better Auth (`services/identity/src/data/auth.ts:261`) owns invitations, seat limits, last-owner database triggers, and audit logging on `member`. Duplicating org roles into tuples would introduce dual-write race conditions. Per-conference relations (`organizer`, `reviewer`, `volunteer`, `accepted_speaker`, `sponsor_contact`) and resource bindings live as tuples in `relation_tuples`.

### The `can()` Engine in `@runkonf/tenancy`

A pure TypeScript helper evaluated in subgraphs:
`can(envelope: Envelope, action: Action, target?: TargetResource): boolean`

Policy is defined in typed code mapping actions to relation sets with deterministic inheritance:

- **Org -> Conference -> Resource**: Org `owner`/`admin` inherits `conference:organizer` across all tenant conferences. Org `member` inherits base read.
- **Conference Relations**: `conference:organizer` inherits management of talks, schedule, shifts, and sponsors.
- **Resource Relations**: `talk:speaker` inherits `edit_own_talk`; `sponsor:contact` inherits `view_sponsor_crm` (scoped to company); `volunteer` inherits `view_shifts`.
- **Operator**: `platformRole: 'operator'` or `platform:operator` scope grants audited platform actions.

### Gateway Envelope & Request Lifecycle

1. Gateway resolves tenant host and verifies identity JWT (`api/src/gateway.ts:532, 594`).
2. Gateway calls `MEMBERSHIP.principal(userId, orgId, conferenceId)` via RPC (`services/identity/src/index.ts:21`). A single D1 query selects the user's `orgRole` and joins active conference relations from `relation_tuples`. Overhead: 0 additional HTTP hops, <1ms in D1.
3. Envelope carries roles: `TenantEnvelope { typ: 'tenant', orgId, conferenceId, userId, orgRole, conferenceRoles: string[], scopes }`.
4. Downstream subgraphs evaluate `can()` entirely in-memory using envelope claims. Sub-resource checks (e.g. specific talk ownership) verify against resource rows in local D1 without remote calls.

## 3. Role / Permission Matrix

Default recommendations below. **Every cell marked with `*` requires owner confirmation.**

| Action                | Operator | Owner | Admin | Member | Organizer | Reviewer   | Volunteer | Accepted Speaker | Sponsor Contact |
| --------------------- | -------- | ----- | ----- | ------ | --------- | ---------- | --------- | ---------------- | --------------- |
| View conf settings    | Yes*     | Yes*  | Yes*  | Yes*   | Yes*      | Yes*       | Yes*      | Yes*             | Yes*            |
| Edit conf settings    | Yes*     | Yes*  | Yes*  | No*    | No*       | No*        | No*       | No*              | No*             |
| View proposals        | Yes*     | Yes*  | Yes*  | No*    | Yes*      | Assigned*  | No*       | No*              | No*             |
| Review proposals      | No*      | Yes*  | Yes*  | No*    | Yes*      | Yes*       | No*       | No*              | No*             |
| See other reviews     | Yes*     | Yes*  | Yes*  | No*    | Yes*      | Blind off* | No*       | No*              | No*             |
| Manage schedule       | Yes*     | Yes*  | Yes*  | No*    | Yes*      | No*        | No*       | No*              | No*             |
| View volunteer shifts | Yes*     | Yes*  | Yes*  | No*    | Yes*      | No*        | Own*      | No*              | No*             |
| Edit own talk         | No*      | Yes*  | Yes*  | No*    | Yes*      | No*        | No*       | Own (window)*    | No*             |
| View sponsor CRM      | Yes*     | Yes*  | Yes*  | No*    | Yes*      | No*        | No*       | No*              | Own tier*       |
| View attendee PII     | Yes*     | Yes*  | Yes*  | No*    | Yes*      | No*        | No*       | No*              | No*             |

## 4. Migration Strategy

Migrate iteratively without downtime:

1. **Phase 1: Table & RPC Addition**: Apply D1 migration for `relation_tuples` in `services/identity`. Update `MEMBERSHIP.principal` to return `conferenceRoles`. Existing callers ignore extra fields.
2. **Phase 2: Tenancy `can()` & Cross-Reader Test**: Implement `can()` in `packages/tenancy`. Add a shadow cross-reader middleware: run `can()` alongside existing `WRITERS` (`services/conference/src/data/index.ts:23`) and log discrepancies to Grafana (`authz.shadow.discrepancy`).
3. **Phase 3: Subgraph Cutover**: Switch `services/conference` and `services/identity` subgraphs to enforce `can()`.
4. **Phase 4: Site Router & tRPC Adaptation**: Create `requirePermission(action)` middleware in `src/server/trpc.ts`. Replace coarse `adminProcedure` in routers (`proposal.ts`, `schedule.ts`, `sponsor.ts`, `volunteer.ts`) with fine-grained checks.
5. **Phase 5: Retire Sanity Organizers**: Backfill Sanity `conference.organizers[]` into `relation_tuples` as `organizer` tuples. Decommission hourly `member-sync.ts` (`docs/DATA_OWNERSHIP.md:90`).

## 5. Architectural Trade-Offs: SpiceDB / OpenFGA & Cedar

- **Why not SpiceDB / OpenFGA now**:
  - SpiceDB and OpenFGA require dedicated persistent containers/VMs (Go daemon + Postgres/CockroachDB). Workers edge cannot host them.
  - Making an external network round-trip per authz check adds 30-80ms to edge subgraphs (Workers D1 takes <2ms).
  - Cost and complexity: hosting and operating a high-availability Zanzibar cluster for ~4 conferences is over-engineering.
  - **Compatibility guarantee**: The D1 schema uses standard Zanzibar `(namespace, object, relation, subject)` tuples. If scale warrants OpenFGA later, swapping `can()` to call OpenFGA is an internal adapter change with zero router refactoring.
- **Cedar-in-Workers alternative**: Cedar policies compiled to WebAssembly can evaluate in Workers. However, pure TypeScript policies in `@runkonf/tenancy` provide compile-time type safety, zero WASM overhead, simpler debugging, and standard unit tests.

## 6. Open Questions for the Owner

1. **Reviewer score visibility**: Should reviewers see other reviewers' scores before scoring?
   - _Recommendation_: **Blind review (No)**. Reviewers only see others' scores after submitting their own score to prevent score anchoring.
2. **Org Member default visibility**: Can an org `member` view unreleased draft editions and proposals?
   - _Recommendation_: **No**. Members see published conference settings, but unreleased drafts and proposal submissions require explicit `organizer` or `reviewer` relations.
3. **Speaker edit window**: Can accepted speakers edit their title/abstract after schedule publication?
   - _Recommendation_: **Restricted (approval required)**. Allow editing bio and links; title and abstract edits after schedule publication lock require organizer approval.
4. **Sponsor contact CRM boundary**: Can sponsor contacts see anything beyond their own company package?
   - _Recommendation_: **Strict isolation**. Sponsor contacts only access their own profile, assets, and claimed discount passes; internal CRM pipelines remain organizer-only.
5. **Volunteer PII boundary**: Do volunteer leads get ticket attendee lists?
   - _Recommendation_: **No**. Volunteers access shift rosters only; attendee and ticket PII stays strictly restricted to organizers.
