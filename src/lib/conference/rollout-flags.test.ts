import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/konf-api/client', () => ({
  konfApiUrl: () =>
    process.env.VERCEL_ENV === 'preview' ? null : 'https://api.test/graphql',
  konfApiHeaders: vi.fn(async (host: string) => ({
    origin: `https://${host}`,
    'x-konf-service': `signed:${host}`,
  })),
}))

import { rolloutFlags } from './konf-api'

const conf = { _id: 'conf-1', organization: { _ref: 'org-1' } }
const off = { apiRead: false, identityLogin: false, d1Write: false }
const fetchMock = vi.fn()
const reply = (rolloutFlags: unknown) =>
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { rolloutFlags } })),
  )

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('KONF_SITE_SIGNING_KEY', 'k')
  for (const n of [
    'KONF_API_TENANTS',
    'KONF_IDENTITY_TENANTS',
    'KONF_D1_WRITE_TENANTS',
    'KONF_API_DISABLED',
  ])
    vi.stubEnv(n, '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  fetchMock.mockReset()
})

describe('rolloutFlags (#1925)', () => {
  it("reads the host's flags on the signed lane, with no tenant argument", async () => {
    reply({ apiRead: true, identityLogin: false, d1Write: true })
    expect(await rolloutFlags('a.example', conf)).toEqual({
      apiRead: true,
      identityLogin: false,
      d1Write: true,
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      query: '{ rolloutFlags { apiRead identityLogin d1Write } }',
    })
    expect(init.headers['x-konf-service']).toBe('signed:a.example')
  })

  it('counts only a literal true', async () => {
    reply({ apiRead: 'true', identityLogin: 1, d1Write: null })
    expect(await rolloutFlags('a.example', conf)).toEqual(off)
  })

  it('ORs the transition env lists in', async () => {
    reply(null)
    vi.stubEnv('KONF_API_TENANTS', 'org-1')
    vi.stubEnv('KONF_IDENTITY_TENANTS', ' conf-1 ')
    vi.stubEnv('KONF_D1_WRITE_TENANTS', 'org-1') // conference ids only
    expect(await rolloutFlags('a.example', conf)).toEqual({
      apiRead: true,
      identityLogin: true,
      d1Write: false,
    })
  })

  it.each([
    [
      'HTTP 503',
      () => fetchMock.mockResolvedValue(new Response('', { status: 503 })),
    ],
    [
      'GraphQL errors',
      () => fetchMock.mockResolvedValue(Response.json({ errors: [{}] })),
    ],
    ['a network error', () => fetchMock.mockRejectedValue(new Error('down'))],
  ])('fails safe to the env lists on %s', async (_, fail) => {
    fail()
    expect(await rolloutFlags('a.example', conf)).toEqual(off)
    vi.stubEnv('KONF_D1_WRITE_TENANTS', 'conf-1')
    expect(await rolloutFlags('a.example', conf)).toEqual({
      ...off,
      d1Write: true,
    })
  })

  it('KONF_API_DISABLED=1 turns everything off without a call', async () => {
    reply({ apiRead: true, identityLogin: true, d1Write: true })
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    vi.stubEnv('KONF_API_DISABLED', '1')
    expect(await rolloutFlags('a.example', conf)).toEqual(off)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns API read and D1 write off without a gateway URL (#1926)', async () => {
    reply({ apiRead: true, identityLogin: true, d1Write: true })
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('KONF_API_TENANTS', 'conf-1')
    vi.stubEnv('KONF_IDENTITY_TENANTS', 'conf-1')
    vi.stubEnv('KONF_D1_WRITE_TENANTS', 'conf-1')
    expect(await rolloutFlags('a.example', conf)).toEqual({ ...off, identityLogin: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes no call without the signing key or a host', async () => {
    reply({ apiRead: true, identityLogin: true, d1Write: true })
    expect(await rolloutFlags(null, conf)).toEqual(off)
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '')
    expect(await rolloutFlags('a.example', conf)).toEqual(off)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
