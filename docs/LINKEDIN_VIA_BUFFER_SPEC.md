# LinkedIn publishing through Buffer

Map: [#1131](https://github.com/CloudNativeBergen/website/issues/1131). Decided in a design interview
on 2026-09-20; the numbers come from a spike against the real API
([#1126](https://github.com/CloudNativeBergen/website/issues/1126)). Amends
[`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) §4.2, where LinkedIn is a manual Channel.

## 1. What changes

An organization that connects a [Buffer](https://buffer.com) account gets its approved LinkedIn
variants published automatically. An organization that does not keeps today's manual path,
unchanged. Buffer is an implementation of `SocialPublishAdapter`
(`src/lib/social/provider/types.ts`), not a new seam.

**Why Buffer, not LinkedIn's API.** Posting to a company page directly needs the Community
Management API: a vetted application with a screencast per use case, 60-day tokens, and programmatic
refresh for a limited set of partners only. Buffer's GraphQL API (`https://api.buffer.com`) has been
generally available since 2026-05-27 on every plan including Free, with self-serve keys. The direct
route stays open as the exit ([#998](https://github.com/CloudNativeBergen/website/issues/998),
dormant — do not submit the application, approval starts a 12-month clock).

Not in this work: any Channel other than LinkedIn (Bluesky stays on its direct adapter), LinkedIn
engagement in Snapshots, an editable first comment, @-mentions, OAuth.
@-mentions are taken up in [`MARKETING_TAGGING_SPEC.md`](./MARKETING_TAGGING_SPEC.md) §5: hints on the manual
path, and a spike before any tag goes through Buffer.

## 2. Connection

- **One Buffer account per tenant organization**, authenticated with that account's **personal API
  key**. No OAuth app, no token refresh, no writable secret store. A personal key is also the only
  credential that can read post metrics, which the engagement follow-up will need.
- A new `buffer` `SecretFamily`: `TENANT_<SLUG>_BUFFER_API_KEY` and
  `TENANT_<SLUG>_BUFFER_LINKEDIN_CHANNEL_ID`, **both or nothing**, as Bluesky's pair is. Manual mode
  stays derived from the secret's absence.
- `CONNECTION_FAMILY.linkedin = 'buffer'` lands **with the adapter**, not with the secret family:
  until `ADAPTERS.linkedin` is the Buffer adapter it is `ManualChannelProvider`, whose `publish`
  refuses, so wiring the family first would fail every connected organization's variants.
- **The channel is pinned, never discovered.** An account may hold a company page and a personal
  profile. The pinned channel must report `service: linkedin`, `type: page`, and
  `linkShortening.isEnabled: false` — a shortened link drops the UTM tags that attribution (§6.2 of
  the plan spec) depends on.
- **That check runs inside `publish()`, before the create call** — not at adapter resolution.
  The adapter factory is synchronous, resolution is bounded at 5 s and can express only "adapter",
  "manual" or a retried throw, and it also runs from `scheduleIssues` at schedule and at Task
  approval, where a Buffer call would spend quota for nothing. A failed check is `rejected`, with a
  message saying what to fix in Buffer; an unreachable one is `transient`, since nothing was created.
  It costs one request per publish.

## 3. Publishing

- **We own the schedule.** The per-minute cron posts with `mode: shareNow`; Buffer's queue is never
  used, so its 10-queued-posts limit on Free does not apply.
- Media: Sanity CDN rendition URLs with `altText`. Buffer has no upload endpoint; it fetched the
  rendition, crop parameters included, at create time.
- The registry stays keyed per platform. The adapter class is vendor-wide; a later Channel is a
  constraints entry, a channel-id field and a registry line.

### 3.1 The link is the first comment

An organizer's call, for reach: on LinkedIn the link is **always** the first comment
(`metadata.linkedin.firstComment`), and the comment is the UTM-tagged URL alone. Never in the body,
never a link attachment. This holds for the manual path too (§5), so it is a change to LinkedIn as a
Channel, not to the Buffer adapter, and it ships as its own slice:

- `PlatformConstraints.linkInBody` (a boolean Bluesky also uses) becomes
  `linkPlacement: 'body' | 'card' | 'comment'`; LinkedIn is `comment`, Bluesky `card`. Its consumers
  are the editor's link hint (`VariantEditor.tsx`, which today would say "shown as a link card"),
  `ManualPostView`'s append-and-count logic, and the constraints, manual and publish-engine tests.
- **The built-in LinkedIn skeletons embed `{url}` in the body** (`template/builtin.ts`), and
  materializing resolves it into `body`. They lose `{url}` — a new built-in Template version — and
  say "link in the comments" instead.
- **Validation:** a LinkedIn body that contains a URL on one of the conference's own verified
  `domains[]` is an issue at save, schedule and approve — the same `validatePublishInput` path as
  every other rule. Matching the variant's `link` exactly would miss: the body's URL is frozen when
  the Task is materialized, while `link` is re-derived at save and again at approval. That rule is
  what catches already-materialized drafts and organization Templates (#1124) whose skeletons still
  carry `{url}`; there is no migration, because rewriting edited copy is not ours to do. URLs on
  other hosts are left alone.

### 3.2 Asynchrony — the `submitted` state

`createPost` answers with a Buffer post id; the LinkedIn URL arrives later and only by polling (no
webhooks). In the spike the call itself took **10.9 s** and the post was `sent` **22 s** after it
(one sample), so the adapter returns on accept and never polls inside `publish()`.

- `PublishOutcome` gains an **accepted** result carrying the vendor post id.
- Variant status gains **`submitted`**: `publishing → submitted → published | failed`. Bluesky's
  synchronous path is unchanged. The variant gains a `submission` object (`vendorPostId`,
  `submittedAt`, `lastCheckedAt`) — `publishResult.externalId` is reserved for the LinkedIn URN and
  `claimedAt` is cleared on settle, so neither can carry it.
- `attempts[]` records two legs with two outcomes (`ATTEMPT_OUTCOMES`, `PublishDecision`): the
  **submit** and the **confirmation**. Only the confirmation joins `PUBLISHED_OUTCOMES`
  (`marketing/snapshots/sanity.ts`), which `firstPublishedAt` and the ledger read — with the submit
  leg in it `publishedAt` is back-dated, with neither it is silently `null`.
- A **confirm sweep** in `/api/cron/social-publish` reads `submitted` variants back: `sent` →
  `published`, with `externalLink` as `publishResult.url` and the `urn:li:share:…` it carries as
  `externalId`; `error` → `failed`; the post gone from Buffer (`NOT_FOUND`, deleted in its UI) →
  `failed` as `ambiguous`. First check ≈30 s after submit, then backing off; unresolved after
  15 minutes → `failed` as `ambiguous`, never re-posted.
- **Budget.** The sweep runs **before** dispatch in the same 60 s function, reads its work in
  `findWork`'s single query (Sanity quota), is capped per tick, and gives each read a short timeout
  so it cannot starve dispatch. The Buffer adapter's own budget must cover the check plus an ≈11 s
  create; with `PUBLISH_RESERVE_MS = 40_000` about **two LinkedIn posts fit in a tick**. Every
  conference's LinkedIn slot defaults to 08:00, so with several connected tenants the rest roll to
  the following minutes — late by minutes, never lost: a variant is never claimed with less than
  the reserve left, and a claim that cannot start is released.
- Buffer allows 100 requests per 15 minutes and 3,000 per 30 days on Free. Successful responses
  carry no quota headers, so usage is counted on our side; a publish cost 5 requests in the spike.
- **`published` still means the post is live.** A `submitted` variant is never claimed for
  publishing again. Every guard that treats `publishing` as in-flight must treat `submitted` the
  same: delete-post refusal and render attach (`social/sanity.ts`), the dashboard aggregate, the
  timeline model, `TaskEditorPage` and `SocialPostsManager`. (The default-time rewrite is an
  allow-list and reminders never look at `publishing`; neither changes.) The Sanity option list
  derives from `VARIANT_STATUSES` and follows on its own.

### 3.3 Failure

| Buffer says, at create                              | Outcome                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `UnauthorizedError`                                 | `credential-expired` (terminal)                                         |
| HTTP 429                                            | `rate-limited`, honouring `Retry-After`                                 |
| `LimitReachedError`                                 | `rejected` — a plan or posting limit; a 5-minute retry only burns quota |
| `InvalidInputError`, `NotFoundError` (bad channel)  | `rejected`                                                              |
| a failure before the create call was sent           | `transient` (existing 5 → 15 min retries)                               |
| `UnexpectedError`, `RestProxyError`, timeout, throw | `ambiguous` — `CreatePostInput` has no idempotency key                  |

During the sweep, post `status: error` → `failed`, terminal, carrying `error.message`.

A Buffer-reported error is **never retried automatically**: the message is free text, and Buffer may
retry on its own. The organizer is notified and either reschedules (a fresh Buffer post) or posts by
hand (§5). The usual cause will be LinkedIn's ~60-day re-authorization, which now happens in
Buffer's UI.

## 4. Admin

The variant editor shows the first comment read-only beneath the post. `submitted` renders as its own
state. A failed confirmation notifies organizers through the notification hub, linking to
`/admin/marketing/posts?variant=<id>`. The admin shows whether LinkedIn is automatic or manual for
the organization — derived, showing no secret.

## 5. Manual path

Unchanged for an organization with no Buffer connection. `ManualPostView` presents the tagged link
separately from the body and tells the organizer to post it as the first comment, so a LinkedIn post
behaves the same whoever published it.

As the **fallback** it needs one new transition: today `markPosted` allows only
`awaiting-manual → published`, and a connected organization's variant never reaches
`awaiting-manual`. An organizer may mark a **`failed`** variant as posted, with the same required
LinkedIn URL and the same `{outcome: 'manual', by}` attempt. For an `ambiguous` failure that is also
how the organizer records a post that did go out.

## 6. Known limits

- **A failed first comment is silent.** The API echoes the comment we sent and reports nothing about
  whether it landed; in the spike it was confirmed by looking at LinkedIn.
- **A published post cannot be retracted through Buffer** — a sent post allows neither delete nor
  edit. A mistaken post is removed on LinkedIn by hand.
- The error shape for an expired LinkedIn connection was not observed; it cannot be provoked safely
  on a real page.
- About two LinkedIn posts per cron tick (§3.2).
- Media size and format limits are unverified. Buffer's API terms ("internal use") have not been
  read in full; that is owed before a second tenant connects.
- The API had been generally available for four months when this was decided.

## 7. Slices

[#1127](https://github.com/CloudNativeBergen/website/issues/1127) secret family ·
[#1134](https://github.com/CloudNativeBergen/website/issues/1134) link as first comment (§3.1),
independent of Buffer ·
[#1128](https://github.com/CloudNativeBergen/website/issues/1128) `submitted` state, confirm sweep
and `failed → published`, reviewed alone ·
[#1129](https://github.com/CloudNativeBergen/website/issues/1129) adapter and
`CONNECTION_FAMILY` — needs all three ·
[#1130](https://github.com/CloudNativeBergen/website/issues/1130) admin.
`TENANT_SECRETS.md` and `INTEGRATION_ADAPTERS.md` change with the code that makes them true, in
#1127 and #1129.
