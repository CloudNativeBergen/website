# Research: Bluesky / AT Protocol posting and engagement

**Question (issue [#931](https://github.com/CloudNativeBergen/website/issues/931)).** How does a server post to Bluesky on behalf of a conference account, and read per-post engagement (likes, reposts, replies, quotes)? Covers auth options, the `@atproto/api` client, post records with link cards and images, engagement reads, rate limits, and credential-storage implications — ending with a recommendation for slice 1 of the Marketing Plan feature ([#929](https://github.com/CloudNativeBergen/website/issues/929)).

> **Source note.** `docs.bsky.app` currently 301-redirects to `bsky.network` and serves a client-rendered shell, so the doc pages were read from their first-party source repo (`bluesky-social/bsky-docs`) and every schema fact was cross-checked against the canonical lexicon JSON in `bluesky-social/atproto`. URLs below point at the doc-site pages; schema claims cite the lexicon file, which is authoritative where the two disagree (and they do — see the image size limit).

---

## 1. Auth: app passwords vs OAuth

### App passwords

An app password is a per-application credential the account owner generates in Bluesky's settings and exchanges for a session via `com.atproto.server.createSession`. That procedure takes `identifier` (handle or DID) + `password` and returns `accessJwt`, `refreshJwt`, `handle`, `did` ([createSession lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/server/createSession.json)). The access token "expires after a few minutes"; the refresh token "lasts longer and is used only to update the session with a new access token" — no exact TTLs are published ([get-started](https://docs.bsky.app/docs/get-started)).

What an app password grants (the `transition:generic` scope): create/update/delete **any** record type in the account's repo, upload blobs, read/write preferences, and proxied access to most Lexicon endpoints under that DID. What it does **not** grant: account management (change handle, change email, delete/deactivate/migrate the account), and — unless the separate "DM Access" (`transition:chat.bsky`) toggle is enabled — no DM access ([atproto auth spec](https://atproto.com/specs/auth)).

**Deprecation status.** The `@atproto/api` README says session management via app password "is deprecated in favor of OAuth based session management" ([packages/api README](https://github.com/bluesky-social/atproto/blob/main/packages/api/README.md)), and the auth spec calls the transitional scopes something they intend to "deprecate and eventually remove" ([atproto auth spec](https://atproto.com/specs/auth)). Deprecated, still fully functional, no removal date announced.

### OAuth

For a backend, atproto OAuth means a **confidential client**: `client_id` is a URL pointing at a publicly hosted client-metadata JSON document; grant types `authorization_code` + `refresh_token`; **PKCE (S256) required**; **PAR required**; **DPoP required for all client types** (`dpop_bound_access_tokens: true` is mandatory); confidential clients additionally use `token_endpoint_auth_method: private_key_jwt` with `ES256` and must publish a public key at `jwks`/`jwks_uri`. The guide's own storage recommendation for a Web Service: client signing key in an env var / secrets manager / enclave, DPoP key in a secure database, tokens in a secure database ([OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client)). The Node package is `@atproto/oauth-client-node`.

**The decisive caveat, from the same first-party page:** *"OAuth is not currently recommended as an auth solution for 'headless' clients, such as command-line tools or bots."* ([OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client))

### Which one for us

A conference account posting from a cron job is exactly the headless case Bluesky says OAuth is not yet the answer for. OAuth also drags in three pieces of infrastructure we don't have: a public client-metadata document per deployment, a DPoP keypair, and a **writable token store** — and per [#937](https://github.com/CloudNativeBergen/website/issues/937), `SecretFamily` bags never live in Sanity and there is no writable token store today. An app password is a single opaque string that fits the existing `SecretFamily` shape with no new storage machinery.

---

## 2. The `@atproto/api` client

- Package `@atproto/api`, **version 0.20.42** at time of writing (npm registry). Still pre-1.0 — pin exactly.
- **Current shape** per the README: a session-agnostic `Agent` wrapping a session manager.

  ```ts
  import { Agent, CredentialSession } from '@atproto/api'

  const session = new CredentialSession(new URL('https://bsky.social'))
  await session.login({ identifier, password })
  const agent = new Agent(session)
  ```

- **Naming.** `BskyAgent` is what the doc-site tutorials still use; the current README documents `Agent` + `CredentialSession` as primary and treats `AtpAgent` (with `agent.login()` / `agent.resumeSession(saved)`) as the legacy path. `BskyAgent` is not mentioned in the current README at all. Use `Agent` + `CredentialSession`.
- Session reuse: the legacy `AtpAgent.resumeSession(savedSession)` exists; the modern OAuth equivalent is `oauthClient.restore(did)`. For our purposes the practical question is whether to cache the session JWTs between cron invocations — see rate limits below.
- Relevant methods: `agent.post(record)`, `agent.uploadBlob(data, opts)`, `agent.deletePost(uri)`, `agent.like(uri, cid)`, `agent.repost(uri, cid)`, `agent.getPosts(params)`, `agent.getPostThread(params)`, `agent.getLikes(params)`, `agent.getRepostedBy(params)`. The raw form under `agent.post()` is `com.atproto.repo.createRecord({ repo: did, collection: 'app.bsky.feed.post', record })`.
- `RichText`: `const rt = new RichText({ text }); await rt.detectFacets(agent)` auto-detects links, mentions and tags and produces correct byte offsets. It also exposes `rt.graphemeLength` — the number to validate against the 300 limit. (`rt.length` is UTF-16 code units, which is *not* the limit; the family emoji `👨‍👩‍👧‍👧` is `length=25, graphemeLength=1`.)

---

## 3. Creating a post

Record type `app.bsky.feed.post`. Required: `text`, `createdAt`.

### Text

```json
"text": { "type": "string", "maxLength": 3000, "maxGraphemes": 300 }
```

**Both limits apply simultaneously**: 300 graphemes *and* 3000 UTF-8 bytes ([post lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json)). `text` may be empty if there are embeds. `createdAt` is a client-declared ISO datetime (`2023-08-07T05:31:12.156888Z`). `langs` is an array of at most 3. `tags` is at most 8 entries, each ≤ 640 bytes / 64 graphemes.

### Facets (links, mentions, hashtags)

`facets[].index` uses **`byteStart` / `byteEnd` as byte offsets into the UTF-8 encoding of `text`** — not UTF-16 code units, not code points, not graphemes. The docs warn explicitly that JS `.slice()` and native string indexing are wrong here; use `RichText` ([post richtext guide](https://docs.bsky.app/docs/advanced-guides/post-richtext)). Facets cannot overlap. Feature types: `#link` (`uri`), `#mention` (`did`), `#tag` (`tag`).

This is the single most common way to get a Bluesky post subtly wrong. A campaign post with an emoji before a URL will link the wrong substring unless the offsets come from `RichText`.

### Link card — `app.bsky.embed.external`

Required `external: { uri, title, description }`; optional `thumb` blob, `accept: image/*`, **`maxSize: 1000000`** (1,000,000 bytes) ([external lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/external.json)).

Bluesky does **not** unfurl links server-side. The card's title, description and thumbnail are values *we* supply, which means we build the card ourselves from the target page's OG tags (or, better, from the Sanity content behind the URL — we already own the talk/speaker data). This is an advantage for attribution: the `uri` in the card is our own UTM-tagged link.

### Images — `app.bsky.embed.images`

`images` array, **max 4**. Each entry needs `image` (blob) and `alt` (required alt text); optional `aspectRatio` `{width, height}` as a client hint — leave it undefined rather than guess ([images lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/images.json)).

**Blob size: `maxSize: 2000000` — 2,000,000 bytes.** The lexicon description says "May be up to 2 MB, formerly limited to 1 MB". The prose at [advanced-guides/posts](https://docs.bsky.app/docs/advanced-guides/posts) still says 1,000,000 bytes and is **stale**. Trust the lexicon; but note the promo-image studio output must be compressed to fit either way.

### Upload flow

`com.atproto.repo.uploadBlob` takes raw bytes with a matching `Content-Type` and returns blob metadata (`$type: "blob"`, `ref.$link` CID, `mimeType`, `size`). "The blob will be deleted if it is not referenced within a time window (eg, minutes)" — so upload and create the post in the same operation, not across two cron ticks ([uploadBlob lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/repo/uploadBlob.json)). The PDS caps any single blob at **52,428,800 bytes (50 MiB)**, a separate and much looser ceiling than the per-embed limits ([rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits)).

### Threads and quotes

`reply.root` and `reply.parent` are both required together, each a `com.atproto.repo.strongRef` = `{ uri, cid }`. For a top-level reply `root === parent`; deeper down, `root` stays the thread's original post. Quote posts use `embed.$type: "app.bsky.embed.record"` with a strong ref to the quoted record.

**Implication for the Task model:** the `{ uri, cid }` strong ref, not just the URI, is what a published Task must persist — it's needed for threading follow-ups and for `cid`-scoped engagement reads.

---

## 4. Reading engagement

| Endpoint | Params | Returns |
| --- | --- | --- |
| `app.bsky.feed.getPosts` | `uris` — **max 25** | `posts: postView[]` |
| `app.bsky.feed.getPostThread` | `uri`, `depth` (default 6, max 1000), `parentHeight` (default 80, max 1000) | `thread` union of `threadViewPost` / `notFoundPost` / `blockedPost` |
| `app.bsky.feed.getLikes` | `uri`, optional `cid`, `limit` 1–100 (default 50), `cursor` | `likes: [{ indexedAt, createdAt, actor }]` |
| `app.bsky.feed.getRepostedBy` | same shape | `repostedBy: profileView[]` |
| `app.bsky.feed.getQuotes` | same shape | `posts: postView[]` |

Sources: [getPosts](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/getPosts.json), [getPostThread](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/getPostThread.json), [getLikes](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/getLikes.json), [getRepostedBy](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/getRepostedBy.json), [getQuotes](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/getQuotes.json).

**`postView` carries the counts directly**: `likeCount`, `repostCount`, `replyCount`, `quoteCount` (plus `bookmarkCount`). All are *optional* in the schema — only `uri`, `cid`, `author`, `record`, `indexedAt` are required — so a consumer must treat a missing count as unknown, not as zero ([feed defs lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/defs.json)).

**These reads need no auth.** `getPostThread`'s own description: "Does not require auth, but additional metadata and filtering will be applied for authed requests." And the API directory says the AppView at `https://api.bsky.app` / `https://public.api.bsky.app` does not support authentication at all, with `public.api.bsky.app` being the cached endpoint they ask public-web consumers to use ([API directory](https://docs.bsky.app/docs/advanced-guides/api-directory)).

**This is the important finding for measurement.** Engagement polling for the Marketing Plan needs no session, no credential, and no per-tenant secret — a plain `fetch` to `public.api.bsky.app`, exactly the pattern this repo already uses for the public feeds (see §6). One `getPosts` call with up to 25 URIs returns all four counts for 25 published Tasks in a single round-trip. `getLikes`/`getRepostedBy`/`getQuotes` are only needed if we ever want *who* engaged, which slice 1 does not.

---

## 5. Rate limits

All from [advanced-guides/rate-limits](https://docs.bsky.app/docs/advanced-guides/rate-limits). Responses use the IETF draft rate-limit headers (`ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`); exceeding a limit returns **HTTP 429**.

**Writes — points-based, per account:**

- **5,000 points/hour, 35,000 points/day**
- CREATE = 3 points, UPDATE = 2, DELETE = 1
- ⇒ **1,666 record creations/hour, 11,666/day** at most
- Counted cumulatively across record types, and `com.atproto.repo.applyWrites` sums every write in the batch

**PDS request limits:**

| Limit | Scope | Value |
| --- | --- | --- |
| All API requests | per IP | **3,000 / 5 min** |
| `com.atproto.server.createSession` | **per account** | **30 / 5 min, 300 / day** |
| `com.atproto.identity.updateHandle` | per account | 10 / 5 min, 50 / day |
| `com.atproto.server.createAccount` | per IP | 100 / 5 min |
| `com.atproto.server.deleteAccount` | per IP | 50 / 5 min |
| `com.atproto.server.resetPassword` | per IP | 50 / 5 min |
| Max blob upload | — | 52,428,800 bytes |

**AppView** (`api.bsky.app` / `public.api.bsky.app`): "These API services have generous rate-limits. Please contact us if you encounter rate-limiting." No published number — deliberately looser than the PDS.

**Two practical consequences.**

1. Nothing a conference marketing plan does comes near the write limits. A dozen posts a week against 11,666/day is noise. Rate limiting is not a design constraint for posting; it is only an error case to handle (429 → retry after `ratelimit-reset`).
2. **`createSession` at 300/day per account is the one limit we can actually hit**, and it is per *account*, not per IP — so a multi-tenant deployment where several conferences share one Bluesky account, or a serverless function that logs in fresh on every invocation, is the failure mode. Cache the session (`accessJwt`/`refreshJwt`) and refresh rather than re-login. On Vercel's ephemeral runtime this means either accepting one login per cron tick (fine at any sane cadence) or storing the refresh token — the latter reintroduces the writable-token-store problem, so prefer the former.

---

## 6. What already exists in this repo

Bluesky code here is **read-only public feed display**. There is no posting, no session, no credential.

- `src/lib/bluesky/utils.ts` — `extractHandleFromUrl()` / `hasBlueskySocial()`, parsing `bsky.app/profile/<handle>` out of a link list. That is the whole library directory.
- `src/lib/stream/config.ts` — `deriveBlueskyHandle(socialLinks)` derives the conference's handle from `socialLinks`, deliberately with **no hardcoded fallback handle** so a conference without a Bluesky link renders no feed rather than another org's account. Worth preserving as the precedent for "which account are we acting as".
- `src/components/BlueskyFeed.tsx` — client component, `fetch` to `public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed`, retry/backoff, 5-minute auto-refresh.
- `src/components/stream/BlueskyAuthorFeedLooping.tsx` — server-side, three parallel unauthenticated `fetch`es (`getAuthorFeed`, `searchPosts` for `@handle`, `searchPosts` for the event hashtag) with `next: { revalidate: 300 }` and `Promise.allSettled` so one failing source degrades rather than breaks.
- `src/components/BlueskyPostItem.tsx` — hand-rolled `BlueskyPost` / `BlueskyAuthor` / `BlueskyRecord` types covering only `text`, `createdAt`, and image embeds. **No engagement counts are modelled anywhere.**
- `src/lib/share/social.ts` — `SocialPlatform = 'bluesky'` opens a `bsky.app/intent/compose` window. This is the current "publishing": a browser hand-off, not an API call.

So: no `@atproto/api` dependency, no XRPC beyond hand-written `fetch` URLs, and every existing call is unauthenticated against the public AppView. Adding engagement reads is continuous with what's here; adding posting is genuinely new.

**Where the pieces would go**, following the house patterns:

- Provider interface + one class per channel under `src/lib/marketing/channel/` (or similar), per [`docs/INTEGRATION_ADAPTERS.md`](../INTEGRATION_ADAPTERS.md) — `types.ts` with a channel-agnostic interface, a `BlueskyChannel` class, an `index.ts` factory. **Credentials injected at construction; the provider never reads `process.env`.**
- A `bluesky` credential family in `src/lib/secrets/types.ts` alongside `slack`, `email`, `push` — see §7.
- Engagement polling as a Vercel cron route under `src/app/api/cron/`, matching `weekly-update`'s shape (per-conference isolation, one try/catch each, continue on failure).

---

## 7. Credential-storage implications

An app password is functionally **full control of the account minus account management and DMs**. Anyone holding it can post as the conference, delete the conference's entire post history, follow and unfollow, and upload blobs. It is closer in blast radius to a Slack bot token than to a read-only API key, and it does not expire on its own — rotation is manual, by revoking it in Bluesky's settings.

That maps cleanly onto the existing per-tenant secret layer ([`docs/TENANT_SECRETS.md`](../TENANT_SECRETS.md)): a new `bluesky` `SecretFamily` bag, roughly `{ identifier: string; appPassword: string }`, resolved at the request boundary from `TenantSecretsStore` with the platform env (`BLUESKY_IDENTIFIER`, `BLUESKY_APP_PASSWORD`) as the default-tenant fallback. **Nothing goes in Sanity**, which is the constraint [#937](https://github.com/CloudNativeBergen/website/issues/937) has to respect. Notably this needs *no* new storage capability — unlike OAuth, which would require writing refreshed tokens back somewhere.

**Identify the account by DID, not handle.** The auth spec: the DID is "the permanent, globally unique, publicly resolvable identifier" and should be "bound to the overall auth session and used as the primary account identifier within client app code", while handles "may change over time and need to be re-verified periodically" ([atproto auth spec](https://atproto.com/specs/auth)). A published Task should record the DID it posted as, and the post's `{ uri, cid }` strong ref — an AT-URI embeds the DID, so it stays resolvable even if the conference renames its handle.

**Operational notes.** Store the app password only in the secret store, never in Sanity or a Task document. Log the DID, never the credential. On 401 from `createSession`, surface "Bluesky credential invalid or revoked" to the organizer rather than retrying — the 30-per-5-min `createSession` limit makes a retry loop on a revoked password self-inflicted rate limiting.

---

## 8. Recommendation for slice 1

**Auth: app password, one per conference, in a new `bluesky` `SecretFamily` bag.** Bluesky's own OAuth guide says OAuth is not currently recommended for headless clients, and confidential-client OAuth needs a hosted client-metadata document, a DPoP key and a writable token store — three things this codebase does not have. The app password is deprecated-but-supported, is a single opaque string, and fits the existing secret layer with zero new storage. Isolate it behind a channel provider interface so the eventual OAuth swap is one class.

**Posting: `@atproto/api` (pin 0.20.42), `Agent` + `CredentialSession`, one login per publish.** Build the record with `RichText.detectFacets()` — never hand-compute facet offsets — validate against `rt.graphemeLength <= 300`, and attach an `app.bsky.embed.external` card whose `uri` is our own UTM-tagged link and whose title/description/thumb we generate from Sanity (Bluesky does not unfurl). Images optional in slice 1; if included, ≤ 4, alt text mandatory, ≤ 2,000,000 bytes, uploaded and referenced in the same operation. Persist the returned `{ uri, cid }` strong ref on the Task.

**Engagement: unauthenticated `app.bsky.feed.getPosts` against `public.api.bsky.app`, batched 25 URIs per call, on a cron.** `postView` returns `likeCount`, `repostCount`, `replyCount` and `quoteCount` directly — all four metrics, no session, no credential, no per-tenant secret, and the same public endpoint the repo's feed components already call. Treat a missing count as unknown rather than zero. Skip `getLikes`/`getRepostedBy`/`getQuotes` until we want to know *who*.

**What this rules out of slice 1:** OAuth, a token store, per-actor engagement detail, and any concern about write rate limits (1,666 creates/hour against a dozen posts a week). The one limit to actually respect is `createSession` at **300/day per account** — don't log in more than once per publish, and never retry a login into a 401.
