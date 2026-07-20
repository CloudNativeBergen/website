import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Boundary mocks --------------------------------------------------------
const createNotificationsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...a: unknown[]) => createNotificationsMock(...a),
}))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { diffScheduleSlots, notifyScheduleChanges } from '../schedule-alerts'
import type { SlotPlacement } from '../types'

const slot = (
  talkId: string,
  startTime: string,
  trackTitle: string,
  date = '2026-09-10',
): SlotPlacement => ({ talkId, date, startTime, trackTitle })

describe('diffScheduleSlots', () => {
  it('detects a time move', () => {
    const moved = diffScheduleSlots(
      [slot('t1', '09:00', 'Track A')],
      [slot('t1', '10:00', 'Track A')],
    )
    expect(moved).toHaveLength(1)
    expect(moved[0].to.startTime).toBe('10:00')
  })
  it('detects a track move', () => {
    const moved = diffScheduleSlots(
      [slot('t1', '09:00', 'Track A')],
      [slot('t1', '09:00', 'Track B')],
    )
    expect(moved).toHaveLength(1)
    expect(moved[0].to.trackTitle).toBe('Track B')
  })
  it('detects a date move', () => {
    const moved = diffScheduleSlots(
      [slot('t1', '09:00', 'Track A', '2026-09-10')],
      [slot('t1', '09:00', 'Track A', '2026-09-11')],
    )
    expect(moved).toHaveLength(1)
  })
  it('ignores an unchanged slot', () => {
    expect(
      diffScheduleSlots(
        [slot('t1', '09:00', 'Track A')],
        [slot('t1', '09:00', 'Track A')],
      ),
    ).toEqual([])
  })
  it('ignores a newly-placed talk (only in next)', () => {
    expect(diffScheduleSlots([], [slot('t1', '09:00', 'Track A')])).toEqual([])
  })
  it('ignores a removed talk (only in prior)', () => {
    expect(diffScheduleSlots([slot('t1', '09:00', 'Track A')], [])).toEqual([])
  })
})

describe('notifyScheduleChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue([
      { _id: 't1', title: 'Moved Talk', speakerIds: ['s1', 's2'] },
    ])
  })

  it('notifies each speaker of a moved talk, excluding the actor', async () => {
    const summary = await notifyScheduleChanges({
      prior: [slot('t1', '09:00', 'Track A')],
      next: [slot('t1', '10:00', 'Track A')],
      conferenceId: 'conf-1',
      actorId: 's2',
    })
    expect(summary.moved).toBe(1)
    expect(summary.notified).toBe(1)
    const inputs = createNotificationsMock.mock.calls[0][0]
    expect(inputs).toHaveLength(1)
    expect(inputs[0].recipientId).toBe('s1')
    expect(inputs[0].notificationType).toBe('schedule_update')
    expect(inputs[0].link).toBe('/program')
  })

  it('emits nothing when nothing moved', async () => {
    const summary = await notifyScheduleChanges({
      prior: [slot('t1', '09:00', 'Track A')],
      next: [slot('t1', '09:00', 'Track A')],
      conferenceId: 'conf-1',
    })
    expect(summary.moved).toBe(0)
    expect(createNotificationsMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when the emit fails', async () => {
    createNotificationsMock.mockRejectedValueOnce(new Error('boom'))
    await expect(
      notifyScheduleChanges({
        prior: [slot('t1', '09:00', 'Track A')],
        next: [slot('t1', '10:00', 'Track A')],
        conferenceId: 'conf-1',
      }),
    ).resolves.toBeDefined()
  })
})
