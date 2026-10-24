import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper): a no-op here.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const retention = vi.fn()
const sweep = vi.fn()
vi.mock('@/lib/photo-wall/retention', () => ({
  runPhotoWallRetention: (...a: unknown[]) => retention(...a),
}))
vi.mock('@/lib/photo-wall/sweep', () => ({
  sweepPhotoWall: (...a: unknown[]) => sweep(...a),
}))
import { GET, maxDuration } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/photo-wall-retention'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET
const RETENTION = {
  due: 1,
  closed: 0,
  purged: 1,
  posts: 12,
  assets: 11,
  assetsKept: 1,
  unfinished: [],
  notReached: 0,
}
const SWEEP = {
  orphans: 1,
  assets: 1,
  assetsKept: 0,
  assetsFailed: 0,
  stuck: 0,
  finished: 0,
  finishFailed: 0,
  cutShort: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  retention.mockResolvedValue(RETENTION)
  sweep.mockResolvedValue(SWEEP)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env.CRON_SECRET = OLD_ENV
  vi.restoreAllMocks()
})

describe('/api/cron/photo-wall-retention', () => {
  it('rejects a request with no bearer token: no read, no write, no run', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(retention).not.toHaveBeenCalled()
    expect(sweep).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(retention).not.toHaveBeenCalled()
    expect(sweep).not.toHaveBeenCalled()
  })

  it('errors 500 when CRON_SECRET is unset, running nothing', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
    expect(retention).not.toHaveBeenCalled()
    expect(sweep).not.toHaveBeenCalled()
  })

  it('runs the retention, then the sweep, with a deadline inside the time budget, and reports both', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-26T03:10:00.000Z'))
    try {
      const res = await GET(req({ authorization: 'Bearer top-secret' }))
      expect(res.status).toBe(200)
      const budget = {
        now: new Date('2026-11-26T03:10:00.000Z'),
        deadline: new Date('2026-11-26T03:14:50.000Z'),
      }
      expect(retention).toHaveBeenCalledWith(budget)
      expect(sweep).toHaveBeenCalledWith(budget)
      expect(retention.mock.invocationCallOrder[0]).toBeLessThan(
        sweep.mock.invocationCallOrder[0],
      )
      expect(maxDuration).toBe(300)
      await expect(res.json()).resolves.toEqual({
        success: true,
        retention: RETENTION,
        sweep: SWEEP,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers 500 when the retention itself fails, and does not sweep', async () => {
    retention.mockRejectedValue(new Error('Sanity is down'))
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      details: 'Sanity is down',
    })
    expect(sweep).not.toHaveBeenCalled()
  })
})
