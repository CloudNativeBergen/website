import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthSession = vi.fn()
const testMode = { value: false }
vi.mock('@/lib/auth', () => ({ getAuthSession }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: async () => ({
    conference: { _id: 'conf-1', organization: { _ref: 'org-1' } },
  }),
}))
vi.mock('@/lib/environment/config', () => ({
  AppEnvironment: {
    get isTestMode() {
      return testMode.value
    },
  },
}))

const { handoffGET, tokenPOST, IDENTITY_SESSION_COOKIE } =
  await import('./identity-handoff')

const SITE = 'https://conf.example'
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('KONF_IDENTITY_TENANTS', 'org-1')
  vi.stubEnv('IDENTITY_URL', 'https://id.test')
  vi.stubEnv('IDENTITY_SITE_SECRET', 's3cret')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  getAuthSession.mockReset()
  testMode.value = false
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const get = (q: string) =>
  handoffGET(
    new NextRequest(`${SITE}/api/auth/handoff?${q}`, {
      headers: { host: 'conf.example' },
    }),
  )

const token = (headers: Record<string, string> = {}) =>
  tokenPOST(
    new NextRequest(`${SITE}/api/token`, {
      method: 'POST',
      headers: {
        host: 'conf.example',
        origin: SITE,
        'sec-fetch-site': 'same-origin',
        ...headers,
      },
    }),
  )

const SESSION = { session: 'tok.sig', expiresAt: '2030-01-01T00:00:00Z' }

describe('flag off', () => {
  it.each(['', 'conf-other'])(
    'KONF_IDENTITY_TENANTS=%j: 404, no identity call, no session read',
    async (v) => {
      vi.stubEnv('KONF_IDENTITY_TENANTS', v)
      expect((await get('token=t')).status).toBe(404)
      expect((await get('provider=github')).status).toBe(404)
      expect((await token()).status).toBe(404)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(getAuthSession).not.toHaveBeenCalled()
    },
  )
})

describe('/api/auth/handoff', () => {
  it('sends the user to identity with this exact origin', async () => {
    const res = await get('provider=github')
    const to = new URL(res.headers.get('location')!)
    expect(to.origin + to.pathname).toBe('https://id.test/handoff')
    expect(to.searchParams.get('origin')).toBe(SITE)
  })

  it('exchanges the token server side, bound to this origin, for a host-only cookie', async () => {
    fetchMock.mockResolvedValue(Response.json(SESSION))
    const res = await get('token=abc')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://id.test/handoff/exchange')
    expect(JSON.parse(init.body)).toEqual({ token: 'abc', origin: SITE })
    expect(init.headers.authorization).toBe('Bearer s3cret')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`${IDENTITY_SESSION_COOKIE}=tok.sig`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).not.toMatch(/Domain=/i)
  })

  it('sets no cookie when identity refuses the token', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    const res = await get('token=spent')
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('/api/token', () => {
  it.each([
    [{ origin: 'https://evil.example' }],
    [{ 'sec-fetch-site': 'cross-site' }],
    [{ 'sec-fetch-site': 'same-site' }],
  ])('refuses a cross-origin POST %j', async (h) => {
    expect(
      (await token({ ...h, cookie: `${IDENTITY_SESSION_COOKIE}=x` })).status,
    ).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a JWT for the first-party session', async () => {
    fetchMock.mockResolvedValue(Response.json({ token: 'jwt' }))
    const res = await token({ cookie: `${IDENTITY_SESSION_COOKIE}=tok.sig` })
    expect(await res.json()).toEqual({ token: 'jwt' })
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(
      'Bearer tok.sig',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('upgrades a NextAuth session once, on the provider account id', async () => {
    getAuthSession.mockResolvedValue({
      account: { provider: 'github', providerAccountId: '42' },
    })
    fetchMock
      .mockResolvedValueOnce(Response.json(SESSION))
      .mockResolvedValueOnce(Response.json({ token: 'jwt' }))
    const res = await token()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      origin: SITE,
      providerId: 'github',
      accountId: '42',
    })
    expect(await res.json()).toEqual({ token: 'jwt' })
    expect(res.headers.get('set-cookie')).toContain(
      `${IDENTITY_SESSION_COOKIE}=tok.sig`,
    )
    // getAuthSession got no headers, so a CLI bearer token can never upgrade.
    expect(getAuthSession.mock.calls[0][0]).not.toHaveProperty('headers')
  })

  it('upgrades a magic-link session on the proved address only', async () => {
    getAuthSession.mockResolvedValue({
      account: { provider: 'email-link', providerAccountId: 'speaker-1' },
      emailLinkIdentifier: 'a@x.test',
    })
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    await token()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      origin: SITE,
      verifiedEmail: 'a@x.test',
    })
  })

  it('refuses to upgrade an impersonated session', async () => {
    getAuthSession.mockResolvedValue({
      isImpersonating: true,
      account: { provider: 'github', providerAccountId: '42' },
    })
    expect((await token()).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to upgrade in test mode', async () => {
    testMode.value = true
    getAuthSession.mockResolvedValue({
      account: { provider: 'github', providerAccountId: '42' },
    })
    expect((await token()).status).toBe(401)
    expect(getAuthSession).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears a session identity no longer accepts', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    const res = await token({ cookie: `${IDENTITY_SESSION_COOKIE}=old` })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toContain(
      `${IDENTITY_SESSION_COOKIE}=;`,
    )
  })
})
