/** @vitest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/cron/marketing-reminders/route'
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), run: vi.fn() }))
vi.mock('@/lib/marketing/reminders', () => ({
  resolveReminderConferences: mocks.resolve,
  runMarketingReminders: mocks.run,
}))
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))
const request = (auth = 'Bearer secret') =>
  new NextRequest('http://localhost/api/cron/marketing-reminders', {
    headers: { authorization: auth },
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'secret')
  mocks.resolve.mockResolvedValue([
    { conferenceId: 'a', planId: 'plan-a' },
    { conferenceId: 'b', planId: 'plan-b' },
  ])
  mocks.run.mockResolvedValue({ due: 2, overdue: 1 })
})
afterEach(() => vi.unstubAllEnvs())
it('requires configured secret and exact bearer authorization before discovery', async () => {
  expect((await GET(request('bad'))).status).toBe(401)
  expect(mocks.resolve).toHaveBeenCalledTimes(0)
  vi.stubEnv('CRON_SECRET', '')
  expect((await GET(request('Bearer '))).status).toBe(500)
  expect(mocks.resolve).toHaveBeenCalledTimes(0)
  vi.stubEnv('CRON_SECRET', 'secret')
  expect((await GET(request())).status).toBe(200)
})
it('one conference throwing leaves the next processed with per-conference results and aggregate summary', async () => {
  mocks.run.mockRejectedValueOnce(new Error('tenant failure'))
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    summary: { conferences: 2, failed: 1, due: 2, overdue: 1 },
    results: [
      { conferenceId: 'a', ok: false, error: 'tenant failure' },
      { conferenceId: 'b', ok: true, due: 2, overdue: 1 },
    ],
  })
  expect(
    mocks.run.mock.calls.map(([conferenceId, , planId]) => ({
      conferenceId,
      planId,
    })),
  ).toEqual([
    { conferenceId: 'a', planId: 'plan-a' },
    { conferenceId: 'b', planId: 'plan-b' },
  ])
})
