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
    isOrganizer: boolean
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
- `/cfp/*` (except `/cfp`) and `/admin/*` &rarr; NextAuth middleware
- Everything else &rarr; passes through

The NextAuth middleware (`auth()` wrapper) checks `req.auth`. If absent, redirects to
`/api/auth/signin?callbackUrl={original_url}`.

Production hardening:

- Blocks dev/test routes (`/api/dev/`, `debug`, `test-mode`, `clear-storage`)
- Blocks impersonation parameter (strips `?impersonate=` and redirects)

#### Admin API Middleware (`src/app/(admin)/admin/api/middleware.ts`)

Protects `/admin/api/*` routes with a two-layer check:

1. Session must exist with `user` and `speaker` &rarr; 401 if not
2. `speaker.isOrganizer` must be `true` &rarr; 403 if not

#### tRPC Middleware (`src/server/trpc.ts`)

Three procedure tiers:

- `publicProcedure` &mdash; no auth required
- `protectedProcedure` &mdash; requires `session.speaker._id` (401 otherwise)
- `adminProcedure` &mdash; requires `session.speaker.isOrganizer` (403 otherwise)

Session is obtained via `getAuthSession({ url: req.url })` in `createTRPCContext()`.

### Admin Route Helper (`src/lib/auth/admin.ts`)

`checkOrganizerAccess(req)` is used by admin API route handlers directly wrapped with
`auth()`. Returns `null` if authorized, or a `NextResponse` with 401/403 and
`cache-control: no-store`.

### Test Mode

When `NODE_ENV === 'development'` and `NEXT_PUBLIC_ENABLE_TEST_MODE === 'true'`,
`getAuthSession()` returns a mock session via `AppEnvironment.createMockAuthContext()`.
The mock session has `isOrganizer: true` for full access during development.

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
3. Browser page calls `POST /api/auth/cli/token` (cookie-authenticated)
4. Endpoint returns a 30-day JWE token with the same payload structure as a regular
   NextAuth JWT
5. Browser redirects to `http://localhost:PORT/callback?token=TOKEN&state=STATE`
6. CLI stores token locally and uses it as `Authorization: Bearer TOKEN`

### Token Generation Endpoint

`POST /api/auth/cli/token` (`src/app/api/auth/cli/token/route.ts`):

- Requires valid NextAuth session (cookie-based, browser must be signed in)
- Validates session has `speaker`, `account`, and `user`
- Encodes a JWE using `encode` from `next-auth/jwt` with `AUTH_SECRET` and
  salt `"authjs.session-token"`
- Token lifetime: 30 days
- Returns: `{ token: string, expiresAt: string }`

### Token Compatibility

CLI tokens are encoded with the same secret, salt, and format as regular NextAuth JWTs.
They can be decoded with `decode` from `next-auth/jwt` using the same parameters. The
only difference is the `maxAge` (30 days vs the default session duration).

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

| Variable                       | Description                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`                  | Bearer token for cron job endpoints (`/api/cron/*`). Not related to user auth but uses the same `Authorization: Bearer` header pattern |
| `NEXT_PUBLIC_ENABLE_TEST_MODE` | Set to `"true"` in development to enable mock auth sessions (bypasses OAuth)                                                           |

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
| `src/lib/auth/admin.ts`                   | `checkOrganizerAccess()` helper                       |
| `src/lib/environment/config.ts`           | `AppEnvironment` (test mode, mock sessions)           |
| `src/lib/speaker/sanity.ts`               | `getOrCreateSpeaker()`, provider linking              |
| `src/proxy.ts`                            | Route-level middleware (NextAuth + WorkOS)            |
| `src/server/trpc.ts`                      | tRPC context creation, auth middleware                |
| `src/app/(admin)/admin/api/middleware.ts` | Admin API auth guard                                  |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler                                |
| `src/app/api/auth/callback/route.ts`      | WorkOS callback handler                               |
| `src/app/api/auth/cli/token/route.ts`     | CLI token generation endpoint                         |
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
