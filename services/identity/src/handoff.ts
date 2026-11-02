// Login handoff (#1803, epic #1772 "First-party web", #688).
//
//   GET  /handoff?origin=&provider=&state=  browser, on id.konf.app. Signs in
//        if needed, then redirects to <origin>/api/auth/handoff?token=… with a
//        single-use token bound to that origin and state, valid 60 s.
//   POST /handoff/exchange  tenant site server: token + nonce -> session.
//   POST /handoff/upgrade   tenant site server: NextAuth account -> session,
//        matched on provider account id or a verified email (#807). Only
//        until IDENTITY_UPGRADE_UNTIL.
//
// Each POST has its own secret and a per-origin rate limit. `state` is the
// SHA-256 of a nonce in a cookie on the tenant site, so a token minted for an
// attacker's login cannot be planted in a victim's browser (login CSRF).
import { makeSignature } from 'better-auth/crypto'
import { createAuth, createData, type AuthEnv, type DataEnv } from './data'

export interface HandoffEnv extends AuthEnv, DataEnv {
  /** wrangler secret put; the site holds the same values. */
  IDENTITY_EXCHANGE_SECRET: string
  IDENTITY_UPGRADE_SECRET: string
  /** ISO date; the NextAuth upgrade is refused after it, or when unset. */
  IDENTITY_UPGRADE_UNTIL?: string
  /** Per origin, on the two POSTs. */
  HANDOFF_SITE_LIMIT: RateLimit
  /** Per client IP, on GET /handoff. ponytail: coarse, one bucket per IP. */
  HANDOFF_IP_LIMIT: RateLimit
}

export const HANDOFF_TTL_MS = 60_000
const PROVIDERS = new Set(['github', 'linkedin'])

const noStore = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}
const fail = (status: number) =>
  new Response(null, { status, headers: noStore })

async function digest(s: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
  )
}
const b64 = async (s: string) => btoa(String.fromCharCode(...(await digest(s))))
/** Hex SHA-256: the site computes `state` the same way. */
export const sha256hex = async (s: string) =>
  [...(await digest(s))].map((b) => b.toString(16).padStart(2, '0')).join('')

const handoffKey = async (token: string) => `handoff:${await b64(token)}`

async function authorized(request: Request, secret: string) {
  if (!secret) return false
  const got = request.headers.get('authorization') ?? ''
  // Compare digests so the check does not leak the secret's length or prefix.
  return (await b64(got)) === (await b64(`Bearer ${secret}`))
}

/** A fresh Better Auth session for the tenant site, as a signed token. */
async function sessionFor(
  auth: ReturnType<typeof createAuth>,
  userId: string,
  origin: string,
) {
  const ctx = await auth.$context
  // `origin` becomes the JWT claim the gateway checks (#1844).
  const s = await ctx.internalAdapter.createSession(userId, false, { origin })
  return Response.json(
    {
      session: `${s.token}.${await makeSignature(s.token, ctx.secret)}`,
      expiresAt: s.expiresAt,
    },
    { headers: noStore },
  )
}

export async function handoff(request: Request, env: HandoffEnv) {
  const url = new URL(request.url)
  const auth = createAuth(env.DB, env)
  const data = createData(env)

  if (request.method === 'GET' && url.pathname === '/handoff') {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
    if (!(await env.HANDOFF_IP_LIMIT.limit({ key: ip })).success) {
      return fail(429)
    }
    const origin = url.searchParams.get('origin') ?? ''
    const state = url.searchParams.get('state') ?? ''
    if (!/^[0-9a-f]{64}$/.test(state)) return fail(400)
    if (!(await data.isVerifiedOrigin(origin))) return fail(400)

    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) {
      const provider = url.searchParams.get('provider') ?? ''
      if (!PROVIDERS.has(provider)) return fail(400)
      // Social sign-in returns here (same origin as baseURL) with a session.
      const res = await auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: env.BETTER_AUTH_URL,
            cookie: request.headers.get('cookie') ?? '',
          },
          body: JSON.stringify({ provider, callbackURL: url.href }),
        }),
      )
      if (!res.ok) return fail(502)
      const { url: to } = (await res.json()) as { url: string }
      const headers = new Headers({ ...noStore, location: to })
      for (const c of res.headers.getSetCookie())
        headers.append('set-cookie', c)
      return new Response(null, { status: 302, headers })
    }

    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    await data.putHandoff(
      await handoffKey(token),
      JSON.stringify({ userId: session.user.id, origin, state }),
      new Date(Date.now() + HANDOFF_TTL_MS),
    )
    const to = new URL('/api/auth/handoff', origin)
    to.searchParams.set('token', token)
    return new Response(null, {
      status: 302,
      headers: { ...noStore, location: to.href },
    })
  }

  if (request.method !== 'POST') return fail(404)
  const secret =
    url.pathname === '/handoff/exchange'
      ? env.IDENTITY_EXCHANGE_SECRET
      : url.pathname === '/handoff/upgrade'
        ? env.IDENTITY_UPGRADE_SECRET
        : ''
  if (!secret) return fail(404)
  if (!(await authorized(request, secret))) return fail(401)
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const str = (k: string) => (typeof body?.[k] === 'string' ? body[k] : '')
  const origin = str('origin')
  if (!(await env.HANDOFF_SITE_LIMIT.limit({ key: origin })).success) {
    return fail(429)
  }

  if (url.pathname === '/handoff/exchange') {
    // Taken (deleted) before any check: a token is spent on first use.
    const row = await data.takeHandoff(await handoffKey(str('token')))
    if (!row || row.expiresAt.getTime() <= Date.now()) return fail(401)
    const stored = JSON.parse(row.value) as {
      userId: string
      origin: string
      state: string
    }
    if (stored.origin !== origin) return fail(401)
    // The nonce from the browser that started this login, and no other.
    if (!str('nonce') || (await sha256hex(str('nonce'))) !== stored.state) {
      return fail(401)
    }
    await data.audit('handoff.exchange', stored.userId, origin)
    return sessionFor(auth, stored.userId, origin)
  }

  // /handoff/upgrade
  const until = Date.parse(env.IDENTITY_UPGRADE_UNTIL ?? '')
  if (!(until > Date.now())) return fail(410)
  if (!(await data.isVerifiedOrigin(origin))) return fail(400)
  let userId: string | undefined
  let match = ''
  if (PROVIDERS.has(str('providerId')) && str('accountId')) {
    userId = await data.userIdForAccount(str('providerId'), str('accountId'))
    match = 'account'
  } else if (str('verifiedEmail')) {
    // #807: only an address our record also holds as verified.
    const found = await (
      await auth.$context
    ).internalAdapter.findUserByEmail(str('verifiedEmail').toLowerCase())
    if (found?.user.emailVerified) userId = found.user.id
    match = 'email'
  }
  // No match: the user signs in through the handoff instead.
  if (!userId) return fail(404)
  await data.audit('session.upgrade', userId, origin, match)
  return sessionFor(auth, userId, origin)
}
