import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper) — no-op it in tests.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const resolveMock = vi.fn()
const runSpeakerRemindersMock = vi.fn()
const runDayOfAgendaMock = vi.fn()
vi.mock('@/lib/reminders', () => ({
  resolveActiveReminderConferences: (...a: unknown[]) => resolveMock(...a),
  runSpeakerReminders: (...a: unknown[]) => runSpeakerRemindersMock(...a),
  runDayOfAgenda: (...a: unknown[]) => runDayOfAgendaMock(...a),
}))

import { GET } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/reminders'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET

const remindersSummary = {
  candidates: 1,
  sent: 1,
  skipped: 0,
  failed: 0,
  perReminder: [],
}
const dayOfSummary = {
  isScheduleDay: false,
  presenting: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  resolveMock.mockResolvedValue([
    {
      _id: 'conf-1',
      title: 'X',
      startDate: '2026-09-10',
      endDate: '2026-09-11',
    },
  ])
  runSpeakerRemindersMock.mockResolvedValue(remindersSummary)
  runDayOfAgendaMock.mockResolvedValue(dayOfSummary)
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
    expect(body.summary.conferences).toBe(1)
    expect(body.results[0].conferenceId).toBe('conf-1')
    expect(body.results[0].ok).toBe(true)
    expect(runSpeakerRemindersMock).toHaveBeenCalledTimes(1)
    expect(runDayOfAgendaMock).toHaveBeenCalledTimes(1)
  })

  it('short-circuits when no conference is active', async () => {
    resolveMock.mockResolvedValue([])
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    expect(runSpeakerRemindersMock).not.toHaveBeenCalled()
  })
})

describe('/api/cron/reminders — multi-conference iteration', () => {
  it('runs both jobs for EVERY active conference', async () => {
    resolveMock.mockResolvedValue([
      {
        _id: 'conf-1',
        title: 'A',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
      },
      {
        _id: 'conf-2',
        title: 'B',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
      },
      {
        _id: 'conf-3',
        title: 'C',
        startDate: '2026-10-10',
        endDate: '2026-10-11',
      },
    ])
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.conferences).toBe(3)
    expect(body.summary.failed).toBe(0)
    expect(runSpeakerRemindersMock).toHaveBeenCalledTimes(3)
    expect(runDayOfAgendaMock).toHaveBeenCalledTimes(3)
    // Each conference was passed through to the runner.
    expect(runSpeakerRemindersMock.mock.calls.map((c) => c[0]._id)).toEqual([
      'conf-1',
      'conf-2',
      'conf-3',
    ])
  })

  it('ISOLATES a failing conference so the others still run', async () => {
    resolveMock.mockResolvedValue([
      {
        _id: 'conf-1',
        title: 'A',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
      },
      {
        _id: 'conf-2',
        title: 'B',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
      },
      {
        _id: 'conf-3',
        title: 'C',
        startDate: '2026-10-10',
        endDate: '2026-10-11',
      },
    ])
    // The middle conference throws; the first and third must still complete.
    runSpeakerRemindersMock.mockImplementation(
      (conference: { _id: string }) => {
        if (conference._id === 'conf-2') {
          return Promise.reject(new Error('conf-2 boom'))
        }
        return Promise.resolve(remindersSummary)
      },
    )

    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary.conferences).toBe(3)
    expect(body.summary.failed).toBe(1)

    const byId = Object.fromEntries(
      body.results.map((r: { conferenceId: string }) => [r.conferenceId, r]),
    )
    expect(byId['conf-1'].ok).toBe(true)
    expect(byId['conf-2'].ok).toBe(false)
    expect(byId['conf-2'].error).toContain('conf-2 boom')
    expect(byId['conf-3'].ok).toBe(true)
    // conf-3 ran despite conf-2 throwing (day-of only runs on the two OK confs).
    expect(runDayOfAgendaMock).toHaveBeenCalledTimes(2)
  })

  it('aggregates a structured per-conference summary shape', async () => {
    resolveMock.mockResolvedValue([
      {
        _id: 'conf-1',
        title: 'A',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
      },
    ])
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    const body = await res.json()
    expect(body.results[0]).toMatchObject({
      conferenceId: 'conf-1',
      ok: true,
    })
    expect(typeof body.results[0].durationMs).toBe('number')
    expect(body.results[0].reminders).toBeDefined()
    expect(body.results[0].dayOf).toBeDefined()
  })
})
