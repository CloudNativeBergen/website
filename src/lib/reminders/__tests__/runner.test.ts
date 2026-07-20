import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReminderConference } from '../types'

// --- Boundary mocks --------------------------------------------------------
const createNotificationsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...a: unknown[]) => createNotificationsMock(...a),
}))

// Routed fetch: the runner issues several distinct GROQ reads; dispatch by a
// signature substring of each query so one mock serves them all.
let talkRows: unknown[] = []
let travelRows: unknown[] = []
let markerRows: unknown[] = []
let agendaRows: unknown[] = []
const fetchMock = vi.fn((query: string) => {
  if (query.includes('scheduledReminderLog')) return Promise.resolve(markerRows)
  if (query.includes('travelSupport')) return Promise.resolve(travelRows)
  if (query.includes('hasSlides')) return Promise.resolve(talkRows)
  if (query.includes('_type == "schedule"')) return Promise.resolve(agendaRows)
  return Promise.resolve([])
})

const commitMock = vi.fn().mockResolvedValue({})
const patchBuilder = { set: () => patchBuilder, inc: () => patchBuilder }
const txBuilder = {
  createIfNotExists: () => txBuilder,
  patch: (_id: string, fn?: (p: typeof patchBuilder) => unknown) => {
    if (typeof fn === 'function') fn(patchBuilder)
    return txBuilder
  },
  commit: () => commitMock(),
}
const createIfNotExistsMock = vi.fn().mockResolvedValue({})
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (q: string) => fetchMock(q) },
  clientWrite: {
    transaction: () => txBuilder,
    createIfNotExists: (doc: unknown) => createIfNotExistsMock(doc),
  },
}))

import { runSpeakerReminders, runDayOfAgenda } from '../runner'

const CONF: ReminderConference = {
  _id: 'conf-1',
  title: 'CloudNative Days',
  startDate: '2026-09-10',
  endDate: '2026-09-11',
}

// Pre-conference date where ONLY confirm-talk is due for an accepted-talk speaker.
const PRE = new Date('2026-08-20T06:00:00Z')
const CONFIRM_ID = 'reminder.confirm-talk.conf-1.s1'

beforeEach(() => {
  vi.clearAllMocks()
  talkRows = [
    {
      _id: 't1',
      title: 'My Talk',
      status: 'accepted',
      speakerIds: ['s1'],
      hasSlides: false,
    },
  ]
  travelRows = []
  markerRows = []
  agendaRows = []
})

describe('runSpeakerReminders — dedup + re-arming', () => {
  it('sends a due reminder on the first run and stamps a marker', async () => {
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(1)
    expect(createNotificationsMock).toHaveBeenCalledTimes(1)
    const inputs = createNotificationsMock.mock.calls[0][0]
    expect(inputs[0].recipientId).toBe('s1')
    expect(inputs[0].link).toBe('/cfp/proposal/t1')
    // Marker stamped via transaction commit.
    expect(commitMock).toHaveBeenCalledTimes(1)
    const confirm = summary.perReminder.find((r) => r.key === 'confirm-talk')!
    expect(confirm.sent).toBe(1)
  })

  it('does not re-send inside the spacing window', async () => {
    markerRows = [
      { _id: CONFIRM_ID, count: 1, lastSentAt: '2026-08-18T06:00:00Z' }, // 2 days ago
    ]
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(createNotificationsMock).not.toHaveBeenCalled()
  })

  it('re-sends once the spacing has elapsed and the cap is not reached', async () => {
    markerRows = [
      { _id: CONFIRM_ID, count: 1, lastSentAt: '2026-08-08T06:00:00Z' }, // 12 days ago
    ]
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(1)
  })

  it('does not send once the cap is reached', async () => {
    markerRows = [
      { _id: CONFIRM_ID, count: 2, lastSentAt: '2026-08-08T06:00:00Z' },
    ]
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
  })

  it('never throws when the emit fails; isolates and counts it', async () => {
    createNotificationsMock.mockRejectedValueOnce(new Error('boom'))
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary.failed).toBe(1)
    expect(summary.sent).toBe(0)
  })

  it('never throws when the candidate read fails', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new Error('read fail')),
    )
    const summary = await runSpeakerReminders(CONF, PRE)
    expect(summary).toBeDefined()
    expect(summary.sent).toBe(0)
  })
})

describe('runDayOfAgenda — presenting-today selection + dedup', () => {
  const DAY = new Date('2026-09-10T06:00:00Z')
  beforeEach(() => {
    agendaRows = [
      {
        tracks: [
          {
            trackTitle: 'Track A',
            talks: [
              { startTime: '09:00', talkTitle: 'My Talk', speakerIds: ['s1'] },
            ],
          },
        ],
      },
    ]
  })

  it('notifies a speaker presenting today when no marker exists', async () => {
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.isScheduleDay).toBe(true)
    expect(summary.sent).toBe(1)
    const inputs = createNotificationsMock.mock.calls[0][0]
    expect(inputs[0].recipientId).toBe('s1')
    expect(inputs[0].message).toContain('09:00')
    expect(createIfNotExistsMock).toHaveBeenCalledTimes(1)
  })

  it('skips a speaker already notified today (marker present)', async () => {
    markerRows = [{ _id: 'reminder.day-of.conf-1.s1.2026-09-10', count: 1 }]
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.sent).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(createNotificationsMock).not.toHaveBeenCalled()
  })

  it('reports a non-schedule day and sends nothing', async () => {
    agendaRows = []
    const summary = await runDayOfAgenda(CONF, DAY)
    expect(summary.isScheduleDay).toBe(false)
    expect(summary.sent).toBe(0)
  })
})
