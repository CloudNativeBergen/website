/**
 * @vitest-environment node
 *
 * The workshop branch of `src/proxy.ts` against the REAL
 * `@workos-inc/authkit-nextjs` (#1296). Nothing of the SDK is mocked: the
 * `Location`, the PKCE parameters and the `Set-Cookie` values asserted here are
 * what the installed package produces.
 *
 * Only the Sanity persistence boundary is supplied (`listAllowlistCandidates`),
 * so the real allowlist policy decides which hosts may sign in.
 *
 * LIMIT OF THIS FILE: the suite aliases `jose` to a stub (see vitest.config),
 * and the SDK is inlined, so a request carrying a `wos-session` cookie would be
 * verified by that stub. Everything below is therefore about the SIGNED-OUT
 * path, which never reaches `jose`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, type NextFetchEvent } from 'next/server'
import type { DomainVerificationRecord } from '@/lib/domain-verification/types'

/** A decoy the SDK would fall back to if a caller forgot `redirectUri`. */
const ENV_FALLBACK = 'https://decoy.example.org/api/auth/callback'

// The SDK captures its configuration at module load.
vi.hoisted(() => {
  process.env.WORKOS_CLIENT_ID = 'client_test'
  process.env.WORKOS_API_KEY = 'sk_test_key'
  process.env.WORKOS_COOKIE_PASSWORD = 'p'.repeat(48)
  process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI =
    'https://decoy.example.org/api/auth/callback'
  delete process.env.WORKOS_COOKIE_DOMAIN
})

const listAllowlistCandidates =
  vi.fn<() => Promise<DomainVerificationRecord[]>>()

vi.mock('@/lib/domain-verification/sanity', () => ({
  listAllowlistCandidates: () => listAllowlistCandidates(),
}))

import middleware from '@/proxy'
import { getWorkOS } from '@workos-inc/authkit-nextjs'

function verified(hostname: string): DomainVerificationRecord {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  return {
    _id: `domainVerification.${hostname}`,
    hostname,
    conferenceId: 'conference-1',
    token: 'tok',
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: yesterday,
    lastSuccessAt: yesterday,
    lastCheckedAt: yesterday,
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
  }
}

const TENANT_A = 'a.example.org'
const TENANT_B = 'b.example.org'
const UNVERIFIED = 'unverified.example.org'

/** A browser navigating to `path` on `host`, signed out. */
function navigate(
  host: string,
  path = '/workshop',
  init: { scheme?: 'http' | 'https'; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`${init.scheme ?? 'https'}://${host}${path}`, {
    headers: new Headers({ host, accept: 'text/html', ...init.headers }),
  })
}

const event = {} as NextFetchEvent

async function run(request: NextRequest): Promise<Response> {
  return (await middleware(request, event)) as Response
}

/** The authorize URL the response redirects to, parsed. */
function authorizeUrl(response: Response): URL {
  return new URL(response.headers.get('location')!)
}

const buildAuthorizationUrl = vi.spyOn(
  getWorkOS().userManagement,
  'getAuthorizationUrl',
)
const generatePkce = vi.spyOn(getWorkOS().pkce, 'generate')

beforeEach(() => {
  vi.clearAllMocks()
  listAllowlistCandidates.mockResolvedValue([
    verified(TENANT_A),
    verified(TENANT_B),
  ])
  vi.stubEnv('NODE_ENV', 'production')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop proxy — a signed-out visitor on an allowlisted host', () => {
  it('is redirected to WorkOS with THAT host’s callback as redirect_uri', async () => {
    const response = await run(navigate(TENANT_A))

    expect(response.status).toBe(307)
    const url = authorizeUrl(response)
    expect(url.origin + url.pathname).toBe(
      'https://api.workos.com/user_management/authorize',
    )
    expect(url.searchParams.get('redirect_uri')).toBe(
      `https://${TENANT_A}/api/auth/callback`,
    )
    expect(url.searchParams.get('client_id')).toBe('client_test')
  })

  it('uses PKCE — a challenge in the URL and its verifier in a cookie', async () => {
    const response = await run(navigate(TENANT_A))

    const url = authorizeUrl(response)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)

    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(/^wos-auth-verifier-[0-9a-f]{8}=/)
    // The sealed state travels in BOTH channels; the callback compares them.
    expect(cookies[0]).toContain(`=${url.searchParams.get('state')};`)
  })

  it('never falls back to the single-host env URI, nor to a client-sent x-redirect-uri', async () => {
    const response = await run(
      navigate(TENANT_A, '/workshop', {
        headers: { 'x-redirect-uri': 'https://evil.example.org/steal' },
      }),
    )

    const location = response.headers.get('location')!
    expect(location).not.toContain(encodeURIComponent(ENV_FALLBACK))
    expect(location).not.toContain('decoy')
    expect(location).not.toContain('evil')
    expect(authorizeUrl(response).searchParams.get('redirect_uri')).toBe(
      `https://${TENANT_A}/api/auth/callback`,
    )
  })

  it('serves each host its own callback, request by request (nothing is captured)', async () => {
    const seen: (string | null)[] = []
    for (const host of [TENANT_A, TENANT_B, TENANT_A]) {
      const response = await run(navigate(host))
      seen.push(authorizeUrl(response).searchParams.get('redirect_uri'))
    }
    expect(seen).toEqual([
      `https://${TENANT_A}/api/auth/callback`,
      `https://${TENANT_B}/api/auth/callback`,
      `https://${TENANT_A}/api/auth/callback`,
    ])
  })

  it('returns the visitor to the path they asked for', async () => {
    const response = await run(navigate(TENANT_A, '/workshop?from=email'))
    // The return path rides inside the sealed state, never in the open.
    expect(response.headers.get('location')).not.toContain('from%3Demail')
    expect(response.status).toBe(307)
  })
})

/**
 * THE SESSION COOKIE STAYS HOST-ONLY. A cookie without a `Domain` attribute is
 * sent back only to the exact host that set it, so a session (or a pending
 * sign-in) on one tenant's host is never presented on another's.
 */
describe('workshop proxy — cookies are host-only', () => {
  it('sets no Domain attribute on the cookie it issues', async () => {
    const response = await run(navigate(TENANT_A))
    const [cookie] = response.headers.getSetCookie()

    expect(cookie).toBeDefined()
    expect(cookie).not.toMatch(/;\s*domain=/i)
    expect(cookie).toMatch(/;\s*Path=\//)
    expect(cookie).toMatch(/;\s*HttpOnly/)
    expect(cookie).toMatch(/;\s*Secure/)
    expect(cookie).toMatch(/;\s*SameSite=Lax/)
  })

  it('refuses every host when WORKOS_COOKIE_DOMAIN would widen the cookie', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('WORKOS_COOKIE_DOMAIN', '.example.org')

    const response = await run(navigate(TENANT_A))

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('workshop proxy — any other host', () => {
  it('issues NO authorize redirect and sets no cookie', async () => {
    const response = await run(navigate(UNVERIFIED))

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('builds no authorize URL and no PKCE pair — the SDK is never entered', async () => {
    await run(navigate(UNVERIFIED))
    await run(navigate(UNVERIFIED, '/workshop/sign-in'))

    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    expect(generatePkce).not.toHaveBeenCalled()

    // CONTROL: the same spies DO fire for an allowlisted host, so the two
    // assertions above are about the refusal and not about dead spies.
    await run(navigate(TENANT_A))
    expect(buildAuthorizationUrl).toHaveBeenCalledOnce()
    expect(generatePkce).toHaveBeenCalledOnce()
  })

  it('decides from the allowlist BEFORE the SDK does anything', async () => {
    await run(navigate(TENANT_A))

    expect(listAllowlistCandidates).toHaveBeenCalledOnce()
    expect(listAllowlistCandidates.mock.invocationCallOrder[0]).toBeLessThan(
      generatePkce.mock.invocationCallOrder[0],
    )
    expect(listAllowlistCandidates.mock.invocationCallOrder[0]).toBeLessThan(
      buildAuthorizationUrl.mock.invocationCallOrder[0],
    )
  })

  it('refuses when the allowlist cannot be read (fail closed)', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    listAllowlistCandidates.mockRejectedValue(new Error('sanity unavailable'))

    const response = await run(navigate(TENANT_A))

    expect(response.status).toBe(404)
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('refuses a request with no Host header at all', async () => {
    const request = new NextRequest(`https://${TENANT_A}/workshop`, {
      headers: new Headers({ accept: 'text/html' }),
    })
    const response = await run(request)

    expect(response.status).toBe(404)
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
  })

  it('does not let a subdomain or a look-alike borrow a verified host', async () => {
    for (const host of [
      `sub.${TENANT_A}`,
      `${TENANT_A}.evil.example.org`,
      `evil-${TENANT_A}`,
    ]) {
      expect((await run(navigate(host))).status).toBe(404)
    }
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
  })
})

/**
 * `/workshop/sign-in` and `/workshop/sign-up` START a sign-in themselves (their
 * route handlers call the SDK), so the proxy lets a signed-out visitor through
 * to them instead of bouncing them into a sign-in of its own.
 */
describe('workshop proxy — the sign-in and sign-up entry points', () => {
  it.each(['/workshop/sign-in', '/workshop/sign-up'])(
    'passes %s through, signed out, on an allowlisted host',
    async (path) => {
      const response = await run(navigate(TENANT_A, path))

      expect(response.headers.get('x-middleware-next')).toBe('1')
      expect(response.headers.get('location')).toBeNull()
      // No sign-in was started by the proxy, so no verifier cookie either.
      expect(response.headers.getSetCookie()).toEqual([])
    },
  )

  it('still redirects every other path under /workshop', async () => {
    expect((await run(navigate(TENANT_A, '/workshop/sign-in/x'))).status).toBe(
      307,
    )
    expect((await run(navigate(TENANT_A, '/workshop/agenda'))).status).toBe(307)
  })
})

/**
 * The development-only `localhost` exception (parent #1293, decision 8).
 */
describe('workshop proxy — localhost', () => {
  it('signs in over http in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const response = await run(
      navigate('localhost:3000', '/workshop', { scheme: 'http' }),
    )

    expect(response.status).toBe(307)
    expect(authorizeUrl(response).searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback',
    )
    expect(listAllowlistCandidates).not.toHaveBeenCalled()
  })

  it('is unreachable when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // Even with a record that says "verified" for it.
    listAllowlistCandidates.mockResolvedValue([
      verified('localhost:3000'),
      verified('localhost'),
    ])

    const response = await run(
      navigate('localhost:3000', '/workshop', { scheme: 'http' }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(buildAuthorizationUrl).not.toHaveBeenCalled()
  })
})
