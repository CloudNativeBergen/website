// The site session from an identity session cookie (#1892), for tenants in
// KONF_IDENTITY_TENANTS. getAuthSession calls this only when there is no
// NextAuth session and no CLI bearer token. Any failure means signed out.
//
// identity's get-session answers with the user and the session's `origin`, the
// tenant origin the handoff issued it for. A cookie is accepted only on that
// origin. The person is mapped to a speaker by the same getOrCreateSpeaker that
// NextAuth sign-in uses, with the provider account identity holds.
import 'server-only'
import { cookies, headers } from 'next/headers'
import type { Account, Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { applySpeakerToToken, sessionCallback } from '@/lib/auth'
import { sessionCookieRequestHost } from '@/lib/auth-cookie-domain'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { getOrCreateSpeaker } from '@/lib/speaker/sanity'
import { IDENTITY_SESSION_COOKIE } from './identity-cookie'
import { isIdentityTenant } from './identity-handoff'

const PROVIDERS = ['github', 'linkedin']
const TTL_MS = 60_000

// ponytail: per-instance memo so a page's many getAuthSession calls, and the
// next few requests, cost one identity round trip. Revocation shows up within
// TTL_MS. Move to a shared cache if instances multiply.
const memo = new Map<string, { at: number; session: Promise<Session | null> }>()

/** Drop a signed-out session from the memo, on every host. */
export function forgetIdentitySession(token: string): void {
  for (const key of memo.keys()) {
    if (key.endsWith(` ${token}`)) memo.delete(key)
  }
}

/** The identity session for this request (RSC / route handlers). */
export async function identitySession(): Promise<Session | null> {
  try {
    if (!process.env.KONF_IDENTITY_TENANTS || !process.env.IDENTITY_URL) {
      return null
    }
    return await identitySessionFor(
      (await cookies()).get(IDENTITY_SESSION_COOKIE)?.value,
      sessionCookieRequestHost(await headers()),
    )
  } catch {
    return null
  }
}

/** Same, from explicit request values (the proxy has no next/headers). */
export async function identitySessionFor(
  token: string | undefined,
  host: string | null,
): Promise<Session | null> {
  try {
    if (!process.env.KONF_IDENTITY_TENANTS || !process.env.IDENTITY_URL) {
      return null
    }
    if (!token || !host) return null
    const { conference } = await getConferenceForDomain(host)
    if (!conference || !isIdentityTenant(conference)) return null

    const key = `${host} ${token}`
    const hit = memo.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return await hit.session
    // The in-flight promise is shared, so parallel first requests run
    // getOrCreateSpeaker once. A rejection (identity 5xx, network, Sanity)
    // is not a definite answer: drop it so the next request retries.
    const session = resolve(token, `https://${host}`)
    if (memo.size > 1000) memo.clear()
    memo.set(key, { at: Date.now(), session })
    session.catch(() => memo.delete(key))
    return await session
  } catch {
    return null
  }
}

async function identityGET<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(new URL(path, process.env.IDENTITY_URL), {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  if (res.ok) return (await res.json()) as T
  // 4xx is identity's answer (no such session); anything else is not.
  if (res.status >= 400 && res.status < 500) return null
  throw new Error(`identity ${res.status}`)
}

async function resolve(token: string, origin: string): Promise<Session | null> {
  const got = await identityGET<{
    session?: { origin?: string | null; expiresAt?: string }
    user?: {
      email?: string
      emailVerified?: boolean
      name?: string
      image?: string | null
    }
  }>('/api/auth/get-session', token)
  // Bound to the tenant the handoff issued it for, and nowhere else.
  if (!got?.session || got.session.origin !== origin || !got.user) return null
  // getOrCreateSpeaker treats the primary email as provider-verified.
  if (!got.user.emailVerified || !got.user.email) return null

  const accounts =
    (await identityGET<{ providerId: string; accountId: string }[]>(
      '/api/auth/list-accounts',
      token,
    )) ?? []
  const linked = PROVIDERS.map((p) =>
    accounts.find((a) => a.providerId === p),
  ).find(Boolean)
  if (!linked) return null

  const account: Account = {
    provider: linked.providerId,
    providerAccountId: linked.accountId,
    type: 'oauth',
  }
  const user = {
    email: got.user.email,
    name: got.user.name || got.user.email,
    image: got.user.image ?? undefined,
  }
  const { speaker, err } = await getOrCreateSpeaker(user, account, {
    email_verified: true,
  })
  if (err) throw err
  if (!speaker?._id) return null

  const jwt: JWT = { sub: speaker._id, ...user, picture: user.image }
  applySpeakerToToken(jwt, speaker, account)
  return sessionCallback({
    session: {
      expires:
        got.session.expiresAt ?? new Date(Date.now() + TTL_MS).toISOString(),
    } as Session,
    token: jwt,
  })
}
