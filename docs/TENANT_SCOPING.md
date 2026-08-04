# Tenant-Scoped Query Invariant (CaaS #616)

This is a Conference-as-a-Service (CaaS) platform: one deployment serves many
tenants. A **tenant** is an [`organization`](./ORGANIZATION_TIER.md); each
conference belongs to exactly one organization, and most content (talks,
conversations, notifications, schedules, sponsors, …) belongs to exactly one
conference and thus one organization. The current tenant is resolved per request
from the `Host` header (`getConferenceForCurrentDomain`) — never from a client
parameter.

**The invariant:** every read that returns tenant-owned documents MUST be
constrained to a single tenant. A GROQ root filter that returns tenant documents
without a `conference._ref` / `organization._ref` predicate is a cross-tenant
leak — it can surface one organization's data on another's surface.

This document defines the builder that expresses scoping one way, the lint rule
that keeps new unscoped queries visible, the suppression convention for
deliberately-global reads, and the playbook for migrating the ~230 pre-existing
unscoped queries incrementally.

> Scoping is a **correctness** invariant, not a security boundary. Document-level
> security (reference-blind read denial) is a separate wave (#614). Scoping keeps
> one tenant's data out of another tenant's lists; it does not by itself stop a
> determined caller from crafting a cross-tenant query.

## The two dimensions

| Predicate constant  | GROQ                               | Applies to types carrying…  |
| ------------------- | ---------------------------------- | --------------------------- |
| `CONFERENCE_FILTER` | `conference._ref == $conferenceId` | a `conference` reference    |
| `ORG_FILTER`        | `organization._ref == $orgId`      | an `organization` reference |

Conference scope is the common case (talks, conversations, notifications,
schedules). Organization scope is for the **global tenant-scoped types** that
have no conference parent (speaker membership, topic, staff, sponsor) — see
[Organization Tier](./ORGANIZATION_TIER.md). Some reads compose both.

## The builder — `src/lib/sanity/scoped.ts`

A small, typed API. The design is **incremental**: existing raw queries keep
working untouched; the builder is opt-in and the invariant is enforced by lint,
not at runtime.

### `scopedFetch(client, scope, groqBody, params?, options?)`

Runs a tenant-scoped read. It **prepends** the scope predicate into `groqBody`
(right after the root `*[`) AND **merges** the scope bindings into `params`, so
the tenant is named ONCE and a `$conferenceId` / `$orgId` can never be referenced
without being bound.

```ts
import { scopedFetch } from '@/lib/sanity/scoped'

// Body is written WITHOUT the conference predicate or the $conferenceId binding.
const count = await scopedFetch<number>(
  clientReadUncached,
  { conferenceId },
  `count(*[_type == "notification" && recipient._ref == $speakerId && !defined(readAt)])`,
  { speakerId },
)
// Runs: count(*[conference._ref == $conferenceId && _type == "notification" && …])
//       with params { speakerId, conferenceId }
```

- `scope`: `{ orgId?, conferenceId? }`. Present dimensions are prepended (conference
  first, then org) and bound; absent/`null` dimensions contribute nothing. An
  **empty** scope (both absent/null) **throws** — an unresolvable tenant must fail
  closed, never widen to a global read. Resolve the tenant first and handle the
  null case explicitly. (The pure `scopedQuery` string helper still returns the
  body unchanged; only the IO entry point enforces this.)
- Scope bindings **win** over caller params of the same name — the scope is the
  invariant.
- `options` is forwarded verbatim (e.g. `{ cache: 'no-store' }`).
- Works for `count(*[…])` too: the predicate is injected into the first `*[`.
- Throws only when `groqBody` has no `*[` root filter — a programming error.

### Predicate constants for hand-written queries

When a query is too dynamic for `scopedFetch`'s single-body prepend (multiple
composed predicates, per-view `count()` projections), compose the constant by
hand:

```ts
import { CONFERENCE_FILTER } from '@/lib/sanity/scoped'

const base = `_type == "conversation" && ${CONFERENCE_FILTER}`
// … build the rest of the filter, then bind { conferenceId } yourself.
```

`scopePredicate(scope)` and `scopeParams(scope)` are also exported for building
the predicate string / param object independently, and `scopedQuery(scope, body)`
for the pure string transform (both are unit-tested).

## The lint rule — `tenancy/no-unscoped-groq`

A local flat-config rule (`eslint-rules/no-unscoped-groq.js`, registered in
`eslint.config.js`) flags four fail-open GROQ shapes in `src/**`:

| messageId              | Shape                                                                                      | Why                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `unscoped`             | `` `*[_type == "x" && …]` `` with no tenant predicate                                      | reads every tenant                                                                                                         |
| `interpolatedFilter`   | `` `*[${filter}]` `` — the root predicate STARTS with an interpolation                     | the scoping is invisible to review and to the rule; several leaks shipped in this shape                                    |
| `optionalTenantFilter` | `!defined($conferenceId) \|\| conference._ref == $conferenceId`, or `!defined(conference)` | a CONDITIONAL tenant predicate: no key ⇒ every tenant, and tenant-less documents leak to everyone (the gallery leak, #616) |
| `nullScope`            | `scopedFetch(client, { orgId: null }, …)`                                                  | the callee looks scoped, but a null tenant key makes the builder drop the predicate                                        |

**Severity is `warn`, deliberately.** The repo carries ~230 pre-existing unscoped
queries; an error would block CI. Warn makes NEW unscoped queries visible in
review and keeps the outstanding count trackable as sites migrate. A warn-level
rule does **not** fail `mise run check` (`eslint` exits 0 with only warnings).

A query is **not** flagged when:

1. **It is passed to `scopedFetch(...)`.** The literal sits inside a `scopedFetch`
   call (direct or member form) whose scope is not explicitly `null`; the tenant
   predicate is prepended at runtime, so the body legitimately omits it. Prefer
   passing the body **inline** to `scopedFetch` so the rule recognizes it (a body
   hoisted to a `const` and passed by variable is not recognized). This exemption
   does **not** cover `optionalTenantFilter` — a fail-open predicate inside the
   body is not undone by a prefix.
2. **It carries a bound tenant `references()`.** A root filter containing
   `references($conferenceId)`, `references($orgId)` or
   `references($organizationId)` constrains the read to that tenant exactly as
   `conference._ref == $conferenceId` does. Only those tenant parameter names
   count — `references($speakerId)` or `references(someVar)` still flags — and
   only for the `unscoped` shape: inside an interpolated filter the injected text
   can escape the bracket, so a visible `references()` proves nothing about the
   query that actually runs.
3. **It carries an annotation** — `// groq-global:` or `// groq-global-scoped:`,
   see below.

**Allowlisted paths** (never flagged): the builder module itself
(`src/lib/sanity/scoped.ts`), `migrations/**`, `scripts/**`, `__tests__/**`, and
`*.test.*` / `*.spec.*` files. The `scripts/**` exemption is a known gap — those
run with the WRITE token — but the cross-tenant reporting scripts are global by
design, so tightening it needs per-script `groq-global` annotations first.

### Annotation vocabulary — two markers, deliberately distinct

| Marker                         | Claim                                                                   | Use for                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `// groq-global: <reason>`     | "this read IS cross-tenant, and that is correct"                        | host → conference routing, the tenant registry, the global identity join (#615), platform aggregates, cron sweeps     |
| `// groq-global-scoped: <how>` | "this read is tenant-scoped, but through something the rule cannot see" | a predicate carried in a variable, a scope applied by a helper, a caller-side authz gate, a point read by a server id |

```ts
// groq-global: cross-tenant identity join — a returning global person must
// resolve regardless of which org they first belonged to (#615).
groq`*[_type == "speaker" && (lower(email) in $emails || …)] …`

// groq-global-scoped: point read by an id resolved server-side; the caller
// (`loadManageableConversation`) asserts isOrganizerForOrg + canAccessConversation.
groq`*[_type == "conversation" && _id == $id][0]`
```

**Why two markers.** Annotating a scoped-but-invisible query `groq-global:` is a
lie, and it drowns the small set of genuinely cross-tenant reads — the set a
human must periodically re-audit — in a much larger set of ordinary scoped ones.
They are independently greppable, because in `groq-global-scoped` the colon is
not adjacent to `groq-global`:

```
rg 'groq-global:'         # the reviewed-cross-tenant set — audit this one
rg 'groq-global-scoped:'  # the scoped-but-invisible set
```

**Both require a non-empty reason.** A bare `// groq-global:` suppresses nothing.
If you find yourself annotating a per-tenant list `groq-global:`, scope it
instead.

**What each marker clears.** `groq-global-scoped:` clears `unscoped` and
`interpolatedFilter` — the two "the rule cannot see the scope" shapes. It does
**not** clear `optionalTenantFilter` or `nullScope`: there the rule _can_ see the
scoping and can see it fail open, so "it is scoped" would be a false claim. Only
an explicit reviewed-global `groq-global:` silences those.

**Placement.** The marker may sit anywhere in the comment block directly above
the query, or trailing on the query's own line. It does **not** have to be the
last comment line — that used to be the requirement, and multi-line annotations
carrying the marker on their first line silently did nothing (four such
annotations sat quietly ineffective in this repo). Blank lines between the block
and the query are skipped; a line carrying **code** is a hard stop, so a marker
separated from the query by a statement does not suppress, and neither does one
placed below it.

## Migration playbook

Do NOT big-bang the ~230 sites. Migrate opportunistically — when you touch a
module, scope its queries — and in themed passes (one router / lib module at a
time). For each unscoped query:

1. **Identify the tenant dimension.** Does the type carry a `conference` ref
   (most content) or only an `organization` ref (global tenant-scoped types)? Both?
2. **Resolve the scope** in the caller: `conferenceId` from
   `getConferenceForCurrentDomain()` / `resolveConferenceId()`; `orgId` from
   `getOrganizationRefForCurrentConference()` / `resolveOrganizationId()`. Both
   resolvers can return null (unknown host, transient read). **A null scope must
   FAIL CLOSED** — return empty, or throw — never fall back to a global read.
   `getConferenceForDomain` returns a truthy `{} as Conference` on an unknown
   host, so guard with `isUnknownHost()` (or `resolveConferenceId()`, which
   throws); a bare `if (!conference)` never fires and leaves the scope
   `undefined`.
3. **Rewrite the read** with `scopedFetch` (drop the `conference._ref` /
   `organization._ref` predicate and its binding from the body — the builder adds
   them), OR, for dynamic queries, compose `CONFERENCE_FILTER` / `ORG_FILTER` by
   hand.
4. **Prefer inline bodies** so the lint rule recognizes the migration and the
   warning clears.
5. **If the query is genuinely global,** annotate `// groq-global: <reason>`
   instead of scoping. **If it is already scoped but the rule cannot see how,**
   annotate `// groq-global-scoped: <how>` and name the mechanism — never reach
   for `groq-global:` there.
6. **Track progress** by watching the warn count fall:
   `rtk pnpm exec eslint . 2>&1 | grep -c tenancy/no-unscoped-groq`.

### Migrated exemplars (the pattern)

- `src/lib/notification/sanity.ts` — `getUnreadCount`, `getNotificationsForSpeaker`,
  `markAllRead` (conference-scoped, inline bodies incl. cursor + clamped slice).
- `src/lib/schedule/sanity.ts` — `getValidTalkIds`, the duplicate-day guard lookup.
- `src/lib/messaging/retention.ts` — per-conference conversation sweep.
- `src/lib/messaging/sanity.ts` — `getConversationViewCounts` uses the
  `CONFERENCE_FILTER` constant (the hand-written path for a dynamic multi-predicate
  query).

## Speaker identity is the deliberate exception (#615)

The login identity resolution (`findSpeakerByProvider`, `findSpeakersByEmails` in
`src/lib/speaker/sanity.ts`) is **intentionally global**: a speaker is a global
person, and a returning speaker from another org's conference must resolve to
their existing account. These queries carry `// groq-global:` annotations. Org
**membership** (`speaker.organizations[]`) accrues per login, and org-scoping is
applied to the ADMIN-facing speaker lists/search instead (see
`SPEAKER_ORG_FILTER` and `getSpeakers` / `getOrganizers`). See
[Organization Tier](./ORGANIZATION_TIER.md).
