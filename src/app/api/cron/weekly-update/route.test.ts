import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The route calls `noStore()` (a request-scoped Next helper) — no-op it in tests.
vi.mock('next/cache', () => ({ unstable_noStore: () => {} }))

const getConferencesMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferencesForWeeklyUpdate: (...a: unknown[]) => getConferencesMock(...a),
}))

const buildSummaryMock = vi.fn()
vi.mock('@/lib/status/summary', () => ({
  buildConferenceStatusSummary: (...a: unknown[]) => buildSummaryMock(...a),
}))

const sendSlackMock = vi.fn()
vi.mock('@/lib/slack/weeklyUpdate', () => ({
  sendWeeklyUpdateToSlack: (...a: unknown[]) => sendSlackMock(...a),
}))

import { GET } from './route'

const URL = 'https://cloudnativebergen.dev/api/cron/weekly-update'
const req = (headers?: Record<string, string>) =>
  new Request(URL, { headers }) as unknown as Parameters<typeof GET>[0]

const OLD_ENV = process.env.CRON_SECRET

const conf = (id: string, title: string) => ({
  _id: id,
  title,
  endDate: '2099-01-01',
  salesNotificationChannel: `#${id}`,
})

const summary = (title: string) => ({
  conferenceTitle: title,
  lastUpdated: '2026-07-20T09:00:00.000Z',
  sponsors: null,
  proposals: null,
  tickets: null,
  targetProgress: null,
  errors: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'top-secret'
  getConferencesMock.mockResolvedValue([conf('conf-1', 'A')])
  buildSummaryMock.mockImplementation((c: { title: string }) =>
    Promise.resolve(summary(c.title)),
  )
  sendSlackMock.mockResolvedValue(undefined)
})

afterEach(() => {
  process.env.CRON_SECRET = OLD_ENV
})

describe('/api/cron/weekly-update — auth guard', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(getConferencesMock).not.toHaveBeenCalled()
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

  it('short-circuits when no qualifying conference', async () => {
    getConferencesMock.mockResolvedValue([])
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    expect(sendSlackMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.results).toEqual([])
  })
})

describe('/api/cron/weekly-update — multi-conference iteration', () => {
  it('sends the update to EVERY qualifying conference', async () => {
    getConferencesMock.mockResolvedValue([
      conf('conf-1', 'A'),
      conf('conf-2', 'B'),
      conf('conf-3', 'C'),
    ])
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.conferences).toBe(3)
    expect(body.summary.failed).toBe(0)
    expect(sendSlackMock).toHaveBeenCalledTimes(3)
    expect(sendSlackMock.mock.calls.map((c) => c[0].conference._id)).toEqual([
      'conf-1',
      'conf-2',
      'conf-3',
    ])
  })

  it('ISOLATES a failing conference so the others still send', async () => {
    getConferencesMock.mockResolvedValue([
      conf('conf-1', 'A'),
      conf('conf-2', 'B'),
      conf('conf-3', 'C'),
    ])
    sendSlackMock.mockImplementation(
      (data: { conference: { _id: string } }) => {
        if (data.conference._id === 'conf-2') {
          return Promise.reject(new Error('conf-2 slack down'))
        }
        return Promise.resolve(undefined)
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
    expect(byId['conf-2'].error).toContain('conf-2 slack down')
    expect(byId['conf-3'].ok).toBe(true)
    // All three were attempted despite conf-2 throwing.
    expect(sendSlackMock).toHaveBeenCalledTimes(3)
  })

  it('reports a structured per-conference summary shape', async () => {
    const res = await GET(req({ authorization: 'Bearer top-secret' }))
    const body = await res.json()
    expect(body.results[0]).toMatchObject({
      conferenceId: 'conf-1',
      title: 'A',
      ok: true,
    })
    expect(typeof body.results[0].durationMs).toBe('number')
  })
})
