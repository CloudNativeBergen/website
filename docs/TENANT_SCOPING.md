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
  **empty** scope returns the body unchanged — a best-effort degrade so a request
  path with an unresolvable tenant reads globally rather than throwing.
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
`eslint.config.js`) flags GROQ root filters written as `*[_type == …` string or
template literals in `src/**`.

**Severity is `warn`, deliberately.** The repo carries ~230 pre-existing unscoped
queries; an error would block CI. Warn makes NEW unscoped queries visible in
review and keeps the outstanding count trackable as sites migrate. A warn-level
rule does **not** fail `mise run check` (`eslint` exits 0 with only warnings).

A query is **not** flagged when:

1. **It is passed to `scopedFetch(...)`.** The literal sits inside a `scopedFetch`
   call (direct or member form); the tenant predicate is prepended at runtime, so
   the body legitimately omits it. Prefer passing the body **inline** to
   `scopedFetch` so the rule recognizes it (a body hoisted to a `const` and passed
   by variable is not recognized).
2. **It is annotated `// groq-global: <reason>`** on the same line as, or the line
   directly above, the query opener.

**Allowlisted paths** (never flagged): the builder module itself
(`src/lib/sanity/scoped.ts`), `migrations/**`, `scripts/**`, `__tests__/**`, and
`*.test.*` / `*.spec.*` files.

### Suppression convention — reviewed-global queries

Some reads are intentionally global and must stay that way. Annotate them:

```ts
// groq-global: cross-tenant identity join — a returning global person must
// resolve regardless of which org they first belonged to (#615).
groq`*[_type == "speaker" && (lower(email) in $emails || …)] …`
```

Use `// groq-global:` only for genuinely cross-tenant reads: the login identity
join (a speaker is a **global** person), platform-wide aggregates, and admin
tooling that operates across tenants by design. Every suppression must carry a
reason. If you find yourself suppressing a per-tenant list, scope it instead.

## Migration playbook

Do NOT big-bang the ~230 sites. Migrate opportunistically — when you touch a
module, scope its queries — and in themed passes (one router / lib module at a
time). For each unscoped query:

1. **Identify the tenant dimension.** Does the type carry a `conference` ref
   (most content) or only an `organization` ref (global tenant-scoped types)? Both?
2. **Resolve the scope** in the caller: `conferenceId` from
   `getConferenceForCurrentDomain()` / `resolveConferenceId()`; `orgId` from
   `getOrganizationRefForCurrentConference()`. Both resolvers are best-effort and
   may be null pre-backfill — pass what you have; an empty scope degrades to the
   prior global read.
3. **Rewrite the read** with `scopedFetch` (drop the `conference._ref` /
   `organization._ref` predicate and its binding from the body — the builder adds
   them), OR, for dynamic queries, compose `CONFERENCE_FILTER` / `ORG_FILTER` by
   hand.
4. **Prefer inline bodies** so the lint rule recognizes the migration and the
   warning clears.
5. **If the query is genuinely global,** annotate `// groq-global: <reason>`
   instead of scoping.
6. **Track progress** by watching the warn count fall:
   `pnpm exec eslint . 2>&1 | grep -c tenancy/no-unscoped-groq`.

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
