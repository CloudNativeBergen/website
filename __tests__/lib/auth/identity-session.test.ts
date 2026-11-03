/**
 * @vitest-environment node
 *
 * getAuthSession accepts the identity session cookie (#1892) for flagged
 * tenants, on the origin the session was issued for, and only when there is no
 * NextAuth session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const nextAuthSession = { value: null as unknown }
  // next-auth's `auth`: `auth()` reads the cookie session; `auth(handler)`
  // (the proxy's form) sets req.auth to it. Built at import, so hoisted.
  const authImpl = (arg?: unknown) => {
    if (typeof arg !== 'function') return Promise.resolve(nextAuthSession.value)
    return async (req: { auth: unknown }, ctx: unknown) => {
      req.auth = nextAuthSession.value
      return arg(req, ctx)
    }
  }
  return {
    nextAuthSession,
    mockAuth: vi.fn(authImpl),
    getOrCreateSpeaker: vi.fn(),
    cookie: { value: 'tok-1' as string | undefined },
    host: { value: 'conf.example' },
    fetch: vi.fn(),
  }
})

vi.mock('next-auth', () => ({
  default: () => ({
    auth: h.mockAuth,
    signIn: vi.fn(),
    handlers: {
      // /api/auth/session as NextAuth answers it: the cookie session or null.
      GET: async () => Response.json(h.nextAuthSession.value),
      POST: vi.fn(),
    },
  }),
  AuthError: class AuthError extends Error {},
}))
vi.mock('@/lib/environment/config', () => ({
  AppEnvironment: {
    isTestMode: false,
    isDevelopment: false,
    isProduction: true,
  },
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: vi.fn(),
  getOrCreateSpeaker: h.getOrCreateSpeaker,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: async () => ({
    conference: { _id: 'conf-1', organization: { _ref: 'org-1' } },
  }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === '__Host-konf.session' && h.cookie.value
        ? { value: h.cookie.value }
        : undefined,
  }),
  headers: async () => new Headers({ host: h.host.value }),
}))

import { NextRequest } from 'next/server'
import { getAuthSession, handlers } from '@/lib/auth'
import middleware from '@/proxy'

function adminRequest() {
  const req = new NextRequest('https://conf.example/admin', {
    headers: { host: h.host.value },
  })
  if (h.cookie.value) req.cookies.set('__Host-konf.session', h.cookie.value)
  return middleware(req) as Promise<Response>
}

const speaker = {
  _id: 'speaker-1',
  slug: 'ada',
  name: 'Ada',
  email: 'ada@example.com',
  isOrganizer: false,
  organizerOrgIds: ['org-1'],
}

function identityReplies(origin: string) {
  h.fetch.mockImplementation(async (url: URL) => {
    if (url.pathname === '/api/auth/get-session') {
      return Response.json({
        session: { origin, expiresAt: '2030-01-01T00:00:00.000Z' },
        user: { email: 'ada@example.com', emailVerified: true, name: 'Ada' },
      })
    }
    if (url.pathname === '/api/auth/list-accounts') {
      return Response.json([{ providerId: 'github', accountId: '42' }])
    }
    return new Response(null, { status: 404 })
  })
}

let n = 0
beforeEach(() => {
  // A fresh cookie per test, so the per-instance memo never carries over.
  h.cookie.value = `tok-${++n}`
  h.host.value = 'conf.example'
  vi.stubEnv('KONF_IDENTITY_TENANTS', 'org-1')
  vi.stubEnv('IDENTITY_URL', 'https://id.test')
  vi.stubGlobal('fetch', h.fetch)
  h.nextAuthSession.value = null
  h.getOrCreateSpeaker.mockResolvedValue({ speaker, err: null })
  identityReplies('https://conf.example')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('getAuthSession with an identity session', () => {
  it('maps the identity user to the speaker via getOrCreateSpeaker', async () => {
    const session = await getAuthSession()
    expect(session?.speaker?._id).toBe('speaker-1')
    expect(session?.speaker?.organizerOrgIds).toEqual(['org-1'])
    expect(session?.account).toMatchObject({
      provider: 'github',
      providerAccountId: '42',
    })
    expect(session?.user?.email).toBe('ada@example.com')
    expect(session?.expires).toBe('2030-01-01T00:00:00.000Z')
    expect(h.getOrCreateSpeaker).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com' }),
      expect.objectContaining({ provider: 'github', providerAccountId: '42' }),
      expect.anything(),
    )
    const [url, init] = h.fetch.mock.calls[0]
    expect(String(url)).toBe('https://id.test/api/auth/get-session')
    expect(init.headers.authorization).toBe(`Bearer ${h.cookie.value}`)
  })

  it('ignores the cookie when the tenant is not flagged', async () => {
    vi.stubEnv('KONF_IDENTITY_TENANTS', 'org-other')
    expect(await getAuthSession()).toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('ignores the cookie when the flag is unset', async () => {
    vi.stubEnv('KONF_IDENTITY_TENANTS', '')
    expect(await getAuthSession()).toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('ignores a session issued for another origin', async () => {
    identityReplies('https://other.example')
    expect(await getAuthSession()).toBeNull()
    expect(h.getOrCreateSpeaker).not.toHaveBeenCalled()
  })

  it('ignores a session carried to another flagged host', async () => {
    h.host.value = 'evil.example'
    expect(await getAuthSession()).toBeNull()
    expect(h.getOrCreateSpeaker).not.toHaveBeenCalled()
  })

  it('prefers the NextAuth session', async () => {
    const nextAuth = { expires: 'x', speaker: { _id: 'speaker-n' } }
    h.nextAuthSession.value = nextAuth
    expect(await getAuthSession()).toBe(nextAuth)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('falls back to signed out when identity fails', async () => {
    h.fetch.mockRejectedValue(new Error('down'))
    expect(await getAuthSession()).toBeNull()
  })

  it('resolves the speaker once for concurrent first requests', async () => {
    const all = await Promise.all([1, 2, 3, 4].map(() => getAuthSession()))
    expect(all.every((s) => s?.speaker?._id === 'speaker-1')).toBe(true)
    expect(h.getOrCreateSpeaker).toHaveBeenCalledTimes(1)
  })

  it('does not cache an identity 5xx', async () => {
    h.fetch.mockResolvedValueOnce(new Response(null, { status: 503 }))
    expect(await getAuthSession()).toBeNull()
    expect((await getAuthSession())?.speaker?._id).toBe('speaker-1')
  })
})

describe('proxy with an identity session', () => {
  it('lets a flagged identity session into /admin', async () => {
    const res = await adminRequest()
    expect(res.headers.get('location')).toBeNull()
    expect(h.getOrCreateSpeaker).toHaveBeenCalledTimes(1)
  })

  it('redirects to sign-in when the tenant is not flagged', async () => {
    vi.stubEnv('KONF_IDENTITY_TENANTS', 'org-other')
    const res = await adminRequest()
    expect(res.headers.get('location')).toContain('/api/auth/signin')
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('lets a NextAuth session in without asking identity', async () => {
    h.nextAuthSession.value = { expires: 'x', speaker: { _id: 'n' } }
    const res = await adminRequest()
    expect(res.headers.get('location')).toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('GET /api/auth/session with an identity session', () => {
  function sessionRequest() {
    const req = new NextRequest('https://conf.example/api/auth/session', {
      headers: { host: h.host.value },
    })
    if (h.cookie.value) req.cookies.set('__Host-konf.session', h.cookie.value)
    return handlers.GET(req)
  }

  it('answers with the identity session for a flagged tenant', async () => {
    const body = await (await sessionRequest()).json()
    expect(body?.speaker?._id).toBe('speaker-1')
  })

  it('answers null when the tenant is not flagged', async () => {
    vi.stubEnv('KONF_IDENTITY_TENANTS', 'org-other')
    expect(await (await sessionRequest()).json()).toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('keeps the NextAuth session when there is one', async () => {
    h.nextAuthSession.value = { expires: 'x', speaker: { _id: 'n' } }
    const body = await (await sessionRequest()).json()
    expect(body.speaker._id).toBe('n')
    expect(h.fetch).not.toHaveBeenCalled()
  })
})
