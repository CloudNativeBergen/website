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
that keeps unscoped reads visible, the suppression convention for
deliberately-global reads, and the playbook for migrating the remaining unscoped
reads incrementally.

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
`eslint.config.js`) **parses** every GROQ literal in `src/**` with `groq-js` and
asks, **per root filter**, whether that root is bound to a tenant. The judgement
itself lives in `eslint-rules/groq-scope-engine.js`, which takes the scoping
vocabulary as options so `RunKonf/kontroll` — same dataset, different contract —
can configure the same engine.

Per-root is the load-bearing word. A literal with three root filters gets three
verdicts, three positions and three independent suppression decisions.

| messageId              | Shape                                                                                      | Why                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `unscoped`             | a root filter with no tenant predicate — including a bare `*` (`count(*)`, `*{…}`)         | reads every tenant                                                                                                         |
| `interpolatedFilter`   | a root filter whose predicate contains a `${…}`                                            | the text under review is not the text that runs, and injected text can escape the bracket                                  |
| `optionalTenantFilter` | `!defined($conferenceId) \|\| conference._ref == $conferenceId`, or `!defined(conference)` | a CONDITIONAL tenant predicate: no key ⇒ every tenant, and tenant-less documents leak to everyone (the gallery leak, #616) |
| `nullScope`            | `scopedFetch(client, { orgId: null }, …)`                                                  | the callee looks scoped, but a null tenant key makes the builder drop the predicate                                        |
| `unparseable`          | a literal that looks like GROQ but does not parse                                          | the roots cannot be enumerated, so the rule fails CLOSED rather than passing text it cannot read                           |

### What counts as scoped

A predicate is judged recursively — which is exactly "every alternative must
carry a tenant predicate":

```
scoped(a || b) = scoped(a) AND scoped(b)
scoped(a && b) = scoped(a) OR  scoped(b)
scoped(leaf)   = leaf is one of the forms below
```

| #   | Form (either operand order)                          | Example                                   |
| --- | ---------------------------------------------------- | ----------------------------------------- |
| T1  | `<tenant-field>._ref == $tenant-param`               | `conference._ref == $conferenceId`        |
| T2  | `<tenant-field>._ref in $tenant-param-plural`        | `conference._ref in $conferenceIds`       |
| T3  | a deref traversal ending in T1/T2                    | `conference->organization._ref == $orgId` |
| T4  | `$tenant-ref in <array-field>[]._ref`                | `$orgRef in organizations[]._ref`         |
| T5  | `references($tenant-param)`                          | `references($conferenceId)`               |
| T6  | parent correlation, nested roots under a SCOPED root | `conference._ref == ^.conference._ref`    |

Tenant fields are `conference` and `organization`; tenant params are
`$conferenceId`, `$orgId`, `$organizationId`, `$organisationId` and their
plurals. **The names are the contract**: `conference._ref == $someId` still
flags. T2 carries a caller obligation — the rule checks that the SET is a bound
tenant parameter, not that every id in it is proven.

A predicate in a **chained** filter counts too (`*[_type == "x"][conference._ref
== $conferenceId]`); a filter on a non-root (`items[conference._ref == …]` in a
projection) does not — it constrains the sub-list, not the read.

### Deliberately not recognised

These are not gaps to be closed later. Each is a case where the query text does
not, on its own, bound the read — so an honest annotation naming the real
mechanism (or a refactor) is the answer.

- **`_id == $id` point reads.** A document id is a dataset-wide key; ownership
  proof lives at the caller, which a lint rule cannot see. This is the bulk of
  the honest residue. Recognising caller names by string would be provenance
  theater.
- **Predicates carried in interpolations or variables**, outside `scopedFetch`.
  A visible `conference._ref == $conferenceId` next to a `${…}` proves nothing:
  the injected text can escape the bracket.
- **`!=` in any position.** Excluding one tenant is the opposite of scoping.
- **Non-tenant `references()`**, `slug.current == $slug`, `_type` filters, date
  filters.
- **Any tenant predicate under a disjunct that lacks one** — see the recursion
  above.
- **A root filter split across string concatenation** (`"*" + "[_type == …]"`).
  Zero occurrences today; closing it would need cross-expression string-flow
  analysis.
- **Caller-side guards, session-derived ids, bearer secrets.** Real mechanisms,
  invisible to a lint rule. That is what the annotation vocabulary is for, and an
  honest annotation is a human judgement per site.

### What the rule does NOT check — parameter provenance

The rule checks predicate **shape**, not where `$conferenceId` was bound from.
A query reading `conference._ref == $conferenceId` with a **client-supplied** id
reports clean — that was the actual bug in #826. Provenance belongs to the authz
waist (`ctx.orgId`, `scopedFetch`, `resolveConferenceId`). A clean lint run is
not proof of authorization.

### How the rule reads a template literal

Every `${…}` is replaced by a placeholder that parses — a parameter, a bare
attribute, a number, a quoted string, a predicate tail, a projection or a slice —
chosen per hole. Reusable **fragments** (a projection field list, a `&& …`
predicate tail) are wrapped so they become whole queries. Parameterised slice
bounds (`[0...$limit]`), which `groq-js` rejects and Sanity accepts, are rewritten
to constants without moving a single offset.

If nothing parses, the literal is reported `unparseable`. It is never passed
silently: a query the rule cannot read is a query nobody has checked.

**Severity is `warn`, deliberately.** The repo carries a tail of pre-existing
unscoped reads whose ownership check lives at the caller; an error would block
CI. Warn makes NEW unscoped queries visible in review and keeps the outstanding
count trackable. A warn-level rule does **not** fail `mise run check` (`eslint`
exits 0 with only warnings).

A root filter is **not** flagged when:

1. **The builder scopes it.** `scopedQuery` splices its predicate at the FIRST
   `*[` and parenthesises what was there, so exactly that root is credited. Every
   other root in the same literal — nested or not — is judged on its own, because
   the builder never touched it. Pass the body **inline** to `scopedFetch`; a body
   hoisted to a `const` and passed by variable is not recognised. This exemption
   does not cover `optionalTenantFilter`: a fail-open predicate inside the body is
   not undone by a prefix.
2. **It carries a tenant predicate** — any of T1–T6.
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

**What each marker clears.** `groq-global-scoped:` clears `unscoped`,
`interpolatedFilter` and `unparseable` — the "the rule cannot see the scope"
shapes. It does **not** clear `optionalTenantFilter` or `nullScope`: there the
rule _can_ see the scoping and can see it fail open, so "it is scoped" would be a
false claim. Only an explicit reviewed-global `groq-global:` silences those.

**Placement.** The marker may sit anywhere in the comment block directly above
the query, or trailing on the query's own line. It does **not** have to be the
last comment line. Blank lines between the block and the query are skipped; a
line carrying **code** is a hard stop, so a marker separated from the query by a
statement does not suppress, and neither does one placed below it.

The practical consequence: for a query that starts on a **later line than its
statement** — the common `await client.fetch<T>(` + query-on-the-next-line shape
— the annotation goes _inside the call, immediately above the query_, not above
the `const`. Above the `const` the walk hits the `await client.fetch<T>(` opener,
which is code, and stops. The rule keeps warning when you get this wrong, so a
misplaced annotation is loud rather than silent.

**An annotation governs ONE root.** The comment block above a literal governs the
literal's **first** root only. A nested root sits inside a template literal, where
no JS comment can reach it, so it cannot be annotated at all — it is cleared by
giving it a tenant predicate, correlating it to a scoped parent
(`conference._ref == ^.conference._ref`), or hoisting it into its own scoped read.
That is deliberate: an outer annotation used to vouch for nested roots nobody had
reviewed.

## Migration playbook

Do NOT big-bang it. Migrate opportunistically — when you touch a module, scope
its queries — and in themed passes (one router / lib module at a time). For each
unscoped root filter:

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
   `rtk pnpm exec eslint . 2>&1 | rg -c tenancy/no-unscoped-groq`. The count is
   per ROOT FILTER, so one literal can contribute several — and clearing a
   literal's outer root does not clear a nested one.

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
