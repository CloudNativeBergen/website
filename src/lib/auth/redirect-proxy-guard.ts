import { decode } from 'next-auth/jwt'
import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'
import { isVerifiedRedirectOrigin } from '@/lib/domain-verification/allowlist'
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
 * Fail closed: undecodable state with an origin we cannot read, a malformed
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
  if (typeof target !== 'string') return false
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }
  if (url.origin + url.pathname !== target) return false
  if (!CALLBACK_PATH_RE.test(url.pathname)) return false

  if (env.NODE_ENV !== 'production' && DEV_HOSTS.has(url.hostname)) {
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  if (url.protocol !== 'https:') return false
  if (!url.port && isPlatformZoneHost(url.hostname, env)) return true
  try {
    return await isVerifiedRedirectOrigin(url.origin)
  } catch (error) {
    console.error('[auth] Redirect-origin lookup failed; refusing', error)
    return false
  }
}

async function stateOf(req: Request): Promise<string | null> {
  const query = new URL(req.url).searchParams.get('state')
  if (query) return query
  if (req.method !== 'POST') return null
  try {
    const form = await req.clone().formData()
    const value = form.get('state')
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * `null` to let the request through, or the refusal response. Only acts on a
 * provider callback arriving at the proxy host; everything else passes.
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
    return refuse() // @auth/core throws on this too; refuse rather than guess.
  }
  if (sessionCookieRequestHost(req.headers) !== proxyOrigin.host) return null
  if (!new URL(req.url).pathname.startsWith('/api/auth/callback/')) return null

  const state = await stateOf(req)
  if (!state) return null // No state: @auth/core does not bounce.
  const secret = env.AUTH_SECRET
  if (!secret) return refuse()

  let origin: unknown
  try {
    const payload = await decode({
      token: state,
      secret,
      salt: ENCODED_STATE_SALT,
    })
    origin = payload?.origin
  } catch {
    // @auth/core fails the same decode and stops with an error; no bounce.
    return null
  }
  if (origin === undefined) return null
  if (typeof origin === 'string') {
    try {
      // Same comparison @auth/core uses to decide not to bounce.
      if (new URL(origin).origin === proxyOrigin.origin) return null
    } catch {
      return refuse()
    }
  }
  if (await isAllowedBounceTarget(origin, env)) return null
  console.warn('[auth] Refused OAuth proxy bounce to unverified origin', {
    origin: String(origin).slice(0, 200),
  })
  return refuse()
}

function refuse(): Response {
  return new Response(
    'Sign-in could not be completed: this site is not a verified sign-in destination.',
    { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  )
}
