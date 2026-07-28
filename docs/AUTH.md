# Authentication System

This document describes the authentication architecture, covering the primary NextAuth.js
system (CFP, admin), the WorkOS AuthKit integration (workshops), and the CLI token exchange.

## Overview

The site uses three distinct authentication systems:

| System             | Purpose                      | Routes               | Strategy         |
| ------------------ | ---------------------------- | -------------------- | ---------------- |
| NextAuth.js        | CFP, admin, speaker profiles | `/cfp/*`, `/admin/*` | JWT (cookie)     |
| WorkOS AuthKit     | Workshop signups             | `/workshop/*`        | Session (WorkOS) |
| CLI Token Exchange | CLI tooling                  | Bearer token via API | JWT (header)     |

NextAuth.js is the primary system. Speaker identities live in Sanity and are linked to
OAuth provider accounts. WorkOS is isolated to workshop signup flows and does not share
identity with NextAuth. CLI tokens are NextAuth-compatible JWTs issued via browser login.

## NextAuth.js

### Configuration

Defined in `src/lib/auth.ts`. Key settings:

- **Version**: `next-auth@5.0.0-beta.30` (Auth.js v5)
- **Session strategy**: `jwt` (stateless, no database sessions)
- **Providers**: GitHub OAuth2, LinkedIn OAuth2
- **Custom sign-in page**: `/signin`
- **JWT encryption**: JWE using `AUTH_SECRET` (AES-256-GCM, `"alg": "dir"`)

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

- `/workshop*` &rarr; WorkOS AuthKit middleware
- `/cfp/*` (except `/cfp`), `/admin/*`, and `/cli/*` &rarr; NextAuth middleware
- Everything else &rarr; passes through

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
  (a `console.warn('[authz-bridge] …')` records the denial of a caller who
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

A separate auth system used exclusively for workshop signup flows:

- **Package**: `@workos-inc/authkit-nextjs@^3.0.0`
- **Routes**: `/workshop`, `/workshop/*`
- **Middleware**: Configured in `src/proxy.ts` via `authkitMiddleware()`
- **Callback**: `src/app/api/auth/callback/route.ts` handles `GET` via `handleAuth()`
- **Identity**: Stored as `userWorkOSId` on `workshopSignup` documents in Sanity

WorkOS sessions are completely independent from NextAuth sessions. A user signed in via
GitHub for CFP has no automatic session for workshops, and vice versa.

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

WorkOS environment variables are managed by `@workos-inc/authkit-nextjs` and documented
in its package. They are only needed if workshop signup is enabled.

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

| File                                      | Purpose                                               |
| ----------------------------------------- | ----------------------------------------------------- |
| `src/lib/auth.ts`                         | NextAuth configuration, callbacks, `getAuthSession()` |
| `src/types/next-auth.d.ts`                | Session type augmentation                             |
| `src/lib/environment/config.ts`           | `AppEnvironment` (test mode, mock sessions)           |
| `src/lib/speaker/sanity.ts`               | `getOrCreateSpeaker()`, provider linking              |
| `src/proxy.ts`                            | Route-level middleware (NextAuth + WorkOS)            |
| `src/server/trpc.ts`                      | tRPC context creation, auth middleware                |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler                                |
| `src/app/api/auth/callback/route.ts`      | WorkOS callback handler                               |
| `src/server/routers/speaker.ts`           | `generateCliToken` mutation and auth procedures       |
| `src/app/(main)/signin/page.tsx`          | Custom sign-in page                                   |

## Security Considerations

- **JWT encryption**: Tokens are JWE (encrypted), not JWS (signed-only). Token contents
  cannot be read without `AUTH_SECRET`.
- **Cookie flags**: HttpOnly, Secure (production), SameSite=Lax.
- **Redirect validation**: The `redirect` callback only allows same-origin redirects
  (`url.startsWith(baseUrl)`).
- **No rate limiting**: Auth endpoints do not have explicit rate limiting. OAuth providers
  have their own rate limits on token exchange.
- **Token revocation**: JWTs are stateless and cannot be individually revoked. Rotating
  `AUTH_SECRET` invalidates all tokens. CLI tokens follow the same model.
- **Provider token storage**: The full OAuth `Account` object (including provider
  `access_token`) is stored in the JWT. The provider token is not actively used after
  sign-in but is available for future provider API calls.
