import { decode } from 'next-auth/jwt'
import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'
import { isVerifiedRedirectOrigin } from '@/lib/domain-verification/allowlist'
import { logger } from '@/lib/logger'
import { isPlatformZoneHost } from '@/lib/domain-verification/platform'

/**
 * VERIFIED-ORIGIN GUARD for the central OAuth proxy (#688).
 *
 * With `AUTH_REDIRECT_PROXY_URL` set, `@auth/core` (`lib/actions/callback/
 * index.js`) bounces the provider's authorization code to whatever URL the
 * decrypted `state.origin` names, and returns BEFORE the app's `redirect`
 * callback runs. The only binding is `AUTH_SECRET`: any deployment holding it
 * can mint a state naming any host. This guard sits in front of the auth
 * handler on the proxy host and refuses the bounce unless the destination is
 * an EXACT https callback URL on a platform host or a verified domain.
 *
 * Mode (`AUTH_REDIRECT_GUARD_MODE`): `report` (default) logs and lets the
 * bounce through; `enforce` refuses with a 403. In enforce mode it fails closed: undecodable state with an origin we cannot read, a malformed
 * URL, an unknown or unverified host, or a lookup error all refuse.
 */

/** `@auth/core`'s private salt for the encoded `state` (`oauth/checks.js`). Pinned by a contract test. */
export const ENCODED_STATE_SALT = 'encodedState'

const CALLBACK_PATH_RE = /^\/api\/auth\/callback\/[a-z0-9-]+$/
const DEV_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Is `target` (the raw `state.origin`, which @auth/core sets to the
 * initiating site's provider callback URL) a destination the code may go to?
 *
 * The raw string must re-serialise to exactly `origin + pathname`, which
 * rejects userinfo, query, fragment, uppercase, trailing dots in a different
 * spelling, default-port spellings and backslash tricks in one comparison.
 */
export async function isAllowedBounceTarget(
  target: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return (await bounceRefusal(target, env)) === null
}

/** Why `target` is refused, or `null` when the bounce may go there. */
async function bounceRefusal(
  target: unknown,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (typeof target !== 'string') return 'not-a-string'
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return 'malformed'
  }
  if (url.origin + url.pathname !== target) return 'not-exact'
  if (!CALLBACK_PATH_RE.test(url.pathname)) return 'not-a-callback-path'

  if (env.NODE_ENV !== 'production' && DEV_HOSTS.has(url.hostname)) {
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : 'not-https'
  }
  if (url.protocol !== 'https:') return 'not-https'
  // Trusts the WHOLE platform zone: any subdomain of PLATFORM_DOMAIN_SUFFIX
  // passes without a lookup. Safe only while that zone's DNS stays under
  // platform control; a delegated or dangling subdomain would receive codes.
  if (!url.port && isPlatformZoneHost(url.hostname, env)) return null
  try {
    return (await isVerifiedRedirectOrigin(url.origin)) ? null : 'unverified'
  } catch (error) {
    logger.error('[auth] Redirect-origin lookup failed', { error })
    return 'lookup-failed'
  }
}

/**
 * `AUTH_REDIRECT_GUARD_MODE`: `enforce` refuses, anything else (default) only
 * reports, so deploying the guard changes nothing for users until it is set.
 */
function isEnforcing(env: NodeJS.ProcessEnv): boolean {
  return env.AUTH_REDIRECT_GUARD_MODE?.trim() === 'enforce'
}

/** Host of a refused target, for the log; never the code or the state. */
function hostOf(target: unknown): string | null {
  try {
    return typeof target === 'string' ? new URL(target).host : null
  } catch {
    return null
  }
}

/**
 * Every `state` value @auth/core could read. It builds its query with
 * `Object.fromEntries` (last duplicate wins) and reads JSON or form bodies on
 * POST (`lib/utils/web.js`), so all of them are collected, not just the first.
 */
async function stateCandidates(req: Request): Promise<string[]> {
  const values = new URL(req.url).searchParams.getAll('state')
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? ''
    try {
      if (type.includes('application/json')) {
        const body: unknown = await req.clone().json()
        const value = (body as { state?: unknown } | null)?.state
        if (value !== undefined) values.push(String(value))
      } else if (type.includes('application/x-www-form-urlencoded')) {
        values.push(
          ...new URLSearchParams(await req.clone().text()).getAll('state'),
        )
      }
    } catch {
      // An unreadable body fails in @auth/core too.
    }
  }
  return values.filter(Boolean)
}

/** The secrets @auth/core may decode with (`lib/utils/env.js`). */
function secretsOf(env: NodeJS.ProcessEnv): string[] {
  return [
    env.AUTH_SECRET_1,
    env.AUTH_SECRET_2,
    env.AUTH_SECRET_3,
    env.AUTH_SECRET,
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
}

/** Normalised `host[:port]` (lowercase, default port dropped), or `null`. */
function normaliseHost(host: string | null): string | null {
  if (!host) return null
  try {
    return new URL(`https://${host}`).host
  } catch {
    return null
  }
}

type Verdict =
  | { kind: 'pass' }
  | { kind: 'refuse-always' }
  | { kind: 'report'; reason: string; target?: unknown }

async function judgeState(
  state: string,
  secrets: string[],
  proxyOrigin: URL,
  env: NodeJS.ProcessEnv,
): Promise<Verdict> {
  let origin: unknown
  try {
    const payload = await decode({
      token: state,
      secret: secrets,
      salt: ENCODED_STATE_SALT,
    })
    if (!payload) return { kind: 'report', reason: 'undecodable' }
    origin = payload.origin
  } catch {
    return { kind: 'report', reason: 'undecodable' }
  }
  if (origin === undefined) return { kind: 'pass' } // No origin: no bounce.
  if (typeof origin === 'string') {
    try {
      // Same comparison @auth/core uses to decide not to bounce.
      if (new URL(origin).origin === proxyOrigin.origin) return { kind: 'pass' }
    } catch {
      return { kind: 'refuse-always' } // @auth/core throws on this too.
    }
  }
  const reason = await bounceRefusal(origin, env)
  return reason === null
    ? { kind: 'pass' }
    : { kind: 'report', reason, target: origin }
}

/**
 * `null` to let the request through, or the refusal response. Only acts on a
 * provider callback arriving at the proxy host; everything else passes.
 *
 * Refused in BOTH modes, because no legitimate sign-in produces them and
 * @auth/core cannot complete them either: an unparseable proxy URL, no
 * secret, more than one distinct `state`, and an unparseable `state.origin`.
 */
export async function guardRedirectProxyBounce(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response | null> {
  const proxy = env.AUTH_REDIRECT_PROXY_URL?.trim()
  if (!proxy) return null
  let proxyOrigin: URL
  try {
    proxyOrigin = new URL(proxy)
  } catch {
    return refuse()
  }
  if (normaliseHost(sessionCookieRequestHost(req.headers)) !== proxyOrigin.host)
    return null
  const { pathname } = new URL(req.url)
  if (!pathname.startsWith('/api/auth/callback/')) return null
  const provider = pathname.slice('/api/auth/callback/'.length)

  const states = [...new Set(await stateCandidates(req))]
  if (states.length === 0) return null // No state: @auth/core does not bounce.
  if (states.length > 1) {
    logger.warn('[auth] Refused OAuth proxy callback with conflicting state', {
      reason: 'ambiguous-state',
      provider,
    })
    return refuse()
  }
  const secrets = secretsOf(env)
  if (secrets.length === 0) return refuse()

  const verdict = await judgeState(states[0], secrets, proxyOrigin, env)
  if (verdict.kind === 'pass') return null
  if (verdict.kind === 'refuse-always') return refuse()
  const enforcing = isEnforcing(env)
  logger.warn(
    enforcing
      ? '[auth] Refused OAuth proxy bounce'
      : '[auth] Would refuse OAuth proxy bounce (report mode)',
    {
      host: hostOf(verdict.target),
      reason: verdict.reason,
      provider,
      mode: enforcing ? 'enforce' : 'report',
    },
  )
  return enforcing ? refuse() : null
}

function refuse(): Response {
  return new Response(
    'Sign-in could not be completed: this site is not a verified sign-in destination.',
    { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  )
}
