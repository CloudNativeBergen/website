import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConferenceSchedule, Conference } from '@/lib/conference/types'
import { ScheduleStatus } from './types'

/**
 * N6: the schedule save must SKIP its move-alert pass (rather than misfire an
 * all-new diff) when the pre-save prior-placements READ fails — a transient read
 * failure would otherwise make every talk look newly placed, silently swallowing
 * any real move. The save itself must still succeed.
 *
 * Plus the ALERT GATE: only an OFFICIAL day may notify speakers. The editor
 * autosaves drafts every few seconds, so a draft that alerted would mail every
 * speaker on every drag; the gate must read the PERSISTED status, never the
 * client-supplied `schedule.status`.
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

/**
 * The PERSISTED status of the schedule document being written, as the security
 * scope-check read returns it. `undefined` = a legacy day saved before the draft
 * feature existed (no `status` field at all).
 */
let persistedStatus: string | undefined

const commitMock = vi.fn().mockResolvedValue({ _rev: 'r2' })
const setMock = vi.fn(() => ({ commit: commitMock }))
const ifRevisionIdMock = vi.fn(() => ({ set: setMock }))
const patchMock = vi.fn((id?: unknown) => {
  void id
  return { ifRevisionId: ifRevisionIdMock }
})

// Default fetchMock implementation
// Typed as returning `Promise<unknown>` so per-test implementations can return
// whichever document shape that query needs. Inferring from the default
// implementation pins the union to just those shapes and rejects the rest.
const fetchMock = vi.fn<(query: string) => Promise<unknown>>(
  (query: string) => {
    if (query.includes('conferenceRef')) {
      return Promise.resolve({ _type: 'schedule', conferenceRef: 'conf-1' })
    }
    if (query.includes('trackTitle')) {
      return Promise.resolve({ date: '2026-09-10', tracks: [] })
    }
    return Promise.resolve(null)
  },
)

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (q: string) => fetchMock(q),
    patch: (id: string) => patchMock(id),
  },
}))

import { saveScheduleToSanity } from './sanity'

const CONF = { _id: 'conf-1', title: 'Conf' } as unknown as Conference

function makeSchedule(
  overrides: Partial<ConferenceSchedule> = {},
): ConferenceSchedule {
  return {
    _id: 'sched-1',
    _rev: 'r1',
    date: '2026-09-10',
    tracks: [
      {
        trackTitle: 'Track A',
        // Moved from 09:00 (see the prior-placements mock) to 14:00, so the diff
        // has a real move to announce whenever the gate lets it through.
        talks: [{ startTime: '14:00', endTime: '14:30', talk: { _id: 't1' } }],
      },
    ],
    ...overrides,
  } as unknown as ConferenceSchedule
}

/** True when the pre-save prior-placements read was issued at all. */
const priorReadIssued = () =>
  fetchMock.mock.calls.some(([query]) => query.includes('trackTitle'))

beforeEach(() => {
  vi.clearAllMocks()
  persistedStatus = undefined
  fetchMock.mockImplementation((query: string) => {
    if (query.includes('conferenceRef')) {
      return Promise.resolve({
        _type: 'schedule',
        conferenceRef: 'conf-1',
        ...(persistedStatus ? { status: persistedStatus } : {}),
      })
    }
    if (query.includes('trackTitle')) {
      return Promise.resolve({
        date: '2026-09-10',
        tracks: [
          {
            trackTitle: 'Track A',
            talks: [{ startTime: '09:00', talkId: 't1' }],
          },
        ],
      })
    }
    return Promise.resolve(null)
  })
})

describe('saveScheduleToSanity — schedule-change alert gating (N6)', () => {
  it('skips the alert pass and logs when the prior-placements read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('conferenceRef')) {
        return Promise.resolve({ _type: 'schedule', conferenceRef: 'conf-1' })
      }
      if (query.includes('trackTitle')) {
        return Promise.reject(new Error('read fail'))
      }
      return Promise.resolve(null)
    })

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

describe('saveScheduleToSanity — alert gate on the PERSISTED schedule status', () => {
  it('sends NOTHING when the saved document is a draft (autosave must be silent)', async () => {
    persistedStatus = ScheduleStatus.Draft

    const result = await saveScheduleToSanity(
      makeSchedule({ status: ScheduleStatus.Draft }),
      CONF,
    )

    // The save itself still happens — only the alerts are suppressed.
    expect(result.error).toBeUndefined()
    expect(result.schedule).toBeDefined()
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(notifyScheduleChangesMock).not.toHaveBeenCalled()
    // Nothing will be sent, so the prior-placements read is skipped entirely.
    expect(priorReadIssued()).toBe(false)
  })

  it('sends NOTHING when the saved document is an archived snapshot', async () => {
    persistedStatus = ScheduleStatus.Archived

    await saveScheduleToSanity(
      makeSchedule({ status: ScheduleStatus.Archived }),
      CONF,
    )

    expect(notifyScheduleChangesMock).not.toHaveBeenCalled()
    expect(priorReadIssued()).toBe(false)
  })

  it('alerts when the saved document is official', async () => {
    persistedStatus = ScheduleStatus.Official

    await saveScheduleToSanity(
      makeSchedule({ status: ScheduleStatus.Official }),
      CONF,
    )

    expect(notifyScheduleChangesMock).toHaveBeenCalledTimes(1)
    const { prior, next } = notifyScheduleChangesMock.mock.calls[0][0]
    expect(prior).toEqual([
      expect.objectContaining({ talkId: 't1', startTime: '09:00' }),
    ])
    expect(next).toEqual([
      expect.objectContaining({ talkId: 't1', startTime: '14:00' }),
    ])
  })

  it('alerts on a LEGACY document with no status field (pre-drafts data)', async () => {
    persistedStatus = undefined

    await saveScheduleToSanity(makeSchedule({ status: undefined }), CONF)

    expect(notifyScheduleChangesMock).toHaveBeenCalledTimes(1)
  })

  it('ignores a payload that CLAIMS to be official while the stored day is a draft', async () => {
    // The status on the payload is client-supplied; trusting it would let a
    // stale (or crafted) save blast speakers from a private draft.
    persistedStatus = ScheduleStatus.Draft

    await saveScheduleToSanity(
      makeSchedule({ status: ScheduleStatus.Official }),
      CONF,
    )

    expect(notifyScheduleChangesMock).not.toHaveBeenCalled()
  })

  it('still alerts on the official day when the payload claims to be a draft', async () => {
    persistedStatus = ScheduleStatus.Official

    await saveScheduleToSanity(
      makeSchedule({ status: ScheduleStatus.Draft }),
      CONF,
    )

    expect(notifyScheduleChangesMock).toHaveBeenCalledTimes(1)
  })
})
