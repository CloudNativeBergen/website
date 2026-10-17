# Research: Sanity quota and storage cost of anonymous Feedback Responses

Ticket: [#1416](https://github.com/CloudNativeBergen/website/issues/1416) (map [#1415](https://github.com/CloudNativeBergen/website/issues/1415)). Researched 2026-10-17.
This file records facts and estimates only. The storage decision belongs to [#1417](https://github.com/CloudNativeBergen/website/issues/1417).

Labels used below:

- **VERIFIED**: read in a primary source (a Sanity or vendor doc, our code, production Sanity, or our own request-log export).
- **MEASURED**: computed from our request-log export for 2026-09-24 to 2026-10-01 (`mvzwvw14-2026-09-24-2026-10-01.ndjson`, 248 MB, untracked in the main checkout).
- **ESTIMATE**: arithmetic on stated assumptions, or a model. Not proven.

## Summary

1. **Sanity's per-request quota does not bind.** A realistic edition costs about 10k–30k live API requests (ESTIMATE). Our September baseline is about 120k a month against 250k (MEASURED), and Growth bills overage at $1 per 25k rather than blocking (VERIFIED, pricing page). We have not checked whether our "Growth Non-Profit" variant follows the same overage rule.
2. **Mutations show up in the request log as `api` requests (MEASURED), and Sanity bills 2xx responses only (VERIFIED).** So a 409 conflict or a 429 costs nothing. A successful write and every successful read cost one request each.
3. **Document count is the closest Sanity limit.** Production holds 7,161 documents (VERIFIED). Sanity's two pages give different Growth limits: 25k on the pricing page and 50k on the technical-limits page. One document per response adds 200–3,000 documents per edition, and they never expire (ESTIMATE).
4. **The existing rate-limit buckets fail under a shared-IP burst.** That failure, not the quota, is the binding problem. `hitRateLimitBucket` reads through GROQ, which lags behind writes, and it allows only 4 compare-and-swap attempts. When everyone shares one bucket (a single venue Wi-Fi exit IP), a model built on our measured latencies **denies about 70–90% of 200 scans** in the minute after a keynote (ESTIMATE). If the same algorithm read through the doc endpoint instead, the model denies about 0–12%.
5. **An external store reachable from Vercel is cheap at this volume.** Upstash Redis's free tier is 500k commands a month (VERIFIED). But it would be a new subprocessor, which touches the privacy ticket [#1424](https://github.com/CloudNativeBergen/website/issues/1424).

## 1. Which Sanity limits apply to public writes

| Limit | Value | Applies to us how | Source |
|---|---|---|---|
| Live API requests (`api.sanity.io`) | 250k/month on Growth; overage $1 per 25k | Every bucket read, every write, every uncached read | VERIFIED [pricing](https://www.sanity.io/pricing); our plan figure from the memory note `sanity-quota-and-request-logs` |
| API CDN requests (`apicdn.sanity.io`) | 1M/month; overage $1 per 250k | Cacheable reads (`clientReadCached`) | VERIFIED [pricing](https://www.sanity.io/pricing) |
| What is billed | "Responses with a 4xx or 5xx status code are not billed." Studio requests are not billed. | 409 and 429 responses are free | VERIFIED [request-log reference](https://www.sanity.io/docs/platform-management/reference-request-log-data) |
| Do mutations count? | No Sanity page says so in words. The request log records `POST /data/mutate` with `domain: "api"`, `endpoint: "mutate"`, `studioRequest: false` (455 in production that week). | Treat each 2xx mutation as one live API request | MEASURED (export) plus the reference above; it is an inference that logged equals billed |
| Over-quota behaviour | Growth: "service continues uninterrupted… added to your monthly invoice". Free: hard cap. | Overrunning the quota costs money, not an outage. Unverified for the Non-Profit variant. | VERIFIED [understanding quotas](https://www.sanity.io/docs/help/understanding-quotas.md) |
| Documents per dataset | Growth: **25k** ([pricing](https://www.sanity.io/pricing), "$299 for 50k in total" add-on) **or 50k** ([technical limits](https://www.sanity.io/docs/technical-limits)). Drafts count. | Production `count(*)` = **7,161**, with 0 drafts and 370 talks | VERIFIED (two Sanity pages that conflict); production query on 2026-10-17 |
| Mutation rate | 25 req/s **per client IP** (mutate and actions combined) and 500 req/s global; 429 above that | The client IP is the Vercel function's exit IP. That week: 1,308 distinct exit IPs; at most 6 mutations from one IP in one second. | VERIFIED [technical limits](https://www.sanity.io/docs/technical-limits); MEASURED |
| Concurrent mutations | 100 per dataset; 500 concurrent queries | A burst of about 15 writes/s × ~1 s each ≈ 15 in flight | VERIFIED [technical limits](https://www.sanity.io/docs/technical-limits) |
| Mutation body | 4 MB per request; 32 MB per document; 1,000 attributes per document on Growth; 10k unique attributes per dataset | Not a factor | VERIFIED [technical limits](https://www.sanity.io/docs/technical-limits) |
| Dataset size in bytes | No limit listed for documents (assets: 100 GB) | A response is about 0.5–1.5 KB, so a few MB per edition | VERIFIED (no such limit on either page) |
| Listeners | 5,000 concurrent on Growth; 4 h maximum lifetime. "Listeners, including the Live Content API, are redirected to the API" (not the CDN). Live Content API: "new requests contribute to your API usage quota". | Only relevant if live views use listeners. The dataset is private, so a listener would need a token and therefore must run server-side. | VERIFIED [technical limits](https://www.sanity.io/docs/technical-limits), [API CDN](https://www.sanity.io/docs/content-lake/api-cdn), [Live Content API](https://www.sanity.io/docs/content-lake/live-content-api) |

Latency (MEASURED, production, that week):

- GROQ live query: p50 48 ms, p90 86 ms.
- Mutation with `visibility=sync`: p50 997 ms, p90 1,125 ms. All 455 production mutations used `sync`.
- 409 conflicts returned in 45–82 ms (4 cases).

The fast 409s mean the revision check happens early. Most of a sync write's second is spent waiting for the query index to catch up, which matches the [mutation reference](https://www.sanity.io/docs/http-reference/mutation): with `async` "it might still be a second or so until you can see the change reflected in a query".

## 2. Realistic peak and monthly cost (ESTIMATE)

Assumptions:

- 40 sessions per edition, a few hundred attendees.
- 50–150 people in an average session, so 2,000–6,000 attendee-session pairs.
- A 10–50% response rate gives **200–3,000 Feedback Responses per edition**.
- A keynote with about 300 in the room at 50% gives about 150–200 scans within a minute or two. That matches the ticket's 200-scans-per-minute scenario.

Billable live requests per response, uncontended:

| Step | Live API | CDN |
|---|---|---|
| Resolve talk and window (cacheable) | 0 | 1 |
| Device bucket: read and write | 2 | 0 |
| IP bucket: read and write | 2 | 0 |
| Write the response (shape A) or `inc` a counter (shape B) | 1 | 0 |
| Optional comment document (shape B, about 30% of responses) | about 0.3 | 0 |
| **Total** | **about 5** | **about 1** |

The writes cost **1k–15k live requests per edition**.

Reads behind the live views assume the polling the app already uses: 30 s intervals through `useIdlePolling`, which stops after 5 minutes without interaction and pauses in background tabs (`src/hooks/useIdlePolling.ts`).

- Speakers: about 60 speakers × 20 active minutes ≈ 2,400 reads.
- Organizers: 5 × 4 h ≈ 2,400 reads.
- Total: about 5k at 30 s, about 15k at 10 s. These are live reads if they use `clientReadUncached`; on `clientReadCached` they count against the 1M CDN quota instead.

**Total: about 10k–30k live requests per edition.** That fits inside the roughly 130k monthly headroom even with two editions in one month. For comparison, the Aug 2026 runaway poller burned about 85k a day, and the social publish tick costs about 43k a month.

Abuse cost: the endpoint is anonymous, and each attempt costs about 2 billable bucket reads even when denied. A denied attempt never writes, and its 429 or 409 is free. One script running at 25 req/s for 24 hours makes about 2.2M attempts, about 4.3M requests, about $170 at Growth overage. Rotating IPs and dropping cookies bypasses both buckets. We have not checked whether the Vercel Firewall can rate-limit before the request reaches Sanity on our plan.

## 3. Three shapes compared

| | A. One document per response | B. Per-talk counter plus comment documents | C. External store (Vercel Marketplace) |
|---|---|---|---|
| Sanity documents per edition | 200–3,000, permanent unless purged, plus transient bucket documents | about 40 counters + 60–900 comments | 0 |
| Live requests per response | about 5 | about 5 | Buckets and responses move off Sanity, about 0–1 Sanity request. Upstash: about 2–4 commands per response. |
| Contention | None on the response (each one is a new id). The hot spots are only the shared buckets. | **Every response writes one counter document per talk.** An unconditioned `inc` patch runs inside Sanity's exclusive per-document transaction lock ("Transactions use exclusive locks"), so it should serialize without 409s. The docs list `inc`/`dec` but never say they are atomic, so that is an inference we have not tested. A read-then-`ifRevisionID` counter would behave like the buckets in §4. | Redis `INCR` is atomic and has no CAS loop. |
| Granularity | Each response can be removed or recounted. A hidden comment keeps its colour. | A spam flood of colours cannot be undone or recounted. Per-response timestamps are lost. | Whatever is modelled |
| Document-count headroom (7,161 now; 25k or 50k limit) | Upper bound of 4 tenant editions × 3,000 = 12k a year, so the 25k figure is reached in about 1.5 years without a purge | Negligible | n/a |
| New subprocessor | No | No | **Yes**: privacy page and DPA ([#1424](https://github.com/CloudNativeBergen/website/issues/1424)) |
| Cost | Inside the current plan | Inside the current plan | Upstash free tier: 500k commands/month, 250 MB, 10k commands/s; pay-as-you-go $0.20 per 100k ([pricing](https://upstash.com/pricing/redis)). Neon free tier: 1 GB, 100 CU-hours, scales to zero after 5 minutes, which means a cold start on the first scan ([pricing](https://neon.com/pricing)). We have not checked EU or Stockholm regions on either pricing page. |

Vercel offers Postgres, Redis and NoSQL only through the Marketplace (Neon, Upstash, Supabase). Credentials arrive as environment variables. Its native stores are Blob and Global Config, and neither suits counters ([Vercel storage](https://vercel.com/docs/storage)).

## 4. How the rate-limit buckets behave under a burst

### What the code does

VERIFIED from `src/lib/rate-limit/bucket.ts`:

- Each subject has one document holding a `hits[]` array.
- Each attempt reads the document by GROQ through `clientReadUncached`, then writes `patch().ifRevisionID(rev).set(...)` with `visibility: 'sync'`. When the document does not exist yet, it uses `create` on an explicit id.
- After a 409 it re-reads immediately, with no backoff, up to `MAX_ATTEMPTS = 4`. Then it **denies**: a failed write always denies.
- The current users are email sign-in, provisioning and marketing snapshots. Buckets carry `expiresAt`, and the daily `cleanup-notifications` cron deletes them once expired (`src/app/api/cron/cleanup-notifications/route.ts`). Production holds 8 `emailSignInRateLimit` documents today.

### Why a shared bucket collapses

Sanity's GROQ store "is synced from the document store outside transactions" (our own note in `src/lib/workshop/seats.ts`). The [doc endpoint](https://www.sanity.io/docs/http-reference/doc) "cuts through any caching/indexing middleware that may involve delayed processing".

After one writer commits, every bucket read for up to about 1 s returns the old revision. Each loser's write is refused within about 60 ms, so a loser burns its 4 attempts in about 0.5 s, inside the stale window, and is denied. In effect a shared bucket accepts about one hit per second.

The per-device bucket is never shared, so it does not contend. The per-IP bucket becomes one shared document for everyone behind a venue's Wi-Fi or a carrier's NAT. That is an assumption about the venue, but a common one.

### Model

ESTIMATE: a discrete-event model of this exact loop on one shared bucket, 20 seeds, with the rate caps assumed generous enough not to bite. The script is in the appendix.

| Read path, index lag | Arrivals | 50 scans: denied | 200 scans: denied | Billable requests (200 scans) |
|---|---|---|---|---|
| GROQ (today), ~0.95 s | spread over 60 s | 35% | **73%** | about 750 |
| GROQ (today), ~0.95 s | within 15 s | 72% | **92%** | about 790 |
| GROQ (today), ~0.95 s | decaying, mean 12 s | 53% | **80%** | about 760 |
| GROQ, 0.4 s lag | decaying | 27% | 64% | about 730 |
| Doc endpoint, no lag | over 60 s / within 15 s / decaying | 0% / 0% / 0% | 0.2% / 12% / 6% | about 440–590 |

How to read this:

- Today's limiter, used as a per-IP limit on a shared venue IP, would silently refuse most legitimate keynote feedback. A user would get an error in about 0.5 s, and the winners wait about 1.1 s.
- Switching the bucket read to `getDocument` (the pattern `src/lib/workshop/seats.ts` already uses) removes most of the loss, but a 15 s spike of 200 still loses about 12%.
- Quota is not the issue in any row: about 4 billable requests per scan at worst.
- The model's main uncertainty is the index lag. We measured the ~1 s sync write; the lag a concurrent reader actually sees is assumed. **We did not run a live burst**, because production is read-only and no write was authorized.

### Other burst limits

ESTIMATE: 200 scans in 15 s is about 13 scans/s × 2–3 writes, which approaches Sanity's 25 mutations/s **per client IP** if Vercel packs concurrent requests onto a few warm instances that share an exit IP. Last week's maximum was 6 per IP per second. Sanity bills nothing for a 429, but `hitRateLimitBucket` treats a failed write as a denial.

## Holes left open

- No Sanity page says in words that mutations count as API requests. The basis is the request log plus the 2xx-billing rule.
- The document limit for our plan (Growth Non-Profit) is not visible from the CLI. The two Sanity pages disagree (25k against 50k). Check manage.sanity.io → Usage.
- Whether overage billing, rather than a hard cap, applies to the Non-Profit variant. The memory note records that the quota hit 100% on 2026-08-22 but not what happened next.
- Atomicity of an unconditioned `inc` under concurrency (shape B) is inferred from the transaction-lock docs, not tested.
- The burst figures come from a model, not a load test. The index lag is assumed.
- Whether Vercel's Firewall rate limiting is available on our plan, and whether Upstash or Neon offer an EU region suitable for GDPR. Neither was checked.

## Appendix: burst model

```python
"""Discrete-event model of hitRateLimitBucket (src/lib/rate-limit/bucket.ts) on ONE shared bucket.
Inputs measured from the 2026-09-24..10-01 request-log export: GROQ read p50 48 ms / p90 86 ms;
sync mutate p50 ~1000 ms; 409 conflicts return in 45-82 ms (so the revision check is early and the
rest of a sync write is waiting for index visibility)."""
import heapq, random, math
MAX_ATTEMPTS=4
def lognorm(med,p90): s=math.log(p90/med)/1.2816; return random.lognormvariate(math.log(med),s)
def run(n,profile,vis,seed):
    random.seed(seed)
    if profile=='uniform60': arr=[random.uniform(0,60) for _ in range(n)]
    elif profile=='front15': arr=[random.uniform(0,15) for _ in range(n)]
    elif profile=='decay': arr=[random.expovariate(1/12) for _ in range(n)]
    commits=[(-1e9,0)]  # (commit_time, rev)
    rev=0; ev=[]; acc=0; den=0; reads=0
    for i,t in enumerate(arr): heapq.heappush(ev,(t,'read',i,0,None))
    while ev:
        t,kind,i,att,seen=heapq.heappop(ev)
        if kind=='read':
            reads+=1
            rt=t+lognorm(.048,.086)
            visible=[r for (ct,r) in commits if ct+vis<=rt]   # newest revision the index shows
            heapq.heappush(ev,(rt,'write',i,att,max(visible)))
        else:
            if seen==commits[-1][1]:
                rev+=1; commits.append((t+0.03,rev)); acc+=1
            elif att+1>=MAX_ATTEMPTS: den+=1
            else: heapq.heappush(ev,(t+lognorm(.06,.08),'read',i,att+1,None))
    return acc,den,reads+acc   # billable = 2xx reads + winning writes
```

`vis` is the index lag: 0.95 for today's GROQ read, 0 for a doc-endpoint read.
