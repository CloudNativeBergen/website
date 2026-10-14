import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper) — no-op it in tests.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const deliverDue = vi.fn()
vi.mock('@/lib/workshop/promoted', () => ({
  deliverDuePromotionEmails: (...a: unknown[]) => deliverDue(...a),
}))

import { GET } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/workshop-promotion-emails'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  deliverDue.mockResolvedValue({ found: 2, emailed: 2, conferences: 1 })
})

afterEach(() => {
  process.env.CRON_SECRET = OLD_ENV
})

describe('/api/cron/workshop-promotion-emails', () => {
  it('rejects a request with no bearer token, and runs nothing', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(deliverDue).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(deliverDue).not.toHaveBeenCalled()
  })

  it('errors 500 when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
    expect(deliverDue).not.toHaveBeenCalled()
  })

  it('pays the promotion emails still owed, and reports the counts', async () => {
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    expect(deliverDue).toHaveBeenCalledTimes(1)
    await expect(res.json()).resolves.toEqual({
      success: true,
      found: 2,
      emailed: 2,
      conferences: 1,
    })
  })

  it('answers 500 when the sweep itself fails', async () => {
    deliverDue.mockRejectedValue(new Error('503'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
  })
})
