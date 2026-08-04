# Scheduled publishing of social post variants on Vercel — execution mechanisms

**Date of research: 2026-08-05.** All claims verified against official documentation on that date; source URLs cited inline.

## Context and requirements

The feature (issues #783/#785) is a conference-scoped social media dashboard: a post is composed once and fans out to per-platform editable variants (LinkedIn, Bluesky, X, Facebook, Instagram, Threads, Mastodon). Each **variant** is the schedulable unit, with a default post time plus optional per-variant override, in the conference's timezone. "Publishing" means calling per-platform publish adapters against **external social APIs** as the conference's org accounts — it is *not* a Sanity document publish. Sanity stores the posts/variants.

The execution mechanism therefore must handle:

1. **Arbitrary per-variant timestamps** (not a fixed cadence), editable/reschedulable until publish time.
2. **Retries against flaky third-party social APIs.**
3. **Idempotency** — never double-post to a social network (double-posting is user-visible and unrecoverable).
4. **Observable failure states** — organizers need to see "failed to publish to X" (failure/notification UX still an open decision).
5. **Reliability over precision** — a few minutes late is tolerable; missing a publish entirely is not.
6. Small scale: tens of publishes per conference, bursts around announcements.

Existing precedent in this repo: 6 Vercel Cron jobs in `vercel.json` (daily/weekly), each hitting `/api/cron/*` route handlers guarded by a `CRON_SECRET` Bearer check — the exact pattern Vercel documents ([vercel.com/docs/cron-jobs/manage-cron-jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)).

---

## 1. Vercel Cron (frequent polling scan)

Mechanism: a `* * * * *` (or `*/5 * * * *`) cron hits `/api/cron/publish-social`, which queries Sanity for variants where `status == "scheduled" && scheduledAt <= now`, claims each, and runs the platform adapters.

- **Timing/exactness**: On **Pro/Enterprise**, cron fires "within the minute specified" (e.g. `5 8 * * *` triggers between 08:05:00–08:05:59). On **Hobby**, crons are limited to **once per day** and fire anywhere within the specified hour (±59 min); more-frequent expressions **fail deployment** ([vercel.com/docs/cron-jobs/usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [manage-cron-jobs#cron-jobs-accuracy](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-accuracy)). With a per-minute scan, worst-case publish lag ≈ 2 minutes — well within tolerance.
- **Plan limits**: 100 cron jobs per project on all plans; minimum interval once/day (Hobby) vs once/minute (Pro/Enterprise) ([usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)). **An every-minute cron requires the Pro plan.**
- **Delivery guarantees / retries**: Explicitly none, twice over: "Vercel will not retry an invocation if a cron job fails," and "Cron job delivery is best effort … occasional transient network errors can prevent a request from reaching your function … Cron delivery can also occasionally invoke the same scheduled run more than once" ([manage-cron-jobs#cron-job-error-handling](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-job-error-handling), [#cron-job-delivery-and-idempotency](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-job-delivery-and-idempotency)). Vercel's own recommended mitigation is exactly the reconciliation pattern: idempotent runs that "query and process all work since the last successful run," plus locks against concurrent runs. A missed tick self-heals on the next tick; a duplicate tick is absorbed by the claim step (below).
- **Invocation timeout**: cron duration limits are the ordinary function limits — with fluid compute, Hobby 300 s max; Pro 300 s default / 800 s max (1800 s extended, beta) ([vercel.com/docs/functions/limitations#max-duration](https://vercel.com/docs/functions/limitations#max-duration)). Ample for tens of variants; batch or fan out if a burst ever approaches it.
- **Deploy behavior**: "Creating a new deployment will not interrupt your running cron jobs; they will continue until they finish." Instant Rollback does **not** update cron config ([manage-cron-jobs#cron-jobs-and-deployments](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-and-deployments)). Because the due-time state lives in Sanity, deploys can't lose scheduled work.
- **Observability**: cron runs appear as function invocations in Runtime Logs, with a per-cron "View Logs" filter; note that redirect/cached responses are not logged ([manage-cron-jobs#cron-jobs-logs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-logs)). No per-publish dashboard — the per-variant status field in Sanity is the source of truth the organizer UI reads.
- **Cost**: "Cron jobs are included in all plans"; you pay only normal function compute ([usage-and-pricing#pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing#pricing)). An every-minute no-op scan is ~43 k invocations/month of a function that does one Sanity query — negligible under Active-CPU billing (I/O wait doesn't count as active CPU, [functions/limitations#cost-and-usage](https://vercel.com/docs/functions/limitations#cost-and-usage)).
- **Mapping to per-variant timestamps**: not native — it's a polling scan. But that inverts into a strength: reschedules/edits/cancellations are just field updates in Sanity; there is no external scheduled artifact to keep in sync.
- **Concurrency caveat**: Vercel can start a second invocation while the first still runs; they recommend a lock or short `maxDuration` ([manage-cron-jobs#controlling-cron-job-concurrency](https://vercel.com/docs/cron-jobs/manage-cron-jobs#controlling-cron-job-concurrency)). For this feature a per-variant compare-and-set claim (below) is sufficient; a global lock is optional hardening.

## 2. Upstash QStash

Mechanism: when the organizer schedules a variant, publish a QStash message targeting `/api/publish/variant` with `notBefore = scheduledAt`; QStash delivers the HTTP call at that time.

- **One-shot scheduling**: native. `Upstash-Not-Before` takes an absolute Unix timestamp (SDK `notBefore`); relative `delay` also available. Max delay: 7 days on the free tier, up to 1 year on pay-as-you-go, unlimited on fixed plans ([upstash.com/docs/qstash/features/delay](https://upstash.com/docs/qstash/features/delay), [upstash.com/pricing/qstash](https://upstash.com/pricing/qstash)). 7 days is a real constraint — organizers plausibly schedule announcement posts weeks out, which forces the paid tier or a hybrid.
- **Retries**: default 3 retries (configurable via `Upstash-Retries`), exponential backoff `min(86400, e^(2.5n))` s ≈ 12 s, 2.5 m, 30 m, 6 h, capped at 24 h; custom backoff via `Upstash-Retry-Delay`. Non-2xx counts as failure; an endpoint can return 489 + `Upstash-NonRetryable-Error: true` to stop retries (useful for "platform rejected the post — don't repost"). After exhaustion the message lands in the **DLQ** for manual review ([upstash.com/docs/qstash/features/retry](https://upstash.com/docs/qstash/features/retry)). DLQ retention: 3 days free / 7 days pay-as-you-go ([pricing](https://upstash.com/pricing/qstash)).
- **Deduplication**: `Upstash-Deduplication-Id` or content-based dedup, but the window is only **10 minutes** ([upstash.com/docs/qstash/features/deduplication](https://upstash.com/docs/qstash/features/deduplication)) — it protects against double-*enqueue*, not double-*delivery* days later. Application-side idempotency is still required.
- **Endpoint auth**: signed JWT in `Upstash-Signature`, verified with current/next signing keys via the SDK `Receiver` ([upstash.com/docs/qstash/howto/signature](https://upstash.com/docs/qstash/howto/signature)) — replaces the CRON_SECRET pattern for these routes.
- **Deploy/down behavior**: QStash calls the production URL over HTTP; Vercel deploys are atomic behind a stable URL, so redeploys are invisible. If the app is down/erroring at delivery time, the retry schedule (spanning ~6 h across 3 retries, longer with more) covers the outage; beyond that, the DLQ catches it.
- **Observability**: console with message/DLQ views and logs; DLQ retention as above ([upstash.com/pricing/qstash](https://upstash.com/pricing/qstash)).
- **Cost**: free tier 1,000 messages/day; pay-as-you-go $1 per 100 k messages, where **each delivery attempt (incl. retries) bills as one message** ([upstash.com/pricing/qstash](https://upstash.com/pricing/qstash)). At tens of publishes per conference this is effectively free — except the 7-day-max-delay push toward paid.
- **Reschedule/cancel**: an edited variant time means cancelling the outstanding message (store its `messageId` on the variant) and publishing a new one — a second source of truth that can drift from Sanity. Belt-and-braces: keep the handler check "is this variant still scheduled for (about) this time?" so a stale message no-ops.

## 3. Inngest

Mechanism: on schedule, send an event; an Inngest function does `await step.sleepUntil('wait', variant.scheduledAt)` then `step.run('publish', …)` per platform. Inngest calls back into the app via HTTP at `/api/inngest`.

- **One-shot scheduling**: native via `step.sleepUntil()`; sleeps are durable, consume no compute or concurrency, and can last **up to one year** ([inngest.com/docs/features/inngest-functions/steps-workflows/sleeps](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps)). Sleeping runs "resume as scheduled" (docs give no sub-minute precision guarantee; adequate here).
- **Retries**: default 4 retries + initial attempt = 5 attempts, exponential backoff with jitter, **per step** (each `step.run` has its own budget); `NonRetriableError` short-circuits, `RetryAfterError` sets exact retry timing — a good match for social-API rate-limit headers ([inngest.com/docs/features/inngest-functions/error-retries/retries](https://www.inngest.com/docs/features/inngest-functions/error-retries/retries)). Per-platform publish as separate steps means one platform failing/retrying doesn't re-run the others — structurally the strongest retry model here.
- **Deploy behavior**: official Vercel integration auto-syncs the app on every deploy; execution is HTTP callbacks into your deployed functions, with state held by Inngest, so redeploys don't lose sleeping runs — but resumed steps execute the *current* code ([inngest.com/docs/deploy/vercel](https://www.inngest.com/docs/deploy/vercel)). Docs recommend `maxDuration = 300` on the endpoint.
- **Observability**: dashboard with per-run traces/steps. Caveat: Hobby trace retention is **24 hours**, so a run sleeping for weeks won't show in the runs view (it still resumes correctly) ([sleeps doc](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/sleeps), [inngest.com/pricing](https://www.inngest.com/pricing)).
- **Cost**: free Hobby tier: 50 k executions/month, 5 concurrent steps, 500 k events/month — far beyond this app's needs; Pro starts at $99/month ([inngest.com/pricing](https://www.inngest.com/pricing)). FAQ warning: "Hobby plans pause execution once the free quota is exhausted."
- **Reschedule/cancel**: sleeping runs can be cancelled (cancel-on-event / API) and a new run started — again a second scheduler state to keep consistent with Sanity.
- **Fit**: excellent semantics, but a third-party control plane, SDK, `/api/inngest` endpoint, signing keys, and a dashboard — a lot of machinery for tens of publishes.

## 4. Trigger.dev

Mechanism: `tasks.trigger("publish-variant", payload, { delay: variant.scheduledAt })` or a task that `wait.until({ date })`. Tasks run on **Trigger.dev's infrastructure**, not Vercel functions.

- **One-shot scheduling**: native; `delay` accepts absolute timestamps and Date objects. "Delayed runs will be enqueued at the time specified, and will run as soon as possible after that time." Delayed runs can be **cancelled or rescheduled** via `runs.cancel` / `runs.reschedule` — the cleanest reschedule API of the external options ([trigger.dev/docs/triggering](https://trigger.dev/docs/triggering)).
- **Deploy/versioning**: delayed runs "execute on the currently deployed version when they start, not the version that was active when they were enqueued" ([trigger.dev/docs/triggering](https://trigger.dev/docs/triggering)) — desirable here (bug fixes apply to already-scheduled posts).
- **Retries**: configurable per-task retrying with backoff; waits longer than 5 s are checkpointed and don't bill compute ([trigger.dev/pricing](https://trigger.dev/pricing)).
- **Observability**: dashboard shows delayed runs with a "Delayed" status; log retention 1 day free / 7 days Hobby($10) / 30 days Pro($50) ([trigger.dev/pricing](https://trigger.dev/pricing)).
- **Cost**: free plan $5 usage credit/month, 20 concurrent runs; runs bill $0.25/10k invocations + per-second compute from $0.0000169/s ([trigger.dev/pricing](https://trigger.dev/pricing)). Free tier suffices at this scale, but 1-day log retention undermines the failure-observability requirement for posts scheduled days out.
- **Fit**: the heaviest addition — code runs off-Vercel, a separate build/deploy pipeline (`trigger deploy`) alongside Vercel deploys, plus secrets (social tokens) replicated to their infra. Overkill here.

## 5. Other options, briefly

### Vercel Workflows (with Vercel Queues underneath)

Vercel now ships **Workflows** — durable functions via `'use workflow'`/`'use step'` on your existing Vercel deployment, listed in main docs without a beta label ([vercel.com/docs/workflows](https://vercel.com/docs/workflows), last updated 2026-07-15):

- `sleep()` pauses with **no compute and no duration limit** ("Maximum `sleep` duration: no limit", [vercel.com/docs/workflows/pricing](https://vercel.com/docs/workflows/pricing)); steps get built-in retries; every step/sleep/error is recorded in the dashboard Observability → Workflows view ([vercel.com/docs/workflows/concepts](https://vercel.com/docs/workflows/concepts)).
- **Skew protection**: "Workflows keep running on the deployment they were created on" ([concepts#skew-protection](https://vercel.com/docs/workflows/concepts#skew-protection)) — durable across deploys, but note the inverse of Trigger.dev: a post scheduled 3 weeks ago publishes with 3-week-old adapter code.
- Pricing: Hobby includes 50 k workflow events/month; $0.02/1k thereafter; run-state retention after completion is 1 day Hobby / 7 days Pro ([workflows/pricing](https://vercel.com/docs/workflows/pricing)). Underlying Queues supports delayed visibility only up to 7 days ([vercel.com/docs/queues/pricing](https://vercel.com/docs/queues/pricing)), but Workflows' sleep abstracts over that with no limit.
- Weak spot for this feature: **rescheduling**. A workflow sleeping until `scheduledAt` can't have its sleep changed; you'd model reschedules with hooks or cancel-and-restart, or simply have the woken run re-read Sanity and re-sleep/abort if the time moved. Newer platform surface than cron; less battle-tested.

**Vercel Queues** directly (GA'd product page, [vercel.com/docs/queues](https://vercel.com/docs/queues)) supports delayed messages, but max delay = 7 days (capped at TTL, max 7 days) ([queues/pricing#limits](https://vercel.com/docs/queues/pricing#limits)) — too short for posts scheduled weeks ahead, so it's out as the primary mechanism.

### Sanity Scheduled Publishing — not applicable

`@sanity/scheduled-publishing` is **deprecated as of October 2025** (superseded by Scheduled Drafts / Content Releases) and requires a **Growth plan or above** ([sanity.io/docs/scheduled-publishing](https://www.sanity.io/docs/scheduled-publishing)). More fundamentally, it schedules *Sanity document publishes*; this feature's publish action is calling external social APIs, which Sanity's scheduler cannot do. Its known caveats (schedules not GROQ-queryable, excluded from exports, publish despite validation errors) would hurt even in a bent-to-fit design. Ruled out.

---

## Comparison

| | Vercel Cron scan | QStash | Inngest | Trigger.dev | Vercel Workflows |
|---|---|---|---|---|---|
| Per-variant timestamp | Polling scan (1-min lag) | Native `notBefore` (≤7 d free / ≤1 y paid) | Native `sleepUntil` (≤1 y) | Native `delay` / `wait.until` | Native `sleep` (no limit) |
| Retry on flaky API | Emergent: next scan retries until max attempts (you implement) | 3× default, exp backoff, DLQ | 4× per step, jitter, `RetryAfterError` | Configurable per task | Built-in step retries |
| Missed-publish risk | Self-healing: every tick reconciles all overdue work | Retries then DLQ (needs monitoring) | Durable runs | Durable runs | Durable runs |
| Reschedule/edit | Free — just update Sanity | Cancel + republish message | Cancel run + resend event | `runs.reschedule` | Awkward (hook or re-check on wake) |
| Deploy behavior | Stateless between ticks; nothing in flight to lose | HTTP to stable prod URL | Resumes on current code | Runs current version | Pinned to creating deployment |
| Observability | Vercel logs + status fields in Sanity | QStash console + DLQ | Dashboard (24 h traces on free) | Dashboard (1 d logs on free) | Vercel dashboard (1 d Hobby / 7 d Pro) |
| New dependencies | **None** | Upstash account, SDK, signing keys | Inngest account, SDK, endpoint | Account, SDK, separate deploy pipeline, secrets off-Vercel | `workflow` package only |
| Cost at this scale | ~$0 (Pro plan required for per-minute) | $0 free tier, but 7-day delay cap pushes to paid | $0 (Hobby tier) | $0 (free credits) | ~$0 (Hobby allowance) |

## Recommendation

**Use a Vercel Cron reconciliation scan (`* * * * *`, or `*/5` if per-minute feels noisy) — the store-and-scan pattern — and make the publish handler idempotent.** This matches the six existing `/api/cron/*` + `CRON_SECRET` jobs, adds zero external dependencies, and its failure modes are the ones this feature already tolerates (minutes of lag) while eliminating the one it can't (a missed publish is retried on every subsequent tick until it succeeds or exhausts `maxAttempts`).

**Hard prerequisite: the Vercel Pro plan.** On Hobby, any sub-daily cron expression fails deployment and timing is ±59 min ([vercel.com/docs/cron-jobs/usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)). If the project is on Hobby and staying there, the recommendation flips to **QStash** (free tier, native one-shot delivery, retries + DLQ, signature verification) with the same idempotent handler and Sanity as source of truth.

The robust core, regardless of trigger (and required anyway because Vercel documents that cron can both miss and duplicate ticks, and QStash dedup only spans 10 minutes):

1. **Sanity is the only scheduler state.** Each variant carries `status` (`draft → scheduled → publishing → published | failed`), `scheduledAt`, `attempts`, `lastError`, and after success the platform post ID. Rescheduling/cancelling is a plain document edit — no external artifact to sync.
2. **Scan**: cron handler queries variants with `status == "scheduled" && scheduledAt <= now && attempts < MAX`.
3. **Claim before posting (idempotency)**: transition `scheduled → publishing` with a compare-and-set (Sanity transaction with `ifRevisionID`, or a patch that asserts current status); only the winner calls the social API. This absorbs duplicate cron ticks and overlapping invocations without a global lock. Where a platform API supports idempotency keys, pass a key derived from the variant ID as a second layer.
4. **Retry policy is data**: on adapter failure, record `lastError`, increment `attempts`, set status back to `scheduled` (optionally with a computed backoff into `nextAttemptAt`); after `MAX` attempts mark `failed`. The next ticks are the retry mechanism. Distinguish permanent rejections (auth revoked, content rejected) and fail immediately — mirroring QStash's non-retryable signal.
5. **Failure surfacing**: `failed`/`lastError` render directly in the dashboard variant map (satisfying the pending failure-UX decision with data already in Sanity), optionally plus an organizer email via the existing email pipeline.
6. **Ordering nicety**: process variants oldest-`scheduledAt` first so a backlog after downtime publishes in intended order.

**Trade-offs accepted**: no vendor retry/DLQ machinery or per-message console — retries and failure states are ~40 lines of handler code and Sanity fields instead (which the organizer UI needs anyway); up to ~1–5 min publish lag (explicitly acceptable); one hot loop to keep healthy — worth adding a lightweight "scan ran recently" check to the existing monitoring so a silently disabled cron is noticed. **Revisit triggers**: if scheduling volume grows enough that per-minute scans feel wasteful, or if per-publish pipelines get multi-step (media upload → post → verify), **Vercel Workflows** is the natural Vercel-native upgrade (durable unlimited `sleep`, step retries, dashboard observability) — but today its reschedule story is weaker than "edit a field in Sanity," and cron-scan code migrates to it trivially since all state already lives in the datastore.
