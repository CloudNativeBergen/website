/** @vitest-environment node */
import { NextRequest } from 'next/server'
import { GET, maxDuration } from '@/app/api/cron/content-judgement-sweep/route'

const h = vi.hoisted(() => ({ sweep: vi.fn(), noStore: vi.fn() }))
vi.mock('@/lib/content-judgement/sweep', () => ({
  sweepOrphanJudgements: h.sweep,
}))
vi.mock('next/cache', () => ({ unstable_noStore: h.noStore }))

const request = (authorization?: string) =>
  new NextRequest('http://localhost/api/cron/content-judgement-sweep', {
    headers: authorization === undefined ? {} : { authorization },
  })
const report = { conferences: 2, deleted: 3, timedOut: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-26T04:50:00Z'))
  vi.stubEnv('CRON_SECRET', 'secret')
  h.sweep.mockResolvedValue(report)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('returns 500 without CRON_SECRET before calling the sweep', async () => {
  vi.stubEnv('CRON_SECRET', undefined)
  const response = await GET(request('Bearer undefined'))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Server configuration error' })
  expect(h.sweep).toHaveBeenCalledTimes(0)
})

it.each([undefined, 'Bearer wrong', 'secret'])(
  'returns 401 for token %s before calling the sweep',
  async (token) => {
    const response = await GET(request(token))
    expect(response.status).toBe(401)
    expect(h.sweep).toHaveBeenCalledTimes(0)
  },
)

it('returns 200 with the sweep report and bounded deadline for the right bearer', async () => {
  const response = await GET(request('Bearer secret'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, ...report })
  expect(h.sweep).toHaveBeenCalledExactlyOnceWith({
    now: new Date(Date.now()),
    deadline: new Date(Date.now() + maxDuration * 1000 - 10_000),
  })
  expect(h.noStore).toHaveBeenCalledOnce()
})

it('returns 500 when the sweep fails', async () => {
  h.sweep.mockRejectedValue(new Error('write failed'))
  const response = await GET(request('Bearer secret'))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    error: 'Internal server error',
    details: 'write failed',
  })
})
