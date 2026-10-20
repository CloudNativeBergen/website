import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper): a no-op here.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const deliver = vi.fn()
vi.mock('@/lib/feedback/server', () => ({
  deliverFeedbackSummaries: (...a: unknown[]) => deliver(...a),
}))

import { GET, maxDuration } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/feedback-summary'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET
const REPORT = {
  candidates: 3,
  due: 2,
  claimed: 2,
  emailed: 3,
  emailFailed: 0,
  skipped: 0,
  failed: 0,
  notReached: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  deliver.mockResolvedValue(REPORT)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  process.env.CRON_SECRET = OLD_ENV
  vi.restoreAllMocks()
})

describe('/api/cron/feedback-summary', () => {
  it('rejects a request with no bearer token, and sends nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('errors 500 when CRON_SECRET is unset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('sends the due summaries with a deadline a minute inside the time budget, and reports the counts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-12T08:00:00.000Z'))
    try {
      const res = await GET(req({ authorization: 'Bearer top-secret' }))
      expect(res.status).toBe(200)
      expect(deliver).toHaveBeenCalledWith({
        now: new Date('2026-06-12T08:00:00.000Z'),
        deadline: new Date('2026-06-12T08:04:00.000Z'),
      })
      expect(maxDuration).toBe(300)
      await expect(res.json()).resolves.toEqual({ success: true, ...REPORT })
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers 500 when the run itself fails', async () => {
    deliver.mockRejectedValue(new Error('503'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
  })
})
