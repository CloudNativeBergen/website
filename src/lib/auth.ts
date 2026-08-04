import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import LinkedIn from 'next-auth/providers/linkedin'
import Credentials from 'next-auth/providers/credentials'
import type { Account, NextAuthConfig, Profile, Session, User } from 'next-auth'
import { decode } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import { getOrCreateSpeaker } from '@/lib/speaker/sanity'
import {
  applySessionCookieDomain,
  sessionCookieRequestHost,
  SESSION_TOKEN_COOKIE_NAMES,
} from '@/lib/auth-cookie-domain'
import { speakerImageUrl } from '@/lib/sanity/client'
import { AppEnvironment } from '@/lib/environment/config'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'
import type { Speaker } from '@/lib/speaker/types'
import type { JWT } from 'next-auth/jwt'

export interface NextAuthRequest extends NextRequest {
  auth: Session | null
}

/**
 * Write a resolved speaker (and the account just authenticated with) onto the
 * JWT. Shared by the normal login path and the Phase-2 link path so both mint an
 * identical token shape.
 */
function applySpeakerToToken(
  token: JWT,
  speaker: Speaker,
  account: Account,
): void {
  if (speaker.image && typeof speaker.image === 'string') {
    token.picture = speakerImageUrl(speaker.image, {
      width: 192,
      height: 192,
      fit: 'crop',
    })
  }

  token.account = account
  token.speaker = {
    _id: speaker._id,
    slug: speaker.slug,
    name: speaker.name,
    email: speaker.email,
    image: speaker.image,
    // Deprecated GLOBAL flag — kept as the org-scoped authz migration bridge.
    isOrganizer: speaker.isOrganizer,
    // Org-SCOPED organizer capability (CaaS T1-2, #614). Deduped + falsy-filtered
    // so a speaker organizing several conferences of one org contributes its org
    // id once, and pre-backfill conferences (no org) contribute nothing.
    organizerOrgIds: Array.from(
      new Set((speaker.organizerOrgIds ?? []).filter(Boolean)),
    ),
    flags: speaker.flags,
  }
}

/**
 * Decode the browser's PRE-EXISTING NextAuth session token from the request
 * cookies.
 *
 * Why this is needed: on an OAuth sign-in, `@auth/core` builds a FRESH default
 * token from the just-authenticated provider and passes THAT to the `jwt`
 * callback — it does NOT hand us the session that was active before the flow
 * started. To bind a link-intent to its initiating session we therefore decode
 * the still-present session cookie ourselves (same secret/salt as `@auth/core`).
 * Handles the chunked cookie form (`<name>.0`, `.1`, …) that `@auth/core` uses
 * for large tokens. Returns `null` when there is no valid prior session.
 */
async function readPriorSessionToken(jar: {
  get(name: string): { value: string } | undefined
}): Promise<
  (JWT & { speaker?: Session['speaker']; account?: Session['account'] }) | null
> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null

  for (const base of SESSION_TOKEN_COOKIE_NAMES) {
    let value = jar.get(base)?.value
    if (!value) {
      const chunks: string[] = []
      for (let i = 0; ; i++) {
        const chunk = jar.get(`${base}.${i}`)?.value
        if (!chunk) break
        chunks.push(chunk)
      }
      if (chunks.length) value = chunks.join('')
    }
    if (!value) continue

    try {
      const decoded = await decode({ token: value, secret, salt: base })
      if (decoded) {
        return decoded as JWT & {
          speaker?: Session['speaker']
          account?: Session['account']
        }
      }
    } catch {
      // Try the next candidate cookie name.
    }
  }
  return null
}

/**
 * NextAuth `events.signOut` handler. Clears any residual link-flow state on
 * sign-out so a pending link-intent cannot outlive the session that created it
 * (defence-in-depth alongside the single-use deletion in the jwt callback). The
 * signout route handler makes `cookies()` writable.
 *
 * Exported so it can be unit-tested; it is referenced from `config.events`
 * (used-in-file), so it is not an unused export.
 */
export async function signOutHandler(): Promise<void> {
  try {
    const { LINK_INTENT_COOKIE } = await import('@/lib/auth-link')
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    jar.delete(LINK_INTENT_COOKIE)

    // RESIDUAL HOST-ONLY COOKIE CLEANUP (belt and braces alongside the per-response
    // rewriter): @auth/core clears the session cookie with the CURRENT cookie
    // options, and `rewriteSessionCookieDomains` duplicates that clear into BOTH
    // scopes (host-only + `Domain`-scoped) so neither can survive. This loop is
    // the independent second mechanism: it walks the request's OWN cookie jar
    // and deletes every session-token cookie it actually finds there, including
    // chunked `<name>.0`, `.1`, … parts whose exact names the rewriter only sees
    // if @auth/core emits a clear for them. Cookie-jar deletes are applied by
    // Next AFTER the handler returns, so they are always host-only — which is
    // exactly the scope this is here to catch.
    for (const { name } of jar.getAll()) {
      if (
        SESSION_TOKEN_COOKIE_NAMES.some(
          (base) => name === base || name.startsWith(`${base}.`),
        )
      ) {
        jar.delete(name)
      }
    }
  } catch (err) {
    console.error('Failed to clear auth cookies on sign-out', err)
  }
}

type JwtCallbackParams = {
  token: JWT
  account?: Account | null
  profile?: Profile
  trigger?: 'signIn' | 'signUp' | 'update'
}

/**
 * The `jwt` callback body. Extracted (and exported) so the Phase-2 link
 * consumption — single-use deletion, initiating-session binding, and the
 * fall-through to a normal sign-in — is directly unit-testable. Referenced from
 * `config.callbacks.jwt` (used-in-file), so it is not an unused export.
 */
export async function jwtSignInCallback({
  token,
  account,
  profile,
  trigger,
}: JwtCallbackParams): Promise<JWT> {
  if (!trigger && !(token.account && token.speaker)) {
    console.error('Invalid auth token', token)
    return {}
  }

  // --- Session refresh via trigger 'update' (M0) -----------------------------
  // A client calling next-auth's `useSession().update()` — or POSTing to the
  // session endpoint — re-invokes this callback with `trigger === 'update'` and
  // NO account/profile. Re-fetch the speaker with the SAME login-shaped read as
  // sign-in (`getSpeaker` → `organizerOrgIds` + `isOrganizer` + name/image) and
  // re-apply its claims via `applySpeakerToToken`, so a fresh grant (e.g. a just-
  // created org from the org-creation wizard) or a profile change lands WITHOUT a
  // full re-login. This path is deliberately kept SEPARATE from the sign-in path
  // and NEVER runs the sign-in-only link-intent handling below.
  if (trigger === 'update') {
    const existing = token.speaker as Session['speaker'] | undefined
    if (existing?._id && token.account) {
      const { getSpeaker } = await import('@/lib/speaker/sanity')
      const { speaker, err } = await getSpeaker(existing._id)
      // A transient read failure or a vanished document must NEVER invalidate a
      // live session — return the existing token untouched on any read problem.
      if (err || !speaker?._id) {
        if (err) {
          console.error(
            'Session update: speaker re-fetch failed; keeping existing token',
            err,
          )
        }
        return token
      }
      // Preserve the authenticated account; re-apply only the speaker claims.
      applySpeakerToToken(token, speaker, token.account as Account)
    }
    return token
  }

  if (trigger === 'signIn') {
    if (!token || !token.email || !token.name) {
      console.error('Invalid auth token', token)
      return {}
    }

    if (!account || !account.provider || !account.providerAccountId) {
      console.error('Invalid auth account', account)
      return {}
    }

    // --- Email (magic-link) sign-in --------------------------------------
    // The `email-link` provider resolves the speaker inside its `authorize`
    // (after verifying the token, its origin and its tier), so `token.sub` is
    // ALREADY a speaker `_id`. Re-read that document and project it, exactly as
    // the session-refresh path does.
    //
    // This branch runs BEFORE the provider-link handling on purpose:
    //  - `getOrCreateSpeaker` must NOT run. For a credentials sign-in
    //    `account.providerAccountId` is the speaker id, not an account id, so it
    //    would key `providers[]` on the wrong value and mint a duplicate.
    //  - a link-intent cookie is minted for a specific OAuth provider and can
    //    never be satisfied by this one, so skipping it changes nothing except
    //    avoiding a pointless verify.
    if (account.provider === EMAIL_LINK_PROVIDER_ID) {
      if (!token.sub) {
        console.error('Email sign-in produced no subject')
        return {}
      }
      const { getSpeaker } = await import('@/lib/speaker/sanity')
      const { speaker, err } = await getSpeaker(token.sub)
      if (err || !speaker?._id) {
        console.error('Email sign-in: speaker could not be loaded', err)
        return {}
      }
      applySpeakerToToken(token, speaker, account)
      return token
    }

    const user: User = {
      email: token.email,
      name: token.name,
      image: token.picture,
    }

    // --- Phase 2: self-service "link another provider" -------------------
    // If this sign-in carries a valid, integrity-protected link-intent cookie
    // (minted only for an already-authenticated speaker X, bound to this
    // provider AND to X's session), attach the just-authenticated account to
    // the EXISTING speaker X instead of creating/switching to another document.
    //
    // `@/lib/auth-link` is imported dynamically so its Node-only crypto does not
    // enter the edge middleware bundle that statically imports this file.
    const { LINK_INTENT_COOKIE, verifyLinkIntent, linkResultStore } =
      await import('@/lib/auth-link')
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    const linkToken = jar.get(LINK_INTENT_COOKIE)?.value

    // SINGLE-USE: delete the cookie the moment it is observed — BEFORE any use —
    // so a lingering intent can never be consumed twice regardless of outcome
    // (success, already-linked-elsewhere, or a thrown error). The route-handler
    // context that wraps this callback makes `cookies()` writable. This is the
    // primary defence against replay of an abandoned intent by a later sign-in.
    if (linkToken) {
      jar.delete(LINK_INTENT_COOKIE)
    }

    const rawIntent = linkToken
      ? verifyLinkIntent(linkToken, account.provider)
      : null

    // BIND TO THE INITIATING SESSION: honour the intent only if the browser is
    // STILL authenticated as the speaker that started the link. `@auth/core`
    // gives us a fresh token here (not the prior session), so decode the
    // pre-existing session cookie ourselves and require it to match both the
    // target speaker and the initiating session's `sub`. If there is no active
    // session, or it belongs to a different user, we ignore the intent and fall
    // through to a normal sign-in.
    let intent: typeof rawIntent = null
    // The pre-existing session decoded once and reused below.
    const prior = rawIntent ? await readPriorSessionToken(jar) : null
    if (rawIntent) {
      if (
        prior?.speaker?._id === rawIntent.speakerId &&
        prior?.sub === rawIntent.initiatorSub
      ) {
        intent = rawIntent
      } else {
        console.warn(
          'Link intent ignored: initiating session mismatch (treating as normal sign-in)',
        )
      }
    }

    if (intent) {
      const { attachProviderToSpeaker, getSpeaker } =
        await import('@/lib/speaker/sanity')
      const resultStore = linkResultStore.getStore()

      const {
        speaker: linked,
        status,
        err: linkErr,
      } = await attachProviderToSpeaker(
        intent.speakerId,
        user,
        account,
        profile,
      )

      if (!linkErr && status === 'linked') {
        if (resultStore) resultStore.result = 'linked'
        applySpeakerToToken(token, linked, account)
        return token
      }

      if (status === 'already-linked-elsewhere') {
        // Pre-existing duplicate. Do NOT merge and do NOT switch the session to
        // the other speaker: keep the user signed in as X (their pre-link
        // identity) and surface a clear "already linked" message.
        if (resultStore) resultStore.result = 'already-linked'
        const { speaker: originX } = await getSpeaker(intent.speakerId)
        if (originX?._id) {
          // Preserve X's original account (do not adopt the account that belongs
          // to the other speaker). We validated the prior session is X above, so
          // its account is X's own.
          const priorAccount = (prior?.account as Account) ?? account
          applySpeakerToToken(token, originX, priorAccount)
          return token
        }
        // X's document could not be loaded (deleted/not found between mint and
        // consumption). FAIL CLOSED: never fall through to the normal login path,
        // which would adopt the conflicting speaker Z's identity. Restore the
        // validated prior session (X); if there is none, keep the fresh token but
        // do not run getOrCreateSpeaker.
        if (prior) {
          return prior
        }
        if (resultStore) resultStore.result = 'error'
        console.error(
          'Provider link already-linked-elsewhere but initiating speaker not found; keeping current session',
          { speakerId: intent.speakerId },
        )
        return token
      }

      // Unexpected link failure — surface it and fall through to the normal
      // login path so the user still ends up with a working session.
      if (resultStore) resultStore.result = 'error'
      console.error('Provider link failed; falling back to normal sign-in', {
        status,
        linkErr,
      })
    }
    // --- end Phase 2 link handling ---------------------------------------

    const { speaker, err } = await getOrCreateSpeaker(user, account, profile)
    if (err) {
      console.error('Error fetching or creating speaker profile', err)
      return {}
    }

    applySpeakerToToken(token, speaker, account)
  }

  return token
}

/**
 * The `session` callback body: project the JWT's speaker/account and a trimmed
 * user onto the client-visible session. Extracted (and exported) so the shape
 * the browser receives is directly unit-testable. Referenced from
 * `config.callbacks.session`.
 */
export async function sessionCallback({
  session,
  token,
}: {
  session: Session
  token: JWT
}): Promise<Session> {
  const speaker = token.speaker
  const account = token.account

  return {
    ...session,
    user: {
      sub: token.sub,
      name: token.name,
      email: token.email,
      picture: token.picture,
    },
    speaker,
    account,
  } as Session
}

/**
 * The `redirect` callback body. Extracted (and exported) so the security-
 * critical OPEN-REDIRECT guard (same-origin check on the parsed URL) and the
 * Phase-2 link-result param append are directly unit-testable. Referenced from
 * `config.callbacks.redirect`.
 */
export async function redirectCallback({
  url,
  baseUrl,
}: {
  url: string
  baseUrl: string
}): Promise<string> {
  // OPEN-REDIRECT GUARD: only ever return a URL on baseUrl's own origin.
  // Compare parsed ORIGINS — a bare `url.startsWith(baseUrl)` is unsafe because a
  // look-alike host such as `https://<base>.evil.com` is a string prefix of the
  // base and would slip through. Relative URLs resolve onto baseUrl; anything
  // else (off-site, protocol-relative `//evil`, unparseable) falls back to base.
  let target: string
  try {
    const resolved = new URL(url, baseUrl)
    target =
      resolved.origin === new URL(baseUrl).origin
        ? resolved.toString()
        : baseUrl
  } catch {
    target = baseUrl
  }

  // Phase 2: append the link outcome (set by the jwt callback in the same
  // request) so the profile page can show a success / already-linked banner.
  // `target` is guaranteed same-origin above, so the append is always safe.
  const { linkResultStore, LINK_RESULT_PARAM } = await import('@/lib/auth-link')
  const result = linkResultStore.getStore()?.result
  if (result) {
    try {
      const resolved = new URL(target, baseUrl)
      resolved.searchParams.set(LINK_RESULT_PARAM, result)
      target = resolved.toString()
    } catch {
      // Leave target unchanged on any URL parsing issue.
    }
  }

  return target
}

/**
 * Optional CENTRALIZED OAUTH ORIGIN (#619), opt-in via `AUTH_REDIRECT_PROXY_URL`.
 *
 * A GitHub OAuth app allows exactly ONE callback URL, and cookies cannot span
 * registrable domains — so a single OAuth app cannot serve conferences on
 * different domains directly (the provider rejects the mismatched redirect_uri
 * BEFORE our app runs). Auth.js's `redirectProxyUrl` fixes this: the OAuth
 * `redirect_uri` is pinned to ONE central auth origin (the value of this env),
 * which then bounces the signed-`state` round-trip back to the initiating site.
 * Setting it also AUTO-ENABLES the provider's `state` check (Auth.js contract).
 *
 * `trustHost` is enabled ALONGSIDE it because the central origin must trust the
 * incoming Host to construct callback URLs. Absent env → returns `{}` → today's
 * single-domain behavior EXACTLY (Vercel already defaults `trustHost` true).
 *
 * Env-parameterised + exported so the config wiring is unit-testable under both
 * env states. Referenced in-file by `config`, so not an unused export.
 */
export function redirectProxyConfig(
  env: NodeJS.ProcessEnv = process.env,
): Pick<NextAuthConfig, 'redirectProxyUrl' | 'trustHost'> {
  const url = env.AUTH_REDIRECT_PROXY_URL?.trim()
  if (!url) return {}
  return { redirectProxyUrl: url, trustHost: true }
}

/**
 * FIXED-ORIGIN ENV GUARD (multi-tenant).
 *
 * `AUTH_URL` / `NEXTAUTH_URL` are NOT harmless base-URL hints: next-auth's
 * `reqWithEnvURL` (`next-auth/lib/env.js`) REWRITES every incoming request's URL
 * onto that origin before Auth.js sees it. On a multi-tenant deployment that
 * pins all tenants to ONE host at once — OAuth callbacks, `redirect` callback
 * origins and cookie hosts all collapse to the configured value, so every tenant
 * domain but that one breaks. Neither is needed on Vercel (`VERCEL_URL` +
 * `trustHost` cover it) and the OAuth-origin need is served by
 * `AUTH_REDIRECT_PROXY_URL` instead.
 *
 * Named `warn…`, not `assert…`, precisely because it does NOT throw — every
 * `assert*` helper in this codebase does.
 *
 * Deliberately a LOUD LOG, not a throw: throwing at module load would take the
 * whole deployment down (and the same module is imported by the middleware), and
 * CI + `scripts/smoke-protected-routes.mjs` legitimately set these to point a
 * `next start` at its own loopback port. The gate is `VERCEL_ENV === 'production'`
 * — never set in CI, local dev or the smoke script — so those stay silent. The
 * always-on, environment-independent surface is the `auth.fixedOrigin` check on
 * /admin/settings (`src/lib/system-status/checks.ts`).
 */
function warnOnFixedAuthOrigin(env: NodeJS.ProcessEnv = process.env): void {
  if (env.VERCEL_ENV !== 'production') return
  const offenders = (['AUTH_URL', 'NEXTAUTH_URL'] as const).filter((name) =>
    env[name]?.trim(),
  )
  if (offenders.length === 0) return
  console.error(
    `[auth] Fixed auth origin configured in production: ${offenders.join(', ')}. ` +
      'next-auth rewrites EVERY request origin to that host, which breaks ' +
      'sign-in on every conference domain except that one. Remove the ' +
      'variable(s); use AUTH_REDIRECT_PROXY_URL for a central OAuth origin, and ' +
      'NEXT_PUBLIC_BASE_URL for the self-hosted contract-signing base URL that ' +
      'also reads NEXTAUTH_URL.',
  )
}

warnOnFixedAuthOrigin()

const config = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    LinkedIn({
      clientId: process.env.AUTH_LINKEDIN_ID,
      clientSecret: process.env.AUTH_LINKEDIN_SECRET,
    }),

    // EMAIL (MAGIC-LINK) SIGN-IN.
    //
    // A CREDENTIALS provider, NOT Auth.js's built-in `email` provider. The two
    // blocking reasons are documented in full in
    // `src/lib/auth/email-link/verify.ts`; in one line each:
    //   1. configuring an adapter (which the email provider requires) makes
    //      @auth/core route every OAUTH sign-in through its own account-linking
    //      logic, which throws `OAuthAccountNotLinked` for the returning-user
    //      case this app deliberately handles in `getOrCreateSpeaker`;
    //   2. `useVerificationToken` only ever receives a HASH, so the stateless
    //      token tier cannot be verified through it at all.
    // Credentials + JWT requires no adapter, so the OAuth path above is
    // untouched by this addition.
    //
    // `authorize` NEVER trusts its input: the token is verified (signature or
    // single-use consume), origin-bound and tier-checked before any account is
    // resolved. Returning `null` makes @auth/core throw `CredentialsSignin`,
    // which the callback route turns into a generic error — the reason never
    // reaches the browser, and the token never reaches a log line.
    Credentials({
      id: EMAIL_LINK_PROVIDER_ID,
      name: 'Email',
      credentials: { token: { type: 'text' } },
      async authorize(credentials, request) {
        const rawToken =
          typeof credentials?.token === 'string' ? credentials.token : null
        if (!rawToken) return null

        const { requestHost } = await import('@/lib/auth/email-link/origin')
        const { verifyEmailSignInToken } =
          await import('@/lib/auth/email-link/verify')

        // ORIGIN: taken from the REQUEST that is redeeming the link, using the
        // same header precedence that decides the session cookie's scope. A
        // token minted on another tenant's host fails the audience check.
        const host =
          requestHost(request.headers) ??
          (() => {
            try {
              return new URL(request.url).hostname.toLowerCase()
            } catch {
              return undefined
            }
          })()

        const verified = await verifyEmailSignInToken(rawToken, host)
        if (!verified.ok) {
          console.warn(`[email-link] rejected sign-in: ${verified.reason}`)
          return null
        }

        const { getOrCreateSpeakerForVerifiedEmail } =
          await import('@/lib/speaker/sanity')
        const { speaker, err } = await getOrCreateSpeakerForVerifiedEmail(
          verified.identifier,
        )
        if (err || !speaker?._id) {
          console.error('[email-link] could not resolve a speaker', err)
          return null
        }

        return {
          id: speaker._id,
          name: speaker.name,
          email: speaker.email,
          image: typeof speaker.image === 'string' ? speaker.image : undefined,
        }
      },
    }),
  ],

  secret: process.env.AUTH_SECRET,

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/signin',
  },

  events: {
    signOut: signOutHandler,
  },

  callbacks: {
    async session(params) {
      return sessionCallback(params)
    },

    async jwt(params) {
      return jwtSignInCallback(params)
    },
    async redirect(params) {
      return redirectCallback(params)
    },
  },

  // NOTE: NO `cookies.sessionToken.options.domain` here, deliberately. A value
  // in this static config would apply to EVERY request host — the multi-tenant
  // defect this replaced. The cross-subdomain `Domain` is applied PER RESPONSE
  // from the actual request host by `applySessionCookieDomain` (wrapped around
  // `handlers` below and around the middleware in `src/proxy.ts`), so @auth/core
  // emits a host-only cookie here and the rewriter widens it correctly. Keeping
  // the config free of a Domain also makes the failure mode SAFE: any emission
  // path the rewriter misses degrades to a host-only cookie (no cross-subdomain
  // sharing) instead of a Domain the browser rejects (silent sign-in failure).

  // Opt-in centralized OAuth origin (#619). Spread LAST so an absent env
  // contributes no keys and the built config is byte-for-byte today's.
  ...redirectProxyConfig(),
} satisfies NextAuthConfig

type ProviderData = { id: string; name: string; type: string }
type ProviderWithFunction = () => ProviderData
type Provider = ProviderData | ProviderWithFunction

/**
 * The OAUTH providers the sign-in page renders as "Sign in with …" buttons, and
 * the list the system-status check reports on.
 *
 * CREDENTIALS PROVIDERS ARE EXCLUDED. `email-link` is a sign-in *mechanism* with
 * its own form (an address field, not a one-click button) and its own request
 * endpoint; rendering it here would produce a button that POSTs to the
 * credentials callback with no token and always fails.
 */
export const providerMap = config.providers
  .map((provider: Provider) => {
    if (typeof provider === 'function') {
      const providerData = provider()
      return {
        id: providerData.id,
        name: providerData.name,
        type: providerData.type,
      }
    } else {
      return { id: provider.id, name: provider.name, type: provider.type }
    }
  })
  .filter((provider) => provider.type !== 'credentials')

const { handlers: rawHandlers, auth: _auth, signIn } = NextAuth(config)

export { signIn }

/**
 * The `/api/auth/*` route handlers, with the session cookie's `Domain` rewritten
 * PER RESPONSE from the request's own host (see `applySessionCookieDomain`).
 *
 * This is the primary seam: the OAuth callback (sets the session cookie) and
 * sign-out (clears it) both land here, so this is where the tenant's real host
 * must decide the cookie scope. `NextAuth(config)` still receives a plain STATIC
 * object — wrapping the returned handlers leaves the shape of `auth` untouched,
 * so the middleware wrapper `auth((req) => …)` in `src/proxy.ts` keeps working
 * (the lazy-config form is what broke it in #671).
 */
export const handlers = {
  GET: wrapAuthHandler(rawHandlers.GET),
  POST: wrapAuthHandler(rawHandlers.POST),
}

function wrapAuthHandler(
  handler: (req: NextRequest) => Promise<Response> | Response,
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const res = await handler(req)
    // `applySessionCookieDomain` is a no-op for anything that is not a real
    // Response with Set-Cookie headers, so no null-guard is needed here.
    return applySessionCookieDomain(res, sessionCookieRequestHost(req.headers))
  }
}

/**
 * `auth`, with the session cookie's `Domain` rewritten PER REQUEST on every
 * response it produces in its HANDLER-WRAPPER form — `auth((req) => …)`.
 *
 * That form is used by the middleware (`src/proxy.ts`) AND by standalone API
 * routes (`export const POST = auth(async (req) => …)`). next-auth's `handleAuth`
 * appends the Set-Cookie headers of its internal `session` action to whatever
 * the wrapped handler returns, and the JWT strategy re-issues the session cookie
 * on every one of those calls to slide its expiry — so ALL of these responses
 * emit the cookie and all of them need the right scope. Wrapping here, rather
 * than at each call site, means a new `auth(...)` route cannot silently opt out
 * and start issuing a competing host-only cookie.
 *
 * The other call forms (`auth()` in RSC, `auth(req, ev)` inline, `auth(req, res)`
 * in API routes) return a PROMISE, not a function, and are passed through
 * untouched — as is the wrapper form's shape: `auth(handler)` still returns a
 * FUNCTION, which is the exact contract the #671 outage broke.
 */
const perRequestAuth = ((...args: unknown[]) => {
  const result = (_auth as (...callArgs: unknown[]) => unknown)(...args)
  if (typeof result !== 'function') return result

  const handler = result as (req: NextRequest, ctx: unknown) => unknown
  return async (req: NextRequest, ctx: unknown) => {
    const res = await handler(req, ctx)
    if (!(res instanceof Response)) return res
    return applySessionCookieDomain(res, sessionCookieRequestHost(req.headers))
  }
}) as typeof _auth

export const auth = perRequestAuth as typeof _auth &
  (<HandlerResponse extends Response | Promise<Response>>(
    ...args: [
      (
        req: NextAuthRequest,
        context: { params: Record<string, string | string[] | undefined> },
      ) => HandlerResponse,
    ]
  ) => (
    req: NextRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => HandlerResponse)

const SANITY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const MAX_IMPERSONATION_ID_LENGTH = 100
// CLI tokens are minted/read with the bare session-cookie salt. Declared as an
// independent literal (NOT derived from SESSION_TOKEN_COOKIE_NAMES) so the
// contract test's `CLI_JWT_SALT === <bare cookie name>` assertion actually
// verifies the two are kept in sync, rather than being true by construction.
export const CLI_JWT_SALT = 'authjs.session-token'

function extractBearerToken(headers?: Headers): string | null {
  const value = headers?.get('authorization')
  if (!value?.startsWith('Bearer ')) return null
  return value.slice(7)
}

export async function getSessionFromBearerToken(
  token: string,
): Promise<Session | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null

  try {
    const decoded = await decode({ token, secret, salt: CLI_JWT_SALT })
    if (!decoded) return null

    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null

    const speaker = decoded.speaker as Session['speaker']
    const account = decoded.account as Session['account']
    if (!decoded.sub || !speaker?._id || !account) return null

    return {
      expires: new Date((decoded.exp ?? 0) * 1000).toISOString(),
      user: {
        sub: decoded.sub,
        name: decoded.name as string,
        email: decoded.email as string,
        picture: decoded.picture as string,
      },
      speaker,
      account,
    }
  } catch {
    return null
  }
}

export async function getAuthSession(req?: {
  url?: string
  headers?: Headers
}): Promise<Session | null> {
  if (AppEnvironment.isTestMode) {
    const mock = AppEnvironment.createMockAuthContext()
    // DEV-ONLY. The mock speaker used to reach `/admin` through the deprecated
    // global `isOrganizer` flag, via the (now deleted) legacy-token bridge.
    // Authorization is org-scoped, so stamp it with the CURRENT domain's org
    // instead. Best-effort: an unresolvable org leaves `organizerOrgIds` empty
    // and the mock session is denied organizer access — fail closed, same as any
    // other caller.
    const { resolveCurrentOrgId } = await import('@/lib/authz/organizer')
    const orgId = await resolveCurrentOrgId()
    if (mock.speaker) mock.speaker.organizerOrgIds = orgId ? [orgId] : []
    return mock
  }

  const session = await _auth()

  // If no cookie session, try Bearer token from Authorization header
  if (!session) {
    const bearerToken = extractBearerToken(req?.headers)
    if (bearerToken) return getSessionFromBearerToken(bearerToken)
    return null
  }

  // SECURITY: Impersonation is ONLY allowed in development mode
  // Explicitly check for production to prevent any bypass
  if (process.env.NODE_ENV === 'production') {
    return session
  }

  // Double-check we're in development
  if (!AppEnvironment.isDevelopment) {
    return session
  }

  // SECURITY: Only organizers can impersonate — ORG-SCOPED (CaaS T1-2, #614): the
  // impersonator must be an organizer of the CURRENT domain's org, decided from
  // `organizerOrgIds` alone (no bridge to the deprecated global flag; an
  // unresolvable org denies). Dynamically
  // imported to keep the org/conference read out of the edge middleware bundle,
  // mirroring the `getSpeaker` import below.
  const { isOrganizerForCurrentOrg } = await import('@/lib/authz/organizer')
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return session
  }

  // No URL provided, no impersonation possible
  if (!req?.url) {
    return session
  }

  try {
    const url = new URL(req.url, 'http://localhost')
    const impersonateId = url.searchParams.get('impersonate')

    if (impersonateId) {
      if (!SANITY_ID_PATTERN.test(impersonateId)) {
        console.warn(
          `Invalid impersonation ID format: ${impersonateId.slice(0, 20)}`,
        )
        return session
      }

      if (impersonateId.length > MAX_IMPERSONATION_ID_LENGTH) {
        console.warn('Impersonation ID too long, rejecting')
        return session
      }

      const { getSpeaker } = await import('@/lib/speaker/sanity')
      const { speaker: impersonatedSpeaker } = await getSpeaker(impersonateId)

      if (impersonatedSpeaker && !impersonatedSpeaker.isOrganizer) {
        // SECURITY: Log impersonation for audit trail
        console.log(
          `[AUDIT] Admin ${session.speaker.email} (${session.speaker._id}) impersonating ${impersonatedSpeaker.email} (${impersonatedSpeaker._id})`,
        )

        return {
          ...session,
          speaker: impersonatedSpeaker,
          isImpersonating: true,
          realAdmin: session.speaker,
        }
      } else if (impersonatedSpeaker?.isOrganizer) {
        // SECURITY: Log attempted organizer impersonation
        console.error(
          `[SECURITY] Admin ${session.speaker.email} attempted to impersonate another organizer: ${impersonatedSpeaker.email}`,
        )
      }
    }
  } catch (error) {
    console.error('Error during impersonation:', error)
  }

  return session
}
