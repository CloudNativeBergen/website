// First-party sessions from identity (id.konf.app), behind KONF_IDENTITY_TENANTS
// (#1803, epic #1772 "First-party web"). With the flag off for a tenant, both
// routes answer 404 and nothing else changes.
//
//   GET  /api/auth/handoff?provider=github  -> id.konf.app/handoff
//   GET  /api/auth/handoff?token=…          token -> session cookie (server side)
//   POST /api/token                         session -> short-lived identity JWT
//
// The gateway only ever sees the JWT. NextAuth cookies stay on this site.
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'
import { EMAIL_LINK_IDENTIFIER_CLAIM } from '@/lib/auth/email-link/identity'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { AppEnvironment } from '@/lib/environment/config'
import type { Conference } from '@/lib/conference/types'

/** Host-only, https-only, never readable from script. */
export const IDENTITY_SESSION_COOKIE = '__Host-konf.session'
/** Login-CSRF nonce: identity gets only its SHA-256 as `state`. */
export const HANDOFF_NONCE_COOKIE = '__Host-konf.handoff'
const COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const
const PROVIDERS = new Set(['github', 'linkedin'])
const noStore = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}

/** `KONF_IDENTITY_TENANTS`: comma-separated conference or organization ids. Empty = off. */
export function isIdentityTenant(conference: Conference): boolean {
  const ids = (process.env.KONF_IDENTITY_TENANTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return (
    ids.includes(conference._id) ||
    (!!conference.organization?._ref &&
      ids.includes(conference.organization._ref))
  )
}

/** This request's origin, or null when the tenant is not flagged. */
async function flaggedOrigin(request: NextRequest): Promise<string | null> {
  // Trusts x-forwarded-host / Host: on Vercel the edge sets both and routes
  // only domains attached to the project, so a client cannot pick another
  // tenant's origin. Revisit if this ever runs behind another proxy.
  const host = sessionCookieRequestHost(request.headers)
  if (!host) return null
  const { conference } = await getConferenceForDomain(host)
  return conference && isIdentityTenant(conference) ? `https://${host}` : null
}

const notFound = () => new NextResponse(null, { status: 404, headers: noStore })
const deny = (status: number) =>
  NextResponse.json({ error: 'unauthorized' }, { status, headers: noStore })

/** Server-to-server call to identity; each endpoint has its own secret. */
function identity(path: string, secret: string | undefined, body: unknown) {
  return fetch(new URL(path, process.env.IDENTITY_URL), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

function setSession(
  res: NextResponse,
  s: { session: string; expiresAt: string },
) {
  res.cookies.set(IDENTITY_SESSION_COOKIE, s.session, {
    ...COOKIE,
    expires: new Date(s.expiresAt),
  })
}

export async function handoffGET(request: NextRequest) {
  const origin = await flaggedOrigin(request)
  if (!origin) return notFound()
  const params = request.nextUrl.searchParams
  const token = params.get('token')

  if (!token) {
    const provider = params.get('provider') ?? ''
    if (!PROVIDERS.has(provider)) return notFound()
    const to = new URL('/handoff', process.env.IDENTITY_URL)
    to.searchParams.set('origin', origin)
    to.searchParams.set('provider', provider)
    const nonce = randomBytes(32).toString('base64url')
    to.searchParams.set(
      'state',
      createHash('sha256').update(nonce).digest('hex'),
    )
    const out = NextResponse.redirect(to, { headers: noStore })
    out.cookies.set(HANDOFF_NONCE_COOKIE, nonce, { ...COOKIE, maxAge: 600 })
    return out
  }

  // Without this browser's nonce the token was not started here: refuse
  // before spending it, so a planted token cannot log the victim in.
  const nonce = request.cookies.get(HANDOFF_NONCE_COOKIE)?.value
  const res = nonce
    ? await identity(
        '/handoff/exchange',
        process.env.IDENTITY_EXCHANGE_SECRET,
        { token, origin, nonce },
      )
    : null
  const out = res?.ok
    ? NextResponse.redirect(new URL('/', origin), { headers: noStore })
    : deny(401)
  if (res?.ok) setSession(out, await res.json())
  out.cookies.set(HANDOFF_NONCE_COOKIE, '', { ...COOKIE, expires: new Date(0) })
  return out
}

/**
 * One-time upgrade of an existing NextAuth session (epic #1772). Cookie
 * sessions only: no CLI bearer, no impersonation, no test mode. identity
 * matches on the provider account id or a proved email address (#807).
 */
async function upgrade(request: NextRequest, origin: string) {
  if (AppEnvironment.isTestMode) return null
  // No headers: getAuthSession then never reads a CLI bearer token.
  const session = await getAuthSession({ url: request.url })
  if (!session || session.isImpersonating) return null
  const provider = session.account?.provider
  const proved = (session as unknown as Record<string, unknown>)[
    EMAIL_LINK_IDENTIFIER_CLAIM
  ]
  const match =
    provider && PROVIDERS.has(provider) && session.account?.providerAccountId
      ? { providerId: provider, accountId: session.account.providerAccountId }
      : typeof proved === 'string' && proved
        ? { verifiedEmail: proved }
        : null
  if (!match) return null
  const res = await identity(
    '/handoff/upgrade',
    process.env.IDENTITY_UPGRADE_SECRET,
    { origin, ...match },
  )
  return res.ok
    ? ((await res.json()) as { session: string; expiresAt: string })
    : null
}

export async function tokenPOST(request: NextRequest) {
  const origin = await flaggedOrigin(request)
  if (!origin) return notFound()
  // CSRF: same-origin fetch only. Browsers always send Origin on POST.
  const site = request.headers.get('sec-fetch-site')
  if (
    request.headers.get('origin') !== origin ||
    (site && site !== 'same-origin')
  ) {
    return deny(403)
  }

  let session = request.cookies.get(IDENTITY_SESSION_COOKIE)?.value
  const upgraded = session ? null : await upgrade(request, origin)
  session ??= upgraded?.session
  if (!session) return deny(401)

  const res = await fetch(
    new URL('/api/auth/token', process.env.IDENTITY_URL),
    {
      headers: { authorization: `Bearer ${session}` },
      cache: 'no-store',
    },
  )
  if (res.status === 401) {
    // identity no longer accepts this session; drop it.
    const out = deny(401)
    out.cookies.set(IDENTITY_SESSION_COOKIE, '', {
      ...COOKIE,
      expires: new Date(0),
    })
    return out
  }
  if (!res.ok) return deny(502)
  const { token } = (await res.json()) as { token: string }
  const out = NextResponse.json({ token }, { headers: noStore })
  if (upgraded) setSession(out, upgraded)
  return out
}
