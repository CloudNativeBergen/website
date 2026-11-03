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
const memo = new Map<string, { at: number; session: Session | null }>()

export async function identitySession(): Promise<Session | null> {
  try {
    if (!process.env.KONF_IDENTITY_TENANTS || !process.env.IDENTITY_URL) {
      return null
    }
    const token = (await cookies()).get(IDENTITY_SESSION_COOKIE)?.value
    if (!token) return null
    const host = sessionCookieRequestHost(await headers())
    if (!host) return null
    const { conference } = await getConferenceForDomain(host)
    if (!conference || !isIdentityTenant(conference)) return null

    const key = `${host} ${token}`
    const hit = memo.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.session
    const session = await resolve(token, `https://${host}`)
    if (memo.size > 1000) memo.clear()
    memo.set(key, { at: Date.now(), session })
    return session
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
  return res.ok ? ((await res.json()) as T) : null
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
  if (err || !speaker?._id) return null

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
