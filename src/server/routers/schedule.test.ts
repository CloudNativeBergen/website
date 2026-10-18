import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { Context } from '@/server/trpc'

// --- next/cache: capture every revalidateTag call ---------------------------
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// --- Conference resolution --------------------------------------------------
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

// --- Schedule persistence layer (stubbed — we assert the router, not Sanity) -
const saveScheduleMock = vi.fn()
const getValidTalkIdsMock = vi.fn()
const getTalkStatusesMock = vi.fn()
const getScheduleStatusByIdMock = vi.fn()
vi.mock('@/lib/schedule/sanity', () => ({
  saveScheduleToSanity: (...args: unknown[]) => saveScheduleMock(...args),
  getValidTalkIds: (...args: unknown[]) => getValidTalkIdsMock(...args),
  getTalkStatuses: (...args: unknown[]) => getTalkStatusesMock(...args),
  getScheduleStatusById: (...args: unknown[]) =>
    getScheduleStatusByIdMock(...args),
}))

const writeFetchMock = vi.fn()
const writeDeleteMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    fetch: (...args: unknown[]) => writeFetchMock(...args),
    delete: (...args: unknown[]) => writeDeleteMock(...args),
  },
}))

const validateMock = vi.fn()
vi.mock('@/lib/schedule/validation', () => ({
  validateSchedulePayload: (...args: unknown[]) => validateMock(...args),
}))

const clientWriteFetchMock = writeFetchMock

import { revalidateTag } from 'next/cache'
import { scheduleRouter } from './schedule'
import { ScheduleStatus } from '@/lib/schedule/types'
import { feedbackCodeIndexTag } from '@/lib/cache/tags'

const revalidateTagMock = revalidateTag as unknown as Mock

const CONFERENCE_ID = 'conf-bergen'
const OTHER_CONFERENCE_ID = 'conf-oslo'
const ORG_ID = 'org-test'

function makeCaller() {
  // Org-scoped authz: the admin waist grants only when `organizerOrgIds`
  // contains the org the domain conference resolves to (see `getConferenceMock`).
  const speaker = {
    _id: 'sp-1',
    name: 'Org',
    isOrganizer: true,
    organizerOrgIds: [ORG_ID],
  }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return scheduleRouter.createCaller(ctx)
}

const validPayload = { _id: '', date: '2026-10-10', tracks: [] }

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    error: null,
  })
  getValidTalkIdsMock.mockResolvedValue(new Set<string>())
  getTalkStatusesMock.mockResolvedValue({})
  getScheduleStatusByIdMock.mockResolvedValue(ScheduleStatus.Draft)
  validateMock.mockReturnValue(null)
  saveScheduleMock.mockResolvedValue({
    schedule: { _id: 'sched-1' },
    error: null,
    conflict: false,
  })
})

describe('schedule router — tenant-scoped cache invalidation (#618)', () => {
  it('revalidates the publishing conference by its scoped tag', async () => {
    await makeCaller().save(validPayload)
    expect(revalidateTagMock).toHaveBeenCalledWith(
      `sanity:conference-${CONFERENCE_ID}`,
      'default',
    )
  })

  it('does NOT bust other tenants via the generic content tags', async () => {
    await makeCaller().save(validPayload)
    // The old behavior busted EVERY conference's /program via these broad tags.
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      'content:program',
      expect.anything(),
    )
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      'content:conferences',
      expect.anything(),
    )
  })

  it('never revalidates a different conference than the one saved', async () => {
    await makeCaller().save(validPayload)
    expect(revalidateTagMock).not.toHaveBeenCalledWith(
      `sanity:conference-${OTHER_CONFERENCE_ID}`,
      expect.anything(),
    )
  })

  it('revalidates the scoped tag and the Feedback Code index only', async () => {
    await makeCaller().save(validPayload)
    expect(revalidateTagMock).toHaveBeenCalledTimes(2)
  })

  it('expires the conference’s Feedback Code index at once (speaker feedback §5.1)', async () => {
    await makeCaller().save(validPayload)
    // `{ expire: 0 }`, not a profile: a moved slot must not keep opening or
    // closing the old window while the index refreshes in the background.
    expect(revalidateTagMock).toHaveBeenCalledWith(
      feedbackCodeIndexTag(CONFERENCE_ID),
      { expire: 0 },
    )
  })

  it('does not revalidate anything when the save fails', async () => {
    saveScheduleMock.mockResolvedValueOnce({
      schedule: null,
      error: 'boom',
      conflict: false,
    })
    await expect(makeCaller().save(validPayload)).rejects.toBeTruthy()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})

describe('schedule router — draft and publish guards', () => {
  it('auto-forks a draft if the existing schedule is official', async () => {
    getScheduleStatusByIdMock.mockResolvedValueOnce(ScheduleStatus.Official)

    await makeCaller().save({
      ...validPayload,
      _id: 'existing-id',
      _rev: 'rev-1',
      status: ScheduleStatus.Draft,
    })

    // The payload passed to saveScheduleToSanity should have _id stripped
    expect(saveScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: '' }),
      expect.anything(),
      expect.anything(),
    )
  })

  it('enforces the Strict Block when publishing an official schedule', async () => {
    getTalkStatusesMock.mockResolvedValueOnce({ 'talk-1': 'submitted' })

    const payload = {
      ...validPayload,
      status: ScheduleStatus.Official,
      tracks: [
        {
          trackTitle: 'T1',
          talks: [
            { startTime: '10:00', endTime: '10:30', talk: { _ref: 'talk-1' } },
          ],
        },
      ],
    }

    await expect(makeCaller().save(payload)).rejects.toThrowError(
      /Strict Block: Cannot publish schedule/,
    )
    expect(saveScheduleMock).not.toHaveBeenCalled()
  })
})

describe('schedule router — the Feedback Code index (speaker feedback §5.1)', () => {
  const feedbackExpiries = () =>
    revalidateTagMock.mock.calls.filter(
      ([tag]) => tag === feedbackCodeIndexTag(CONFERENCE_ID),
    )

  it('expires it when an official day is saved', async () => {
    await makeCaller().save({
      ...validPayload,
      status: ScheduleStatus.Official,
    })
    expect(feedbackExpiries()).toEqual([
      [feedbackCodeIndexTag(CONFERENCE_ID), { expire: 0 }],
    ])
  })

  it('leaves it alone on a draft save: drafts never open a window, and they autosave every few seconds', async () => {
    await makeCaller().save({ ...validPayload, status: ScheduleStatus.Draft })
    expect(saveScheduleMock).toHaveBeenCalled()
    expect(feedbackExpiries()).toEqual([])
  })

  it('expires it when a legacy day with no status (read as official) is deleted', async () => {
    writeFetchMock.mockResolvedValueOnce({ _id: 'day-legacy' })
    await makeCaller().admin.delete({ id: 'day-legacy' })
    expect(writeDeleteMock).toHaveBeenCalledWith('day-legacy')
    expect(feedbackExpiries()).toEqual([
      [feedbackCodeIndexTag(CONFERENCE_ID), { expire: 0 }],
    ])
  })

  it('leaves it alone when an archived day is deleted: it never held a window', async () => {
    writeFetchMock.mockResolvedValueOnce({
      _id: 'day-archived',
      status: ScheduleStatus.Archived,
    })
    await makeCaller().admin.delete({ id: 'day-archived' })
    expect(writeDeleteMock).toHaveBeenCalledWith('day-archived')
    expect(feedbackExpiries()).toEqual([])
  })

  it('leaves it alone when a draft day is deleted', async () => {
    writeFetchMock.mockResolvedValueOnce({
      _id: 'day-draft',
      status: ScheduleStatus.Draft,
    })
    await makeCaller().admin.delete({ id: 'day-draft' })
    expect(writeDeleteMock).toHaveBeenCalledWith('day-draft')
    expect(feedbackExpiries()).toEqual([])
  })
})
describe('schedule.admin.addTalk', () => {
  const dummySchedule = {
    _id: 'sched-1',
    _rev: 'rev-1',
    date: '2026-10-26',
    status: ScheduleStatus.Draft,
    tracks: [
      {
        _key: 'track-0',
        trackTitle: 'Track 1',
        talks: [
          {
            _key: 'talk-1',
            startTime: '10:00',
            endTime: '11:00',
            talk: { _ref: 'talk-1', _type: 'reference' },
          },
        ],
      },
    ],
  }

  it('adds a talk and maintains chronological sorting by startTime', async () => {
    clientWriteFetchMock
      .mockResolvedValueOnce(structuredClone(dummySchedule))
      .mockResolvedValueOnce({
        _id: 'talk-2',
        conferenceRef: CONFERENCE_ID,
        status: 'confirmed',
      })

    const res = await makeCaller().admin.addTalk({
      scheduleId: 'sched-1',
      trackIndex: 0,
      startTime: '09:00',
      endTime: '10:00',
      proposalId: 'talk-2',
    })

    expect(res.success).toBe(true)
    expect(saveScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            talks: [
              expect.objectContaining({ startTime: '09:00', endTime: '10:00' }),
              expect.objectContaining({ startTime: '10:00', endTime: '11:00' }),
            ],
          }),
        ],
      }),
      expect.anything(),
      expect.anything(),
    )
    expect(revalidateTagMock).toHaveBeenCalledWith(
      `sanity:conference-${CONFERENCE_ID}`,
      'default',
    )
  })

  it('adds a placeholder to an empty track', async () => {
    const emptyTrackSchedule = {
      ...dummySchedule,
      tracks: [{ _key: 'track-0', trackTitle: 'Track 1', talks: [] }],
    }
    clientWriteFetchMock.mockResolvedValueOnce(structuredClone(emptyTrackSchedule))

    const res = await makeCaller().admin.addTalk({
      scheduleId: 'sched-1',
      trackIndex: 0,
      startTime: '12:00',
      endTime: '13:00',
      placeholder: 'Lunch Break',
    })

    expect(res.success).toBe(true)
    expect(saveScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            talks: [
              expect.objectContaining({
                startTime: '12:00',
                endTime: '13:00',
                placeholder: 'Lunch Break',
              }),
            ],
          }),
        ],
      }),
      expect.anything(),
      expect.anything(),
    )
  })

  it('refuses when schedule is not found', async () => {
    clientWriteFetchMock.mockResolvedValueOnce(null)

    await expect(
      makeCaller().admin.addTalk({
        scheduleId: 'sched-nonexistent',
        trackIndex: 0,
        startTime: '09:00',
        endTime: '10:00',
        placeholder: 'Break',
      }),
    ).rejects.toThrowError(/Schedule not found/)
  })

  it('refuses when track index is out of bounds', async () => {
    clientWriteFetchMock.mockResolvedValueOnce(structuredClone(dummySchedule))

    await expect(
      makeCaller().admin.addTalk({
        scheduleId: 'sched-1',
        trackIndex: 99,
        startTime: '09:00',
        endTime: '10:00',
        placeholder: 'Break',
      }),
    ).rejects.toThrowError(/Track index out of bounds/)
  })

  it('refuses cross-tenant proposal addition', async () => {
    clientWriteFetchMock
      .mockResolvedValueOnce(structuredClone(dummySchedule))
      .mockResolvedValueOnce(null) // scoped query returns null for a foreign conference proposal

    await expect(
      makeCaller().admin.addTalk({
        scheduleId: 'sched-1',
        trackIndex: 0,
        startTime: '09:00',
        endTime: '10:00',
        proposalId: 'foreign-talk',
      }),
    ).rejects.toThrowError(/Proposal not found or belongs to another conference/)
  })

  it('refuses unconfirmed talk on an official schedule', async () => {
    const officialSchedule = {
      ...dummySchedule,
      status: ScheduleStatus.Official,
    }
    clientWriteFetchMock
      .mockResolvedValueOnce(structuredClone(officialSchedule))
      .mockResolvedValueOnce({
        _id: 'talk-unconfirmed',
        conferenceRef: CONFERENCE_ID,
        status: 'submitted',
      })

    await expect(
      makeCaller().admin.addTalk({
        scheduleId: 'sched-1',
        trackIndex: 0,
        startTime: '09:00',
        endTime: '10:00',
        proposalId: 'talk-unconfirmed',
      }),
    ).rejects.toThrowError(/Cannot add talk to official schedule/)
  })

  it('allows confirmed talk on an official schedule', async () => {
    const officialSchedule = {
      ...dummySchedule,
      status: ScheduleStatus.Official,
    }
    clientWriteFetchMock
      .mockResolvedValueOnce(structuredClone(officialSchedule))
      .mockResolvedValueOnce({
        _id: 'talk-confirmed',
        conferenceRef: CONFERENCE_ID,
        status: 'confirmed',
      })

    const res = await makeCaller().admin.addTalk({
      scheduleId: 'sched-1',
      trackIndex: 0,
      startTime: '09:00',
      endTime: '10:00',
      proposalId: 'talk-confirmed',
    })

    expect(res.success).toBe(true)
  })
})

describe('schedule.admin.removeTalk', () => {
  const dummyScheduleWithTalks = {
    _id: 'sched-1',
    _rev: 'rev-1',
    date: '2026-10-26',
    status: ScheduleStatus.Draft,
    tracks: [
      {
        _key: 'track-0',
        trackTitle: 'Track 1',
        talks: [
          {
            _key: 'talk-0',
            startTime: '09:00',
            endTime: '10:00',
            talk: { _ref: 'talk-0', _type: 'reference' },
          },
          {
            _key: 'talk-1',
            startTime: '10:00',
            endTime: '11:00',
            talk: { _ref: 'talk-1', _type: 'reference' },
          },
        ],
      },
    ],
  }

  it('removes a talk by track and talk index', async () => {
    clientWriteFetchMock.mockResolvedValueOnce(structuredClone(dummyScheduleWithTalks))

    const res = await makeCaller().admin.removeTalk({
      scheduleId: 'sched-1',
      trackIndex: 0,
      talkIndex: 0,
    })

    expect(res.success).toBe(true)
    expect(saveScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            talks: [expect.objectContaining({ startTime: '10:00' })],
          }),
        ],
      }),
      expect.anything(),
      expect.anything(),
    )
    expect(revalidateTagMock).toHaveBeenCalledWith(
      `sanity:conference-${CONFERENCE_ID}`,
      'default',
    )
  })

  it('refuses when talk index is out of bounds', async () => {
    clientWriteFetchMock.mockResolvedValueOnce(structuredClone(dummyScheduleWithTalks))

    await expect(
      makeCaller().admin.removeTalk({
        scheduleId: 'sched-1',
        trackIndex: 0,
        talkIndex: 5,
      }),
    ).rejects.toThrowError(/Track or talk index out of bounds/)
  })
})
