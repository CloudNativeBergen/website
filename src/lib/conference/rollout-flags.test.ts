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
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ data: { rolloutFlags } })),
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

  it('gives the read 500 ms (#1939)', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    reply(null)
    await rolloutFlags('a.example', conf)
    expect(timeout).toHaveBeenCalledWith(500)
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
  ])(
    'with no last good value, fails to the env lists, unverified, on %s',
    async (_, fail) => {
      fail()
      const host = `fail-${Math.random()}.example`
      expect(await rolloutFlags(host, conf)).toEqual({
        ...off,
        unverified: true,
      })
      vi.stubEnv('KONF_D1_WRITE_TENANTS', 'conf-1')
      expect(await rolloutFlags(host, conf)).toEqual({
        ...off,
        d1Write: true,
        unverified: true,
      })
    },
  )

  describe('last good value (#1938)', () => {
    const on = { apiRead: true, identityLogin: true, d1Write: true }
    afterEach(() => vi.useRealTimers())

    it('a read failure within 10 minutes uses the last good flags', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      reply(on)
      expect(await rolloutFlags('lkg.example', conf)).toEqual(on)
      fetchMock.mockRejectedValue(new Error('down'))
      vi.advanceTimersByTime(9 * 60_000)
      expect(await rolloutFlags('lkg.example', conf)).toEqual(on)
      expect(console.warn).toHaveBeenCalledWith(
        '[konf-api] rollout flags unavailable for conf-1, using last good: down',
      )
    })

    it('is bounded in age: older than 10 minutes is unverified', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      reply(on)
      await rolloutFlags('old.example', conf)
      fetchMock.mockRejectedValue(new Error('down'))
      vi.advanceTimersByTime(10 * 60_000 + 1)
      expect(await rolloutFlags('old.example', conf)).toEqual({
        ...off,
        unverified: true,
      })
    })

    // A remote cache hit carries the time the gateway answered, not now.
    // Date.now() is called once to stamp the read, then once to check its age.
    // This relies on konfApiHeaders being mocked: the real one calls Date.now in
    // siteAssertion and would consume these stamps.
    const T0 = 1_700_000_000_000
    const stampAt = (at: number, now: number) =>
      vi.spyOn(Date, 'now').mockReturnValueOnce(at).mockReturnValue(now)

    const flagReads = () => fetchMock.mock.calls.length

    it('a stale cached entry with a healthy gateway reads it directly once and is verified', async () => {
      reply(on)
      stampAt(T0, T0 + 10 * 60_000 + 1)
      expect(
        await rolloutFlags('stale-hit.example', conf, { verify: true }),
      ).toEqual(on)
      expect(flagReads()).toBe(2) // the cached read (no-op cache here) + one direct
      // The direct read became the last good value, stamped with its own time.
      fetchMock.mockRejectedValue(new Error('down'))
      vi.spyOn(Date, 'now').mockReturnValue(T0 + 19 * 60_000)
      expect(
        await rolloutFlags('stale-hit.example', conf, { verify: true }),
      ).toEqual(on)
    })

    it('a stale cached entry and a failed direct read use a recent last good', async () => {
      reply(on)
      stampAt(T0, T0 + 2 * 60_000)
      await rolloutFlags('stale-lkg.example', conf, { verify: true }) // last good at T0
      fetchMock
        .mockImplementationOnce(
          async () =>
            new Response(JSON.stringify({ data: { rolloutFlags: on } })),
        )
        .mockRejectedValueOnce(new Error('down'))
      // Cached hit stamped T0 - 1, so it is stale while last good (T0) is not.
      stampAt(T0 - 1, T0 + 10 * 60_000 - 1)
      expect(
        await rolloutFlags('stale-lkg.example', conf, { verify: true }),
      ).toEqual(on)
      expect(flagReads()).toBe(3)
      expect(console.warn).toHaveBeenCalledWith(
        '[konf-api] rollout flags unavailable for conf-1, using last good: down',
      )
    })

    it('a stale cached entry and a failed direct read with no last good is unverified', async () => {
      fetchMock
        .mockImplementationOnce(
          async () =>
            new Response(JSON.stringify({ data: { rolloutFlags: on } })),
        )
        .mockRejectedValueOnce(new Error('down'))
      stampAt(T0, T0 + 10 * 60_000 + 1)
      expect(
        await rolloutFlags('stale-none.example', conf, { verify: true }),
      ).toEqual({
        ...off,
        unverified: true,
      })
      expect(flagReads()).toBe(2)
    })

    it('without verify, a stale cached entry makes no direct read and is unverified', async () => {
      reply(on)
      stampAt(T0, T0 + 10 * 60_000 + 1)
      const flags = await rolloutFlags('stale-page.example', conf)
      expect(flagReads()).toBe(1) // the cached read only
      expect(flags).toEqual({ ...on, unverified: true })
    })

    it('a cached entry within the revalidate window is verified', async () => {
      reply(on)
      stampAt(T0, T0 + 5 * 60_000)
      expect(await rolloutFlags('fresh-hit.example', conf)).toEqual(on)
    })

    it('the last good value keeps the original read time', async () => {
      reply(on)
      stampAt(T0, T0 + 6 * 60_000) // cache hit of a read 6 minutes old
      expect(await rolloutFlags('orig.example', conf)).toEqual(on)
      vi.spyOn(Date, 'now').mockReturnValue(T0 + 10 * 60_000 + 1)
      fetchMock.mockRejectedValue(new Error('down'))
      expect(await rolloutFlags('orig.example', conf)).toEqual({
        ...off,
        unverified: true,
      })
    })

    it('is bounded in size: the oldest host is evicted past 500', async () => {
      reply(on)
      for (let i = 0; i <= 500; i++) await rolloutFlags(`h${i}.example`, conf)
      fetchMock.mockRejectedValue(new Error('down'))
      expect(await rolloutFlags('h0.example', conf)).toMatchObject({
        unverified: true,
      })
      expect(await rolloutFlags('h500.example', conf)).toEqual(on)
    })

    it('a good read of off is off, not the last good on', async () => {
      reply(on)
      await rolloutFlags('flip.example', conf)
      reply({ apiRead: false, identityLogin: false, d1Write: false })
      expect(await rolloutFlags('flip.example', conf)).toEqual(off)
      fetchMock.mockRejectedValue(new Error('down'))
      expect(await rolloutFlags('flip.example', conf)).toEqual(off)
    })

    it('the kill switch wins over a last good value', async () => {
      reply(on)
      await rolloutFlags('kill.example', conf)
      vi.stubEnv('KONF_API_DISABLED', '1')
      fetchMock.mockRejectedValue(new Error('down'))
      expect(await rolloutFlags('kill.example', conf)).toEqual(off)
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
    expect(await rolloutFlags('a.example', conf)).toEqual({
      ...off,
      identityLogin: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes no call without the signing key or a host', async () => {
    reply({ apiRead: true, identityLogin: true, d1Write: true })
    expect(await rolloutFlags(null, conf)).toEqual({ ...off, unverified: true })
    vi.stubEnv('KONF_SITE_SIGNING_KEY', '')
    expect(await rolloutFlags('a.example', conf)).toEqual({
      ...off,
      unverified: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
