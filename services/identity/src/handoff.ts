// Login handoff (#1803, epic #1772 "First-party web", #688).
//
//   GET  /handoff?origin=&provider=  browser, on id.konf.app. Signs in if
//        needed, then redirects to <origin>/api/auth/handoff?token=… with a
//        single-use token bound to that origin, valid 60 s.
//   POST /handoff/exchange           tenant site server: token -> session.
//   POST /handoff/upgrade            tenant site server: NextAuth account
//        -> session, matched on provider account id or a verified email (#807).
//
// The two POSTs need the per-environment site secret, so a leaked token is
// worthless without it, and the origin binding stops one site redeeming
// another's token.
import { makeSignature } from 'better-auth/crypto'
import { createAuth, createData, type AuthEnv, type DataEnv } from './data'

export interface HandoffEnv extends AuthEnv, DataEnv {
  /** wrangler secret put IDENTITY_SITE_SECRET; the site holds the same value. */
  IDENTITY_SITE_SECRET: string
}

export const HANDOFF_TTL_MS = 60_000
const PROVIDERS = new Set(['github', 'linkedin'])

const noStore = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}
const fail = (status: number) =>
  new Response(null, { status, headers: noStore })

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return btoa(String.fromCharCode(...new Uint8Array(d)))
}

const handoffKey = async (token: string) => `handoff:${await sha256(token)}`

async function siteAuthorized(request: Request, secret: string) {
  if (!secret) return false
  const got = request.headers.get('authorization') ?? ''
  // Compare digests so the check does not leak the secret's length or prefix.
  return (await sha256(got)) === (await sha256(`Bearer ${secret}`))
}

/** A fresh Better Auth session for the tenant site, as a signed token. */
async function sessionFor(auth: ReturnType<typeof createAuth>, userId: string) {
  const ctx = await auth.$context
  const s = await ctx.internalAdapter.createSession(userId, false)
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
    const origin = url.searchParams.get('origin') ?? ''
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
      JSON.stringify({ userId: session.user.id, origin }),
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
  if (!(await siteAuthorized(request, env.IDENTITY_SITE_SECRET))) {
    return fail(401)
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const str = (k: string) => (typeof body?.[k] === 'string' ? body[k] : '')

  if (url.pathname === '/handoff/exchange') {
    // Taken (deleted) before any check: a token is spent on first use.
    const row = await data.takeHandoff(await handoffKey(str('token')))
    if (!row || row.expiresAt.getTime() <= Date.now()) return fail(401)
    const { userId, origin } = JSON.parse(row.value) as {
      userId: string
      origin: string
    }
    if (origin !== str('origin')) return fail(401)
    return sessionFor(auth, userId)
  }

  if (url.pathname === '/handoff/upgrade') {
    if (!(await data.isVerifiedOrigin(str('origin')))) return fail(400)
    const ctx = await auth.$context
    let userId: string | undefined
    if (PROVIDERS.has(str('providerId')) && str('accountId')) {
      userId = await data.userIdForAccount(str('providerId'), str('accountId'))
    } else if (str('verifiedEmail')) {
      // #807: only an address our record also holds as verified.
      const found = await ctx.internalAdapter.findUserByEmail(
        str('verifiedEmail').toLowerCase(),
      )
      if (found?.user.emailVerified) userId = found.user.id
    }
    // No match: the user signs in through the handoff instead.
    if (!userId) return fail(404)
    return sessionFor(auth, userId)
  }

  return fail(404)
}
