# Authentication System

This document describes the authentication architecture, covering the primary NextAuth.js
system (CFP, admin), the WorkOS AuthKit integration (workshops), and the CLI token exchange.

## Overview

The site uses three distinct authentication systems:

| System             | Purpose                      | Routes               | Strategy      |
| ------------------ | ---------------------------- | -------------------- | ------------- |
| NextAuth.js        | CFP, admin, speaker profiles | `/cfp/*`, `/admin/*` | JWT (cookie)  |
| WorkOS AuthKit     | Workshop signups             | `/workshop/*`        | Sealed cookie |
| CLI Token Exchange | CLI tooling                  | Bearer token via API | JWT (header)  |

NextAuth.js is the primary system. Speaker identities live in Sanity and are linked to
OAuth provider accounts. WorkOS is isolated to workshop signup flows and does not share
identity with NextAuth. The sign-in runs through one central auth host
(`WORKSHOP_AUTH_ORIGIN`), which hands the result to the conference's host; the session on
that host is the platform's own cookie, not WorkOS's (see
[WorkOS AuthKit](#workos-authkit-workshops)). CLI tokens are NextAuth-compatible JWTs
issued via browser login.

## NextAuth.js

### Configuration

Defined in `src/lib/auth.ts`. Key settings:

- **Version**: `next-auth@5.0.0-beta.32` (Auth.js v5)
- **Session strategy**: `jwt` (stateless, no database sessions, **no adapter**)
- **Providers**: GitHub OAuth2, LinkedIn OAuth2, `email-link` (magic link, credentials)
- **Custom sign-in page**: `/signin`
- **JWT encryption**: JWE using `AUTH_SECRET` (AES-256-GCM, `"alg": "dir"`)

`providerMap` (rendered as the "Sign in with …" buttons) excludes credentials providers,
so `email-link` appears as its own address form rather than a one-click button.

### Email sign-in (magic link)

The sign-in route for people with neither a GitHub nor a LinkedIn account — the majority of
a general conference audience, and the reason it exists. It works on **every tenant domain**
with no OAuth app registration, which the OAuth providers cannot (one callback URL each).

**Not the built-in Auth.js Email provider.** It is a credentials provider whose `authorize`
verifies the link. Two verified reasons, documented at length in
`src/lib/auth/email-link/verify.ts`:

1. The Email provider requires an **adapter**, and an adapter's mere presence makes
   `@auth/core` route every **OAuth** sign-in through its own account-linking logic
   (`adapter.getUserByAccount` is called unconditionally; `handle-login.js` only
   short-circuits when `!adapter`). That throws `OAuthAccountNotLinked` for the
   returning-user case `getOrCreateSpeaker` deliberately handles by verified-email match.
2. `useVerificationToken` receives only `sha256(token + secret)` and no request context, so
   a self-describing (stateless) token cannot be verified through it at all.

**Two token tiers**, chosen from the address at request time and re-derived at redemption:

| Tier             | Who                                    | Mechanism                                    | TTL    | Replay                |
| ---------------- | -------------------------------------- | -------------------------------------------- | ------ | --------------------- |
| `st1.` stateless | speakers, attendees, unknown addresses | HMAC-signed blob, nothing stored             | 5 min  | possible until expiry |
| `sd1.` stored    | organizers, admins                     | random token, `sha256(raw+secret)` in Sanity | 15 min | single-use, revocable |

The prefix selects a **verification path**, never a privilege. `verifyEmailSignInToken`
recomputes the identity's current tier and refuses a stateless token for a stored-tier
identity, so a link minted before a promotion cannot be replayed afterwards. Authorization
still comes from `organizerOrgIds` on the speaker document at session-mint time.

**Origin binding.** The link is minted from the **request host** (`x-forwarded-host` → `host`,
the same precedence that decides the session cookie's scope) and that host is carried in the
token (stateless) or on the token document (stored). A link minted on tenant A does not
authenticate on tenant B. Nothing in this path reads `NEXTAUTH_URL`/`AUTH_URL` (#687).

**Audience allowlist.** That host is a request header, so on its own the audience check would
compare an attacker-supplied value against an attacker-supplied value — bind the token to
whatever the requester said, twice. Both minting and redemption therefore additionally require
the derived host to be **claimed by some conference's `domains[]`**
(`src/lib/auth/email-link/audience.ts`, exact or single-label-wildcard match, port-stripped,
read live and **fail closed**). Do **not** reason about this from
`sessionCookieRequestHost`'s doc comment: that argues a spoofed `x-forwarded-host` is harmless
because a browser rejects a `Set-Cookie` whose `Domain` does not match the request URL. That is
true for cookies and **does not transfer** to a bearer token redeemed by curl. The edge's
header hygiene (Vercel overwrites the header) is defence in depth, not the control.

Consequence worth knowing: email sign-in only works on a host a conference actually claims.
A brand-new tenant, or a preview deployment on a `*.vercel.app` URL, gets no sign-in mail
until the host is in `domains[]`.

**Login CSRF.** Redemption is an unauthenticated GET and server-side `signIn` runs with
`skipCSRFCheck`, so a GET only mints a session when the browser proves it requested the link:
an HttpOnly `cndn.email-link-intent` cookie holding `sha256(token + AUTH_SECRET)`, set on
**every** link request (a random value when nothing was minted, so its presence is not an
oracle). Any other redemption — the ordinary cross-device case and every induced navigation —
lands on `/signin/confirm`, which mints nothing and whose continue control is a **server
action**, i.e. a POST Next refuses cross-origin. Without this, an attacker's own 5-minute link
silently switches a victim's browser to the attacker's account over an existing session, and a
later "link my GitHub" unions the victim's verified addresses into the attacker's
`knownEmails`. Rendering the interstitial never consumes a token (`peekEmailSignInToken` is a
read), so navigating a victim there cannot burn their real link.

**Rate limits** (Sanity-backed, keyed by a salted hash — no address or IP at rest):
per address 1/60s, 3/15min, 10/24h; per client IP 20/h, 60/24h. Exceeding any of them
produces the same response as success; only the mail is not sent. The read-modify-write is a
**revision-conditioned compare-and-swap with bounded retry** — the same primitive the token
store uses. A plain whole-array replace would not merely overshoot under concurrency, it would
_erase the history_: N concurrent requests each read `hits: []` and each write `hits: [now]`,
so a burst of 50 left a bucket believing one request happened and the caps never accumulated
(measured: 50/50 allowed against a cap of 1; 60 sends in five minutes against a 24h cap of 10).
Read failures fail **open** (an abuse control must not take sign-in down); write failures fail
**closed** (a bucket that is never persisted is not a limit, it is an unmetered mail cannon).

**At rest, and what a burned link costs.** `emailSignInToken` stores only
`sha256(raw + AUTH_SECRET)`, so nothing redeemable leaks — but `identifier` is **plaintext**.
The type is hidden from the Studio's document lists and omnisearch, and `visionTool` can still
query it, so anyone with Studio access or a leaked `SANITY_API_TOKEN_READ` can read the
addresses of organizers with outstanding links. Acceptable while customers have no Studio
access; stated here rather than implied by "hidden from the Studio". Separately, a stored-tier
token is **consumed before the session is minted**, so a failure in speaker resolution costs
the user their link — availability only, the fix is to request another one.

**No enumeration.** Every outcome — unknown address, known organizer, malformed input, rate
limit, mail failure — redirects to the same `/signin/verify-request` page, and every invalid
redemption redirects to the same `/signin?error=EmailSignIn`.

**Known limitation.** `signIn()` writes the session cookie through Next's cookie jar, which
the per-response `Domain` rewriter cannot see, so an email sign-in yields a **host-only**
session cookie. That is the documented safe degradation in `src/lib/auth-cookie-domain.ts`
— strictly narrower than the OAuth path, never broader — but a magic-link session does not
span sibling subdomains of a tenant's domain until the user next signs in via OAuth (which
self-heals the scope) or the flow is moved onto the wrapped route handlers.

**Sender.** The mail goes through `resolveEmailSender(orgId)` +
`resolveConferenceFrom()`, and the **sender policy** on the Resend client itself
(`src/lib/email/sender-policy.ts`, platform#20) makes the result deliverable: a tenant whose
own domain is not verified on the platform Resend account sends from the platform sender with
its conference name in the display name and its own address in `Reply-To`. Verifying a
tenant's domain (`EMAIL_SENDING_DOMAINS`) or giving it a dedicated Resend account
(`TENANT_SECRETS_JSON`, Pro — platform#26) makes it send as itself. See `EMAIL_SYSTEM.md`.

**A failed send stays invisible to the user, by design — never to an operator.** The request
path returns the same opaque outcome regardless, so the only signals are the
`[email] send failed` log at the client (with the org and sender) and the
`[email-link] Resend rejected the sign-in email` log here (with the conference). Do not add a
user-visible signal to compensate: that would hand back the enumeration oracle.

### Organizer invitations — the one grant that keys on email-link

`conference.organizers[]` is the canonical `/admin` grant, and
`organizerInvite.accept` is the only way to enter it without an organizer
already picking you from a list. Its authorization is worth stating here because
it is the one place a _sign-in mechanism_ is also an _authorization proof_.

**The invitation token is not ownership proof.** Invitation mail is forwarded and
sits in shared inboxes, so holding the link proves only that you have the link.
Acceptance therefore requires `session.emailLinkIdentifier`: the address **this
session** proved by redeeming a magic link, stamped onto the JWT at the moment of
redemption and read back through
`emailLinkIdentifierOf` (`src/lib/auth/email-link/identity.ts`).

**Why a session claim rather than the speaker document.** The obvious proof is
`providers[]` containing `email-link:<address>` — only
`getOrCreateSpeakerForVerifiedEmail` MINTS such an entry, and only after a link
to that address was redeemed. It was the first implementation and it was wrong,
for two reasons worth recording:

1. `providers[]` is an **accumulating dedup key**, not an assertion about the
   person holding the session. `mergeSpeakers` unions a loser's `providers[]`
   onto the survivor, so an organizer who can arrange to merge a document
   carrying `email-link:victim@x` moves that entry onto their own and could then
   present it as proof of a mailbox they never controlled.
2. Even without a merge it proves only "controlled it **at some point**". A
   speaker who accrued `email-link:a@x` months ago and signs in today with
   `email-link:b@x` would have satisfied a check about `a@x`.

Reading the fact from the session removes both at once. `knownEmails` and the
display `email` are weaker still — both are matched by `findSpeakersByEmails` and
`knownEmails` has the wider writer set (#808) — so neither is consulted.

**Absent means no proof.** OAuth sessions carry no claim, and neither does any
session minted before the claim existed, so both are refused and every consumer
must fail closed. That is also how platform#49 phase 3 (OAuth accept, gated on
website#808) stays deferred by construction rather than by a separate check. The
cost is one extra sign-in, which for this flow is the action being asked for
anyway.

**The claim is a fact, not a capability.** Knowing which address a session proved
grants nothing on its own; authorization still comes from `organizerOrgIds`.

**Nothing about acceptance writes identity.** The only writes are the
conference's `organizers[]` and the invitation's own status. Identity resolution
happened earlier, inside the sign-in path, on an address proved by delivery.

**Check order in `accept` is load-bearing:** token signature → conference-scoped
lookup → stored-token compare → **ownership** → expiry → status → grant.
Everything above ownership refuses with one identical `NOT_FOUND`, and the three
ownership branches share one message, so a stranger holding a forwarded token
learns neither that the invitation exists nor its lifecycle state — and cannot
trigger the expiry write that would burn it. The status check sits **below**
expiry so a lapsed invitation gets the expiry message rather than a generic one.
The accept page mirrors the same order for the same reason.

Standing takes effect on the next token mint, so the accept page calls
`useSession().update()` (see the session-refresh section above).

### OAuth Flow

```text
Browser                     Site                        OAuth Provider
  │                           │                               │
  ├─ Click "Sign in" ────────►│ /signin                       │
  │                           ├─ signIn(providerId) ─────────►│
  │                           │                               ├─ User authorizes
  │                           │◄── callback with code ────────┤
  │                           ├─ jwt callback:                │
  │                           │   getOrCreateSpeaker()        │
  │                           │   enrich token with speaker   │
  │◄── Set session cookie ────┤                               │
```

1. User clicks a provider button on `/signin`
2. Server action calls `signIn(providerId, { redirectTo })` which redirects to the
   OAuth provider
3. Provider redirects back to `/api/auth/callback/{provider}`
4. The `jwt` callback fires with `trigger === 'signIn'`:
   - Validates token has `email` and `name`
   - Validates account has `provider` and `providerAccountId`
   - Calls `getOrCreateSpeaker(user, account)` to find or create a Sanity speaker document
   - Stores speaker profile and account info on the JWT token
5. NextAuth sets an encrypted HttpOnly cookie containing the JWT

### Session Refresh (`trigger === 'update'`)

The speaker claims baked into the JWT (`organizerOrgIds`, `isOrganizer`,
`name`/`image`) are captured at sign-in. Without a refresh path they would only
change on a full re-login — which would, for example, lock the creator of a
brand-new organization out of it until they signed out and back in, and let stale
organizer grants persist for the token's life.

The `jwt` callback therefore handles `trigger === 'update'`: it re-fetches the
speaker (`getSpeaker`, the same `organizerOrgIds` + `isOrganizer` read used at
sign-in) and re-applies the claims via `applySpeakerToToken`, preserving the
authenticated `account`. A transient read failure (or a vanished document) returns
the existing token unchanged — a refresh never invalidates a live session. This
path is kept strictly separate from sign-in and never runs the link-intent logic.

**How to trigger it**

- **Client (browser).** Call the updater from next-auth's session hook:

  ```typescript
  'use client'
  import { useSession } from 'next-auth/react'

  const { update } = useSession()
  // After an action that changes the speaker's grants (e.g. creating an org):
  await update() // re-invokes the jwt callback with trigger 'update'
  ```

  The payload is ignored (the callback re-reads from Sanity), so `update()` with
  no argument is sufficient. This works out of the box because `callbacks.jwt` is
  registered — no extra wiring is needed. The app wraps the client tree in
  next-auth's `SessionProvider` (via `SessionProviderWrapper` in the root layout),
  which `useSession()` requires. The wiring is already exercised in production by
  `SessionRefreshOnRestore` (`src/components/providers/SessionRefreshOnRestore.tsx`),
  which calls `update()` on bfcache restore; with the update path implemented, that
  refresh now also re-reads the speaker's grants from Sanity.

- **Server.** next-auth's `unstable_update` (returned from `NextAuth(config)`) can
  drive the same refresh from a server action if a client round-trip is undesired.

### Multi-Domain OAuth (Centralized Auth Origin, #619)

**Opt-in, config-driven, off by default.** Wired in `src/lib/auth.ts` via
`redirectProxyConfig()`, driven by the `AUTH_REDIRECT_PROXY_URL` env var. When
the env is **absent** the built config carries no proxy keys and behavior is
byte-for-byte today's single-domain flow.

#### The problem

A GitHub OAuth app allows **exactly one** authorization callback URL, and cookies
cannot span registrable domains. So a single OAuth app cannot directly serve
conferences hosted on different domains: the provider rejects a mismatched
`redirect_uri` with `redirect_uri_mismatch` **before our app ever runs**.

#### The mechanism

Auth.js's `redirectProxyUrl` (env `AUTH_REDIRECT_PROXY_URL`) pins the OAuth
`redirect_uri` to **one central auth origin**. The flow, in words:

```text
2026.example.no                auth.example.no (proxy)            OAuth Provider
      │                              │                                 │
      ├─ signIn(github) ────────────►│  redirect_uri = the proxy       │
      │  (state carries the origin)  ├────────────────────────────────►│
      │                              │◄──── code + signed state ───────┤
      │◄── bounce code to origin ────┤  (proxy sees isOnRedirectProxy) │
      ├─ token exchange + jwt/session callbacks run HERE, on the origin
      │◄── Set session cookie (origin-local)
```

The central origin is the ONLY callback URL registered with the OAuth app. It
verifies the **signed `state`** and bounces the authorization `code` back to the
initiating origin, where token exchange and our `jwt`/`session` callbacks run and
the session cookie is set. Setting `AUTH_REDIRECT_PROXY_URL` **auto-enables the
provider's `state` check** (Auth.js contract) — that signed round-trip is what
carries the initiating origin safely.

#### Configuration

`redirectProxyConfig()` returns `{ redirectProxyUrl, trustHost: true }` when the
env is set, spread **last** into the NextAuth config. `trustHost` is enabled
alongside it because the central origin must trust the incoming `Host` to build
callback URLs (on Vercel `trustHost` already defaults true). The URL must include
the full path up to where Auth.js is initialized, e.g.
`https://auth.example.no/api/auth`.

#### Interaction with provider-link intents

The self-service **"link another provider"** flow (see [Speaker Linking](#speaker-linking))
binds a link-intent to the initiating session by reading two **origin-local**
cookies in the `jwt` callback: the `LINK_INTENT_COOKIE` and the pre-existing
session token (`readPriorSessionToken`). Because the redirect proxy only governs
the OAuth `redirect_uri` (the authorization round-trip) and the `jwt`/`session`
callbacks still run **on the initiating origin**, the link-intent logic needs
**no change** and is unaffected by the proxy at the code level.

**Limitation (documented, not enforced):** link-intents are same-session /
same-origin by construction. The proxy is effectively scoped to sign-**in**; it
does not make provider-linking work **across** registrable domains, since the
initiating cookies are origin-local and are not shared with a different domain.
Cross-domain provider-linking is therefore not a supported combination.

#### Manual verification (cannot be E2E-tested here)

1. Register the proxy origin's `/api/auth/callback/{provider}` as the OAuth app's
   single callback URL.
2. Set `AUTH_REDIRECT_PROXY_URL=https://auth.<domain>/api/auth` on each satellite
   deployment.
3. Sign in from a satellite domain → confirm the provider redirects to the proxy
   origin, then lands back on the satellite with a valid session.
4. On a satellite, run the profile "link another provider" flow → confirm the
   intent still binds to the initiating session (link-intent unaffected).

The config wiring itself is unit-tested (`redirectProxyConfig` under both env
states) in `src/lib/auth.test.ts`.

### Speaker Linking

`getOrCreateSpeaker()` in `src/lib/speaker/sanity.ts` links OAuth identities to Sanity
speaker documents using a `providers` array:

1. **Find by provider ID**: Query speakers where `providers[]` contains `"github:12345"`
2. **Find by email**: If not found by provider, fall back to email lookup. If found,
   append the new provider ID to the `providers[]` array (links the account)
3. **Create new**: If neither found, create a new speaker document with initial provider

Provider format: `"{provider}:{providerAccountId}"` (e.g., `"github:12345"`,
`"linkedin:789"`)

### JWT Token Structure

The encrypted JWT contains:

```typescript
{
  sub: string           // NextAuth subject ID
  name: string          // User display name
  email: string         // User email
  picture: string       // Avatar URL (192x192 crop from Sanity if available)
  iat: number           // Issued at (Unix timestamp)
  exp: number           // Expiry (Unix timestamp)
  jti: string           // Unique token ID
  speaker: {
    _id: string         // Sanity document ID
    name: string
    email: string
    image: string       // Sanity image reference
    isOrganizer: boolean  // DEPRECATED global flag; NO LONGER used for authz
                          // (see "Authorization bridges" below) — UI reads only
    organizerOrgIds: string[] // Org-SCOPED organizer capability (#614/#635):
                          // deduped organization refs the speaker organizes.
                          // The org-scoped authz waist gates on this.
    flags: Flags[]      // e.g., ["local", "first-time"]
  }
  account: {
    provider: string    // "github" | "linkedin"
    providerAccountId: string
    type: string        // "oauth"
    access_token: string
    // ... other provider-specific fields
  }
}
```

### Session Interface

Defined in `src/types/next-auth.d.ts`:

```typescript
interface Session {
  user: {
    sub?: string
    name: string
    email: string
    picture: string
  }
  speaker?: Speaker
  account?: Account
  isImpersonating?: boolean // Dev-only
  realAdmin?: Speaker // Dev-only
}
```

### Route Protection

Three layers of protection are used depending on the route type:

#### Middleware (`src/proxy.ts`)

The top-level middleware routes requests to the correct auth system:

- `/cfp/*` (except `/cfp`), `/admin/*`, and `/cli/*` &rarr; NextAuth middleware
- Everything else &rarr; passes through, `/workshop*` included: the workshop portal keeps
  a session of its own, which its page and the `workshop.*` procedures read for
  themselves (see [WorkOS AuthKit](#workos-authkit-workshops))

The NextAuth middleware (`auth()` wrapper) checks `req.auth`. If absent, redirects to
`/api/auth/signin?callbackUrl={original_url}`.

Production hardening:

- Blocks dev/test routes (`/api/dev/`, `debug`, `test-mode`, `clear-storage`)
- Blocks impersonation parameter (strips `?impersonate=` and redirects)

#### tRPC Middleware (`src/server/trpc.ts`)

Three procedure tiers:

- `publicProcedure` &mdash; no auth required
- `protectedProcedure` &mdash; requires `session.speaker._id` (401 otherwise)
- `adminProcedure` &mdash; org-scoped organizer check (403 otherwise): the request's
  org is resolved from the domain conference and the caller's `organizerOrgIds`
  must include it (see `src/lib/authz/organizer.ts`)

Session is obtained via `getAuthSession({ url, headers })` in `createTRPCContext()`,
which supports both cookie-based and Bearer token authentication.

All admin operations previously protected by REST middleware are now handled by
`adminProcedure` in tRPC routers.

#### Authorization bridges (org-scoped) &mdash; both REMOVED

Org-scoped organizer authz (`isOrganizerForOrg`, #614/#635) gates on the JWT's
`organizerOrgIds` and **nothing else**. Two migration bridges to the deprecated
global `isOrganizer` flag once softened it; both are now gone:

- **Org UNRESOLVABLE (`orgId === null`) &mdash; FAILS CLOSED.** The 044 backfill has
  run (every live conference has an `organization`), so an unresolvable org is now
  an unknown domain / transient failure rather than pre-backfill data. It **denies**
  (a `console.warn('[authz-deny] …')` records the denial of a caller who
  organizes at least one org, so the failure mode stays observable).
- **Legacy TOKEN (no `organizerOrgIds` field) &mdash; REMOVED.** Tokens minted before
  #635 lack the field, and the bridge deferred wholesale to the global flag. That
  flag is true for an organizer of **any** org, so a legacy token granted organizer
  on **any host** &mdash; a cross-tenant grant. It now **denies**: a holder of a
  pre-#635 token is an ordinary non-organizer until they sign in again, or until
  the `trigger === 'update'` session refresh (above) re-mints a modern token
  carrying `organizerOrgIds`.

The deprecated `isOrganizer` claim is still minted into the token and read by UI
and by non-authz code (badge sorting, messaging recipient selection), but it no
longer participates in any authorization decision.

### Test Mode

When `NODE_ENV === 'development'` and `NEXT_PUBLIC_ENABLE_TEST_MODE === 'true'`,
`getAuthSession()` returns a mock session via `AppEnvironment.createMockAuthContext()`.
The mock session has `isOrganizer: true`, and `getAuthSession()` additionally
stamps its `organizerOrgIds` with the **current domain's** org so it gets
organizer access under the org-scoped model. If that org cannot be resolved the
mock session is denied organizer access like any other caller (fail closed).

Test mode can also be activated per-request with `?test=true` on protected routes.

### Impersonation (Development Only)

Organizers can impersonate speakers in development by adding `?impersonate={speakerId}`
to any URL. Security controls:

- **Production**: blocked unconditionally (parameter stripped, request redirected)
- **Development**: requires `isOrganizer: true`, validates ID format against
  `^[a-zA-Z0-9_-]+$]`, max 100 chars, prevents impersonating other organizers
- All impersonation is logged with `[AUDIT]` prefix

## CLI Token Exchange

Enables CLI tools to authenticate against site APIs using a long-lived Bearer token.
See `docs/CLI_AUTH.md` for the full implementation plan.

### How It Works

1. CLI opens browser to `/cli/login?port=PORT&state=STATE`
2. User authenticates via NextAuth (GitHub/LinkedIn) if not already signed in
3. The CLI login page client component (`cli-login-client.tsx`) calls the
   `speaker.generateCliToken` tRPC mutation
4. If `port` and `state` are present, redirects to
   `http://localhost:PORT/callback?token=TOKEN&state=STATE`
5. If no `port`, the token is displayed for manual copy-paste
6. CLI stores token locally and uses it as `Authorization: Bearer TOKEN`

### CLI Login Page

`/cli/login` (`src/app/cli/login/page.tsx` + `cli-login-client.tsx`):

- Server component reads session and passes user identity to the client component
- Client component fetches the token and handles redirect or display
- Protected by NextAuth middleware (redirects to `/signin` if not authenticated)
- **Security**: redirect target must be `localhost` or `127.0.0.1`, port 1024–65535,
  `state` required when `port` is present

### Token Generation

The `speaker.generateCliToken` tRPC mutation (`src/server/routers/speaker.ts`):

- Protected by `protectedProcedure` (requires valid NextAuth session)
- Reads `speaker`, `account`, and `user` from the session context
- Encodes a JWE using `encode` from `next-auth/jwt` with `AUTH_SECRET` and
  salt `"authjs.session-token"`
- Token lifetime: 30 days
- Returns: `{ token: string, expiresAt: string }`

### Bearer Token Support

`getSessionFromBearerToken()` in `src/lib/auth.ts` decodes CLI tokens:

- Uses `decode` from `next-auth/jwt` with the same secret and salt
- Validates token expiry (`exp` check — `decode()` does not check this automatically)
- Validates required fields: `sub`, `speaker._id`, `account`
- Returns a `Session` object or `null` on any failure

`getAuthSession()` transparently supports Bearer tokens:

1. Tries cookie-based auth via `_auth()` first (always takes precedence)
2. If no cookie session, checks `req.headers` for `Authorization: Bearer <token>`
3. Calls `getSessionFromBearerToken()` and returns the result
4. Bearer sessions never get impersonation (only cookie sessions in dev mode)

This is wired into `createTRPCContext()` which passes both `url` and `headers` to
`getAuthSession()`, enabling Bearer auth for all tRPC endpoints automatically.

### Token Compatibility

CLI tokens are encoded with the same secret, salt, and format as regular NextAuth JWTs.
They can be decoded with `decode` from `next-auth/jwt` using the same parameters. The
only difference is the `maxAge` (30 days vs the default session duration).

### Limitations

- **No token revocation**: JWTs are stateless. A denylist can be added later if needed.
- **No refresh tokens**: users re-run `cli login` when the token expires.
- **Full permission parity**: CLI tokens have the same permissions as browser sessions.

## WorkOS AuthKit (Workshops)

A separate auth system used only by the attendee workshop portal. It proves an email
address. Whether that address may sign up for workshops is decided afterwards, from the
conference's tickets (`decideWorkshopPortalAccess` in `src/lib/workshop/access.ts`).

- **Package**: `@workos-inc/node` (the plain server SDK), built once per process in
  `src/lib/workshop/central-sign-in/workos.ts`. No AuthKit Next.js middleware and no SDK
  session; `__tests__/lib/workshop/no-authkit-sdk.test.ts` keeps it that way.
- **Tenant-host routes**: `/workshop` (the portal page), `/workshop/sign-in`,
  `/workshop/sign-up`, `/workshop/redeem`, and the sign-out server action in
  `src/app/(workshop)/workshop/actions.ts`.
- **Auth-host routes**: `/api/auth/workshop/start`, `/api/auth/callback`,
  `/api/auth/workshop/sign-out`, `/api/auth/workshop/signed-out`.
- **Identity**: stored as `userWorkOSId` on `workshopSignup` documents in Sanity.

Workshop sessions are completely independent from NextAuth sessions. A user signed in
via GitHub for CFP has no automatic session for workshops, and vice versa. The design
record is [WORKSHOP_CENTRAL_SIGN_IN_SPEC.md](WORKSHOP_CENTRAL_SIGN_IN_SPEC.md) (#1311);
the code is `src/lib/workshop/central-sign-in/`.

### The auth host

Every tenant signs in through the same WorkOS environment, and that environment holds
two addresses for the application, added by hand once per environment: the redirect URI
`<auth origin>/api/auth/callback` and the sign-out redirect
`<auth origin>/api/auth/workshop/signed-out` (`src/lib/workshop/sign-in-paths.ts`).

`WORKSHOP_AUTH_ORIGIN` names the auth host (in production `https://auth.konf.app`). It
serves no conference: it starts a sign-in, takes the callback from WorkOS, hands the
result to the conference's host, and takes the return from a sign-out. A tenant host is
never a WorkOS callback: the WorkOS environment is shared by every tenant, so its
registered addresses stay on a host the platform operates.

`authOrigin()` (`src/lib/workshop/central-sign-in/decision.ts`) reads the variable:

- **set** to a bare `https` origin of a hostname: the auth-host routes answer 404 on
  every other host, and the tenant-host routes answer 404 on the auth host;
- **unset**: a host is its own auth host. The start route then accepts only a request
  naming the host it arrived on. This is local development and a single-domain
  installation, and system status warns about it in a deployed build;
- **anything else** (a path, a query, userinfo, an IPv6 literal, plain `http` outside
  development): every decision refuses. Sign-in is unavailable on every host, the
  auth-host routes answer 404, and the server log and system status say why.

### Which hosts may carry the portal

`resolveProvenDestination` (`src/lib/domain-verification/destination.ts`) is the one
rule, asked on the tenant host by every route that begins or redeems a sign-in and by
every read of the session, and on the auth host by start, callback and sign-out. A host
qualifies when its `domainVerification` record is **proven** — it passes
`isAllowlistEligible` and is either a host the platform allocated or a record with
`method: 'dns-txt'` — the record names that exact host, and the conference holding the
record still lists it in `domains[]`. A grandfathered record inside its grace period is
not enough. `localhost` qualifies only with `NODE_ENV=development`. The record is read
live on every decision, with no cache, and a read error refuses. Details are in
[DOMAIN_VERIFICATION.md](DOMAIN_VERIFICATION.md#workshop-sign-in-which-hosts-receive-a-hand-off).

The routes that begin a sign-in, the auth host's start and callback, and the redeem route
also check that the tenant has workshops (`isWorkshopsEnabledForConference`), so a tenant
without them is never sent to WorkOS. Sign-out does not: a conference that has turned
workshops off still lets its attendees out.

### The four steps

1. **Tenant host, `/workshop/sign-in` or `/workshop/sign-up`**
   (`central-sign-in/tenant-start.ts`). After the decision above, a random value goes
   into a cookie on this host (`__Host-workshop-sign-in`, 10 minutes) and the browser is
   sent to the auth host's start route with one sealed request, valid for 60 seconds,
   naming this host, the SHA-256 of that value and the screen to show. No WorkOS URL is
   built here.
2. **Auth host, start** (`central-sign-in/start.ts`). Without a request a tenant host
   sealed, nothing is read and the answer is 404. It takes the decision for the named
   host, generates a PKCE pair, seals the host, the conference that claims it, the hash
   and a nonce as the OAuth `state` (10 minutes), puts the nonce and the PKCE verifier in
   a cookie on the auth host (`__Host-workshop-auth-start`, 10 minutes), and redirects to
   WorkOS's authorize URL with `redirect_uri` `<auth origin>/api/auth/callback`.
3. **Auth host, callback** (`central-sign-in/callback.ts`). Before the code is
   exchanged: the state unseals and has not expired, a code is present, the cookie from
   step 2 carries the state's nonce, the decision holds again for the host in state, and
   the conference claiming it is still the one in state. Only then does it exchange the
   code with the PKCE verifier. It keeps **no session and no WorkOS token**: it seals a
   hand-off (60 seconds) holding the WorkOS user ID, email, whether WorkOS reports the
   email verified, name, the WorkOS session ID (the access token's `sid`), the host, the
   conference and the hash, clears the step 2 cookie, and redirects to
   `https://<host>/workshop/redeem?token=…` with `Cache-Control: no-store` and
   `Referrer-Policy: no-referrer`. Every refusal is a 404 with one line in the log
   (`logRefusal`), and a failed exchange is a 404 too.
4. **Tenant host, redeem** (`central-sign-in/redeem.ts`). The token must unseal and not
   have expired, the browser must hold the step 1 cookie and its value must hash to what
   the token carries, and the token must name this host; so far from the request alone.
   Then the decision is taken live, the conference claiming the host must be the one in
   the token, and it must have workshops. The session cookie is set, the step 1 cookie is
   cleared and the browser goes to `/workshop`; that path is fixed. A refusal goes to
   `/workshop?sign-in=incomplete`, signed out, with one neutral line on the page and the
   reason in the log only; no cookie is touched.

The hand-off is not single use: nothing records a redeemed token. Only the browser that
began can redeem it, and a redeem clears the cookie that makes it that browser.

### The session on the tenant host

`__Host-workshop-session` (`central-sign-in/session.ts`): HttpOnly, `Secure`,
`SameSite=Lax`, `Path=/`, sealed by the platform. The `__Host-` prefix makes the browser
refuse a `Domain`, so no sibling host can set or replace it. It holds the WorkOS user
ID, email, whether the email is verified, name, the WorkOS session ID, the host it was
issued for and the conference that claimed the host then.

**Fixed 7 days from sign-in, no renewal.** The expiry inside the seal decides; the
cookie's own `Max-Age` only tells the browser when to drop it, and a read never writes a
cookie. A session counts only when it unseals, has not expired, was issued for the
request's host, the host still passes the decision above (read live), and the conference
claiming the host is the one it was issued for. The portal page (`readWorkshopPortal`)
and the tRPC attendee identity (`readWorkshopSession`, `src/server/trpc.ts`) read it;
neither calls WorkOS.

The login behind it is not per host: a WorkOS account is one account for every conference
on the platform, and `/privacy` says so to workshop participants. Organizers only see
the workshop registrations of their own organization's conferences.

### Sign-out

`signOutOfWorkshop` (`src/app/(workshop)/workshop/actions.ts`) clears the session cookie
on the tenant host and redirects to where `workshopSignOutTarget`
(`central-sign-in/sign-out.ts`) says: with a session of this host, the auth host's
`/api/auth/workshop/sign-out` with one sealed request (60 seconds) naming the host and the
WorkOS session ID; with none, or with an unusable `WORKSHOP_AUTH_ORIGIN`, the front page.

The auth host answers only a browser's navigation (a request carrying the `RSC` header
is a 404, so Next's own prefetch of a same-host redirect ends nothing). Without a sealed
request nothing is read. It checks that the request is on the auth host and that the
named host may be returned to, keeps the host in a cookie of its own
(`__Host-workshop-sign-out`, 5 minutes), and sends the browser to WorkOS's logout with
the session ID and the one fixed return address, with no referrer. The return route
(`/api/auth/workshop/signed-out`) reads that cookie, clears it, checks the host again and
redirects to `https://<host>/`; with no valid host it shows a plain signed-out page.

Signing out on one host does not end a session the same attendee holds on another
conference's host; that one lasts until its 7 days are over.

### The seal

`central-sign-in/seal.ts`: `jose` `EncryptJWT`, `alg: dir`, `enc: A256GCM`, with the
expiry inside the token and checked with no tolerance. One key per purpose
(`start-request`, `auth-state`, `auth-start`, `handoff`, `session`, `sign-out-request`,
`sign-out-return`), each derived from `WORKOS_COOKIE_PASSWORD` with HKDF-SHA256 and the
purpose as its label, so a hand-off token is never accepted as a session and the reverse.

**`WORKOS_COOKIE_PASSWORD` seals identity: whoever holds it can issue a session.** It
must be at least 32 characters, a different value in every environment, and the
production value must not be available to preview deployments. Changing it signs everyone
out: no existing session, hand-off or request unseals under the new key. With no usable
password both `seal` and `unseal` throw, so a deployment without one cannot sign anyone
in and does not read as a merely refused seal.

### Cookies in development

`hostCookie` (`central-sign-in/cookies.ts`) drops the `__Host-` prefix and the `Secure`
flag when `NODE_ENV` is `development`, because a browser may not store a `Secure` cookie
over plain HTTP. `NODE_ENV` is `production` in every deployed build, previews included.

Operations are in [WORKSHOP_SIGN_IN_RUNBOOK.md](WORKSHOP_SIGN_IN_RUNBOOK.md).

## Environment Variables

### Required

| Variable               | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `AUTH_SECRET`          | Secret for JWT encryption (JWE). Generate with `openssl rand -base64 32` |
| `AUTH_GITHUB_ID`       | GitHub OAuth App client ID                                               |
| `AUTH_GITHUB_SECRET`   | GitHub OAuth App client secret                                           |
| `AUTH_LINKEDIN_ID`     | LinkedIn OAuth App client ID                                             |
| `AUTH_LINKEDIN_SECRET` | LinkedIn OAuth App client secret                                         |

### Optional

| Variable                       | Description                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`                  | Bearer token for cron job endpoints (`/api/cron/*`). Not related to user auth but uses the same `Authorization: Bearer` header pattern                                                                          |
| `NEXT_PUBLIC_ENABLE_TEST_MODE` | Set to `"true"` in development to enable mock auth sessions (bypasses OAuth)                                                                                                                                    |
| `AUTH_REDIRECT_PROXY_URL`      | **Opt-in** centralized OAuth origin (#619) for serving multiple domains from ONE OAuth app. Absent = single-domain (today's default). See [Multi-Domain OAuth](#multi-domain-oauth-centralized-auth-origin-619) |

### WorkOS (Workshops Only)

Only needed when a tenant on the deployment has workshops.

| Variable                 | Description                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`       | Client ID of the one WorkOS environment every tenant shares. System status reports whether it is set                                                                                                                                                                                         |
| `WORKOS_API_KEY`         | API key of that environment, used by the server SDK on the auth host                                                                                                                                                                                                                         |
| `WORKOS_COOKIE_PASSWORD` | **Seals identity** (see [The seal](#the-seal)): whoever holds it can issue a session. At least 32 characters. A different value in every environment, and the production value must not be available to preview deployments. Changing it signs everyone out                                  |
| `WORKSHOP_AUTH_ORIGIN`   | The auth host, as a bare `https` origin (`https://auth.konf.app` in production). Unset: each host is its own auth host and must be registered at WorkOS itself, which is right only for a single-domain installation; system status warns. Invalid: sign-in is refused on every host (error) |

`WORKOS_REDIRECT_URI` and `NEXT_PUBLIC_WORKOS_REDIRECT_URI` are not needed and should be
removed where they are still set: the redirect URI is passed to the SDK explicitly
(`workshopCallbackUri`), and nothing in this repository reads either variable. The test
setup (`vitest.setup.ts`) deletes every `WORKOS_*` and `NEXT_PUBLIC_WORKOS_*` variable
from the test environment; suites set the three above through
`__tests__/helpers/workosEnv.ts`.

Local development (`NODE_ENV=development`): `localhost` carries the portal without a
verification record, and `WORKSHOP_AUTH_ORIGIN` may be unset (one origin) or a plain
`http` origin such as `http://127.0.0.1:<port>` (two origins: `127.0.0.1` is then the auth
host and `localhost` the tenant host). Register that auth origin's
`/api/auth/callback` and `/api/auth/workshop/signed-out` in a WorkOS **staging**
environment. Cookies are set without `__Host-` and `Secure` in development. That WorkOS
staging accepts `http://127.0.0.1:<port>` next to `localhost` is documented, not
verified here.

### GitHub OAuth App Setup

1. Go to GitHub &rarr; Settings &rarr; Developer settings &rarr; OAuth Apps &rarr; New
2. **Homepage URL**: `http://localhost:3000` (dev) or production URL
3. **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID &rarr; `AUTH_GITHUB_ID`
5. Generate client secret &rarr; `AUTH_GITHUB_SECRET`

### LinkedIn OAuth App Setup

1. Go to LinkedIn Developer Portal &rarr; Create App
2. Under **Auth** tab, add redirect URL: `http://localhost:3000/api/auth/callback/linkedin`
3. Request **Sign In with LinkedIn using OpenID Connect** product
4. Copy Client ID &rarr; `AUTH_LINKEDIN_ID`
5. Copy Client Secret &rarr; `AUTH_LINKEDIN_SECRET`

## Key Files

| File                                            | Purpose                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/auth.ts`                               | NextAuth configuration, callbacks, `getAuthSession()`                            |
| `src/types/next-auth.d.ts`                      | Session type augmentation                                                        |
| `src/lib/environment/config.ts`                 | `AppEnvironment` (test mode, mock sessions)                                      |
| `src/lib/speaker/sanity.ts`                     | `getOrCreateSpeaker()`, `getOrCreateSpeakerForVerifiedEmail()`, provider linking |
| `src/lib/auth/email-link/`                      | Magic-link tokens, tiering, store, rate limit, send                              |
| `src/app/api/auth/email-link/callback/route.ts` | Magic-link redemption (GET → server-side `signIn`)                               |
| `src/app/(main)/signin/confirm/`                | Login-CSRF interstitial for an unproven redemption                               |
| `src/app/(main)/signin/actions.ts`              | "Email me a link" server action (uniform response)                               |
| `src/proxy.ts`                                  | Route-level middleware (NextAuth; `/workshop*` is not handled there)             |
| `src/lib/workshop/central-sign-in/`             | Workshop sign-in: start, callback, hand-off, redeem, session, sign-out, the seal |
| `src/lib/domain-verification/destination.ts`    | Which hosts may receive a workshop sign-in hand-off                              |
| `src/lib/workshop/sign-in.ts`                   | Where the workshop portal is for a link that leaves the request (the main host)  |
| `src/server/trpc.ts`                            | tRPC context creation, auth middleware, the workshop attendee identity           |
| `src/app/api/auth/[...nextauth]/route.ts`       | NextAuth route handler                                                           |
| `src/app/api/auth/callback/route.ts`            | The one WorkOS callback, on the auth host                                        |
| `src/app/api/auth/workshop/`                    | The auth host's start, sign-out and signed-out routes                            |
| `src/server/routers/speaker.ts`                 | `generateCliToken` mutation and auth procedures                                  |
| `src/app/(main)/signin/page.tsx`                | Custom sign-in page                                                              |

## Security Considerations

- **JWT encryption**: Tokens are JWE (encrypted), not JWS (signed-only). Token contents
  cannot be read without `AUTH_SECRET`.
- **Cookie flags**: HttpOnly, Secure (production), SameSite=Lax.
- **Redirect validation**: The `redirect` callback only allows same-origin redirects
  (`url.startsWith(baseUrl)`).
- **Rate limiting**: only the email sign-in request path is rate limited (per address and
  per client IP, see above). OAuth endpoints rely on the providers' own limits on token
  exchange.
- **Token revocation**: JWTs are stateless and cannot be individually revoked. Rotating
  `AUTH_SECRET` invalidates all tokens — including every outstanding magic link, since both
  tiers are keyed to it. CLI tokens follow the same model. Stored-tier magic links are the
  one credential here that can be revoked individually (delete the `emailSignInToken`).
- **Magic-link hygiene**: the redemption route sets `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store` and `X-Robots-Tag: noindex`, strips the token from the redirect
  target, and no code path logs a raw token.
- **Provider token storage**: The full OAuth `Account` object (including provider
  `access_token`) is stored in the JWT. The provider token is not actively used after
  sign-in but is available for future provider API calls.
- **Workshop sign-in**: `WORKOS_COOKIE_PASSWORD` seals every token and cookie of the
  workshop sign-in, the session included, so holding it is holding the ability to issue a
  session. It differs per environment, is kept out of previews in its production value,
  and rotating it signs every workshop attendee out. No WorkOS token is stored anywhere;
  the hand-off token travels in a URL once, under `no-store` and `no-referrer`, and lives
  60 seconds.
