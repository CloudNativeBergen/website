import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper): a no-op here.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const fold = vi.fn()
vi.mock('@/lib/feedback/server', () => ({
  foldExpiredFeedback: (...a: unknown[]) => fold(...a),
}))

import { GET, maxDuration } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/feedback-fold'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET
const REPORT = {
  candidates: 3,
  folded: 2,
  responses: 140,
  held: 1,
  failed: 0,
  ineligible: 0,
  notReached: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  fold.mockResolvedValue(REPORT)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  process.env.CRON_SECRET = OLD_ENV
  vi.restoreAllMocks()
})

describe('/api/cron/feedback-fold', () => {
  it('rejects a request with no bearer token, and folds nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(fold).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(fold).not.toHaveBeenCalled()
  })

  it('errors 500 when CRON_SECRET is unset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
    expect(fold).not.toHaveBeenCalled()
  })

  it('folds with a deadline just inside the time budget, and reports the counts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-12T04:40:00.000Z'))
    try {
      const res = await GET(req({ authorization: 'Bearer top-secret' }))
      expect(res.status).toBe(200)
      expect(fold).toHaveBeenCalledWith({
        now: new Date('2026-06-12T04:40:00.000Z'),
        deadline: new Date('2026-06-12T04:44:50.000Z'),
      })
      expect(maxDuration).toBe(300)
      await expect(res.json()).resolves.toEqual({ success: true, ...REPORT })
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers 500 when the run itself fails', async () => {
    fold.mockRejectedValue(new Error('503'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
  })
})
