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
    })
    expect(mockSweep).toHaveBeenCalledTimes(1)
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
