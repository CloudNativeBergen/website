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
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'
import { EMAIL_LINK_IDENTIFIER_CLAIM } from '@/lib/auth/email-link/identity'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { AppEnvironment } from '@/lib/environment/config'
import type { Conference } from '@/lib/conference/types'

/** Host-only, https-only, never readable from script. */
export const IDENTITY_SESSION_COOKIE = '__Host-konf.session'
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
  const host = sessionCookieRequestHost(request.headers)
  if (!host) return null
  const { conference } = await getConferenceForDomain(host)
  return conference && isIdentityTenant(conference) ? `https://${host}` : null
}

const notFound = () => new NextResponse(null, { status: 404, headers: noStore })
const deny = (status: number) =>
  NextResponse.json({ error: 'unauthorized' }, { status, headers: noStore })

/** Server-to-server call to identity with the per-environment site secret. */
function identity(path: string, body: unknown) {
  return fetch(new URL(path, process.env.IDENTITY_URL), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.IDENTITY_SITE_SECRET}`,
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
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
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
    return NextResponse.redirect(to, { headers: noStore })
  }

  const res = await identity('/handoff/exchange', { token, origin })
  if (!res.ok) return deny(401)
  const out = NextResponse.redirect(new URL('/', origin), { headers: noStore })
  setSession(out, await res.json())
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
  const res = await identity('/handoff/upgrade', { origin, ...match })
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
  if (!res.ok) {
    const out = deny(401)
    out.cookies.delete(IDENTITY_SESSION_COOKIE)
    return out
  }
  const { token } = (await res.json()) as { token: string }
  const out = NextResponse.json({ token }, { headers: noStore })
  if (upgraded) setSession(out, upgraded)
  return out
}
