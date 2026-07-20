import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper) — no-op it in tests.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const resolveMock = vi.fn()
const runSpeakerRemindersMock = vi.fn()
const runDayOfAgendaMock = vi.fn()
vi.mock('@/lib/reminders', () => ({
  resolveActiveReminderConference: (...a: unknown[]) => resolveMock(...a),
  runSpeakerReminders: (...a: unknown[]) => runSpeakerRemindersMock(...a),
  runDayOfAgenda: (...a: unknown[]) => runDayOfAgendaMock(...a),
}))

import { GET } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/reminders'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  resolveMock.mockResolvedValue({
    _id: 'conf-1',
    title: 'X',
    startDate: '2026-09-10',
    endDate: '2026-09-11',
  })
  runSpeakerRemindersMock.mockResolvedValue({
    candidates: 1,
    sent: 1,
    skipped: 0,
    failed: 0,
    perReminder: [],
  })
  runDayOfAgendaMock.mockResolvedValue({
    isScheduleDay: false,
    presenting: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  })
})

afterEach(() => {
  process.env.CRON_SECRET = OLD_ENV
})

describe('/api/cron/reminders — auth guard', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
  })

  it('errors 500 when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(500)
  })

  it('runs both jobs for a valid token', async () => {
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.conference).toBe('conf-1')
    expect(runSpeakerRemindersMock).toHaveBeenCalledTimes(1)
    expect(runDayOfAgendaMock).toHaveBeenCalledTimes(1)
  })

  it('short-circuits when no conference is active', async () => {
    resolveMock.mockResolvedValue(null)
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    expect(runSpeakerRemindersMock).not.toHaveBeenCalled()
  })
})
