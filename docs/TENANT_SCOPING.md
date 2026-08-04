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
| `unscoped`             | `` `*[_type == "x" && …]` `` or `` `*[_id == $id …]` `` with no tenant predicate           | reads every tenant                                                                                                         |
| `interpolatedFilter`   | `` `*[${filter}]` `` — the root predicate STARTS with an interpolation                     | the scoping is invisible to review and to the rule; several leaks shipped in this shape                                    |
| `optionalTenantFilter` | `!defined($conferenceId) \|\| conference._ref == $conferenceId`, or `!defined(conference)` | a CONDITIONAL tenant predicate: no key ⇒ every tenant, and tenant-less documents leak to everyone (the gallery leak, #616) |
| `nullScope`            | `scopedFetch(client, { orgId: null }, …)`                                                  | the callee looks scoped, but a null tenant key makes the builder drop the predicate                                        |

### What the root-filter patterns match

Both parts matter, and both were once wrong (#676):

- **Whitespace.** `*[`, `* [` and `*  [ ` are the same GROQ. The patterns were
  once anchored on the literal two characters `*[`, so a spaced root filter
  matched nothing and was reported clean — which is how the cross-tenant staff
  queries in #675 were written. All three patterns now use `\*\s*\[`.
- **`_id ==` as well as `_type ==`.** A document id is a **dataset-wide key**, so
  a by-id read is not self-scoping: a client-supplied id resolves documents in
  any tenant. The rule once required `_type ==` and never examined `_id` at all.
  It now matches `_id ==` too, which is why the by-id reads in this repo carry an
  explicit `groq-global:` / `groq-global-scoped:` note saying what constrains
  them. Note the narrowness: **`_id ==` is closed, the `_id` _class_ is not** —
  `_id in $ids` is still invisible (see below).

### Known gaps — what the rule still cannot see

The patterns are a syntactic first-token match, not a GROQ parser. Everything
below is a shape that runs across every tenant and is reported **clean**. Each
is verified by probe, not assumed.

| Shape                                           | Example                                                                            | Why it slips                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| `_type` / `_id` not first                       | `` `*[defined(foo) && _type == "x"]` ``                                            | pattern anchors on the token right after `[`       |
| reversed comparison                             | `` `*["x" == _type]` ``                                                            | pattern expects the field on the left              |
| non-`==` operators                              | `` `*[_type match "x*"]` ``, `` `*[_type in ["a","b"]]` ``, `` `*[_id in $ids]` `` | pattern requires `==`                              |
| other opening fields                            | `` `*[references($x)]` ``, `` `*[slug.current == $slug]` ``                        | neither `_type` nor `_id`                          |
| nested roots in a projection                    | `` `*[_type == "a"]{ "x": *[_type == "b"] }` ``                                    | only the first root filter is examined — see below |
| a root filter split across string concatenation | `"*" + "[_type == \"x\"]"`                                                         | each literal is checked on its own                 |

**Nested roots, in detail.** The scan reports the FIRST root filter its pattern
matches and stops, so a nested root is examined only when no _earlier_ root
filter matched — e.g. under an invisible outer `*[slug.current == …]`. Two
consequences follow from the fact that "is this inside `scopedFetch`" and "is
this suppressed" are decided **once for the whole literal**:

- `scopedFetch` prepends its predicate into the first `*[` only, so a nested root
  inside a scoped body runs **unscoped at runtime** while the rule stays silent;
- an outer `// groq-global-scoped:` silently covers nested roots it never
  vouched for.

Measured: **26 literals in `src/` carry 37 such nested roots**, none of which the
rule examines.

**The live census.** Scanning every string and template literal in `src/`
(excluding tests and stories) for root filters the `unscoped` pattern cannot
match yields **9 rule-invisible sites** — all inbound-reference or by-id-set
reads, and **none dangerous today**:

- `src/server/tenancy.ts` 197, 324, 419, 423, 463 — the tenant guard machinery
  itself. 197/419/423/463 already carry an explicit `$conferenceId` / `$orgId`
  predicate the pattern simply cannot parse; 324 is deliberately cross-tenant
  (it counts OTHER tenants' inbound refs in order to refuse a destructive op).
- `src/lib/speaker/merge.ts` 664 (`references($loserId)`), 681 (`_id in $ids`) —
  both ids pass `requireSpeakerInCurrentOrg` at the tRPC entry points, and 681's
  ids are derived from 664's result, not from input.
- `src/lib/proposal/data/sanity.ts` 406 — inbound-reference enumeration before a
  delete; projects `{ _id, _type }` only, never tenant data.
- `src/lib/gallery/sanity.ts` 572 — `count(*[references($assetId)])`, an
  is-this-asset-still-used probe that returns a number and must see all refs.

That list is the thing to re-derive when the rule changes; an unquantified "there
are gaps" caveat is not actionable, a named set of 9 is. Interpolated bodies
(`` `*[${…}]` ``) are **not** in it — those are caught by `interpolatedFilter`.

Closing the nested-root gap needs per-root-filter suppression and reporting (a
rule redesign) plus an audit of all 37 sites; it is tracked as a characterization
test in `eslint-rules/no-unscoped-groq.test.ts` so a future fix flips a
documented expectation rather than changing behaviour silently.

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

The practical consequence: for a query that starts on a **later line than its
statement** — the common `await client.fetch<T>(` + query-on-the-next-line shape
— the annotation goes _inside the call, immediately above the query_, not above
the `const`. Above the `const` the walk hits the `await client.fetch<T>(` opener,
which is code, and stops. The rule keeps warning when you get this wrong, so a
misplaced annotation is loud rather than silent.

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
