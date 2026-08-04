# Programmatic Text+Image Posting as an Organization/Brand Account — Platform API Survey

**Date:** 2026-08-05
**Question:** What does it take to programmatically publish text+image posts as an organization/brand account on LinkedIn, Bluesky, X, Facebook Pages, Instagram Business, Threads, and Mastodon — auth model, approvals, cost, scopes, media constraints, token lifetimes, and rate limits?

All claims cite the official platform developer docs fetched 2026-08-05 unless flagged **UNVERIFIED**. X pricing and Meta review policies change frequently — re-verify before committing to a budget.

---

## TL;DR

- **Mastodon and Bluesky are nearly free of friction**: no app review, no cost, effectively non-expiring credentials (Mastodon tokens don't expire; Bluesky app passwords + refreshable sessions), simple REST calls.
- **Threads is the easiest of the Meta family**: standalone use case, 60-day refreshable tokens, but images must be publicly hosted and Meta App Review is needed to onboard arbitrary users (not needed if you only post as your own tester accounts).
- **Facebook Pages and Instagram** share the Meta App Review + Business Verification burden; once through it, long-lived Page tokens **never expire**, which makes steady-state operation pleasant. Instagram is stricter (JPEG-only, public URL required).
- **LinkedIn** requires a Community Management API access request from a **registered legal organization** with a verified company page — the vetting is the hard part; the Posts API itself is straightforward, tokens last 60 days, and programmatic refresh is **partner-restricted**.
- **X is now the most expensive and volatile**: as of Feb 2026 the API is **pay-per-usage** ($0.015 per post created, **$0.20 per post containing a URL**); the Free/Basic/Pro tiers are closed to new signups and legacy Basic is being force-migrated since June 2026.

---

## Difficulty-Ranked Matrix (easiest → hardest)

| # | Platform | Auth | Approval/review | Cost | Token lifetime | Posting limit | One-line rationale |
|---|----------|------|-----------------|------|----------------|---------------|--------------------|
| 1 | **Mastodon** | OAuth 2 (auth code + PKCE), per-instance app via `POST /api/v1/apps` | None | Free | Does not expire (revocation only) | 300 req/5 min; 30 media uploads/30 min | Self-serve app registration, non-expiring tokens, dead-simple REST. |
| 2 | **Bluesky** | App password + `createSession` JWTs, or atproto OAuth (no central registration) | None | Free | Session refresh; OAuth refresh tokens | ~1,666 record-creates/hr (5,000 pts/hr) | No review, no cost; only quirks are blob upload + 300-grapheme limit. |
| 3 | **Threads** | OAuth 2 (Threads-specific authorization window) | Meta App Review to publish app (skip for own tester accounts) | Free | 60-day long-lived, refreshable ≥24h old | 250 posts/24h | Clean two-step publish; refresh keeps tokens alive indefinitely; needs public image URL. |
| 4 | **Facebook Pages** | OAuth 2 user token → Page access token | Meta App Review for `pages_manage_posts` (+ Business Verification for advanced access) | Free | Long-lived Page tokens **do not expire** | Not documented per-page (Graph API platform limits apply) | Easy API, never-expiring page token; App Review is the tax. |
| 5 | **Instagram Business** | OAuth 2 (Instagram Login or Facebook Login) → user/page token | Meta App Review (`instagram_content_publish` etc.) | Free | 60-day long-lived (IG Login) / non-expiring Page token path | 100 API-published posts/24h | Same Meta review burden plus JPEG-only, public-URL-only, container+publish dance. |
| 6 | **LinkedIn** | OAuth 2 auth code, 3-legged; page ADMIN/CONTENT_ADMIN member authorizes | Community Management API access request: legal org, verified business email, page-verified app; second review for Standard tier | Free | 60 days; programmatic refresh limited to partners | Not published (429 on excess) | Organizational vetting (legal entity + screencast review) and re-auth every 60 days for most apps. |
| 7 | **X / Twitter** | OAuth 2 user context (PKCE) `tweet.write` or OAuth 1.0a | Developer account + prepaid credits | **Pay-per-usage**: $0.015/post, $0.20/post-with-URL | OAuth 2 tokens with refresh (offline.access) | 100 posts/15 min/user; 10,000/24h/app | Every single post costs money, URL posts cost 13x more, and pricing/tiers have churned twice in 3 years. |

---

## 1. LinkedIn (Organization Pages — Community Management API / Posts API)

**Auth model.** OAuth 2.0 authorization code flow ("3-legged"); a LinkedIn *member* authenticates and the app acts on their behalf. To post as an organization, the authenticated member must hold a company-page role of `ADMINISTRATOR`, `DIRECT_SPONSORED_CONTENT_POSTER`, or `CONTENT_ADMIN` — the `w_organization_social` scope is restricted to such members. There is no page-owned token; it is always a user token with org authority. Page roles cannot be granted via API, only in the UI.
Sources: [Posts API — Permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [3-legged OAuth flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow), [Quick Start](https://learn.microsoft.com/en-us/linkedin/marketing/quick-start).

**Approvals.** You must apply for the **Community Management API** product from the Developer Portal. Requirements: registered **legal organization** (commercial use cases only), verified business email (personal addresses fail vetting), organization legal name/address/website/privacy policy, and the app must be verified by a super admin of the org's LinkedIn Page. Two tiers: **Development tier** (form review) then **Standard tier** (second form + downloadable screencast demonstrating the full OAuth flow and posting, + test credentials). Rejection forces you to create a *new* app and reapply. LinkedIn does not publish review SLAs; community reports suggest days-to-weeks per tier (**UNVERIFIED** — not stated in primary docs).
Source: [Community Management App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).

**Cost.** Free.

**Scopes for text+image org posts.** `w_organization_social` (create posts/comments/likes as org). Image upload via `/rest/images` accepts `w_organization_social` among others. Reading org posts back needs `r_organization_social`.
Sources: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Images API — Permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api).

**Posting mechanics.** `POST https://api.linkedin.com/rest/posts` with `author: urn:li:organization:{id}`, `commentary`, `visibility`, `distribution`, `lifecycleState: PUBLISHED`; headers `Linkedin-Version: YYYYMM` + `X-Restli-Protocol-Version: 2.0.0`. Images: `POST /rest/images?action=initializeUpload` (owner = org URN) → PUT bytes to the returned `uploadUrl` → reference `urn:li:image:{id}` in `content.media.id`.
Sources: [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api).

**Media constraints.** JPG, GIF, PNG; images < 36,152,320 pixels (no byte-size limit documented); GIF up to 250 frames. Alt text via `content.media.altText` (image `altText` max 4,086 chars, ≤120 recommended). Commentary character limit is **not stated** in the Post Schema doc; the 3,000-char limit widely cited matches the UI (**UNVERIFIED** from primary docs — API returns `FIELD_LENGTH_TOO_LONG` on excess).
Sources: [Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api), [Post Schema](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema).

**Tokens.** Access tokens are issued with a **60-day lifespan** (`expires_in: 5184000`); LinkedIn explicitly does not issue long-lived tokens. Refresh = send the user through the auth flow again (silent redirect if still logged in and token unexpired). **Programmatic refresh tokens are available only to a limited set of partners.** Requesting a different scope invalidates all previous tokens.
Source: [3-legged OAuth flow, Steps 3 & 5](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

**Rate limits.** Not published; API returns `429 TOO_MANY_REQUESTS` when exceeded. Per-app/per-user daily limits are shown per-app in the Developer Portal (**UNVERIFIED** exact numbers — not in public docs).
Source: [Posts API — Error Details](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api).

---

## 2. Bluesky (AT Protocol)

**Auth model.** Two options: (a) **app passwords** — create one in Settings, call `com.atproto.server.createSession` with handle + app password, get `accessJwt`/`refreshJwt`; (b) **atproto OAuth** (now the recommended path for client apps) — no central registration: the `client_id` is the HTTPS URL of a self-hosted client-metadata JSON document, and any client can authorize against any PDS. A brand account is just an account; whoever holds the credential posts as it — no separate org concept.
Sources: [Creating posts guide](https://docs.bsky.app/docs/advanced-guides/posts), [OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client).

**Approvals.** None. No review process, no developer signup.
Source: [OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client) ("without prior registration or coordination").

**Cost.** Free.

**Scopes/permissions.** App-password sessions have full posting rights. OAuth scopes exist under the atproto OAuth profile; posting = writing `app.bsky.feed.post` records via `com.atproto.repo.createRecord`.
Source: [Creating posts guide](https://docs.bsky.app/docs/advanced-guides/posts).

**Media constraints.** Post `text`: **300 graphemes** (3,000 bytes max) per the `app.bsky.feed.post` lexicon. Images: up to **4 per post** via `app.bsky.embed.images`; each blob (uploaded with `com.atproto.repo.uploadBlob`) max **2,000,000 bytes (~2 MB)** ("formerly limited to 1 MB"); accepted MIME `image/*`; **`alt` text is a required field** per image (no documented max length). Strip EXIF before upload (recommended).
Sources: [app.bsky.feed.post lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json), [app.bsky.embed.images lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/images.json), [posts guide](https://docs.bsky.app/docs/advanced-guides/posts).

**Tokens.** `createSession` yields access + refresh JWTs; long-lived clients refresh periodically (`com.atproto.server.refreshSession`). OAuth flows likewise issue access + refresh tokens with periodic refresh; docs warn against concurrent refresh (can kill the session). Exact JWT lifetimes are not documented (access JWTs are short, ~hours — **UNVERIFIED**).
Source: [OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client).

**Rate limits (bsky.social PDS).** Points system: create = 3 pts; **5,000 points/hour and 35,000/day per account** (≈1,666 creates/hr, ≈11,666/day). `createSession`: 30 per 5 min, 300/day per account. Global: 3,000 requests/5 min per IP.
Source: [Rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits).

---

## 3. X / Twitter (API v2)

**Auth model.** OAuth 2.0 Authorization Code with PKCE (user context) with scopes `tweet.read`, `tweet.write`, `users.read` (+ `offline.access` for refresh tokens), or legacy OAuth 1.0a user context. A brand account is an ordinary account the app is authorized against — no org/page construct.
Source: [Create Post endpoint](https://docs.x.com/x-api/posts/create-post).

**Approvals & cost — MAJOR CHANGE.** As of the current docs, **"The X API uses pay-per-usage pricing. No subscriptions — pay only for what you use."** You buy prepaid credits in the Developer Console; charges per request:

| Operation | Price |
|---|---|
| Post creation | **$0.015 per request** |
| Post creation **containing a URL** | **$0.200 per request** |
| Post read | $0.005 per resource |
| User read | $0.010 per resource |
| Owned reads (your own data) | $0.001 per resource |
| DM send | $0.015 per request |

Pay-per-usage is capped at 2M post reads/month; beyond that is Enterprise. Up to 20% back in xAI API credits at ≥$1,000/mo spend.
Source: [X API pricing](https://docs.x.com/x-api/getting-started/pricing).

**The Free/Basic/Pro tiers are gone for new signups.** Per secondary reporting: on 2026-02-06 X made pay-per-use the default and closed the $200/mo Basic and $5,000/mo Pro tiers (and the free write-only tier) to new developers; on 2026-05-21 X announced legacy Basic subscribers would be auto-migrated to pay-per-use after 2026-06-01 at end of billing cycle. (**Secondary sources** — the official docs no longer mention the tiers at all, which corroborates their retirement: [twitterapi.io breakdown](https://twitterapi.io/blog/x-api-cost-breakdown-2026), [postproxy.dev](https://postproxy.dev/blog/x-api-pricing-2026/), [opentweet.io](https://opentweet.io/how-to/x-api-pay-per-use-explained).) For historical reference, the legacy tiers were: Free — 500 posts/mo, write-only; Basic $200/mo — 3,000 posts/mo (user), 50,000 (app); Pro $5,000/mo — 300,000 posts/mo (**UNVERIFIED** against current primary docs; removed from docs.x.com).

**Posting mechanics.** `POST /2/tweets` with `text` and optional `media.media_ids` (1–4). Media uploaded first via the v2 media upload endpoints (initialize/append/finalize chunked flow, or simple upload for images); alt text attached via the Create Media Metadata endpoint (`alt_text.text`). Quote posts via API are Enterprise-only.
Sources: [Create Post](https://docs.x.com/x-api/posts/create-post), [Media upload intro](https://docs.x.com/x-api/media/introduction), [Create media metadata](https://docs.x.com/x-api/media/create-media-metadata).

**Media constraints.** Images: JPG, PNG, GIF, WEBP; **≤5 MB** per image; animated GIF ≤15 MB (≤1280x1080, ≤350 frames). Post text limit 280 characters for standard accounts (longer for premium) — **UNVERIFIED** from current primary docs (not stated on the fetched pages). Alt text supported via metadata endpoint; 1,000-char limit commonly cited (**UNVERIFIED**).
Sources: [Media best practices](https://docs.x.com/x-api/media/quickstart/best-practices), [Create media metadata](https://docs.x.com/x-api/media/create-media-metadata).

**Tokens.** OAuth 2.0 user-context access tokens are short-lived (2h) with refresh tokens when `offline.access` is granted (**lifetime figures UNVERIFIED** — not on fetched pages); OAuth 1.0a tokens do not expire.

**Rate limits.** `POST /2/tweets`: **100 per 15 min per user**, **10,000 per 24h per app**. Media upload: 500/15 min per user, 50,000/24h per app. Enterprise gets custom limits.
Source: [Rate limits](https://docs.x.com/x-api/fundamentals/rate-limits).

---

## 4. Facebook Pages (Graph API)

**Auth model.** OAuth 2.0 (Facebook Login). A user with a role on the Page grants the app permissions; the app exchanges the user token for a **Page access token** via `GET /{user-id}/accounts`, then calls the Pages API with the Page token.
Sources: [Access tokens guide](https://developers.facebook.com/docs/facebook-login/guides/access-tokens), [Pages API posts](https://developers.facebook.com/docs/pages-api/posts).

**Approvals.** Permissions `pages_manage_posts` and `pages_read_engagement` require **Meta App Review** for Advanced Access (i.e., to serve users outside your own app roles/business); Business Verification is required for advanced access as a business app. If you only post to Pages administered by people with roles on your own app, Standard Access suffices without review (**partially UNVERIFIED** — review-necessity nuances live in the App Review docs, not the fetched page; the Pages posts doc confirms extra approval such as Page Public Content Access for pages you don't own). Realistic App Review lead time: days to a few weeks (**UNVERIFIED** — Meta does not publish an SLA).
Source: [Pages API posts](https://developers.facebook.com/docs/pages-api/posts).

**Cost.** Free.

**Scopes for text+image posts.** `pages_manage_posts` + `pages_read_engagement`; publish text/link posts to `POST /{page-id}/feed`, photos to `POST /{page-id}/photos` (with `url` or file, plus `message` caption). Response returns photo and post IDs. Scheduling supported (10 min–30 days ahead).
Source: [Pages API posts](https://developers.facebook.com/docs/pages-api/posts).

**Media constraints.** The Pages posts doc doesn't enumerate image format/size limits; the Graph API photos edge commonly documents JPEG/PNG/GIF/TIFF/BMP up to 4 MB (10 MB for PNG advised <1 MB to avoid re-compression) — **UNVERIFIED** from the fetched page. No practical text length limit documented (~63,206 chars folk value — **UNVERIFIED**). Programmatic alt text on Page photos is not exposed as a dedicated field in the fetched docs (**UNVERIFIED/absent**).

**Tokens.** Short-lived user tokens ~1–2 h; long-lived user tokens ~60 days (Meta warns lifetimes "may change without warning"). **"Long-lived Page access tokens do not have an expiration date"** — obtained by exchanging a long-lived user token via `/{user-id}/accounts`; they only invalidate under specific conditions (password change, role removal, etc.). This makes steady-state posting maintenance-free.
Sources: [Access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens), [Long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived).

**Rate limits.** Not stated on the posts page; Pages use Graph API Platform/Page-level rate limiting (BUC) documented separately (**UNVERIFIED** exact formulas from this fetch).

---

## 5. Instagram Business (Instagram Platform / Content Publishing API)

**Auth model.** OAuth 2.0 via either **Instagram Login** (scopes `instagram_business_basic`, `instagram_business_content_publish`) or **Facebook Login** (scopes `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`). Requires an Instagram **professional (business) account**; with Facebook Login it must be connected to a Facebook Page.
Source: [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing).

**Approvals.** Meta App Review for the content-publish scopes to serve external users (as with Pages); Business Verification for business apps. Lead time days–weeks (**UNVERIFIED**, no published SLA).

**Cost.** Free.

**Posting mechanics.** Two-step: `POST /{ig-user-id}/media` with `image_url` + `caption` (creates a container) → `POST /{ig-user-id}/media_publish` with the container ID. Check `status_code` on the container for processing. **Media must be hosted on a publicly accessible URL** — the API cURLs it; you cannot upload image bytes directly for feed photos.
Sources: [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing), [IG User Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media).

**Media constraints.** **JPEG only** (no PNG for feed images); **max 8 MB**; aspect ratio 4:5 to 1.91:1; width 320–1440 px (scaled otherwise); sRGB (auto-converted). Caption: **max 2,200 characters, 30 hashtags, 20 @-mentions**. **Alt text**: `alt_text` param, up to 1,000 chars (images only, not reels/stories).
Sources: [IG User Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media), [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing).

**Tokens.** Instagram Login: short-lived (1h) → long-lived 60-day tokens, refreshable (same model as Threads — **partially UNVERIFIED**, token page not fetched). Facebook Login path: use a never-expiring long-lived Page token as above.
Source: [Long-lived tokens (Meta)](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived).

**Rate limits.** **100 API-published posts per 24-hour moving window** per IG account (carousel = 1 post).
Source: [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing).

---

## 6. Threads (Threads API)

**Auth model.** OAuth 2.0 against the Threads-specific authorization window; Meta app with the **Threads use case** (note: such apps get two app IDs — use the *Threads* app ID/secret). The brand's Threads account authorizes directly; no page/org indirection.
Source: [Get started](https://developers.facebook.com/docs/threads/get-started).

**Approvals.** **App Review + app published** for arbitrary users to grant permissions. During development, **Threads Testers** (invited in App Dashboard) can authorize without review — sufficient if you only post as your own brand accounts and add them as testers. Lead time for review: days–weeks (**UNVERIFIED**).
Source: [Get started](https://developers.facebook.com/docs/threads/get-started).

**Cost.** Free.

**Scopes.** `threads_basic` (always) + `threads_content_publish` (posting).
Source: [Get started](https://developers.facebook.com/docs/threads/get-started).

**Posting mechanics.** Two-step like Instagram: `POST /{threads-user-id}/threads` (container: `media_type=TEXT|IMAGE`, `text`, `image_url`) → `POST /{threads-user-id}/threads_publish`. **Image must be on a public URL** ("we will cURL your image").
Source: [Posts](https://developers.facebook.com/docs/threads/posts).

**Media constraints.** Text: **500 characters** (emoji counted as UTF-8 bytes). Images: **JPEG or PNG**, **max 8 MB**, width 320–1440 px, ≤10:1 aspect, sRGB. Alt text: `alt_text` param on image/video containers (added to the API; not on the fetched posts page — **UNVERIFIED** here).
Source: [Posts](https://developers.facebook.com/docs/threads/posts).

**Tokens.** Short-lived: **1 hour**. Long-lived: **60 days**, refreshable via `GET /refresh_access_token` as long as the token is unexpired and ≥24h old; refreshed tokens valid 60 days from refresh; unrefreshed tokens die after 60 days. So a cron refresh keeps the integration alive indefinitely.
Source: [Long-lived tokens](https://developers.facebook.com/docs/threads/get-started/long-lived-tokens).

**Rate limits.** **250 published posts per 24 hours** per profile (plus general API request limits).
Source: [Posts](https://developers.facebook.com/docs/threads/posts).

---

## 7. Mastodon (REST API)

**Auth model.** OAuth 2.0 per instance: register the app with `POST /api/v1/apps` (client_name, redirect_uris, scopes) → get client_id/secret → authorization code flow (PKCE supported since 4.3.0) for a user token. Client-credentials flow exists for app-only (read) contexts. Password grant has been removed. A brand account is just an account on the instance.
Sources: [Obtaining a token](https://docs.joinmastodon.org/client/token/), [OAuth spec compliance](https://docs.joinmastodon.org/spec/oauth/).

**Approvals.** None — fully self-serve on any instance (subject to instance policy).
Source: [Obtaining a token](https://docs.joinmastodon.org/client/token/).

**Cost.** Free (instance-dependent).

**Scopes.** `write:statuses` for posting; `write:media` for uploads (or the umbrella `write`).
Sources: [Statuses methods](https://docs.joinmastodon.org/methods/statuses/), [Media methods](https://docs.joinmastodon.org/methods/media/).

**Posting mechanics.** Upload image: `POST /api/v2/media` (multipart `file`, optional `description` = alt text, `focus` point); small images return 200 synchronously. Then `POST /api/v1/statuses` with `status` + `media_ids[]`; supports `visibility`, `spoiler_text`, `scheduled_at` (≥5 min ahead), and an `Idempotency-Key` header (1h window).
Sources: [Media methods](https://docs.joinmastodon.org/methods/media/), [Statuses methods](https://docs.joinmastodon.org/methods/statuses/).

**Media constraints.** Formats/sizes are **per-instance configuration**, exposed via `GET /api/v2/instance` (`configuration.media_attachments`: supported MIME types, `image_size_limit`, etc.); mastodon.social defaults are ~16 MB images (**UNVERIFIED** default value). Character limit likewise per-instance (`configuration.statuses.max_characters`); the stock default is 500 (**default value UNVERIFIED** on the fetched page, which notes limits "vary by server"). Alt text via `description` (no hard length cap documented on the fetched page; 1,500-char limit in recent releases — **UNVERIFIED**).
Sources: [Media methods](https://docs.joinmastodon.org/methods/media/), [Statuses methods](https://docs.joinmastodon.org/methods/statuses/).

**Tokens.** Access tokens have **no automatic expiration** — the OAuth spec page documents revocation (RFC 7009) but no expiry; tokens remain valid until revoked. (Explicit "do not expire" phrasing not present on the fetched page — **weakly verified**; behaviorally true across Mastodon releases.)
Source: [OAuth spec compliance](https://docs.joinmastodon.org/spec/oauth/).

**Rate limits.** Default **300 requests / 5 min** per account (and per IP); `POST /api/v1/media` limited to **30 / 30 min**; deletion 30/30 min. Headers `X-RateLimit-Limit/Remaining/Reset` returned. Limits are defaults — instances can change them.
Source: [Rate limits](https://docs.joinmastodon.org/api/rate-limits/).

---

## Cross-Platform Observations

- **Public-URL image hosting** is mandatory for Instagram and Threads (Meta cURLs your image); LinkedIn, Bluesky, X, Facebook (file upload option), and Mastodon accept direct byte uploads. If you build a shared pipeline, you need a public, tenant-safe image CDN for the Meta pair anyway.
- **Token babysitting tiers:** none (Mastodon, FB long-lived Page tokens) → automated refresh (Bluesky, Threads, X OAuth2, IG) → human re-auth every 60 days (LinkedIn, unless you're a refresh-token partner).
- **Only X charges per post.** At $0.015/post ($0.20 with a URL — and brand posts almost always carry a URL), a modest 100-posts-with-links/month costs ~$20/mo, and pricing has changed twice since 2023; treat X as the budget and churn risk.
- **Alt-text support** is universal except Facebook Page photos (no documented API field): LinkedIn `altText`, Bluesky `alt` (required!), X metadata endpoint, IG/Threads `alt_text`, Mastodon `description`.

## Sources

1. LinkedIn Posts API — https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
2. LinkedIn Images API — https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
3. LinkedIn Post Schema — https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/post-api-schema
4. LinkedIn 3-legged OAuth — https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
5. LinkedIn Community Management App Review — https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review
6. LinkedIn Marketing Quick Start — https://learn.microsoft.com/en-us/linkedin/marketing/quick-start
7. Bluesky posts guide — https://docs.bsky.app/docs/advanced-guides/posts
8. Bluesky rate limits — https://docs.bsky.app/docs/advanced-guides/rate-limits
9. Bluesky OAuth client guide — https://docs.bsky.app/docs/advanced-guides/oauth-client
10. app.bsky.feed.post lexicon — https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json
11. app.bsky.embed.images lexicon — https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/images.json
12. X API pricing — https://docs.x.com/x-api/getting-started/pricing
13. X Create Post — https://docs.x.com/x-api/posts/create-post
14. X rate limits — https://docs.x.com/x-api/fundamentals/rate-limits
15. X media best practices — https://docs.x.com/x-api/media/quickstart/best-practices
16. X media metadata (alt text) — https://docs.x.com/x-api/media/create-media-metadata
17. X pricing-change reporting (secondary): https://twitterapi.io/blog/x-api-cost-breakdown-2026 , https://postproxy.dev/blog/x-api-pricing-2026/ , https://opentweet.io/how-to/x-api-pay-per-use-explained
18. Facebook Pages API posts — https://developers.facebook.com/docs/pages-api/posts
19. Facebook access tokens — https://developers.facebook.com/docs/facebook-login/guides/access-tokens
20. Facebook long-lived tokens — https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
21. Instagram content publishing — https://developers.facebook.com/docs/instagram-platform/content-publishing
22. Instagram IG User Media reference — https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
23. Threads get started — https://developers.facebook.com/docs/threads/get-started
24. Threads posts — https://developers.facebook.com/docs/threads/posts
25. Threads long-lived tokens — https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
26. Mastodon token guide — https://docs.joinmastodon.org/client/token/
27. Mastodon statuses methods — https://docs.joinmastodon.org/methods/statuses/
28. Mastodon media methods — https://docs.joinmastodon.org/methods/media/
29. Mastodon rate limits — https://docs.joinmastodon.org/api/rate-limits/
30. Mastodon OAuth spec — https://docs.joinmastodon.org/spec/oauth/
