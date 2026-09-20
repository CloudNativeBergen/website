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

## 2. Connection

- **One Buffer account per tenant organization**, authenticated with that account's **personal API
  key**. No OAuth app, no token refresh, no writable secret store. A personal key is also the only
  credential that can read post metrics, which the engagement follow-up will need.
- A new `buffer` `SecretFamily`: `TENANT_<SLUG>_BUFFER_API_KEY` and
  `TENANT_<SLUG>_BUFFER_LINKEDIN_CHANNEL_ID`, **both or nothing**, as Bluesky's pair is.
  `CONNECTION_FAMILY.linkedin = 'buffer'`. Manual mode stays derived from the secret's absence.
- **The channel is pinned, never discovered.** An account may hold a company page and a personal
  profile. At adapter resolution the pinned channel must report `service: linkedin` and
  `type: page`; anything else refuses with `rejected` rather than posting to a person's profile.
- The channel's `linkShortening.isEnabled` must be `false`; a shortened link drops the UTM tags that
  attribution (§6.2 of the plan spec) depends on. Enabled → `rejected`, with a message saying where
  to turn it off.

## 3. Publishing

- **We own the schedule.** The per-minute cron posts with `mode: shareNow`; Buffer's queue is never
  used, so its 10-queued-posts limit on Free does not apply.
- **The link is always the first comment** (`metadata.linkedin.firstComment`), and the comment is the
  UTM-tagged URL alone. Never in the body, never a link attachment — an organizer's call, for reach.
  LinkedIn's `linkInBody` constraint goes; the body copy says "link in the comments" where it wants
  to. The manual path follows the same rule (§5).
- Media: Sanity CDN rendition URLs with `altText`. Buffer has no upload endpoint; it fetched the
  rendition, crop parameters included, at create time.
- The registry stays keyed per platform. The adapter class is vendor-wide; a later Channel is a
  constraints entry, a channel-id field and a registry line.

### 3.1 Asynchrony — the `submitted` state

`createPost` answers with a Buffer post id; the LinkedIn URL arrives later and only by polling (no
webhooks). In the spike the call itself took **10.9 s** and the post was `sent` **22 s** after it
(one sample), so the adapter returns on accept and never polls inside `publish()`.

- `PublishOutcome` gains an **accepted** result carrying the vendor post id.
- Variant status gains **`submitted`**: `publishing → submitted → published | failed`. Bluesky's
  synchronous path is unchanged.
- A **confirm sweep** in `/api/cron/social-publish` reads `submitted` variants back: `sent` →
  `published`, with `externalLink` as `publishResult.url` and the `urn:li:share:…` it carries as
  `externalId`; `error` → `failed`. First check ≈30 s after submit, then backing off; unresolved
  after 15 minutes → `failed`, recorded as `ambiguous` and never re-posted. Buffer's limits are 100 requests per 15 minutes and 3,000 per
  30 days on Free, with no rate-limit headers — a publish cost 5 requests in the spike.
- **`published` still means the post is live.** A `submitted` variant is never claimed for
  publishing again.

### 3.2 Failure

| Buffer says                                         | Outcome                                           |
| --------------------------------------------------- | ------------------------------------------------- |
| `UnauthorizedError`                                 | `credential-expired` (terminal)                   |
| `LimitReachedError`, HTTP 429                       | `rate-limited`, honouring `Retry-After`           |
| `InvalidInputError`, `NotFoundError`                | `rejected`                                        |
| a failure before the create call was sent           | `transient` (existing 5 → 15 min retries)         |
| `UnexpectedError`, `RestProxyError`, timeout, throw | `ambiguous` — `CreatePostInput` has no idempotency key |
| post `status: error` during the sweep               | `failed`, terminal, carrying `error.message`      |

A Buffer-reported error is **never retried automatically**: the message is free text, and Buffer may
retry on its own. The organizer is notified and either reschedules (a fresh Buffer post) or posts by
hand through `social.markPosted`. The usual cause will be LinkedIn's ~60-day re-authorization, which
now happens in Buffer's UI.

## 4. Admin

The variant editor shows the first comment read-only beneath the post. `submitted` renders as its own
state. A failed confirmation notifies organizers through the notification hub, linking to
`/admin/marketing/posts?variant=<id>`. The admin shows whether LinkedIn is automatic or manual for
the organization — derived, showing no secret.

## 5. Manual path

Unchanged in mechanics, and it is the fallback for every failure above. `ManualPostView` presents the
tagged link separately from the body and tells the organizer to post it as the first comment, so a
LinkedIn post behaves the same whoever published it.

## 6. Known limits

- **A failed first comment is silent.** The API echoes the comment we sent and reports nothing about
  whether it landed; in the spike it was confirmed by looking at LinkedIn.
- **A published post cannot be retracted through Buffer** — a sent post allows neither delete nor
  edit. A mistaken post is removed on LinkedIn by hand.
- The error shape for an expired LinkedIn connection was not observed; it cannot be provoked safely
  on a real page.
- Media size and format limits are unverified. Buffer's API terms ("internal use") have not been
  read in full; that is owed before a second tenant connects.
- The API had been generally available for four months when this was decided.

## 7. Slices

[#1127](https://github.com/CloudNativeBergen/website/issues/1127) secret family ·
[#1128](https://github.com/CloudNativeBergen/website/issues/1128) `submitted` state and confirm
sweep, reviewed alone ·
[#1129](https://github.com/CloudNativeBergen/website/issues/1129) adapter ·
[#1130](https://github.com/CloudNativeBergen/website/issues/1130) admin and manual fallback.
`TENANT_SECRETS.md` and `INTEGRATION_ADAPTERS.md` change with the code that makes them true, in
#1127 and #1129.
