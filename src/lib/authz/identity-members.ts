import 'server-only'
import { cookies } from 'next/headers'
import { can, principalOfRole } from '@runkonf/tenancy/authz'
import { IDENTITY_SESSION_COOKIE } from '@/lib/auth/identity-cookie'
import { konfApiHeaders, konfApiUrl } from '@/lib/konf-api/client'
import { identityJwt } from '@/lib/konf-api/conference-write'

// Authz phase 1b (#2101): for an org an operator switched to identity
// (identity's setMemberSource), the org's organizers are its identity
// owners and admins, read live through the gateway, not Sanity organizers[].

const TTL_MS = 60_000
const TIMEOUT_MS = 3000
const QUERY = '{ memberAuthority { identitySource role } }'

export type OrgAuthority = {
  /** Identity owns this org's roles. */
  identitySource: boolean
  /** Organizer (owner or admin) by identity; false without a Konf sign-in. */
  admin: boolean
  /** A Konf (identity) sign-in was available to ask with. */
  signedIn: boolean
}

// ponytail: per-instance memo, as live-organizer. Revocation in identity
// shows up within TTL_MS. Move to a shared cache if instances multiply.
const memo = new Map<string, { at: number; value: Promise<OrgAuthority> }>()

async function read(host: string, url: string): Promise<OrgAuthority> {
  const jwt = await identityJwt()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(await konfApiHeaders(host)),
      ...(jwt && { authorization: `Bearer ${jwt}` }),
    },
    body: JSON.stringify({ query: QUERY }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: {
      memberAuthority: { identitySource: boolean; role: string | null } | null
    }
    errors?: { message?: string }[]
  }
  if (json.errors?.length || !json.data?.memberAuthority)
    throw new Error('no memberAuthority')
  const a = json.data.memberAuthority
  return {
    identitySource: a.identitySource === true,
    admin: !!jwt && can(principalOfRole(a.role), 'org.manage_members'),
    signedIn: !!jwt,
  }
}

/**
 * The request org's member source and the caller's identity role. Null when
 * this environment has no gateway (preview, KONF_API_DISABLED): Sanity
 * decides, as before. Throws when the gateway cannot answer.
 */
export async function orgAuthority(host: string): Promise<OrgAuthority | null> {
  if (process.env.KONF_API_DISABLED === '1') return null
  const url = konfApiUrl()
  if (!url) return null
  const session = (await cookies()).get(IDENTITY_SESSION_COOKIE)?.value ?? ''
  const key = `${host} ${session}`
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = read(host, url)
  if (memo.size > 1000) memo.clear()
  memo.set(key, { at: Date.now(), value })
  // A failure is not an answer: retry on the next request.
  value.catch(() => {
    if (memo.get(key)?.value === value) memo.delete(key)
  })
  return value
}

/** Test hook. */
export function clearOrgAuthorityMemo(): void {
  memo.clear()
}

const INVITE =
  'mutation($email: String!) { inviteMember(email: $email, role: admin) { id status expiresAt } }'

/**
 * An organizer invitation for an identity-source org (#2101): an identity
 * `admin` invitation made as the signed-in user, so identity's own rules
 * (owner/admin only, audit) decide. Never a service call. Throws when there
 * is no Konf sign-in or the gateway refuses.
 */
export async function inviteThroughIdentity(
  host: string,
  email: string,
): Promise<{ id: string; status: string; expiresAt: string }> {
  const url = konfApiUrl()
  const jwt = await identityJwt()
  if (!url || !jwt) throw new Error('no Konf sign-in')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(await konfApiHeaders(host)),
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query: INVITE, variables: { email } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: {
      inviteMember: { id: string; status: string; expiresAt: string } | null
    }
    errors?: { message?: string }[]
  }
  if (json.errors?.length || !json.data?.inviteMember)
    throw new Error(json.errors?.map((e) => e.message).join('; ') || 'refused')
  return json.data.inviteMember
}
