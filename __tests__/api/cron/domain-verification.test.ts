/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockSweep = vi.fn<(...args: any[]) => any>()

vi.mock('@/lib/domain-verification', () => ({
  runDomainVerificationSweep: (...args: unknown[]) => mockSweep(...args),
}))

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}))

const SUMMARY = {
  checked: 3,
  verified: 2,
  hardFailures: 1,
  softFailures: 0,
  unverifiable: 0,
  delisted: ['lapsed-conf.no'],
  errored: [],
  redirectUris: {
    skipped: null,
    wanted: 2,
    registered: ['new-conf.konf.run'],
    removed: ['lapsed-conf.no'],
    errored: [],
    unaccounted: [],
    error: null,
  },
}

describe('api/cron/domain-verification', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    mockSweep.mockResolvedValue(SUMMARY)
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  function request(auth?: string) {
    return new NextRequest('http://localhost/api/cron/domain-verification', {
      headers: auth ? { authorization: auth } : {},
    })
  }

  it('runs the sweep and reports the delistings', async () => {
    const { GET } = await import('@/app/api/cron/domain-verification/route')
    const response = await GET(request('Bearer test-cron-secret'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      delisted: ['lapsed-conf.no'],
      redirectUris: {
        registered: ['new-conf.konf.run'],
        removed: ['lapsed-conf.no'],
      },
    })
    expect(mockSweep).toHaveBeenCalledTimes(1)
  })

  it('stays quiet about the redirect URIs when nothing needs an operator', async () => {
    const { GET } = await import('@/app/api/cron/domain-verification/route')

    await GET(request('Bearer test-cron-secret'))

    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a host it could not bring into step',
      { errored: ['stuck.konf.run'] },
      'stuck.konf.run',
    ],
    [
      'a callback URI nobody answers for',
      { unaccounted: ['https://left-behind.example.org/api/auth/callback'] },
      'https://left-behind.example.org/api/auth/callback',
    ],
    [
      'a run that stopped before any host',
      { error: 'GET was refused by WorkOS with HTTP 503' },
      'HTTP 503',
    ],
  ])('names %s in the error log', async (_, redirectUris, named) => {
    const { GET } = await import('@/app/api/cron/domain-verification/route')
    const logged = vi.mocked(console.error)
    mockSweep.mockResolvedValue({
      ...SUMMARY,
      redirectUris: { ...SUMMARY.redirectUris, ...redirectUris },
    })

    await GET(request('Bearer test-cron-secret'))

    expect(logged).toHaveBeenCalledTimes(1)
    expect(logged.mock.calls[0][0]).toContain(named)
  })

  it('says in the summary line that the reconcile was skipped, and why', async () => {
    // Guard a mutation pass found unpinned (#1297 review): a skipped reconcile
    // is no error, so this line is the only place the logs show it.
    const { GET } = await import('@/app/api/cron/domain-verification/route')
    const logged = vi.mocked(console.log)

    await GET(request('Bearer test-cron-secret'))
    expect(logged.mock.calls[0][0]).not.toContain('redirectUris.skipped')

    logged.mockClear()
    mockSweep.mockResolvedValue({
      ...SUMMARY,
      redirectUris: { ...SUMMARY.redirectUris, skipped: 'no-api-key' },
    })
    await GET(request('Bearer test-cron-secret'))

    expect(logged).toHaveBeenCalledTimes(1)
    expect(logged.mock.calls[0][0]).toContain('redirectUris.skipped=no-api-key')
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated call and does NOT sweep', async () => {
    const { GET } = await import('@/app/api/cron/domain-verification/route')
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(mockSweep).not.toHaveBeenCalled()
  })

  it('fails loudly when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const { GET } = await import('@/app/api/cron/domain-verification/route')
    expect((await GET(request('Bearer anything'))).status).toBe(500)
    expect(mockSweep).not.toHaveBeenCalled()
  })
})
