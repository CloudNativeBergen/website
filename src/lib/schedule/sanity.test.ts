import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConferenceSchedule, Conference } from '@/lib/conference/types'

/**
 * N6: the schedule save must SKIP its move-alert pass (rather than misfire an
 * all-new diff) when the pre-save prior-placements READ fails — a transient read
 * failure would otherwise make every talk look newly placed, silently swallowing
 * any real move. The save itself must still succeed.
 */

// --- Boundary mocks --------------------------------------------------------
const notifyScheduleChangesMock = vi
  .fn()
  .mockResolvedValue({ moved: 0, notified: 0 })
vi.mock('@/lib/reminders', () => ({
  notifyScheduleChanges: (...a: unknown[]) => notifyScheduleChangesMock(...a),
}))

vi.mock('@/lib/sanity/helpers', () => ({
  generateKey: (p?: string) => `${p ?? 'k'}-key`,
  createReference: (ref: string) => ({ _type: 'reference', _ref: ref }),
  createReferenceWithKey: (ref: string) => ({
    _type: 'reference',
    _ref: ref,
    _key: 'k',
  }),
}))

// The prior-placements read is the one whose behaviour each test controls.
let priorFetchImpl: () => Promise<unknown> = () =>
  Promise.resolve({ date: '2026-09-10', tracks: [] })

const commitMock = vi.fn().mockResolvedValue({ _rev: 'r2' })
const setMock = vi.fn(() => ({ commit: commitMock }))
const ifRevisionIdMock = vi.fn(() => ({ set: setMock }))
const patchMock = vi.fn((id?: unknown) => {
  void id
  return { ifRevisionId: ifRevisionIdMock }
})

const fetchMock = vi.fn((query: string) => {
  // Target-existence / scope check.
  if (query.includes('conferenceRef')) {
    return Promise.resolve({ _type: 'schedule', conferenceRef: 'conf-1' })
  }
  // Prior-placements projection (the one N6 cares about).
  if (query.includes('trackTitle')) {
    return priorFetchImpl()
  }
  return Promise.resolve(null)
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (q: string) => fetchMock(q),
    patch: (id: string) => patchMock(id),
  },
}))

import { saveScheduleToSanity } from './sanity'

const CONF = { _id: 'conf-1', title: 'Conf' } as unknown as Conference

function makeSchedule(): ConferenceSchedule {
  return {
    _id: 'sched-1',
    _rev: 'r1',
    date: '2026-09-10',
    tracks: [
      {
        trackTitle: 'Track A',
        talks: [{ startTime: '09:00', endTime: '09:30', talk: { _id: 't1' } }],
      },
    ],
  } as unknown as ConferenceSchedule
}

beforeEach(() => {
  vi.clearAllMocks()
  priorFetchImpl = () =>
    Promise.resolve({
      date: '2026-09-10',
      tracks: [
        {
          trackTitle: 'Track A',
          talks: [{ startTime: '09:00', talkId: 't1' }],
        },
      ],
    })
})

describe('saveScheduleToSanity — schedule-change alert gating (N6)', () => {
  it('skips the alert pass and logs when the prior-placements read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    priorFetchImpl = () => Promise.reject(new Error('read fail'))

    const result = await saveScheduleToSanity(makeSchedule(), CONF)

    // The save still succeeds — the read failure never fails the write.
    expect(result.error).toBeUndefined()
    expect(result.schedule).toBeDefined()
    // No spurious alerts, and the miss is observable.
    expect(notifyScheduleChangesMock).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
    error.mockRestore()
  })

  it('runs the alert pass normally when the prior read succeeds', async () => {
    const result = await saveScheduleToSanity(makeSchedule(), CONF)
    expect(result.schedule).toBeDefined()
    expect(notifyScheduleChangesMock).toHaveBeenCalledTimes(1)
  })
})
